const { success, error } = require('../utils/responseFormatter');
const pool = require('../config/database');
const redis = require('../config/redis');
const { executePython } = require('../services/pythonBridge');
const logger = require('../config/logger');

const getRecommendations = async (req, res) => {
  try {
    const { enterpriseId } = req.params;
    const cacheKey = `recommendations:${enterpriseId}`;

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
    res.status(500).json(error(err.message));
  }
};

const generateRecommendations = async (req, res) => {
  try {
    const { enterpriseId } = req.params;

    const enterprise = await pool.query('SELECT * FROM enterprises WHERE id = $1', [enterpriseId]);
    if (enterprise.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    const analysis = await pool.query(
      'SELECT * FROM analysis_results WHERE enterprise_id = $1 ORDER BY created_at DESC LIMIT 1',
      [enterpriseId]
    );

    const recommendations = await executePython('recommend.py', {
      enterprise: enterprise.rows[0],
      analysis: analysis.rows[0] || {}
    });

    const insertPromises = recommendations.map(rec =>
      pool.query(
        'INSERT INTO recommendations (enterprise_id, title, description, priority, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [enterpriseId, rec.title, rec.description, rec.priority, rec.category]
      )
    );

    const results = await Promise.all(insertPromises);
    await redis.del(`recommendations:${enterpriseId}`);

    logger.info(`Recommendations generated for enterprise: ${enterpriseId}`);
    res.status(201).json(success(results.map(r => r.rows[0]), 'Recommendations generated'));
  } catch (err) {
    logger.error('Generate recommendations error:', err);
    res.status(500).json(error(err.message));
  }
};

module.exports = { getRecommendations, generateRecommendations };
