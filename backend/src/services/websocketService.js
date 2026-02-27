/**
 * WebSocket Service - Real-time progress updates for research jobs
 */
const logger = require('../config/logger');

class WebSocketService {
  constructor() {
    this.clients = new Map();
  }

  initialize(server) {
    const WebSocket = require('ws');
    this.wss = new WebSocket.Server({ server, path: '/ws/research' });

    this.wss.on('connection', (ws, req) => {
      const clientId = req.headers['sec-websocket-key'];
      logger.info('WebSocket client connected', { clientId });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'subscribe' && data.jobId) {
            this.clients.set(data.jobId, ws);
            ws.send(JSON.stringify({ type: 'subscribed', jobId: data.jobId }));
          }
        } catch (error) {
          logger.error('WebSocket message error', { error: error.message });
        }
      });

      ws.on('close', () => {
        for (const [jobId, client] of this.clients.entries()) {
          if (client === ws) this.clients.delete(jobId);
        }
        logger.info('WebSocket client disconnected', { clientId });
      });
    });

    logger.info('WebSocket service initialized');
  }

  sendProgress(jobId, progress) {
    const client = this.clients.get(jobId);
    if (client && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'progress', jobId, ...progress }));
    }
  }

  sendComplete(jobId, result) {
    const client = this.clients.get(jobId);
    if (client && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'complete', jobId, result }));
      this.clients.delete(jobId);
    }
  }

  sendError(jobId, error) {
    const client = this.clients.get(jobId);
    if (client && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'error', jobId, error }));
      this.clients.delete(jobId);
    }
  }
}

module.exports = new WebSocketService();
