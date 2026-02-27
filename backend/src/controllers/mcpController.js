const { randomUUID } = require('crypto');
const aiService = require('../services/aiService');
const { resolveUserId, getOrCreateUserSettings } = require('../services/aiSettingsService');
const aiAnalyzeJobService = require('../services/aiAnalyzeJobService');
const logger = require('../config/logger');
const pool = require('../config/database');
const redis = require('../config/redis');
const {
  normalizeList, extractDisplayLabel, uniqueNonEmpty,
  buildFeatureRows, buildModelResult,
  buildPeerCandidates, buildPeerIndustrySummary, buildPeerInsights, buildPeerSuggestions
} = require('../utils/math');
let mcpFallbackReasonLabelMap = {};
try {
  mcpFallbackReasonLabelMap = require('../../../shared/mcp-fallback-reasons.json');
} catch {
  try {
    mcpFallbackReasonLabelMap = require('../../shared/mcp-fallback-reasons.json');
  } catch {
    mcpFallbackReasonLabelMap = {};
  }
}

const AI_ANALYZE_CACHE_TTL_SECONDS = 300;

const TEA_BRAND_COMPETITOR_COMPANY_MAP = {
  '\u8336\u989c\u60a6\u8272': [
    '\u559c\u8336',
    '\u8336\u767e\u9053',
    '\u5948\u96ea\u7684\u8336',
    '\u871c\u96ea\u51b0\u57ce'
  ]
};

const toBoolean = (value, fallback = false) => {
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

const setupSse = (res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
};

const writeSseEvent = (res, eventName, payload) => {
  const name = String(eventName || 'message').trim() || 'message';
  const serialized = JSON.stringify(payload === undefined ? null : payload);
  res.write(`event: ${name}\ndata: ${serialized}\n\n`);
};

const parsePositiveInt = (value, fallback, max = 500) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const parseBoundedFloat = (value, fallback, min = 0, max = 1) => {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const AI_ANALYZE_MATCH_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_MATCH_LIMIT, 120, 500);
const AI_ANALYZE_SIGNAL_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_SIGNAL_LIMIT, 20, 100);
const AI_ANALYZE_TOP_INDUSTRY_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_TOP_INDUSTRY_LIMIT, 10, 50);
const AI_ANALYZE_SAMPLE_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_SAMPLE_LIMIT, 20, 100);
const AI_ANALYZE_JOB_LIST_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_JOB_LIST_LIMIT, 20, 100);
const AI_ANALYZE_JOB_LIST_OFFSET_MAX = parsePositiveInt(process.env.AI_ANALYZE_JOB_LIST_OFFSET_MAX, 1000, 5000);
const AI_MCP_COMPETITOR_VARIANTS = parsePositiveInt(process.env.AI_MCP_COMPETITOR_VARIANTS, 3, 6);
const AI_ANALYZE_COMPETITOR_QUERY_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_COMPETITOR_QUERY_LIMIT, 12, 24);
const AI_MCP_COMPETITOR_RESULT_LIMIT = parsePositiveInt(process.env.AI_MCP_COMPETITOR_RESULT_LIMIT, 24, 100);
const AI_ANALYZE_MIN_COMPETITOR_COUNT = parsePositiveInt(process.env.AI_ANALYZE_MIN_COMPETITOR_COUNT, 4, 20);
const AI_ANALYZE_MIN_COMPETITOR_RELEVANCE = Number.parseFloat(process.env.AI_ANALYZE_MIN_COMPETITOR_RELEVANCE || '1.8');
const AI_ANALYZE_GAP_FOLLOWUP_TRIGGER = parsePositiveInt(process.env.AI_ANALYZE_GAP_FOLLOWUP_TRIGGER, 2, 6);
const AI_ANALYZE_GAP_FOLLOWUP_MAX_ATTEMPTS = parsePositiveInt(process.env.AI_ANALYZE_GAP_FOLLOWUP_MAX_ATTEMPTS, 2, 5);
const AI_ANALYZE_GAP_FOLLOWUP_LATENCY_BUDGET_MS = parsePositiveInt(process.env.AI_ANALYZE_GAP_FOLLOWUP_LATENCY_BUDGET_MS, 6000, 60000);
const AI_ANALYZE_GAP_FOLLOWUP_MAX_QUERIES = parsePositiveInt(process.env.AI_ANALYZE_GAP_FOLLOWUP_MAX_QUERIES, 2, 4);
const AI_ANALYZE_COMPLETENESS_CONFIDENCE_FLOOR = parseBoundedFloat(process.env.AI_ANALYZE_COMPLETENESS_CONFIDENCE_FLOOR, 0.62, 0.1, 0.95);

const CRITICAL_DATA_GAP_KEYS = [
  'competitorsInsufficient',
  'competitorRelevanceLow',
  'marketReferencesMissing',
  'financialReferencesMissing',
  'sourceCoverageWeak'
];

const EVIDENCE_UNSAFE_TERMS = [
  'porn', 'xxx', 'xvideos', 'xnxx', 'sex', 'adult', 'redtube', 'youporn', 'pornhub', 'onlyfans',
  '鎴愪汉瑙嗛', '鎴愪汉褰辩墖', '鑹叉儏', '鎯呰壊'
];

const EVIDENCE_NOISY_GAME_TERMS = [
  'free online games', 'play now', 'crazygames', 'poki', 'play-games', 'unblocked games'
];

const GAME_CONTEXT_TERMS = ['game', 'gaming', 'games', 'esports', 'valorant', '娓告垙', '鐢电珵'];

const normalizeEvidenceText = (value) => String(value || '').toLowerCase().trim();

const isGameContextTarget = (target) => {
  const text = normalizeEvidenceText(target);
  return GAME_CONTEXT_TERMS.some((term) => text.includes(term));
};

const sanitizeEvidenceItems = (items = [], target, mode = 'generic') => {
  const list = normalizeList(items);
  const gameContext = isGameContextTarget(target);

  return list.filter((item) => {
    const name = normalizeEvidenceText(item?.name || item?.title || '');
    const url = normalizeEvidenceText(item?.url || '');
    const summary = normalizeEvidenceText(item?.summary || item?.description || '');
    const text = `${name} ${url} ${summary}`.trim();

    if (!text) return false;
    if (EVIDENCE_UNSAFE_TERMS.some((term) => text.includes(term))) return false;

    if (!gameContext && mode === 'competitor' && EVIDENCE_NOISY_GAME_TERMS.some((term) => text.includes(term))) {
      return false;
    }

    return true;
  });
};

const isDegradedAiResponse = (payload) => Boolean(payload?.data?.analysis?.aiMeta?.degraded);

const emitQualityTelemetry = (eventName, payload) => {
  if (typeof logger.emitQualityEvent === 'function') {
    return logger.emitQualityEvent(eventName, payload);
  }
  logger.info('quality_event', {
    eventName,
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),
    ...payload
  });
  return null;
};

const readTelemetryTrendReport = (windowMs) => {
  if (typeof logger.getQualityTelemetryReport === 'function') {
    return logger.getQualityTelemetryReport({ windowMs });
  }
  return null;
};

const resolveQualityFlags = (aiNarrativeResult) => {
  const fallback = {
    qualityContractEnabled: toBoolean(process.env.AI_QUALITY_CONTRACT_ENABLED, true),
    qualityStrictMode: toBoolean(process.env.AI_QUALITY_STRICT_MODE, false),
    qualityMinCoverageSources: parsePositiveInt(process.env.AI_QUALITY_MIN_COVERAGE_SOURCES, 2, 12)
  };
  const incoming = aiNarrativeResult?.qualityFlags || {};
  return {
    qualityContractEnabled: toBoolean(incoming.qualityContractEnabled, fallback.qualityContractEnabled),
    qualityStrictMode: toBoolean(incoming.qualityStrictMode, fallback.qualityStrictMode),
    qualityMinCoverageSources: parsePositiveInt(incoming.qualityMinCoverageSources, fallback.qualityMinCoverageSources, 12)
  };
};

