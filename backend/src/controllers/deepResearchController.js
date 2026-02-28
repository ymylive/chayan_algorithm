/**
 * Deep Research Controller - Async deep-research + narrative analysis jobs
 */
const deepResearchService = require('../services/deepResearchService');
const aiService = require('../services/aiService');
const aiAnalyzeJobService = require('../services/aiAnalyzeJobService');
const { resolveUserId } = require('../services/aiSettingsService');
const logger = require('../config/logger');

const DEEP_RESEARCH_ANALYSIS_PIPELINE = 'deep_research_analysis';
const JOB_LIST_LIMIT = 20;
const JOB_LIST_LIMIT_MAX = 100;
const JOB_LIST_OFFSET_MAX = 5000;

const parsePositiveInt = (value, fallback, max = 500) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const parseOffset = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, JOB_LIST_OFFSET_MAX);
};

const parseJobId = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length > 120) return null;
  return normalized;
};

const isAdminUser = (user) => String(user?.role || '').trim().toLowerCase() === 'admin';

const parseWorkflowTrace = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const resolveJobAccessContext = (req) => {
  const userId = resolveUserId(req.user);
  const adminUser = isAdminUser(req.user);
  return { userId, adminUser };
};

const ensureAuthorizedForJobs = (req, res) => {
  const { userId, adminUser } = resolveJobAccessContext(req);
  if (!adminUser && !userId) {
    res.status(403).json({ success: false, message: 'Forbidden' });
    return null;
  }
  return { userId, adminUser };
};

const mapResearchProgressToJob = (progressValue) => {
  const numeric = Number(progressValue);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(75, Math.round((numeric / 100) * 75)));
};

const buildNarrativePayloadFromResearch = (topic, researchResult, responseFormat) => {
  const report = researchResult?.report && typeof researchResult.report === 'object'
    ? researchResult.report
    : {};
  const sourceReferences = Array.isArray(report.sources)
    ? report.sources.map((item) => ({
      name: String(item?.title || item?.url || '').trim().slice(0, 180),
      url: String(item?.url || '').trim().slice(0, 520),
      summary: `content_length=${Number(item?.contentLength || 0)}`
    })).filter((item) => item.name || item.url)
    : [];

  const keyFindings = [
    `Collected ${Number(researchResult?.searchResults || 0)} search results`,
    `Fetched ${Number(researchResult?.fetchedUrls || 0)} sources`,
    `Data quality: ${String(report?.dataQuality || 'unknown')}`
  ];

  const marketSizeCount = Number(report?.marketData?.sizes?.length || 0);
  const growthRateCount = Number(report?.marketData?.growthRates?.length || 0);
  if (marketSizeCount > 0 || growthRateCount > 0) {
    keyFindings.push(`Extracted market indicators: sizes=${marketSizeCount}, growthRates=${growthRateCount}`);
  }

  const suggestions = [
    'Validate top sources and remove low-quality references before strategy decisions.',
    'Cross-check peer filings and regulatory disclosures to strengthen financial evidence.',
    'Run follow-up retrieval for missing consumer demographics or segment signals.'
  ];

  return {
    target: topic,
    goal: `Produce a strategic narrative for ${topic} from deep research evidence`,
    responseFormat,
    industryNames: [topic],
    competitorNames: Array.isArray(report?.competitors) ? report.competitors.slice(0, 12) : [],
    marketReport: {
      references: sourceReferences
    },
    financialData: {
      references: []
    },
    keyFindings,
    suggestions
  };
};

