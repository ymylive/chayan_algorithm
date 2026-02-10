const express = require('express');
const cors = require('cors');
const logger = require('./src/config/logger');
const errorHandler = require('./src/utils/errorHandler');
const healthController = require('./src/controllers/healthController');
const analyzeController = require('./src/controllers/analyzeController');
const { upload, handleUpload } = require('./src/controllers/uploadController');
const mcpController = require('./src/controllers/mcpController');
const enterpriseController = require('./src/controllers/enterpriseController');
const analysisController = require('./src/controllers/analysisController');
const recommendationController = require('./src/controllers/recommendationController');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', healthController.healthCheck);
app.post('/api/upload', upload.single('file'), handleUpload);
app.post('/api/analyze', analyzeController.analyze);
app.get('/api/mcp/search', mcpController.search);
app.post('/api/mcp/fetch', mcpController.fetch);
app.get('/api/enterprises', enterpriseController.getEnterprises);
app.get('/api/enterprises/:id', enterpriseController.getEnterpriseById);
app.post('/api/enterprises', enterpriseController.createEnterprise);
app.put('/api/enterprises/:id', enterpriseController.updateEnterprise);
app.delete('/api/enterprises/:id', enterpriseController.deleteEnterprise);
app.get('/api/analysis/:enterpriseId', analysisController.getAnalysis);
app.post('/api/analysis', analysisController.createAnalysis);
app.get('/api/recommendations/:enterpriseId', recommendationController.getRecommendations);
app.post('/api/recommendations/:enterpriseId', recommendationController.generateRecommendations);

app.use(errorHandler);

module.exports = app;