const buildQualityContract = ({
  aiNarrativeResult,
  dataGapReasons,
  dataGapFlags,
  coverageSourceCount,
  competitorAvgRelevance
}) => {
  const featureFlags = resolveQualityFlags(aiNarrativeResult);
  const gapCount = Number(dataGapReasons?.length || 0);
  const sourceCoverageCount = Number(coverageSourceCount || 0);
  const degraded = Boolean(aiNarrativeResult?.degraded);
  const claimSupport = aiNarrativeResult?.claimSupport && typeof aiNarrativeResult.claimSupport === 'object'
    ? aiNarrativeResult.claimSupport
    : null;
  const unsupportedClaimCount = Number(claimSupport?.unsupportedClaims || 0);
  const strictPass = featureFlags.qualityStrictMode
    ? gapCount === 0 && sourceCoverageCount >= featureFlags.qualityMinCoverageSources && unsupportedClaimCount === 0
    : gapCount <= 1 && sourceCoverageCount >= featureFlags.qualityMinCoverageSources && unsupportedClaimCount === 0;
  const passed = !degraded && strictPass;
  const qualityScore = Math.max(
    0,
    Math.min(
      100,
      100 - (gapCount * 18) - (Math.max(0, featureFlags.qualityMinCoverageSources - sourceCoverageCount) * 10)
    )
  );

  return {
    contractVersion: 'v1',
    enabled: featureFlags.qualityContractEnabled,
    qualityScore,
    qualityGate: {
      status: degraded ? 'degraded' : (passed ? 'pass' : 'warn'),
      checks: {
        degraded,
        dataGapCount: gapCount,
        sourceCoverageCount,
        minCoverageSources: featureFlags.qualityMinCoverageSources,
        strictMode: featureFlags.qualityStrictMode,
        competitorAvgRelevance,
        dataGapFlags,
        claimSupport: {
          validationSkipped: Boolean(claimSupport?.validationSkipped),
          totalClaims: Number(claimSupport?.totalClaims || 0),
          supportedClaims: Number(claimSupport?.supportedClaims || 0),
          unsupportedClaims: unsupportedClaimCount,
          supportRatio: Number(claimSupport?.supportRatio || 1),
          repairAttempted: Boolean(claimSupport?.repairAttempted),
          repairSucceeded: Boolean(claimSupport?.repairSucceeded),
          reasonCode: claimSupport?.reasonCode || null
        }
      }
    },
    featureFlags
  };
};

const isAdminUser = (user) => String(user?.role || '').trim().toLowerCase() === 'admin';

const normalizeCacheScopeToken = (value, fallback = 'unknown') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  return normalized || fallback;
};

const resolveAiAnalyzeCacheScope = (user, requesterUserId, requesterIsAdmin) => {
  const parsedUserId = Number(requesterUserId);
  if (Number.isInteger(parsedUserId) && parsedUserId > 0) {
    return `user:${parsedUserId}`;
  }

  if (requesterIsAdmin) {
    return `admin:${normalizeCacheScopeToken(user?.email || user?.username, 'default')}`;
  }

  return 'public';
};

const buildAiAnalyzeCacheKey = (target, user, requesterUserId, requesterIsAdmin) => {
  const normalizedTarget = String(target || '').trim().toLowerCase();
  const scope = resolveAiAnalyzeCacheScope(user, requesterUserId, requesterIsAdmin);
  return `aiAnalyze:${scope}:${normalizedTarget}`;
};

const parseJobId = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length > 120) return null;
  return normalized;
};

const parseOffset = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, AI_ANALYZE_JOB_LIST_OFFSET_MAX);
};

const emitWorkflowProgress = async (progressCallback, workflowStep, progress, status = 'running', extras = {}) => {
  if (typeof progressCallback !== 'function') return;
  const normalizedProgress = Number.isFinite(Number(progress))
    ? Math.max(0, Math.min(100, Number(progress)))
    : 0;

  try {
    await progressCallback({
      workflowStep,
      progress: normalizedProgress,
      status,
      timestamp: new Date().toISOString(),
      ...extras
    });
  } catch (err) {
    logger.warn('MCP aiAnalyze progress callback failed:', err?.message || err);
  }
};

const resolveMappedCompetitorCompanies = (target) => {
  const base = String(target || '').trim();
  if (!base) return [];

  const mapped = [];
  Object.entries(TEA_BRAND_COMPETITOR_COMPANY_MAP).forEach(([brand, peers]) => {
    const normalizedBrand = String(brand || '').trim();
    if (!normalizedBrand) return;
    if (base === normalizedBrand || base.includes(normalizedBrand) || normalizedBrand.includes(base)) {
      mapped.push(...normalizeList(peers));
    }
  });

  return uniqueNonEmpty(mapped);
};

const buildCompetitorQueries = (target, maxVariants) => {
  const base = String(target || '').trim();
  if (!base) return [];
  const genericCandidates = [
    base,
    `${base} competitor brand`,
    `${base} rival`,
    `${base} \u7ade\u54c1`,
    `${base} \u540c\u7c7b\u54c1\u724c`
  ];
  const mappedCompanyCandidates = resolveMappedCompetitorCompanies(base);
  const baseCandidates = uniqueNonEmpty(genericCandidates).slice(0, Math.max(1, maxVariants));
  return uniqueNonEmpty([...baseCandidates, ...mappedCompanyCandidates]);
};

const resolveCompetitorQueries = async (target, maxVariants) => {
  const baseCandidates = buildCompetitorQueries(target, maxVariants);
  let aiCandidates = [];
  try {
    if (typeof aiService.extractCompetitorCompanies === 'function') {
      aiCandidates = await aiService.extractCompetitorCompanies(target, {
        maxCandidates: Math.max(4, maxVariants * 2)
      });
    }
  } catch (err) {
    logger.warn('AI competitor candidate extraction failed in controller:', err?.message || err);
    aiCandidates = [];
  }

  return uniqueNonEmpty([...baseCandidates, ...normalizeList(aiCandidates)])
    .slice(0, AI_ANALYZE_COMPETITOR_QUERY_LIMIT);
};