const executeDeepResearchAnalysisJob = async ({
  jobId,
  topic,
  maxUrls,
  maxRetries,
  responseFormat
}) => {
  try {
    await aiAnalyzeJobService.appendProgress(jobId, {
      workflowStep: 'research_start',
      progress: 3,
      status: 'running',
      message: 'Deep research started'
    });

    const researchResult = await deepResearchService.conductResearch(topic, {
      maxUrls,
      maxRetries,
      onProgress: async (progress) => {
        await aiAnalyzeJobService.appendProgress(jobId, {
          workflowStep: `research_${String(progress?.stage || 'running').trim() || 'running'}`,
          progress: mapResearchProgressToJob(progress?.progress),
          status: progress?.stage === 'error' ? 'failed' : 'running',
          message: String(progress?.message || '').trim(),
          extra: {
            stage: progress?.stage,
            researchProgress: Number(progress?.progress || 0)
          }
        });
      }
    });

    if (!researchResult?.success) {
      const message = String(researchResult?.error || 'Deep research failed');
      await aiAnalyzeJobService.markFailed(jobId, message, {
        stage: 'research',
        result: researchResult
      });
      return;
    }

    await aiAnalyzeJobService.appendProgress(jobId, {
      workflowStep: 'analysis_start',
      progress: 80,
      status: 'running',
      message: 'Generating analysis narrative'
    });

    const narrativePayload = buildNarrativePayloadFromResearch(topic, researchResult, responseFormat);
    const narrative = await aiService.generateAnalysisNarrative(narrativePayload, {
      telemetryContext: {
        analysisRequestId: jobId,
        streamRequested: false
      }
    });

    await aiAnalyzeJobService.appendProgress(jobId, {
      workflowStep: 'analysis_complete',
      progress: 95,
      status: 'running',
      message: 'Analysis narrative generated'
    });

    await aiAnalyzeJobService.markCompleted(jobId, {
      target: topic,
      pipeline: DEEP_RESEARCH_ANALYSIS_PIPELINE,
      research: researchResult,
      researchSummary: researchResult?.report?.summary || '',
      sources: Array.isArray(researchResult?.report?.sources) ? researchResult.report.sources : [],
      keyFindings: narrativePayload.keyFindings,
      suggestions: narrativePayload.suggestions,
      analysis: {
        narrative: narrative?.text || '',
        keyFindings: narrativePayload.keyFindings,
        suggestions: narrativePayload.suggestions,
        meta: {
          modelUsed: narrative?.modelUsed || null,
          providerUsed: narrative?.providerUsed || null,
          protocol: narrative?.protocol || null,
          degraded: Boolean(narrative?.degraded),
          degradedReason: narrative?.degradedReason || null,
          promptVersion: narrative?.promptVersion || null,
          claimSupport: narrative?.claimSupport || null
        }
      },
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Deep research analysis pipeline failed', {
      jobId,
      topic,
      error: err?.message || String(err)
    });
    await aiAnalyzeJobService.markFailed(jobId, err?.message || 'Deep research analysis failed', {
      stage: 'analysis',
      topic
    });
  }
};

const createDeepResearchAnalysisJobInternal = async (req, res, { legacyResponse = false } = {}) => {
  const topic = String(req.body?.topic || '').trim().slice(0, 200);
  if (!topic) {
    res.status(400).json({ success: false, message: 'Missing topic' });
    return null;
  }

  const authContext = ensureAuthorizedForJobs(req, res);
  if (!authContext) return null;

  const maxUrls = parsePositiveInt(req.body?.maxUrls, 10, 20);
  const maxRetries = parsePositiveInt(req.body?.maxRetries, 2, 5);
  const responseFormat = req.body?.responseFormat || null;

  const created = await aiAnalyzeJobService.createJob({
    userId: authContext.adminUser ? (authContext.userId || null) : authContext.userId,
    target: topic,
    pipeline: DEEP_RESEARCH_ANALYSIS_PIPELINE,
    requestPayload: {
      topic,
      maxUrls,
      maxRetries,
      responseFormat,
      requestedAt: new Date().toISOString()
    }
  });

  const jobSummary = aiAnalyzeJobService.toJobSummary(created);

  aiAnalyzeJobService.startBackgroundJob(created.id, async () => {
    await executeDeepResearchAnalysisJob({
      jobId: created.id,
      topic,
      maxUrls,
      maxRetries,
      responseFormat
    });
  });

  if (legacyResponse) {
    res.status(202).json({
      success: true,
      jobId: created.id,
      message: 'Research started in background',
      progressUrl: `/api/research/progress/${created.id}`,
      resultUrl: `/api/research/result/${created.id}`,
      data: jobSummary
    });
    return created;
  }

  res.status(202).json({
    success: true,
    message: 'Deep research analysis job started',
    data: jobSummary
  });

  return created;
};

const createDeepResearchAnalysisJob = async (req, res, next) => {
  try {
    await createDeepResearchAnalysisJobInternal(req, res, { legacyResponse: false });
  } catch (err) {
    logger.error('createDeepResearchAnalysisJob error', { error: err?.message || String(err) });
    next(err);
  }
};

const listDeepResearchAnalysisJobs = async (req, res, next) => {
  try {
    const authContext = ensureAuthorizedForJobs(req, res);
    if (!authContext) return;

    const limit = parsePositiveInt(req.query?.limit, JOB_LIST_LIMIT, JOB_LIST_LIMIT_MAX);
    const offset = parseOffset(req.query?.offset, 0);
    const status = String(req.query?.status || '').trim().toLowerCase();

    const jobs = await aiAnalyzeJobService.listJobs({
      userId: authContext.userId,
      isAdmin: authContext.adminUser,
      limit,
      offset,
      status,
      pipeline: DEEP_RESEARCH_ANALYSIS_PIPELINE
    });

    const items = jobs.map((job) => ({
      ...aiAnalyzeJobService.toJobSummary(job),
      hasResult: Boolean(job?.result_json)
    }));

    res.json({
      success: true,
      data: {
        items,
        limit,
        offset,
        total: items.length
      }
    });
  } catch (err) {
    logger.error('listDeepResearchAnalysisJobs error', { error: err?.message || String(err) });
    next(err);
  }
};

