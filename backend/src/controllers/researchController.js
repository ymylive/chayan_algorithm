/**
 * Research Controller - API endpoints for deep research
 */
const deepResearchService = require('../services/deepResearchService');
const researchJobService = require('../services/researchJobService');
const websocketService = require('../services/websocketService');
const logger = require('../config/logger');

exports.conductResearch = async (req, res) => {
  try {
    const { topic, maxUrls = 10, maxRetries = 2 } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const result = await deepResearchService.conductResearch(topic, { maxUrls, maxRetries });
    res.json(result);
  } catch (error) {
    logger.error('Research endpoint error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
};

exports.createResearchJob = async (req, res) => {
  try {
    const { topic, maxUrls = 10, maxRetries = 2 } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const jobId = await researchJobService.createJob(topic, { maxUrls, maxRetries });

    // Execute job in background
    researchJobService.executeJob(jobId, (progress) => {
      websocketService.sendProgress(jobId, progress);
    }).then((result) => {
      websocketService.sendComplete(jobId, result);
    }).catch((error) => {
      websocketService.sendError(jobId, error.message);
    });

    res.json({ jobId, status: 'pending' });
  } catch (error) {
    logger.error('Create job error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
};

exports.getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await researchJobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    logger.error('Get job status error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
};
