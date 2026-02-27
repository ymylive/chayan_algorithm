/**
 * Research Job Service - Background task management for deep research
 */
const logger = require('../config/logger');
const deepResearchService = require('./deepResearchService');

class ResearchJobService {
  constructor() {
    this.jobPrefix = 'research:job:';
    this.queueKey = 'research:queue';
    this.activeJobs = new Map();
    this.jobStore = new Map();
    this.redis = null;
    this.initRedis();
  }

  async initRedis() {
    try {
      const Redis = require('ioredis');
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retryStrategy: () => null,
        lazyConnect: true
      });

      await this.redis.connect();
      this.redis.on('error', () => {
        this.redis = null;
      });
      logger.info('Redis connected for job service');
    } catch (err) {
      logger.warn('Redis unavailable, using in-memory job storage');
      this.redis = null;
    }
  }

  async createJob(topic, options = {}) {
    const jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const job = {
      id: jobId,
      topic,
      options,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (this.redis) {
      try {
        await this.redis.setex(`${this.jobPrefix}${jobId}`, 3600, JSON.stringify(job));
        await this.redis.rpush(this.queueKey, jobId);
      } catch (err) {
        logger.warn('Redis write failed, using memory', { error: err.message });
        this.jobStore.set(jobId, job);
      }
    } else {
      this.jobStore.set(jobId, job);
    }

    logger.info('Research job created', { jobId, topic });
    return jobId;
  }

  async getJob(jobId) {
    if (this.redis) {
      try {
        const data = await this.redis.get(`${this.jobPrefix}${jobId}`);
        return data ? JSON.parse(data) : this.jobStore.get(jobId) || null;
      } catch (err) {
        return this.jobStore.get(jobId) || null;
      }
    }
    return this.jobStore.get(jobId) || null;
  }

  async updateJob(jobId, updates) {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };

    if (this.redis) {
      try {
        await this.redis.setex(`${this.jobPrefix}${jobId}`, 3600, JSON.stringify(updated));
      } catch (err) {
        this.jobStore.set(jobId, updated);
      }
    } else {
      this.jobStore.set(jobId, updated);
    }

    return updated;
  }

  async executeJob(jobId, progressCallback) {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    await this.updateJob(jobId, { status: 'running', startedAt: new Date().toISOString() });
    this.activeJobs.set(jobId, true);

    try {
      const result = await deepResearchService.conductResearch(job.topic, {
        ...job.options,
        onProgress: async (progress) => {
          await this.updateJob(jobId, { progress: progress.progress, stage: progress.stage });
          if (progressCallback) progressCallback(progress);
        }
      });

      await this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        result,
        completedAt: new Date().toISOString()
      });

      this.activeJobs.delete(jobId);
      logger.info('Research job completed', { jobId });
      return result;
    } catch (error) {
      await this.updateJob(jobId, {
        status: 'failed',
        error: error.message,
        failedAt: new Date().toISOString()
      });
      this.activeJobs.delete(jobId);
      logger.error('Research job failed', { jobId, error: error.message });
      throw error;
    }
  }

  async processQueue() {
    while (true) {
      const jobId = await redis.lpop(this.queueKey);
      if (!jobId) break;

      try {
        await this.executeJob(jobId);
      } catch (error) {
        logger.error('Queue processing error', { jobId, error: error.message });
      }
    }
  }

  isJobActive(jobId) {
    return this.activeJobs.has(jobId);
  }
}

module.exports = new ResearchJobService();
