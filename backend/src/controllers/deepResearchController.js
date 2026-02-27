/**
 * Deep Research Controller - Enhanced with progress tracking and background jobs
 */
const deepResearchService = require('../services/deepResearchService');
const logger = require('../config/logger');

const conductDeepResearch = async (req, res) => {
  try {
    const { topic, maxUrls, maxRetries, async: isAsync } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required and must be a non-empty string'
      });
    }

    const options = {
      maxUrls: parseInt(maxUrls) || 10,
      maxRetries: parseInt(maxRetries) || 2,
      jobId: `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    logger.info('Deep research request', { topic, options, async: isAsync });

    if (isAsync) {
      // Start background job
      setImmediate(() => {
        deepResearchService.conductResearch(topic.trim(), options).catch(err => {
          logger.error('Background research failed', { jobId: options.jobId, error: err.message });
        });
      });

      return res.json({
        success: true,
        jobId: options.jobId,
        message: 'Research started in background',
        progressUrl: `/api/research/progress/${options.jobId}`
      });
    }

    // Synchronous execution
    const result = await deepResearchService.conductResearch(topic.trim(), options);
    res.json(result);
  } catch (err) {
    logger.error('Deep research controller error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message
    });
  }
};

const getResearchProgress = async (req, res) => {
  try {
    const { jobId } = req.params;
    const progress = await deepResearchService.getProgress(jobId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      ...progress
    });
  } catch (err) {
    logger.error('Get progress error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

const getResearchResult = async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await deepResearchService.getResult(jobId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    res.json(result);
  } catch (err) {
    logger.error('Get result error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

module.exports = { conductDeepResearch, getResearchProgress, getResearchResult };
