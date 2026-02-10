const Redis = require('ioredis');
const logger = require('./logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: () => null
});

redis.on('error', (err) => logger.warn('Redis unavailable:', err.message));

module.exports = redis;
