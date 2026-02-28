const { randomUUID } = require('crypto');
const pool = require('../config/database');
const logger = require('../config/logger');

const TERMINAL_STATUS = new Set(['completed', 'failed']);

const normalizeStatus = (value, fallback = 'running') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['queued', 'pending', 'running', 'completed', 'failed'].includes(normalized)) {
    if (normalized === 'pending') return 'queued';
    return normalized;
  }
  return fallback;
};

const normalizeProgress = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
};

const parseRequestPayload = (value) => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizePipeline = (value) => String(value || '').trim().slice(0, 80);

const resolvePipeline = (row = {}) => {
  const requestPayload = parseRequestPayload(row.request_payload);
  return normalizePipeline(row.pipeline || requestPayload.pipeline || '');
};

const resolveTraceMessage = (entry = {}) => {
  if (entry.message && typeof entry.message === 'string') return entry.message;
  if (entry.error && typeof entry.error === 'string') return entry.error;
  return '';
};

class AiAnalyzeJobService {
  constructor() {
    this.activeJobs = new Set();
  }

  toJobSummary(row = {}) {
    if (!row) return null;
    const trace = Array.isArray(row.workflow_trace) ? row.workflow_trace : [];
    const latestTrace = trace.length > 0 ? trace[trace.length - 1] : null;
    return {
      id: row.id,
      jobId: row.id,
      userId: row.user_id,
      target: row.target,
      pipeline: resolvePipeline(row),
      status: row.status,
      progress: normalizeProgress(row.progress, 0),
      workflowStep: row.workflow_step || '',
      message: row.error_message || resolveTraceMessage(latestTrace),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at
    };
  }

  async createJob({ userId, target, pipeline = '', requestPayload = {} }) {
    const jobId = randomUUID();
    const normalizedPipeline = normalizePipeline(pipeline);
    const normalizedRequestPayload = {
      ...(requestPayload && typeof requestPayload === 'object' ? requestPayload : {}),
      ...(normalizedPipeline ? { pipeline: normalizedPipeline } : {})
    };
    const traceEntry = [{
      step: 'queued',
      status: 'queued',
      progress: 0,
      message: 'Analysis job queued',
      at: new Date().toISOString()
    }];

    const result = await pool.query(
      `INSERT INTO ai_analysis_jobs
        (id, user_id, target, status, progress, workflow_step, workflow_trace, request_payload)
       VALUES ($1, $2, $3, 'queued', 0, 'queued', $4::jsonb, $5::jsonb)
       RETURNING *`,
      [jobId, userId || null, target, JSON.stringify(traceEntry), JSON.stringify(normalizedRequestPayload)]
    );

    return result.rows[0];
  }

  async appendProgress(jobId, update = {}) {
    const status = normalizeStatus(update.status, 'running');
    const progress = normalizeProgress(update.progress, status === 'completed' ? 100 : 0);
    const workflowStep = String(update.workflowStep || update.step || '').trim() || 'running';
    const message = String(update.message || update.detail || '').trim();
    const extra = update && typeof update === 'object' ? update : {};

    const traceEntry = [{
      step: workflowStep,
      status,
      progress,
      message,
      at: new Date().toISOString(),
      extra
    }];

    const completedAtExpression = TERMINAL_STATUS.has(status)
      ? 'NOW()'
      : 'completed_at';

    const result = await pool.query(
      `UPDATE ai_analysis_jobs
         SET status = $2,
             progress = $3,
             workflow_step = $4,
             workflow_trace = COALESCE(workflow_trace, '[]'::jsonb) || $5::jsonb,
             started_at = COALESCE(started_at, CASE WHEN $2 <> 'queued' THEN NOW() ELSE NULL END),
             completed_at = ${completedAtExpression},
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId, status, progress, workflowStep, JSON.stringify(traceEntry)]
    );

    return result.rows[0] || null;
  }

  async markCompleted(jobId, resultPayload) {
    const traceEntry = [{
      step: 'completed',
      status: 'completed',
      progress: 100,
      message: 'Analysis completed',
      at: new Date().toISOString()
    }];

    const result = await pool.query(
      `UPDATE ai_analysis_jobs
         SET status = 'completed',
             progress = 100,
             workflow_step = 'completed',
             result_json = $2::jsonb,
             error_message = NULL,
             workflow_trace = COALESCE(workflow_trace, '[]'::jsonb) || $3::jsonb,
             started_at = COALESCE(started_at, NOW()),
             completed_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId, JSON.stringify(resultPayload || {}), JSON.stringify(traceEntry)]
    );

    return result.rows[0] || null;
  }

  async markFailed(jobId, errorMessage, extra = {}) {
    const message = String(errorMessage || 'Analysis failed').slice(0, 1000);
    const traceEntry = [{
      step: 'failed',
      status: 'failed',
      progress: 100,
      message,
      at: new Date().toISOString(),
      extra
    }];

    const result = await pool.query(
      `UPDATE ai_analysis_jobs
         SET status = 'failed',
             progress = 100,
             workflow_step = 'failed',
             error_message = $2,
             workflow_trace = COALESCE(workflow_trace, '[]'::jsonb) || $3::jsonb,
             started_at = COALESCE(started_at, NOW()),
             completed_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId, message, JSON.stringify(traceEntry)]
    );

    return result.rows[0] || null;
  }

  async getJob(jobId, { userId = null, isAdmin = false, pipeline = '' } = {}) {
    const normalizedId = String(jobId || '').trim();
    if (!normalizedId) return null;
    const normalizedPipeline = normalizePipeline(pipeline);

    const where = ['id = $1'];
    const params = [normalizedId];
    if (!isAdmin) {
      where.push(`user_id = $${params.length + 1}`);
      params.push(userId);
    }
    if (normalizedPipeline) {
      where.push(`COALESCE(request_payload->>'pipeline', '') = $${params.length + 1}`);
      params.push(normalizedPipeline);
    }

    const query = `SELECT * FROM ai_analysis_jobs WHERE ${where.join(' AND ')}`;
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  async listJobs({ userId = null, isAdmin = false, limit = 20, offset = 0, status = '', pipeline = '' } = {}) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const normalizedOffset = Math.max(Number(offset) || 0, 0);
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedPipeline = normalizePipeline(pipeline);

    const where = [];
    const params = [];

    if (!isAdmin) {
      where.push(`user_id = $${params.length + 1}`);
      params.push(userId);
    }

    if (normalizedStatus) {
      where.push(`status = $${params.length + 1}`);
      params.push(normalizedStatus);
    }
    if (normalizedPipeline) {
      where.push(`COALESCE(request_payload->>'pipeline', '') = $${params.length + 1}`);
      params.push(normalizedPipeline);
    }

    params.push(normalizedLimit, normalizedOffset);

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM ai_analysis_jobs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return result.rows;
  }

  startBackgroundJob(jobId, runner) {
    if (this.activeJobs.has(jobId)) return false;
    this.activeJobs.add(jobId);

    setImmediate(async () => {
      try {
        await runner();
      } catch (err) {
        logger.error('AI analyze background job execution failed', {
          jobId,
          error: err?.message || String(err)
        });
        await this.markFailed(jobId, err?.message || 'Background job execution failed').catch(() => {});
      } finally {
        this.activeJobs.delete(jobId);
      }
    });

    return true;
  }
}

module.exports = new AiAnalyzeJobService();
