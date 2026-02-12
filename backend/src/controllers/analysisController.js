const { success, error } = require('../utils/responseFormatter');
const pool = require('../config/database');
const redis = require('../config/redis');
const { executePython } = require('../services/pythonBridge');
const { validateAnalysisRequest } = require('../utils/validator');
const logger = require('../config/logger');

const ALLOWED_ANALYSIS_TYPES = new Set(['financial', 'market_trend', 'competitiveness']);

const getAnalysis = async (req, res) => {
  try {
    const enterpriseId = Number(req.params.enterpriseId);
    if (!Number.isFinite(enterpriseId)) {
      return res.status(400).json(error('Enterprise ID must be numeric', 400));
    }

    const cacheKey = `analysis:${enterpriseId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info(`Cache hit for analysis: ${enterpriseId}`);
      return res.json(success(JSON.parse(cached)));
    }

    const result = await pool.query(
      'SELECT * FROM analysis_results WHERE enterprise_id = $1 ORDER BY created_at DESC',
      [enterpriseId]
    );

    await redis.setex(cacheKey, 300, JSON.stringify(result.rows));
    res.json(success(result.rows));
  } catch (err) {
    logger.error('Get analysis error:', err);
    res.status(500).json(error(err.message));
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

    const enterprise = await pool.query('SELECT * FROM enterprises WHERE id = $1', [enterpriseId]);
    if (enterprise.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    const analysisResult = await executePython('analyze.py', {
      enterprise: enterprise.rows[0],
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

    await redis.del(`analysis:${enterpriseId}`);
    logger.info(`Analysis created for enterprise: ${enterpriseId}`);
    res.status(201).json(success(rows, 'Analysis completed'));
  } catch (err) {
    logger.error('Create analysis error:', err);
    res.status(500).json(error(err.message));
  }
};

module.exports = { getAnalysis, createAnalysis };