const mergeUniqueEvidence = (baseList, incomingList) => {
  const seen = new Set();
  const merged = [];
  [...normalizeList(baseList), ...normalizeList(incomingList)].forEach((item) => {
    const name = String(extractDisplayLabel(item) || '').trim();
    const url = String(item?.url || '').trim().toLowerCase();
    const key = `${name.toLowerCase()}|${url}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
};

const mergeCompetitorPayload = (target, currentPayload, nextPayload) => {
  const current = currentPayload && typeof currentPayload === 'object' ? currentPayload : { competitors: [] };
  const incoming = nextPayload && typeof nextPayload === 'object' ? nextPayload : { competitors: [] };
  const mergedByName = new Map();

  const ingest = (item) => {
    const normalized = item && typeof item === 'object' ? item : {};
    const name = String(extractDisplayLabel(normalized) || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const prev = mergedByName.get(key);
    const prevRelevance = Number(prev?.relevanceScore || 0);
    const nextRelevance = Number(normalized?.relevanceScore || 0);
    const source = String(normalized?.source || prev?.source || 'mcp').toLowerCase();

    if (!prev || nextRelevance >= prevRelevance) {
      mergedByName.set(key, { ...prev, ...normalized, name, source, relevanceScore: Math.max(prevRelevance, nextRelevance) });
      return;
    }

    mergedByName.set(key, {
      ...prev,
      description: prev.description || normalized.description,
      url: prev.url || normalized.url,
      relevanceScore: Math.max(prevRelevance, nextRelevance)
    });
  };

  normalizeList(current).forEach(ingest);
  normalizeList(incoming).forEach(ingest);

  const mergeCountMap = (left = {}, right = {}) => {
    const output = { ...left };
    Object.entries(right || {}).forEach(([rawSource, rawCount]) => {
      const source = String(rawSource || '').toLowerCase();
      if (!source) return;
      output[source] = Number(output[source] || 0) + Math.max(0, Number(rawCount || 0));
    });
    return output;
  };

  const currentMeta = current.meta || {};
  const incomingMeta = incoming.meta || {};

  return {
    query: current.query || incoming.query || target,
    competitors: [...mergedByName.values()]
      .sort((a, b) => {
        const delta = Number(b?.relevanceScore || 0) - Number(a?.relevanceScore || 0);
        if (delta !== 0) return delta;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      })
      .slice(0, AI_MCP_COMPETITOR_RESULT_LIMIT),
    meta: {
      sourceCounts: mergeCountMap(currentMeta.sourceCounts, incomingMeta.sourceCounts),
      coverageSourceCounts: mergeCountMap(currentMeta.coverageSourceCounts, incomingMeta.coverageSourceCounts),
      sourcesUsed: uniqueNonEmpty([
        ...normalizeList(currentMeta.sourcesUsed),
        ...normalizeList(incomingMeta.sourcesUsed)
      ]),
      partialFailure: Boolean(currentMeta.partialFailure || incomingMeta.partialFailure),
      attempts: [
        ...normalizeList(currentMeta.attempts),
        ...normalizeList(incomingMeta.attempts)
      ]
    }
  };
};

const computeDataCompletenessState = (target, industryData, competitorData, marketReport, financialData) => {
  const industryList = normalizeList(industryData);
  const competitorList = sanitizeEvidenceItems(normalizeList(competitorData), target, 'competitor');
  const industryNames = uniqueNonEmpty(industryList.map(extractDisplayLabel)).slice(0, AI_ANALYZE_SIGNAL_LIMIT);
  const competitorNames = uniqueNonEmpty(competitorList.map(extractDisplayLabel)).slice(0, AI_ANALYZE_SIGNAL_LIMIT);
  const marketReferences = sanitizeEvidenceItems(normalizeList(marketReport?.references), target, 'market');
  const financialReferences = sanitizeEvidenceItems(normalizeList(financialData?.references), target, 'financial');

  const competitorSourceCounts = competitorData?.meta?.sourceCounts || {};
  const competitorCoverageSourceCounts = competitorData?.meta?.coverageSourceCounts || {};
  const competitorAvgRelevance = competitorList.length > 0
    ? Number((competitorList.reduce((sum, item) => sum + Number(item?.relevanceScore || 0), 0) / competitorList.length).toFixed(3))
    : 0;
  const financialReferenceCount = Number(financialData?.repoCount || financialReferences.length || 0);
  const coverageSourceCount = Object.keys(competitorCoverageSourceCounts).length > 0
    ? Object.keys(competitorCoverageSourceCounts).length
    : Object.keys(competitorSourceCounts).length;

  const dataGapFlags = {
    industrySignalsMissing: industryNames.length === 0,
    competitorsInsufficient: competitorList.length < AI_ANALYZE_MIN_COMPETITOR_COUNT,
    competitorRelevanceLow: competitorList.length > 0 && competitorAvgRelevance < AI_ANALYZE_MIN_COMPETITOR_RELEVANCE,
    marketReferencesMissing: marketReferences.length === 0,
    financialReferencesMissing: financialReferenceCount === 0,
    sourceCoverageWeak: coverageSourceCount < 2
  };

  const dataGapReasons = Object.entries(dataGapFlags)
    .filter(([, flag]) => Boolean(flag))
    .map(([reason]) => reason);

  const dataGapFollowupQueries = uniqueNonEmpty([
    dataGapFlags.competitorsInsufficient ? `${target} \u540c\u7c7b\u54c1\u724c \u5bf9\u6bd4` : null,
    dataGapFlags.competitorRelevanceLow ? `${target} \u54c1\u724c \u8d5b\u9053 \u7ade\u54c1` : null,
    dataGapFlags.marketReferencesMissing ? `${target} \u884c\u4e1a\u62a5\u544a \u5e02\u573a\u89c4\u6a21` : null,
    dataGapFlags.financialReferencesMissing ? `${target} \u5e74\u62a5 \u6295\u8d44\u8005\u5173\u7cfb` : null,
    dataGapFlags.sourceCoverageWeak ? `${target} \u65b0\u95fb \u6df1\u5ea6\u5206\u6790` : null
  ]);

  const criticalGapCount = CRITICAL_DATA_GAP_KEYS
    .filter((reason) => Boolean(dataGapFlags[reason]))
    .length;
  const completenessScore = Number((1 - (dataGapReasons.length / Math.max(1, Object.keys(dataGapFlags).length))).toFixed(3));

  return {
    industryList,
    competitorList,
    industryNames,
    competitorNames,
    marketReferences,
    financialReferences,
    competitorSourceCounts,
    competitorCoverageSourceCounts,
    competitorAvgRelevance,
    financialReferenceCount,
    coverageSourceCount,
    dataGapFlags,
    dataGapReasons,
    dataGapFollowupQueries,
    criticalGapCount,
    completenessScore
  };
};

const mergeCompetitorSearchResults = (target, queries, settledResults) => {
  const mergedByName = new Map();
  const sourceCounts = {};
  const coverageSourceCounts = {};
  const sourceSet = new Set();
  const attempts = [];
  const fallbackReasonSet = new Set();
  let partialFailure = false;

  settledResults.forEach((entry, index) => {
    const query = queries[index] || target;
    if (entry.status !== 'fulfilled') {
      partialFailure = true;
      fallbackReasonSet.add('query_request_failed');
      attempts.push({
        query,
        success: false,
        resultCount: 0,
        reason: 'query_request_failed',
        error: entry.reason?.message || String(entry.reason || 'unknown_error')
      });
      return;
    }

    const payload = entry.value && typeof entry.value === 'object' ? entry.value : { query, competitors: [] };
    const list = normalizeList(payload);
    const meta = payload?.meta || {};
    const fallbackReason = String(meta?.reason || '').trim();
    const listedSources = new Set((meta.sourcesUsed || []).map((v) => String(v || '').toLowerCase()).filter(Boolean));

    if (fallbackReason) {
      fallbackReasonSet.add(fallbackReason);
    } else if (meta.partialFailure) {
      fallbackReasonSet.add('partial_failure');
    }

    normalizeList(meta?.fallbackReasons).forEach((reason) => {
      const normalizedReason = String(reason || '').trim();
      if (normalizedReason) {
        fallbackReasonSet.add(normalizedReason);
      }
    });

    const sourceCountEntries = Object.entries(meta?.sourceCounts || {})
      .map(([rawSource, rawCount]) => [String(rawSource || '').toLowerCase(), Number(rawCount || 0)]);
    const coverageSourceEntries = Object.entries(meta?.coverageSourceCounts || {})
      .map(([rawSource, rawCount]) => [String(rawSource || '').toLowerCase(), Number(rawCount || 0)]);

    if (sourceCountEntries.length > 0) {
      sourceCountEntries.forEach(([source, count]) => {
        if (!source) return;
        sourceCounts[source] = Number(sourceCounts[source] || 0) + Math.max(0, count);
      });
    } else {
      list.forEach((item) => {
        const source = String(item?.source || 'mcp').toLowerCase();
        sourceCounts[source] = Number(sourceCounts[source] || 0) + 1;
      });
    }

    if (coverageSourceEntries.length > 0) {
      coverageSourceEntries.forEach(([source, count]) => {
        if (!source) return;
        coverageSourceCounts[source] = Number(coverageSourceCounts[source] || 0) + Math.max(0, count);
      });
    }

    list.forEach((item) => {
      const source = String(item?.source || 'mcp').toLowerCase();
      listedSources.add(source);
      const name = String(extractDisplayLabel(item) || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const prev = mergedByName.get(key);
      const prevRelevance = Number(prev?.relevanceScore || 0);
      const nextRelevance = Number(item?.relevanceScore || 0);

      if (!prev || nextRelevance > prevRelevance) {
        mergedByName.set(key, { ...item, name, source, relevanceScore: nextRelevance });
      } else {
        mergedByName.set(key, {
          ...prev,
          description: prev.description || item.description,
          url: prev.url || item.url,
          relevanceScore: Math.max(prevRelevance, nextRelevance)
        });
      }
    });

    if (meta.partialFailure) {
      partialFailure = true;
    }

    listedSources.forEach((source) => {
      sourceSet.add(source);
    });
    attempts.push({
      query,
      success: true,
      resultCount: list.length,
      partialFailure: Boolean(meta.partialFailure),
      reason: fallbackReason || (meta.partialFailure ? 'partial_failure' : null)
    });
  });

  const competitors = [...mergedByName.values()]
    .sort((a, b) => {
      const delta = Number(b?.relevanceScore || 0) - Number(a?.relevanceScore || 0);
      if (delta !== 0) return delta;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    })
    .slice(0, AI_MCP_COMPETITOR_RESULT_LIMIT);

  return {
    query: target,
    competitors,
    meta: {
      sourceCounts,
      coverageSourceCounts,
      sourcesUsed: uniqueNonEmpty([...sourceSet]),
      partialFailure,
      fallbackReasons: uniqueNonEmpty([...fallbackReasonSet]),
      attempts
    }
  };
};

const resolvePayloadMeta = (payload) => (
  payload && typeof payload === 'object' && payload.meta && typeof payload.meta === 'object'
    ? payload.meta
    : {}
);

const collectMcpHealth = ({
  industryData,
  competitorData,
  marketReport,
  financialData,
  regulatoryFilings,
  newsStream
}) => {
  const fallbackReasonSet = new Set();
  const partialFailureSourceSet = new Set();

  const inspectSource = (sourceName, payload) => {
    const meta = resolvePayloadMeta(payload);
    if (meta.partialFailure) {
      partialFailureSourceSet.add(sourceName);
    }

    uniqueNonEmpty([
      meta.reason,
      meta.fallbackReason,
      ...(Array.isArray(meta.fallbackReasons) ? meta.fallbackReasons : [])
    ]).forEach((reason) => {
      const normalizedReason = String(reason || '').trim();
      if (normalizedReason) {
        fallbackReasonSet.add(normalizedReason);
      }
    });

    if (String(meta.source || '').trim().toLowerCase() === 'mcp_fallback_empty') {
      fallbackReasonSet.add('mcp_fallback_empty');
    }

    normalizeList(meta.attempts).forEach((attempt) => {
      if (!attempt || typeof attempt !== 'object') return;
      if (attempt.partialFailure === true || attempt.success === false) {
        partialFailureSourceSet.add(sourceName);
      }
      const attemptReason = String(attempt.reason || '').trim();
      if (attemptReason) {
        fallbackReasonSet.add(attemptReason);
      }
    });
  };

  inspectSource('industry', industryData);
  inspectSource('competitor', competitorData);
  inspectSource('market_report', marketReport);
  inspectSource('financial_data', financialData);
  inspectSource('regulatory_filings', regulatoryFilings);
  inspectSource('news_stream', newsStream);

  const fallbackReasons = uniqueNonEmpty([...fallbackReasonSet]);
  const partialFailureSources = uniqueNonEmpty([...partialFailureSourceSet]);
  const fallbackReasonLabels = fallbackReasons.map((reason) => (
    mcpFallbackReasonLabelMap[reason] || reason
  ));

  return {
    usedFallback: fallbackReasons.length > 0 || partialFailureSources.length > 0,
    fallbackReasons,
    fallbackReasonLabels,
    partialFailureSources
  };
};

exports.search = async (req, res, next) => {
  try {
    const { query, type } = req.query;
    if (!query || !type) {
      return res.status(400).json({ error: 'Missing query or type parameter' });
    }

    let result;
    if (type === 'industry') {
      result = await aiService.searchIndustryData(query);
    } else if (type === 'competitor') {
      result = await aiService.searchCompetitors(query);
    } else {
      return res.status(400).json({ error: 'Invalid type. Use industry or competitor' });
    }

    res.json(result);
  } catch (err) {
    logger.error('MCP search error:', err);
    next(err);
  }
};

exports.fetch = async (req, res, next) => {
  try {
    const { dataType, params } = req.body;
    if (!dataType) {
      return res.status(400).json({ error: 'Missing dataType' });
    }

    let result;
    if (dataType === 'market_report') {
      result = await aiService.fetchMarketReport(params || {});
    } else if (dataType === 'financial_data') {
      result = await aiService.fetchFinancialData(params || {});
    } else if (dataType === 'regulatory_filings') {
      if (typeof aiService.fetchRegulatoryFilings !== 'function') {
        return res.status(501).json({ error: 'Regulatory filings fetch is not available' });
      }
      result = await aiService.fetchRegulatoryFilings(params || {});
    } else if (dataType === 'news_stream') {
      if (typeof aiService.fetchNewsStream !== 'function') {
        return res.status(501).json({ error: 'News stream fetch is not available' });
      }
      result = await aiService.fetchNewsStream(params || {});
    } else {
      return res.status(400).json({ error: 'Invalid dataType' });
    }

    res.json(result);
  } catch (err) {
    logger.error('MCP fetch error:', err);
    next(err);
  }
};

const aiAnalyze = async (req, res, next, internalOptions = {}) => {
  const progressCallback = typeof internalOptions?.onProgress === 'function'
    ? internalOptions.onProgress
    : null;
  const bypassCache = toBoolean(internalOptions?.disableCache, false);
  const forceNonStream = toBoolean(internalOptions?.forceNonStream, false);

  try {
    const target = (req.body?.target || '').trim().slice(0, 200);
    if (!target) {
      return res.status(400).json({ success: false, message: 'Missing target' });
    }

    const streamRequested = forceNonStream ? false : toBoolean(req.body?.stream, false);
    const requesterUserId = resolveUserId(req.user);
    const requesterIsAdmin = isAdminUser(req.user);
    const enforceUserScope = Boolean(requesterUserId) && !requesterIsAdmin;

    const telemetryWindowMs = parsePositiveInt(process.env.AI_QUALITY_TELEMETRY_WINDOW_MS, 3600000, 86400000);
    const analysisRequestId = typeof randomUUID === 'function'
      ? randomUUID()
      : `analysis-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const analysisStartedAt = Date.now();
    emitQualityTelemetry('quality.ai_analyze.start', {
      analysisRequestId,
      stage: 'controller_start',
      status: 'ok',
      quality: {
        targetLength: target.length,
        streamRequested
      },
      tags: {
        layer: 'controller'
      }
    });

    let aiConfigOverride = null;
    try {
      if (requesterUserId) {
        aiConfigOverride = await getOrCreateUserSettings(requesterUserId);
      }
    } catch (settingsErr) {
      logger.warn('Failed to load user AI settings for aiAnalyze:', settingsErr?.message || settingsErr);
    }

    await emitWorkflowProgress(progressCallback, 'load_context', 15, 'running', {
      message: 'Loading enterprise context'
    });

    let streamEnded = false;
    const endStreamOnce = () => {
      if (!streamRequested || streamEnded) return;
      streamEnded = true;
      try {
        res.end();
      } catch {
        // ignore response close errors
      }
    };

    if (streamRequested) {
      setupSse(res);
      if (typeof req.on === 'function') {
        req.on('close', () => {
          streamEnded = true;
        });
      }
    }

    const normalizedTarget = target.toLowerCase();
    const cacheKey = buildAiAnalyzeCacheKey(target, req.user, requesterUserId, requesterIsAdmin);
    if (!streamRequested && !bypassCache) {
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          if (isDegradedAiResponse(parsedCache)) {
            await redis.del(cacheKey).catch(() => {});
            emitQualityTelemetry('quality.ai_analyze.cache_decision', {
              analysisRequestId,
              stage: 'controller_cache',
              status: 'degraded',
              quality: {
                cache: 'degraded_invalidated'
              },
              tags: {
                layer: 'controller'
              }
            });
          } else {
            logger.info(`Cache hit for aiAnalyze: ${normalizedTarget}`);
            emitQualityTelemetry('quality.ai_analyze.cache_decision', {
              analysisRequestId,
              stage: 'controller_cache',
              status: 'ok',
              quality: {
                cache: 'hit'
              },
              tags: {
                layer: 'controller'
              }
            });
            return res.json(parsedCache);
          }
        } catch {
          await redis.del(cacheKey).catch(() => {});
        }
      }
    }

    const escapedTarget = target.replace(/[%_]/g, '\\$&');

    let matchedSql = `
      SELECT id, name, industry, created_at
      FROM enterprises
      WHERE name ILIKE $1 OR industry ILIKE $1
      ORDER BY created_at DESC
      LIMIT ${AI_ANALYZE_MATCH_LIMIT}
    `;
    const matchedParams = [`%${escapedTarget}%`];
    if (enforceUserScope) {
      matchedSql = `
        SELECT id, name, industry, created_at
        FROM enterprises
        WHERE (name ILIKE $1 OR industry ILIKE $1) AND user_id = $2
        ORDER BY created_at DESC
        LIMIT ${AI_ANALYZE_MATCH_LIMIT}
      `;
      matchedParams.push(requesterUserId);
    }

    const matchedRows = (await pool.query(matchedSql, matchedParams)).rows;

    let usedRows = matchedRows;
    if (matchedRows.length === 0) {
      if (enforceUserScope) {
        const recentSql = `
          SELECT id, name, industry, created_at
          FROM enterprises
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT ${AI_ANALYZE_MATCH_LIMIT}
        `;
        usedRows = (await pool.query(recentSql, [requesterUserId])).rows;
      } else {
        const recentSql = `
          SELECT id, name, industry, created_at
          FROM enterprises
          ORDER BY created_at DESC
          LIMIT ${AI_ANALYZE_MATCH_LIMIT}
        `;
        usedRows = (await pool.query(recentSql)).rows;
      }
    }

    const baseCompetitorQueries = buildCompetitorQueries(target, AI_MCP_COMPETITOR_VARIANTS);
    const competitorQueries = await resolveCompetitorQueries(target, AI_MCP_COMPETITOR_VARIANTS);
    await emitWorkflowProgress(progressCallback, 'collect_signals', 35, 'running', {
      message: 'Collecting MCP signals',
      queryCount: competitorQueries.length,
      aiCandidateCount: Math.max(0, competitorQueries.length - baseCompetitorQueries.length)
    });
    const industryPromise = aiService.searchIndustryData(target);
    const marketReportPromise = aiService.fetchMarketReport({ query: target, timeframe: 'latest' });
    const financialDataPromise = aiService.fetchFinancialData({ company: target });
    const regulatoryFilingsPromise = typeof aiService.fetchRegulatoryFilings === 'function'
      ? aiService.fetchRegulatoryFilings({ company: target, timeframe: 'latest' })
      : Promise.resolve({});
    const newsStreamPromise = typeof aiService.fetchNewsStream === 'function'
      ? aiService.fetchNewsStream({ query: target, timeframe: 'latest' })
      : Promise.resolve({});
    const competitorSettled = await Promise.allSettled(
      competitorQueries.map((query) => aiService.searchCompetitors(query))
    );
    let industryData = await industryPromise;
    let marketReport = await marketReportPromise;
    let financialData = await financialDataPromise;
    let regulatoryFilings = await regulatoryFilingsPromise;
    let newsStream = await newsStreamPromise;
    let competitorData = mergeCompetitorSearchResults(target, competitorQueries, competitorSettled);

    const normalizedRegulatory = (
      regulatoryFilings && typeof regulatoryFilings === 'object' ? regulatoryFilings : {}
    );
    const normalizedNews = (
      newsStream && typeof newsStream === 'object' ? newsStream : {}
    );
    const regulatoryReferences = mergeUniqueEvidence(
      [],
      normalizeList(normalizedRegulatory.filings || normalizedRegulatory.references)
    );
    const newsReferences = mergeUniqueEvidence(
      [],
      normalizeList(normalizedNews.news || normalizedNews.references)
    );
    const regulatoryFilingCount = Math.max(
      Number(normalizedRegulatory.filingCount || normalizedRegulatory.fillingCount || 0),
      regulatoryReferences.length
    );

    regulatoryFilings = {
      ...normalizedRegulatory,
      filingCount: regulatoryFilingCount,
      fillingCount: Math.max(Number(normalizedRegulatory.fillingCount || 0), regulatoryFilingCount),
      filings: mergeUniqueEvidence(normalizeList(normalizedRegulatory.filings), regulatoryReferences),
      references: regulatoryReferences
    };
    newsStream = {
      ...normalizedNews,
      news: mergeUniqueEvidence(normalizeList(normalizedNews.news), newsReferences),
      references: newsReferences
    };

    if (newsReferences.length > 0) {
      marketReport = {
        ...(marketReport || {}),
        references: mergeUniqueEvidence(marketReport?.references, newsReferences)
      };
    }

    if (regulatoryReferences.length > 0 || regulatoryFilingCount > 0) {
      const mergedFinancialReferences = mergeUniqueEvidence(financialData?.references, regulatoryReferences);
      financialData = {
        ...(financialData || {}),
        repoCount: Math.max(
          Number(financialData?.repoCount || 0),
          mergedFinancialReferences.length,
          regulatoryFilingCount
        ),
        references: mergedFinancialReferences
      };
    }

    let dataCompleteness = computeDataCompletenessState(target, industryData, competitorData, marketReport, financialData);
    let followupStopReason = 'not_triggered';
    let followupWaveAttempts = 0;
    let followupTriggered = dataCompleteness.criticalGapCount >= AI_ANALYZE_GAP_FOLLOWUP_TRIGGER;
    await emitWorkflowProgress(progressCallback, 'gap_followup', 58, 'running', {
      message: 'Running follow-up retrieval for data gaps',
      triggered: followupTriggered,
      gapCount: dataCompleteness.dataGapReasons.length
    });
    const followupStartedAt = Date.now();
    const attemptedFollowupTaskSignatures = new Set();
    const reserveFollowupTask = (kind, queryValue) => {
      const normalizedQuery = String(queryValue || target).trim().toLowerCase();
      if (!normalizedQuery) return false;
      const signature = `${kind}:${normalizedQuery}`;
      if (attemptedFollowupTaskSignatures.has(signature)) {
        return false;
      }
      attemptedFollowupTaskSignatures.add(signature);
      return true;
    };

    if (followupTriggered) {
      followupStopReason = 'max_attempts_exhausted';
      for (let attempt = 1; attempt <= AI_ANALYZE_GAP_FOLLOWUP_MAX_ATTEMPTS; attempt++) {
        const elapsedMs = Date.now() - followupStartedAt;
        if (elapsedMs >= AI_ANALYZE_GAP_FOLLOWUP_LATENCY_BUDGET_MS) {
          followupStopReason = 'latency_budget_exhausted';
          break;
        }

        const followupQueries = dataCompleteness.dataGapFollowupQueries.slice(0, AI_ANALYZE_GAP_FOLLOWUP_MAX_QUERIES);
        if (followupQueries.length === 0) {
          followupStopReason = 'no_followup_queries';
          break;
        }

        followupWaveAttempts = attempt;
        const waveTasks = [];
        let suppressedDuplicateTaskCount = 0;
        if (dataCompleteness.dataGapFlags.industrySignalsMissing) {
          if (reserveFollowupTask('industry', target)) {
            waveTasks.push({
              kind: 'industry',
              promise: aiService.searchIndustryData(`${target} 琛屼笟 璧涢亾`)
            });
          } else {
            suppressedDuplicateTaskCount += 1;
          }
        }
        if (dataCompleteness.dataGapFlags.marketReferencesMissing) {
          if (reserveFollowupTask('market', followupQueries[0])) {
            waveTasks.push({
              kind: 'market',
              promise: aiService.fetchMarketReport({ query: followupQueries[0], timeframe: 'latest' })
            });
          } else {
            suppressedDuplicateTaskCount += 1;
          }
        }
        if (dataCompleteness.dataGapFlags.financialReferencesMissing) {
          if (reserveFollowupTask('financial', followupQueries[0])) {
            waveTasks.push({
              kind: 'financial',
              promise: aiService.fetchFinancialData({ company: target, query: followupQueries[0] })
            });
          } else {
            suppressedDuplicateTaskCount += 1;
          }
        }
        if (
          dataCompleteness.dataGapFlags.competitorsInsufficient
          || dataCompleteness.dataGapFlags.competitorRelevanceLow
          || dataCompleteness.dataGapFlags.sourceCoverageWeak
        ) {
          followupQueries.forEach((query) => {
            if (reserveFollowupTask('competitor', query)) {
              waveTasks.push({
                kind: 'competitor',
                query,
                promise: aiService.searchCompetitors(query)
              });
            } else {
              suppressedDuplicateTaskCount += 1;
            }
          });
        }

        if (waveTasks.length === 0) {
          followupStopReason = suppressedDuplicateTaskCount > 0
            ? 'insufficient_new_evidence'
            : 'no_required_actions';
          break;
        }

        const settledWave = await Promise.allSettled(waveTasks.map((task) => task.promise));
        let hadNewEvidence = false;
        const nextCompetitorPayloads = [];

        settledWave.forEach((entry, index) => {
          const task = waveTasks[index];
          if (entry.status !== 'fulfilled' || !entry.value) return;
          const payload = entry.value;

          if (task.kind === 'competitor') {
            const competitorRefs = normalizeList(payload?.competitors);
            if (competitorRefs.length > 0) {
              nextCompetitorPayloads.push({ query: task.query || target, payload });
              hadNewEvidence = true;
            }
            return;
          }

          if (task.kind === 'market') {
            const marketRefs = normalizeList(payload?.references);
            if (marketRefs.length > 0) {
              marketReport = {
                ...(marketReport || {}),
                ...payload,
                references: mergeUniqueEvidence(marketReport?.references, payload?.references)
              };
              hadNewEvidence = true;
            }
            return;
          }

          if (task.kind === 'financial') {
            const financialRefs = normalizeList(payload?.references);
            if (financialRefs.length > 0 || Number(payload?.repoCount || 0) > 0) {
              financialData = {
                ...(financialData || {}),
                ...payload,
                repoCount: Math.max(Number(financialData?.repoCount || 0), Number(payload?.repoCount || financialRefs.length || 0)),
                references: mergeUniqueEvidence(financialData?.references, payload?.references)
              };
              hadNewEvidence = true;
            }
            return;
          }

          const industryItems = normalizeList(payload);
          if (industryItems.length > 0) {
            industryData = {
              ...(industryData && typeof industryData === 'object' && !Array.isArray(industryData) ? industryData : {}),
              results: mergeUniqueEvidence(industryData, industryItems)
            };
            hadNewEvidence = true;
          }
        });

        if (nextCompetitorPayloads.length > 0) {
          const mergedWaveCompetitors = mergeCompetitorSearchResults(
            target,
            nextCompetitorPayloads.map((entry) => entry.query),
            nextCompetitorPayloads.map((entry) => ({ status: 'fulfilled', value: entry.payload }))
          );
          competitorData = mergeCompetitorPayload(target, competitorData, mergedWaveCompetitors);
        }

        const previousGapCount = dataCompleteness.dataGapReasons.length;
        dataCompleteness = computeDataCompletenessState(target, industryData, competitorData, marketReport, financialData);

        if (
          dataCompleteness.criticalGapCount < AI_ANALYZE_GAP_FOLLOWUP_TRIGGER
          && dataCompleteness.completenessScore >= AI_ANALYZE_COMPLETENESS_CONFIDENCE_FLOOR
        ) {
          followupStopReason = 'gaps_recovered';
          break;
        }

        if (!hadNewEvidence || dataCompleteness.dataGapReasons.length >= previousGapCount) {
          followupStopReason = 'insufficient_new_evidence';
          break;
        }

        if ((Date.now() - followupStartedAt) >= AI_ANALYZE_GAP_FOLLOWUP_LATENCY_BUDGET_MS) {
          followupStopReason = 'latency_budget_exhausted';
          break;
        }
      }
    }

    const {
      industryList,
      competitorList,
      industryNames,
      competitorNames,
      marketReferences,
      financialReferences,
      competitorSourceCounts,
      competitorCoverageSourceCounts,
      competitorAvgRelevance,
      financialReferenceCount,
      coverageSourceCount,
      dataGapFlags,
      dataGapReasons,
      dataGapFollowupQueries,
      criticalGapCount,
      completenessScore
    } = dataCompleteness;

    const followupLatencyMs = Date.now() - followupStartedAt;
    const followupExhausted = followupTriggered && (
      criticalGapCount >= AI_ANALYZE_GAP_FOLLOWUP_TRIGGER
      || completenessScore < AI_ANALYZE_COMPLETENESS_CONFIDENCE_FLOOR
    );
    const completenessDegradedReason = followupExhausted
      ? `data_completeness_insufficient:${followupStopReason}`
      : null;
    const mcpHealth = collectMcpHealth({
      industryData,
      competitorData,
      marketReport,
      financialData,
      regulatoryFilings,
      newsStream
    });

    const industryStat = {};
    for (const row of usedRows) {
      if (!row.industry) continue;
      industryStat[row.industry] = (industryStat[row.industry] || 0) + 1;
    }

    const topIndustries = Object.entries(industryStat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, AI_ANALYZE_TOP_INDUSTRY_LIMIT)
      .map(([name, count]) => ({ name, count }));

    emitQualityTelemetry('quality.ai_analyze.pre_ai_snapshot', {
      analysisRequestId,
      stage: 'controller_pre_ai',
      status: dataGapReasons.length > 0 ? 'degraded' : 'ok',
      quality: {
        dataGapFlags,
        dataGapReasons,
        sourceCoverageCount: coverageSourceCount,
        competitorAvgRelevance,
        competitorSignalCount: competitorNames.length,
        industrySignalCount: industryNames.length,
        marketReferenceCount: marketReferences.length,
        financialReferenceCount,
        followupTriggered,
        followupWaveAttempts,
        followupStopReason,
        followupLatencyMs,
        completenessScore,
        mcpUsedFallback: mcpHealth.usedFallback,
        mcpFallbackReasons: mcpHealth.fallbackReasons,
        mcpPartialFailureSources: mcpHealth.partialFailureSources
      },
      tags: {
        layer: 'controller'
      }
    });

    await emitWorkflowProgress(progressCallback, 'model_scoring', 76, 'running', {
      message: 'Running model scoring'
    });

    const featureRows = buildFeatureRows(usedRows, target, industryNames, competitorNames);
    const modelResult = buildModelResult(featureRows);

    const peers = buildPeerCandidates(target, competitorNames, modelResult.ranking);

    const peerRows = peers
      .map((peer) => {
        const rankingItem = (modelResult.ranking || []).find(
          (item) => String(item.name || '').toLowerCase() === String(peer.name || '').toLowerCase()
        );
        return {
          name: peer.name,
          industry: rankingItem?.industry || peer.industry || '\u672a\u5206\u7c7b',
          source: peer.source,
          topsisScore: rankingItem?.topsisScore ?? 0
        };
      })
      .slice(0, 10);

    const peerIndustryStats = buildPeerIndustrySummary(peerRows);
    const peerInsights = buildPeerInsights(peerRows, peerIndustryStats);
    const peerSuggestions = buildPeerSuggestions(peerIndustryStats, peerRows);

    const keyFindings = [
      `Analysis target: ${target}`,
      matchedRows.length > 0
        ? `Matched uploaded records: ${matchedRows.length}`
        : 'No direct uploaded record matched target; using recent uploads as reference.',
      topIndustries.length > 0
        ? `Top industries in uploads: ${topIndustries.map((i) => `${i.name}(${i.count})`).join(', ')}`
        : 'Industry fields in uploads are sparse.',
      Object.values(competitorSourceCounts).some((count) => Number(count || 0) > 0)
        ? `Competitor signal sources: ${Object.entries(competitorSourceCounts)
          .map(([source, count]) => `${String(source).toUpperCase()} ${Number(count || 0)}`)
          .join(', ')}`
        : `Competitor signal count: ${competitorList.length}`,
      competitorAvgRelevance > 0
        ? `Competitor avg relevance: ${competitorAvgRelevance}`
        : 'Competitor relevance is low; add anchored follow-up queries.',
      marketReferences.length > 0
        ? `Market references: ${marketReferences.length}`
        : 'Insufficient market references; expand retrieval sources.',
      financialReferenceCount > 0
        ? `Financial/public references: ${financialReferenceCount}`
        : 'Insufficient financial/public references; add IR and annual-report channels.',
      dataGapReasons.length > 0
        ? `Data gap flags: ${dataGapReasons.join(', ')}`
        : 'Data completeness checks passed.',
      `Model method: ${modelResult.method}`,
      `TOPSIS trend (Theil-Sen): ${modelResult.trendLabel} (slope ${modelResult.trendSlope})`,
      ...peerInsights
    ];

    const suggestions = [
      topIndustries.length > 0
        ? `Prioritize a monthly tracking board for ${topIndustries[0].name}: demand, price, competitor moves, channel efficiency.`
        : 'Enrich uploaded enterprise records with industry fields to improve explainability.',
      matchedRows.length === 0
        ? 'Upload records directly related to the target to improve precision.'
        : 'Compare matched peers by scale and segment to improve actionability.',
      modelResult.ranking.length > 0
        ? `Prioritize TOP samples: ${modelResult.ranking.slice(0, 3).map((item) => item.name).join(', ')}`
        : 'Sample size is insufficient; upload more enterprise records before relying on ranking.',
      ...dataGapFollowupQueries.map((query) => `Follow-up query: ${query}`),
      ...peerSuggestions
    ];

    await emitWorkflowProgress(progressCallback, 'ai_narrative', 90, 'running', {
      message: 'Generating AI narrative'
    });

    let aiNarrativeResult;
    try {
      const narrativePayload = {
        target,
        uploaded: {
          matchedCount: matchedRows.length,
          usedCount: usedRows.length,
          topIndustries
        },
        industryNames,
        competitorNames,
        model: modelResult,
        peers: peerRows,
        peerResearch: peerIndustryStats,
        marketReport,
        financialData,
        regulatoryFilings,
        newsStream,
        mcpCoverage: {
          industrySignalCount: industryNames.length,
          competitorSignalCount: competitorNames.length,
          competitorSources: competitorSourceCounts,
          competitorCoverageSources: competitorCoverageSourceCounts,
          competitorAvgRelevance,
          marketReferenceCount: marketReferences.length,
          financialReferenceCount,
          dataGapFlags,
          dataGapCount: dataGapReasons.length,
          dataGapFollowupQueries,
          mcpHealth,
          dataGapFollowup: {
            triggered: followupTriggered,
            attempts: followupWaveAttempts,
            stopReason: followupStopReason,
            latencyMs: followupLatencyMs,
            completenessScore,
            confidenceFloor: AI_ANALYZE_COMPLETENESS_CONFIDENCE_FLOOR
          }
        },
        keyFindings,
        suggestions,
        responseFormat: req.body?.responseFormat
      };

      if (streamRequested) {
        aiNarrativeResult = await aiService.generateAnalysisNarrativeStream(narrativePayload, {
          configOverride: aiConfigOverride,
          onEvent: (event) => {
            if (streamEnded) return;
            writeSseEvent(res, event?.type || 'ai_analyze.event', event);
          },
          telemetryContext: {
            analysisRequestId,
            streamRequested
          }
        });
      } else {
        aiNarrativeResult = await aiService.generateAnalysisNarrative(narrativePayload, {
          configOverride: aiConfigOverride,
          telemetryContext: {
            analysisRequestId,
            streamRequested
          }
        });
      }
    } catch (aiErr) {
      logger.error('MCP aiAnalyze narrative generation failed:', aiErr?.message || aiErr);
      const status = Number(aiErr?.status || 502);
      const retryAfter = parsePositiveInt(aiErr?.retryAfterSec, 0, 300);
      const isRateLimited = status === 429;
      const isTimeout = status === 504;
      const responseStatus = isRateLimited ? 429 : (isTimeout ? 504 : 502);
      await emitWorkflowProgress(progressCallback, 'failed', 100, 'failed', {
        error: aiErr?.message || 'ai_narrative_failed',
        status: responseStatus
      });
      emitQualityTelemetry('quality.ai_analyze.failed', {
        analysisRequestId,
        stage: 'controller_failed',
        status: 'error',
        quality: {
          degraded: false,
          retryable: isRateLimited || isTimeout
        },
        perf: {
          durationMs: Date.now() - analysisStartedAt
        },
        error: {
          status: responseStatus,
          retryAfter: retryAfter > 0 ? retryAfter : 0,
          limitHint: aiErr?.limitHint || null,
          message: aiErr?.message || 'ai_narrative_failed'
        },
        tags: {
          layer: 'controller'
        }
      });
      const failureTrendReport = readTelemetryTrendReport(telemetryWindowMs);
      if (failureTrendReport) {
        emitQualityTelemetry('quality.ai_analyze.trend_report', {
          analysisRequestId,
          stage: 'controller_trend_report',
          status: 'ok',
          quality: {
            report: failureTrendReport
          },
          tags: {
            layer: 'controller'
          }
        });
      }

      if (streamRequested) {
        if (!streamEnded) {
          writeSseEvent(res, 'ai_analyze.error', {
            success: false,
            status: responseStatus,
            message: isRateLimited
              ? 'AI provider rate-limited. Retrying automatically; please try again shortly.'
              : isTimeout
                ? 'AI provider timed out; please retry shortly.'
                : 'AI provider call failed; check API key/model configuration and retry.',
            retryable: isRateLimited || isTimeout,
            retryAfter: retryAfter > 0 ? retryAfter : undefined,
            limitHint: aiErr?.limitHint || (isRateLimited ? 'provider_rate_limited' : (isTimeout ? 'provider_timeout' : 'provider_error'))
          });
        }
        endStreamOnce();
        return;
      }

      return res.status(responseStatus).json({
        success: false,
        message: isRateLimited
          ? 'AI provider rate-limited. Retrying automatically; please try again shortly.'
          : isTimeout
            ? 'AI provider timed out; please retry shortly.'
            : 'AI provider call failed; check API key/model configuration and retry.',
        retryable: isRateLimited || isTimeout,
        retryAfter: retryAfter > 0 ? retryAfter : undefined,
        limitHint: aiErr?.limitHint || (isRateLimited ? 'provider_rate_limited' : (isTimeout ? 'provider_timeout' : 'provider_error'))
      });
    }

    if (completenessDegradedReason) {
      aiNarrativeResult = {
        ...aiNarrativeResult,
        degraded: true,
        degradedReason: aiNarrativeResult?.degradedReason || completenessDegradedReason
      };
    }

    const summary = `${keyFindings.join('; ')}.`;
    const qualityContract = buildQualityContract({
      aiNarrativeResult,
      dataGapReasons,
      dataGapFlags,
      coverageSourceCount,
      competitorAvgRelevance
    });

    if (Boolean(aiNarrativeResult?.degraded)) {
      emitQualityTelemetry('quality.ai_analyze.degraded', {
        analysisRequestId,
        stage: 'controller_degraded',
        status: 'degraded',
        quality: {
          degraded: true,
          degradedReason: aiNarrativeResult?.degradedReason || null,
          qualityScore: qualityContract?.qualityScore || 0,
          qualityGateStatus: qualityContract?.qualityGate?.status || 'degraded',
          dataGapReasons,
          sourceCoverageCount: coverageSourceCount
        },
        perf: {
          durationMs: Date.now() - analysisStartedAt
        },
        tags: {
          layer: 'controller'
        }
      });
    }

    const response = {
      success: true,
      data: {
        target,
        uploaded: {
          matchedCount: matchedRows.length,
          usedCount: usedRows.length,
          samples: usedRows.slice(0, AI_ANALYZE_SAMPLE_LIMIT),
          topIndustries
        },
        mcp: {
          mcpHealth,
          industryData,
          competitorData,
          marketReport,
          financialData,
          regulatoryFilings,
          newsStream
        },
        peerAnalysis: {
          peers: peerRows,
          industryStats: peerIndustryStats
        },
        model: modelResult,
        analysis: {
          summary,
          keyFindings,
          suggestions,
          evidence: {
            competitorTopSources: competitorList.slice(0, 6).map((item) => ({
              name: item?.name,
              url: item?.url,
              source: item?.source,
              relevanceScore: Number(item?.relevanceScore || 0)
            })),
            marketTopReferences: marketReferences.slice(0, 6).map((item) => ({
              name: item?.name,
              url: item?.url,
              summary: item?.summary || item?.description || ''
            })),
            financialTopReferences: financialReferences.slice(0, 6).map((item) => ({
              name: item?.name,
              url: item?.url,
              relevanceScore: Number(item?.relevanceScore || 0)
            })),
            regulatoryTopReferences: regulatoryReferences.slice(0, 6).map((item) => ({
              name: item?.name,
              url: item?.url,
              source: item?.source,
              relevanceScore: Number(item?.relevanceScore || 0)
            })),
            newsTopReferences: newsReferences.slice(0, 6).map((item) => ({
              name: item?.name || item?.title || '',
              url: item?.url,
              source: item?.source,
              relevanceScore: Number(item?.relevanceScore || 0)
            })),
            dataCompleteness: {
              dataGapFlags,
              dataGapReasons,
              dataGapCount: dataGapReasons.length,
              followup: {
                triggered: followupTriggered,
                attempts: followupWaveAttempts,
                maxAttempts: AI_ANALYZE_GAP_FOLLOWUP_MAX_ATTEMPTS,
                stopReason: followupStopReason,
                latencyMs: followupLatencyMs,
                latencyBudgetMs: AI_ANALYZE_GAP_FOLLOWUP_LATENCY_BUDGET_MS,
                gapTriggerThreshold: AI_ANALYZE_GAP_FOLLOWUP_TRIGGER,
                criticalGapCount,
                completenessScore,
                confidenceFloor: AI_ANALYZE_COMPLETENESS_CONFIDENCE_FLOOR,
                exhausted: followupExhausted
              },
              degradedReason: completenessDegradedReason,
              metrics: {
                industrySignalCount: industryNames.length,
                competitorSignalCount: competitorNames.length,
                competitorAvgRelevance,
                marketReferenceCount: marketReferences.length,
                financialReferenceCount,
                sourceCoverageCount: coverageSourceCount
              },
              suggestedQueries: dataGapFollowupQueries
            }
          },
          aiNarrative: aiNarrativeResult.text,
          aiMeta: {
            modelUsed: aiNarrativeResult.modelUsed,
            providerUsed: aiNarrativeResult.providerUsed,
            protocol: aiNarrativeResult.protocol || null,
            degraded: aiNarrativeResult.degraded,
            degradedReason: aiNarrativeResult.degradedReason || null,
            claimSupport: aiNarrativeResult?.claimSupport || null,
            promptVersion: aiNarrativeResult.promptVersion || 'unknown',
            analysisRequestId,
            eventVersion: '1.0'
          },
          qualityContract
        }
      }
    };

    emitQualityTelemetry('quality.ai_analyze.completed', {
      analysisRequestId,
      stage: 'controller_completed',
      status: aiNarrativeResult?.degraded ? 'degraded' : 'ok',
      quality: {
        degraded: Boolean(aiNarrativeResult?.degraded),
        degradedReason: aiNarrativeResult?.degradedReason || null,
        qualityScore: qualityContract?.qualityScore || 0,
        qualityGateStatus: qualityContract?.qualityGate?.status || 'warn',
        dataGapCount: dataGapReasons.length,
        dataGapReasons,
        sourceCoverageCount: coverageSourceCount,
        contractVersion: qualityContract?.contractVersion || 'v1'
      },
      perf: {
        durationMs: Date.now() - analysisStartedAt,
        streamRequested
      },
      tags: {
        layer: 'controller'
      }
    });
    const trendReport = readTelemetryTrendReport(telemetryWindowMs);
    if (trendReport) {
      emitQualityTelemetry('quality.ai_analyze.trend_report', {
        analysisRequestId,
        stage: 'controller_trend_report',
        status: 'ok',
        quality: {
          report: trendReport
        },
        tags: {
          layer: 'controller'
        }
      });
    }

    await emitWorkflowProgress(progressCallback, 'completed', 100, 'completed', {
      message: 'Analysis completed'
    });

    if (!streamRequested && !bypassCache && !isDegradedAiResponse(response)) {
      await redis.setex(cacheKey, AI_ANALYZE_CACHE_TTL_SECONDS, JSON.stringify(response)).catch(() => {});
    }

    if (streamRequested) {
      if (!streamEnded) {
        writeSseEvent(res, 'ai_analyze.completed', response);
      }
      endStreamOnce();
      return;
    }

    res.json(response);
  } catch (err) {
    logger.error('MCP aiAnalyze error:', err);
    await emitWorkflowProgress(progressCallback, 'failed', 100, 'failed', {
      error: err?.message || 'mcp_ai_analyze_error'
    });

    emitQualityTelemetry('quality.ai_analyze.failed', {
      analysisRequestId: 'unknown',
      stage: 'controller_unhandled',
      status: 'error',
      error: {
        status: 500,
        limitHint: err?.limitHint || null,
        message: err?.message || 'mcp_ai_analyze_error'
      },
      tags: {
        layer: 'controller'
      }
    });

    if (toBoolean(req.body?.stream, false)) {
      try {
        writeSseEvent(res, 'ai_analyze.error', {
          success: false,
          status: 500,
          message: 'MCP aiAnalyze internal error'
        });
      } catch {
        // ignore response write errors
      }

      try {
        res.end();
      } catch {
        // ignore response close errors
      }
      return;
    }

    next(err);
  }
};

