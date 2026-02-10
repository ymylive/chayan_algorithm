const { executePython } = require('../services/pythonBridge');
const db = require('../config/database');

const analyze = async (req, res, next) => {
  try {
    const { enterpriseId, analysisType, data } = req.body;

    const result = await executePython('analyzer.py', { type: analysisType, data });

    await db.query(
      'INSERT INTO analysis_results (enterprise_id, analysis_type, result, created_at) VALUES ($1, $2, $3, NOW())',
      [enterpriseId, analysisType, JSON.stringify(result)]
    );

    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

module.exports = { analyze };
