const express = require('express');
const cors = require('cors');
const logger = require('./src/config/logger');
const errorHandler = require('./src/utils/errorHandler');
const authMiddleware = require('./src/middleware/auth');
const healthController = require('./src/controllers/healthController');
const authController = require('./src/controllers/authController');
const settingsController = require('./src/controllers/settingsController');
const analyzeController = require('./src/controllers/analyzeController');
const { upload, handleUpload } = require('./src/controllers/uploadController');
const mcpController = require('./src/controllers/mcpController');
const deepResearchController = require('./src/controllers/deepResearchController');
const enterpriseController = require('./src/controllers/enterpriseController');
const analysisController = require('./src/controllers/analysisController');
const recommendationController = require('./src/controllers/recommendationController');

const app = express();

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(
  configuredCorsOrigins.length ? configuredCorsOrigins : DEFAULT_CORS_ORIGINS
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    logger.warn(`Blocked CORS origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

const getClientIp = (req) => {
  const cloudflareIp = req.headers['cf-connecting-ip'];
  if (typeof cloudflareIp === 'string' && cloudflareIp.trim()) {
    return cloudflareIp.trim();
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    const [firstIp] = forwardedFor.split(',');
    if (firstIp && firstIp.trim()) {
      return firstIp.trim();
    }
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const recordFailedAttempt = (ip, now) => {
  const current = loginAttempts.get(ip);
  if (!current || now > current.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  current.count += 1;
  loginAttempts.set(ip, current);
};

const loginRateLimit = (req, res, next) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const current = loginAttempts.get(ip);

  if (current && now > current.resetAt) {
    loginAttempts.delete(ip);
  }

  const active = loginAttempts.get(ip);
  if (active && active.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts, please try again later.'
    });
  }

  res.on('finish', () => {
    const statusCode = res.statusCode;
    const finishedAt = Date.now();

    if (statusCode >= 200 && statusCode < 400) {
      loginAttempts.delete(ip);
      return;
    }

    if (statusCode === 400 || statusCode === 401) {
      recordFailedAttempt(ip, finishedAt);
    }
  });

  return next();
};

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', healthController.healthCheck);
app.get('/api/health', healthController.healthCheck);

// Public authentication endpoints
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', loginRateLimit, authController.login);

// All /api/* routes require authentication
app.use('/api', authMiddleware);

app.post('/api/auth/logout', authController.logout);
app.get('/api/auth/me', authController.me);

app.post('/api/upload', upload.single('file'), handleUpload);
app.post('/api/analyze', analyzeController.analyze);
app.get('/api/mcp/search', mcpController.search);
app.post('/api/mcp/fetch', mcpController.fetch);
app.post('/api/mcp/ai-analyze', mcpController.aiAnalyze);
app.post('/api/mcp/ai-analyze/jobs', mcpController.startAiAnalyzeJob);
app.get('/api/mcp/ai-analyze/jobs', mcpController.listAiAnalyzeJobs);
app.get('/api/mcp/ai-analyze/jobs/:jobId', mcpController.getAiAnalyzeJob);
app.get('/api/mcp/ai-analyze/jobs/:jobId/result', mcpController.getAiAnalyzeJobResult);
app.post('/api/research/deep', deepResearchController.conductDeepResearch);
app.get('/api/research/progress/:jobId', deepResearchController.getResearchProgress);
app.get('/api/research/result/:jobId', deepResearchController.getResearchResult);
app.get('/api/enterprises', enterpriseController.getEnterprises);
app.get('/api/enterprises/:id', enterpriseController.getEnterpriseById);
app.post('/api/enterprises', enterpriseController.createEnterprise);
app.put('/api/enterprises/:id', enterpriseController.updateEnterprise);
app.delete('/api/enterprises/:id', enterpriseController.deleteEnterprise);
app.get('/api/analysis/:enterpriseId', analysisController.getAnalysis);
app.post('/api/analysis', analysisController.createAnalysis);
app.get('/api/recommendations/:enterpriseId', recommendationController.getRecommendations);
app.post('/api/recommendations/:enterpriseId', recommendationController.generateRecommendations);
app.get('/api/settings/ai', settingsController.getSettings);
app.post('/api/settings/ai', settingsController.updateSettings);

app.use(errorHandler);

module.exports = app;