const getDeepResearchAnalysisJob = async (req, res, next) => {
  try {
    const jobId = parseJobId(req.params?.jobId);
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Invalid jobId' });
    }

    const authContext = ensureAuthorizedForJobs(req, res);
    if (!authContext) return;

    const job = await aiAnalyzeJobService.getJob(jobId, {
      userId: authContext.userId,
      isAdmin: authContext.adminUser,
      pipeline: DEEP_RESEARCH_ANALYSIS_PIPELINE
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    return res.json({
      success: true,
      data: {
        ...aiAnalyzeJobService.toJobSummary(job),
        hasResult: Boolean(job?.result_json),
        history: parseWorkflowTrace(job.workflow_trace)
      }
    });
  } catch (err) {
    logger.error('getDeepResearchAnalysisJob error', { error: err?.message || String(err) });
    next(err);
  }
};

const getDeepResearchAnalysisJobResult = async (req, res, next) => {
  try {
    const jobId = parseJobId(req.params?.jobId);
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Invalid jobId' });
    }

    const authContext = ensureAuthorizedForJobs(req, res);
    if (!authContext) return;

    const job = await aiAnalyzeJobService.getJob(jobId, {
      userId: authContext.userId,
      isAdmin: authContext.adminUser,
      pipeline: DEEP_RESEARCH_ANALYSIS_PIPELINE
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (!job.result_json) {
      if (String(job.status || '').toLowerCase() === 'failed') {
        return res.status(409).json({
          success: false,
          message: job.error_message || 'Deep research analysis failed',
          data: {
            ...aiAnalyzeJobService.toJobSummary(job),
            history: parseWorkflowTrace(job.workflow_trace)
          }
        });
      }

      return res.status(202).json({
        success: false,
        message: 'Result is not ready',
        data: {
          ...aiAnalyzeJobService.toJobSummary(job),
          history: parseWorkflowTrace(job.workflow_trace)
        }
      });
    }

    return res.json({
      success: true,
      data: job.result_json,
      meta: {
        ...aiAnalyzeJobService.toJobSummary(job),
        history: parseWorkflowTrace(job.workflow_trace)
      }
    });
  } catch (err) {
    logger.error('getDeepResearchAnalysisJobResult error', { error: err?.message || String(err) });
    next(err);
  }
};

const conductDeepResearch = async (req, res, next) => {
  try {
    const topic = String(req.body?.topic || '').trim();
    const isAsync = parseBoolean(req.body?.async, false);

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required and must be a non-empty string'
      });
    }

    if (isAsync) {
      await createDeepResearchAnalysisJobInternal(req, res, { legacyResponse: true });
      return;
    }

    const options = {
      maxUrls: parsePositiveInt(req.body?.maxUrls, 10, 20),
      maxRetries: parsePositiveInt(req.body?.maxRetries, 2, 5)
    };

    const result = await deepResearchService.conductResearch(topic, options);
    res.json(result);
  } catch (err) {
    logger.error('Deep research controller error', { error: err?.message || String(err) });
    if (typeof next === 'function') {
      next(err);
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err?.message || 'unknown_error'
    });
  }
};

const getResearchProgress = async (req, res) => {
  try {
    const jobId = parseJobId(req.params?.jobId);
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Invalid jobId' });
    }

    const authContext = ensureAuthorizedForJobs(req, res);
    if (!authContext) return;

    const job = await aiAnalyzeJobService.getJob(jobId, {
      userId: authContext.userId,
      isAdmin: authContext.adminUser,
      pipeline: DEEP_RESEARCH_ANALYSIS_PIPELINE
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const summary = aiAnalyzeJobService.toJobSummary(job);
    res.json({
      success: true,
      jobId: summary.jobId,
      status: summary.status,
      progress: summary.progress,
      workflowStep: summary.workflowStep,
      message: summary.message,
      history: parseWorkflowTrace(job.workflow_trace),
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      completedAt: summary.completedAt
    });
  } catch (err) {
    logger.error('Get progress error', { error: err?.message || String(err) });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

const getResearchResult = async (req, res) => {
  try {
    const jobId = parseJobId(req.params?.jobId);
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Invalid jobId' });
    }

    const authContext = ensureAuthorizedForJobs(req, res);
    if (!authContext) return;

    const job = await aiAnalyzeJobService.getJob(jobId, {
      userId: authContext.userId,
      isAdmin: authContext.adminUser,
      pipeline: DEEP_RESEARCH_ANALYSIS_PIPELINE
    });

    if (!job || !job.result_json) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    res.json(job.result_json);
  } catch (err) {
    logger.error('Get result error', { error: err?.message || String(err) });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

module.exports = {
  conductDeepResearch,
  getResearchProgress,
  getResearchResult,
  createDeepResearchAnalysisJob,
  listDeepResearchAnalysisJobs,
  getDeepResearchAnalysisJob,
  getDeepResearchAnalysisJobResult
};
