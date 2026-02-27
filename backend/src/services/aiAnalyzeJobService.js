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

  async createJob({ userId, target, requestPayload = {} }) {
    const jobId = randomUUID();
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
      [jobId, userId || null, target, JSON.stringify(traceEntry), JSON.stringify(requestPayload || {})]
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

  async getJob(jobId, { userId = null, isAdmin = false } = {}) {
    const normalizedId = String(jobId || '').trim();
    if (!normalizedId) return null;

    const query = isAdmin
      ? 'SELECT * FROM ai_analysis_jobs WHERE id = $1'
      : 'SELECT * FROM ai_analysis_jobs WHERE id = $1 AND user_id = $2';
    const params = isAdmin ? [normalizedId] : [normalizedId, userId];
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  async listJobs({ userId = null, isAdmin = false, limit = 20, offset = 0, status = '' } = {}) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const normalizedOffset = Math.max(Number(offset) || 0, 0);
    const normalizedStatus = String(status || '').trim().toLowerCase();

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
