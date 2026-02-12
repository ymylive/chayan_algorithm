/**
 * MCP connection and tool call management (extracted from AIService, W9).
 */
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const logger = require('../config/logger');
const redis = require('../config/redis');

class MCPClient {
  constructor() {
    this.client = null;
  }

  async connect() {
    if (this.client) return this.client;

    try {
      const transport = new StdioClientTransport({
        command: process.env.MCP_SERVER_COMMAND || 'node',
        args: [process.env.MCP_SERVER_PATH || './mcp-server.js']
      });

      this.client = new Client({ name: 'chayan-backend', version: '1.0.0' }, { capabilities: {} });
      await this.client.connect(transport);
      logger.info('MCP client connected');
      return this.client;
    } catch (err) {
      logger.warn('MCP connection failed:', err.message);
      return null;
    }
  }

  async callWithCache(toolName, args, cachePrefix, mockFn) {
    const cacheKey = `${cachePrefix}:${typeof args === 'string' ? args : JSON.stringify(args)}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const client = await this.connect();
    if (!client) {
      const mock = mockFn(args);
      await redis.setex(cacheKey, 3600, JSON.stringify(mock)).catch(() => {});
      return mock;
    }

    try {
      const toolArgs = typeof args === 'string' ? { query: args } : args;
      const result = await client.callTool({ name: toolName, arguments: toolArgs });
      await redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
      return result;
    } catch (err) {
      logger.error(`MCP ${toolName} failed:`, err);
      this.client = null;
      const mock = mockFn(args);
      await redis.setex(cacheKey, 60, JSON.stringify(mock)).catch(() => {});
      return mock;
    }
  }
}

module.exports = MCPClient;
