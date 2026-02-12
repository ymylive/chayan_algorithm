const { executePython } = require('../services/pythonBridge');
const db = require('../config/database');

const ALLOWED_ANALYSIS_TYPES = new Set(['financial', 'market_trend', 'competitiveness']);

const analyze = async (req, res, next) => {
  try {
    const { enterpriseId, analysisType, data } = req.body;
    const normalizedEnterpriseId = Number(enterpriseId);
    const normalizedType = ALLOWED_ANALYSIS_TYPES.has(analysisType) ? analysisType : 'financial';

    if (!Number.isFinite(normalizedEnterpriseId)) {
      return res.status(400).json({ success: false, message: 'Enterprise ID must be numeric' });
    }

    const result = await executePython('analyzer.py', { type: normalizedType, data });

    await db.query(
      'INSERT INTO analysis_results (enterprise_id, analysis_type, result_json, created_at) VALUES ($1, $2, $3, NOW())',
      [normalizedEnterpriseId, normalizedType, JSON.stringify(result)]
    );

    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

module.exports = { analyze };
