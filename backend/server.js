require('dotenv').config();
const app = require('./app');
const logger = require('./src/config/logger');
const websocketService = require('./src/services/websocketService');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Initialize WebSocket for real-time progress updates
websocketService.initialize(server);
