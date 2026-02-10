const aiService = require('../services/aiService');
const logger = require('../config/logger');

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
    } else {
      return res.status(400).json({ error: 'Invalid dataType' });
    }

    res.json(result);
  } catch (err) {
    logger.error('MCP fetch error:', err);
    next(err);
  }
};
