const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const logger = require('../config/logger');
const redis = require('../config/redis');

class AIService {
  constructor() {
    this.mcpClient = null;
  }

  async connectMCP() {
    if (this.mcpClient) return this.mcpClient;

    try {
      const transport = new StdioClientTransport({
        command: process.env.MCP_SERVER_COMMAND || 'node',
        args: [process.env.MCP_SERVER_PATH || './mcp-server.js']
      });

      this.mcpClient = new Client({ name: 'chayan-backend', version: '1.0.0' }, { capabilities: {} });
      await this.mcpClient.connect(transport);
      logger.info('MCP client connected');
      return this.mcpClient;
    } catch (err) {
      logger.warn('MCP connection failed:', err.message);
      return null;
    }
  }

  async searchIndustryData(query) {
    const cacheKey = `industry:${query}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const client = await this.connectMCP();
    if (!client) {
      const mock = { query, results: [{ name: '示例行业', trend: '上升', data: [] }] };
      await redis.setex(cacheKey, 3600, JSON.stringify(mock)).catch(() => {});
      return mock;
    }

    try {
      const result = await client.callTool({ name: 'search_industry', arguments: { query } });
      await redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
      return result;
    } catch (err) {
      logger.error('MCP search_industry failed:', err);
      throw err;
    }
  }

  async searchCompetitors(query) {
    const cacheKey = `competitor:${query}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const client = await this.connectMCP();
    if (!client) {
      const mock = { query, competitors: [{ name: '竞品A', market_share: '15%' }] };
      await redis.setex(cacheKey, 3600, JSON.stringify(mock)).catch(() => {});
      return mock;
    }

    try {
      const result = await client.callTool({ name: 'search_competitors', arguments: { query } });
      await redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
      return result;
    } catch (err) {
      logger.error('MCP search_competitors failed:', err);
      throw err;
    }
  }

  async fetchMarketReport(params) {
    const cacheKey = `market:${JSON.stringify(params)}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const client = await this.connectMCP();
    if (!client) {
      const mock = { report: '市场报告示例', date: new Date().toISOString() };
      await redis.setex(cacheKey, 3600, JSON.stringify(mock)).catch(() => {});
      return mock;
    }

    try {
      const result = await client.callTool({ name: 'fetch_market_report', arguments: params });
      await redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
      return result;
    } catch (err) {
      logger.error('MCP fetch_market_report failed:', err);
      throw err;
    }
  }

  async fetchFinancialData(params) {
    const cacheKey = `financial:${JSON.stringify(params)}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const client = await this.connectMCP();
    if (!client) {
      const mock = { company: params.company, revenue: 1000000, profit: 50000 };
      await redis.setex(cacheKey, 3600, JSON.stringify(mock)).catch(() => {});
      return mock;
    }

    try {
      const result = await client.callTool({ name: 'fetch_financial_data', arguments: params });
      await redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
      return result;
    } catch (err) {
      logger.error('MCP fetch_financial_data failed:', err);
      throw err;
    }
  }

  async analyzeData(data) {
    return { result: 'pending' };
  }
}

module.exports = new AIService();
