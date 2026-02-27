const { success, error } = require('../utils/responseFormatter');
const pool = require('../config/database');
const redis = require('../config/redis');
const { executePython } = require('../services/pythonBridge');
const logger = require('../config/logger');

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

const getRecommendationCacheKey = (enterpriseId, enterpriseUserId) => `recommendations:${enterpriseUserId || 0}:${enterpriseId}`;

const clampPriority = (value) => {
  const priority = Number.parseInt(value, 10);
  if (Number.isNaN(priority)) {
    return 0;
  }
  return Math.max(0, Math.min(10, priority));
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeRecommendations = (recommendations) => {
  let list = [];
  if (Array.isArray(recommendations)) {
    list = recommendations;
  } else if (recommendations && Array.isArray(recommendations.recommendations)) {
    list = recommendations.recommendations;
  } else if (recommendations && typeof recommendations === 'object') {
    list = [recommendations];
  }

  return list.map((item) => {
    const title = normalizeString(item.title);
    const description = normalizeString(item.description)
      || normalizeString(item.recommendation_text)
      || normalizeString(item.content)
      || normalizeString(item.text);
    const recommendationText = title && description
      ? `${title}: ${description}`
      : (description || title || 'No recommendation provided');

    return {
      recommendationText,
      priority: clampPriority(item.priority)
    };
  });
};

const INSERT_BATCH_SIZE = 100;

const getRecommendations = async (req, res) => {
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

    const cacheKey = getRecommendationCacheKey(enterpriseId, scopeResult.enterprise.user_id);

    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info(`Cache hit for recommendations: ${enterpriseId}`);
      return res.json(success(JSON.parse(cached)));
    }

    const result = await pool.query(
      'SELECT * FROM recommendations WHERE enterprise_id = $1 ORDER BY priority DESC',
      [enterpriseId]
    );

    await redis.setex(cacheKey, 300, JSON.stringify(result.rows));
    res.json(success(result.rows));
  } catch (err) {
    logger.error('Get recommendations error:', err);
    res.status(500).json(error('Failed to get recommendations'));
  }
};

const generateRecommendations = async (req, res) => {
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

    const analysis = await pool.query(
      'SELECT * FROM analysis_results WHERE enterprise_id = $1 ORDER BY created_at DESC LIMIT 1',
      [enterpriseId]
    );

    const latestAnalysis = analysis.rows[0] || {};
    const recommendations = await executePython('recommend.py', {
      enterprise: scopeResult.enterprise,
      analysis: {
        ...latestAnalysis,
        result_data: latestAnalysis.result_json || latestAnalysis.result_data || {}
      }
    });

    const normalizedRecommendations = normalizeRecommendations(recommendations);
    const rowsToInsert = normalizedRecommendations.length > 0
      ? normalizedRecommendations
      : [{ recommendationText: 'No recommendation provided', priority: 0 }];

    const createdRows = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM recommendations WHERE enterprise_id = $1',
        [enterpriseId]
      );

      for (let index = 0; index < rowsToInsert.length; index += INSERT_BATCH_SIZE) {
        const batch = rowsToInsert.slice(index, index + INSERT_BATCH_SIZE);
        const values = [];
        const params = [];

        batch.forEach((rec, rowIndex) => {
          const offset = rowIndex * 3;
          values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
          params.push(enterpriseId, rec.recommendationText, rec.priority);
        });

        const batchResult = await client.query(
          `INSERT INTO recommendations (enterprise_id, recommendation_text, priority) VALUES ${values.join(', ')} RETURNING *`,
          params
        );
        createdRows.push(...batchResult.rows);
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.warn('Rollback failed for recommendations rebuild', {
          enterpriseId,
          error: rollbackErr?.message || String(rollbackErr)
        });
      }
      throw dbErr;
    } finally {
      client.release();
    }
    await redis.del(getRecommendationCacheKey(enterpriseId, scopeResult.enterprise.user_id));

    logger.info(`Recommendations generated for enterprise: ${enterpriseId}`);
    res.status(201).json(success(createdRows, 'Recommendations generated'));
  } catch (err) {
    logger.error('Generate recommendations error:', err);
    res.status(500).json(error('Failed to generate recommendations'));
  }
};

module.exports = { getRecommendations, generateRecommendations };
