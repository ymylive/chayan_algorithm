const { success, error } = require('../utils/responseFormatter');
const pool = require('../config/database');
const redis = require('../config/redis');
const { executePython } = require('../services/pythonBridge');
const { validateAnalysisRequest } = require('../utils/validator');
const logger = require('../config/logger');

const ALLOWED_ANALYSIS_TYPES = new Set(['financial', 'market_trend', 'competitiveness']);
const ANALYSIS_CACHE_TTL_SECONDS = 300;
const ANALYSIS_DEFAULT_PAGE = 1;
const ANALYSIS_DEFAULT_LIMIT = 20;
const ANALYSIS_MAX_LIMIT = 100;
const ANALYSIS_CACHEABLE_MAX_ROWS = 200;

const isAdminUser = (user) => user && user.role === 'admin';

const resolveUserId = (user) => {
  const userId = Number(user && user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }
  return userId;
};

const fetchScopedEnterprise = async (req, enterpriseId) => {
  const adminUser = isAdminUser(req.user);
  const userId = resolveUserId(req.user);

  if (!adminUser && !userId) {
    return { forbidden: true };
  }

  const queryText = adminUser
    ? 'SELECT * FROM enterprises WHERE id = $1'
    : 'SELECT * FROM enterprises WHERE id = $1 AND user_id = $2';
  const queryParams = adminUser ? [enterpriseId] : [enterpriseId, userId];
  const enterpriseResult = await pool.query(queryText, queryParams);

  return {
    forbidden: false,
    enterprise: enterpriseResult.rows[0] || null
  };
};

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const getAnalysisCachePrefix = (enterpriseId, enterpriseUserId) => `analysis:${enterpriseUserId || 0}:${enterpriseId}`;
const getAnalysisCacheKey = (enterpriseId, enterpriseUserId, page = 'all', limit = 'all') => (
  `${getAnalysisCachePrefix(enterpriseId, enterpriseUserId)}:${page}:${limit}`
);

const invalidateAnalysisCache = async (enterpriseId, enterpriseUserId) => {
  const prefix = getAnalysisCachePrefix(enterpriseId, enterpriseUserId);
  try {
    const matchedKeys = typeof redis.keys === 'function'
      ? await redis.keys(`${prefix}:*`)
      : [];
    const keysToDelete = [...new Set([prefix, ...matchedKeys])];
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch (cacheErr) {
    logger.warn('Analysis cache invalidation failed', {
      enterpriseId,
      error: cacheErr?.message || String(cacheErr)
    });
  }
};

const getAnalysis = async (req, res) => {
  try {
    const enterpriseId = Number(req.params.enterpriseId);
    if (!Number.isFinite(enterpriseId)) {
      return res.status(400).json(error('Enterprise ID must be numeric', 400));
    }

    const scopeResult = await fetchScopedEnterprise(req, enterpriseId);
    if (scopeResult.forbidden) {
      return res.status(403).json(error('Forbidden', 403));
    }
    if (!scopeResult.enterprise) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    const hasPageQuery = req.query && req.query.page !== undefined;
    const hasLimitQuery = req.query && req.query.limit !== undefined;
    const usePagination = hasPageQuery || hasLimitQuery;

    let page = 'all';
    let limit = 'all';
    let offset = 0;

    if (usePagination) {
      const parsedPage = hasPageQuery ? parsePositiveInt(req.query.page) : ANALYSIS_DEFAULT_PAGE;
      const parsedLimit = hasLimitQuery ? parsePositiveInt(req.query.limit) : ANALYSIS_DEFAULT_LIMIT;
      if (!parsedPage || !parsedLimit) {
        return res.status(400).json(error('Page and limit must be positive integers', 400));
      }
      page = parsedPage;
      limit = Math.min(parsedLimit, ANALYSIS_MAX_LIMIT);
      offset = (page - 1) * limit;
    }

    const cacheKey = getAnalysisCacheKey(enterpriseId, scopeResult.enterprise.user_id, page, limit);

    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info(`Cache hit for analysis: ${enterpriseId}`);
      return res.json(success(JSON.parse(cached)));
    }

    const result = usePagination
      ? await pool.query(
        'SELECT * FROM analysis_results WHERE enterprise_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [enterpriseId, limit, offset]
      )
      : await pool.query(
        'SELECT * FROM analysis_results WHERE enterprise_id = $1 ORDER BY created_at DESC',
        [enterpriseId]
      );

    const shouldCache = usePagination || result.rows.length <= ANALYSIS_CACHEABLE_MAX_ROWS;
    if (shouldCache) {
      await redis.setex(cacheKey, ANALYSIS_CACHE_TTL_SECONDS, JSON.stringify(result.rows));
    }
    res.json(success(result.rows));
  } catch (err) {
    logger.error('Get analysis error:', err);
    res.status(500).json(error('Failed to get analysis'));
  }
};

const createAnalysis = async (req, res) => {
  try {
    const validation = validateAnalysisRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json(error(validation.errors.join(', '), 400));
    }

    const enterpriseId = Number(req.body.enterpriseId);
    const metrics = Array.isArray(req.body.metrics)
      ? req.body.metrics.filter(metric => ALLOWED_ANALYSIS_TYPES.has(metric))
      : [];

    const scopeResult = await fetchScopedEnterprise(req, enterpriseId);
    if (scopeResult.forbidden) {
      return res.status(403).json(error('Forbidden', 403));
    }
    if (!scopeResult.enterprise) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    const analysisResult = await executePython('analyze.py', {
      enterprise: scopeResult.enterprise,
      metrics
    });

    const resultData = analysisResult && typeof analysisResult === 'object' && !Array.isArray(analysisResult)
      ? analysisResult
      : {};
    const typesToPersist = Array.from(new Set([
      ...metrics.filter(type => resultData[type] !== undefined),
      ...Object.keys(resultData).filter(type => ALLOWED_ANALYSIS_TYPES.has(type))
    ]));

    const insertPromises = typesToPersist.map(type => pool.query(
      'INSERT INTO analysis_results (enterprise_id, analysis_type, result_json) VALUES ($1, $2, $3) RETURNING *',
      [enterpriseId, type, resultData[type]]
    ));
    const inserted = await Promise.all(insertPromises);
    const rows = inserted.map(item => item.rows[0]);

    await invalidateAnalysisCache(enterpriseId, scopeResult.enterprise.user_id);
    logger.info(`Analysis created for enterprise: ${enterpriseId}`);
    res.status(201).json(success(rows, 'Analysis completed'));
  } catch (err) {
    logger.error('Create analysis error:', err);
    res.status(500).json(error('Failed to create analysis'));
  }
};

module.exports = { getAnalysis, createAnalysis };
