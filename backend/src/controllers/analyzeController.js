const { executePython } = require('../services/pythonBridge');
const db = require('../config/database');
const { resolveUserId } = require('../utils/coercion');

const ALLOWED_ANALYSIS_TYPES = new Set(['financial', 'market_trend', 'competitiveness']);

const isAdminUser = (user) => user && user.role === 'admin';

const analyze = async (req, res, next) => {
  try {
    const { enterpriseId, analysisType, data } = req.body;
    const normalizedEnterpriseId = Number(enterpriseId);
    const normalizedType = ALLOWED_ANALYSIS_TYPES.has(analysisType) ? analysisType : 'financial';

    if (!Number.isFinite(normalizedEnterpriseId)) {
      return res.status(400).json({ success: false, message: 'Enterprise ID must be numeric' });
    }

    const adminUser = isAdminUser(req.user);
    const userId = resolveUserId(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const enterpriseQuery = adminUser
      ? 'SELECT id FROM enterprises WHERE id = $1'
      : 'SELECT id FROM enterprises WHERE id = $1 AND user_id = $2';
    const enterpriseParams = adminUser ? [normalizedEnterpriseId] : [normalizedEnterpriseId, userId];
    const enterprise = await db.query(enterpriseQuery, enterpriseParams);
    if (enterprise.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Enterprise not found' });
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