const createBufferedResponse = () => {
  let statusCode = 200;
  let payload = null;

  return {
    status(code) {
      statusCode = Number(code) || 500;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    },
    setHeader() {},
    flushHeaders() {},
    write() {},
    end() {},
    getCaptured() {
      return { statusCode, payload };
    }
  };
};

const executeAiAnalyzeJob = async ({ jobId, target, responseFormat, user }) => {
  await aiAnalyzeJobService.appendProgress(jobId, {
    workflowStep: 'queued',
    progress: 5,
    status: 'running',
    message: 'Analysis task accepted'
  });

  const internalReq = {
    body: {
      target,
      responseFormat,
      stream: false
    },
    user
  };

  const bufferedRes = createBufferedResponse();

  await aiAnalyze(
    internalReq,
    bufferedRes,
    (err) => {
      throw err;
    },
    {
      forceNonStream: true,
      disableCache: false,
      onProgress: async (progress) => {
        await aiAnalyzeJobService.appendProgress(jobId, {
          workflowStep: progress?.workflowStep || progress?.step || 'running',
          progress: Number(progress?.progress || 0),
          status: progress?.status || 'running',
          message: String(progress?.message || progress?.detail || '').trim(),
          extra: progress
        });
      }
    }
  );

  const captured = bufferedRes.getCaptured();
  if (!captured?.payload || captured.statusCode >= 400 || captured.payload.success !== true) {
    const message = captured?.payload?.message || captured?.payload?.error
      || `AI analyze failed with HTTP ${captured.statusCode}`;
    await aiAnalyzeJobService.markFailed(jobId, message, {
      statusCode: captured?.statusCode || 500,
      response: captured?.payload || null
    });
    return;
  }

  await aiAnalyzeJobService.markCompleted(jobId, captured.payload.data);
};

const startAiAnalyzeJob = async (req, res, next) => {
  try {
    const target = (req.body?.target || '').trim().slice(0, 200);
    if (!target) {
      return res.status(400).json({ success: false, message: 'Missing target' });
    }

    const userId = resolveUserId(req.user);
    const adminUser = isAdminUser(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const created = await aiAnalyzeJobService.createJob({
      userId: adminUser ? (userId || null) : userId,
      target,
      requestPayload: {
        responseFormat: req.body?.responseFormat || null,
        requestedAt: new Date().toISOString()
      }
    });

    const jobSummary = aiAnalyzeJobService.toJobSummary(created);

    aiAnalyzeJobService.startBackgroundJob(created.id, async () => {
      await executeAiAnalyzeJob({
        jobId: created.id,
        target,
        responseFormat: req.body?.responseFormat,
        user: req.user
      });
    });

    return res.status(202).json({
      success: true,
      message: 'AI analysis job started',
      data: jobSummary
    });
  } catch (err) {
    logger.error('startAiAnalyzeJob error:', err);
    return next(err);
  }
};

const listAiAnalyzeJobs = async (req, res, next) => {
  try {
    const userId = resolveUserId(req.user);
    const adminUser = isAdminUser(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const limit = parsePositiveInt(req.query?.limit, AI_ANALYZE_JOB_LIST_LIMIT, 100);
    const offset = parseOffset(req.query?.offset, 0);
    const status = String(req.query?.status || '').trim().toLowerCase();
    const jobs = await aiAnalyzeJobService.listJobs({
      userId,
      isAdmin: adminUser,
      limit,
      offset,
      status
    });

    const items = jobs.map((job) => ({
      ...aiAnalyzeJobService.toJobSummary(job),
      hasResult: Boolean(job?.result_json)
    }));

    return res.json({
      success: true,
      data: {
        items,
        limit,
        offset,
        total: items.length
      }
    });
  } catch (err) {
    logger.error('listAiAnalyzeJobs error:', err);
    return next(err);
  }
};

const getAiAnalyzeJob = async (req, res, next) => {
  try {
    const jobId = parseJobId(req.params?.jobId);
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Invalid jobId' });
    }

    const userId = resolveUserId(req.user);
    const adminUser = isAdminUser(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const job = await aiAnalyzeJobService.getJob(jobId, {
      userId,
      isAdmin: adminUser
    });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    return res.json({
      success: true,
      data: {
        ...aiAnalyzeJobService.toJobSummary(job),
        hasResult: Boolean(job?.result_json)
      }
    });
  } catch (err) {
    logger.error('getAiAnalyzeJob error:', err);
    return next(err);
  }
};

const getAiAnalyzeJobResult = async (req, res, next) => {
  try {
    const jobId = parseJobId(req.params?.jobId);
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Invalid jobId' });
    }

    const userId = resolveUserId(req.user);
    const adminUser = isAdminUser(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const job = await aiAnalyzeJobService.getJob(jobId, {
      userId,
      isAdmin: adminUser
    });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (!job.result_json) {
      if (String(job.status || '').toLowerCase() === 'failed') {
        return res.status(409).json({
          success: false,
          message: job.error_message || 'Analysis failed'
        });
      }
      return res.status(202).json({
        success: false,
        message: 'Result is not ready',
        data: aiAnalyzeJobService.toJobSummary(job)
      });
    }

    return res.json({
      success: true,
      data: job.result_json,
      meta: aiAnalyzeJobService.toJobSummary(job)
    });
  } catch (err) {
    logger.error('getAiAnalyzeJobResult error:', err);
    return next(err);
  }
};

exports.aiAnalyze = aiAnalyze;
exports.startAiAnalyzeJob = startAiAnalyzeJob;
exports.listAiAnalyzeJobs = listAiAnalyzeJobs;
exports.getAiAnalyzeJob = getAiAnalyzeJob;
exports.getAiAnalyzeJobResult = getAiAnalyzeJobResult;

