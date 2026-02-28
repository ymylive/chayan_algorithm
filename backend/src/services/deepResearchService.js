/**
 * Deep Research Service - Autonomous search, fetch, and analysis workflow
 */
const MCPClient = require('./mcpClient');
const logger = require('../config/logger');

class DeepResearchService {
  constructor() {
    this.mcpClient = new MCPClient();
  }

  async emitProgress(callback, payload) {
    if (typeof callback !== 'function') return;
    try {
      await Promise.resolve(callback(payload));
    } catch (err) {
      logger.warn('Deep research progress callback failed', { error: err?.message || String(err) });
    }
  }

  parseToolPayload(result) {
    const text = result?.content?.[0]?.text;
    if (typeof text !== 'string') {
      return result && typeof result === 'object' ? result : {};
    }

    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async conductResearch(topic, options = {}) {
    const maxUrls = Math.max(1, Math.min(Number(options.maxUrls) || 10, 20));
    const maxRetries = Math.max(1, Math.min(Number(options.maxRetries) || 2, 5));
    const progressCallback = options.onProgress || (() => {});

    logger.info('Starting deep research', { topic, maxUrls });

    try {
      await this.emitProgress(progressCallback, { stage: 'search', progress: 0, message: 'Searching for information...' });

      // Step 1: Search for information
      const searchResults = await this.searchTopic(topic);
      logger.info('Search completed', { resultCount: searchResults.length });
      await this.emitProgress(progressCallback, { stage: 'search', progress: 25, message: `Found ${searchResults.length} sources` });

      // Step 2: Fetch full content from URLs
      await this.emitProgress(progressCallback, { stage: 'fetch', progress: 25, message: 'Fetching content...' });
      const fetchedContent = await this.fetchAllContent(searchResults, maxUrls, maxRetries, (current, total) => {
        const safeTotal = Math.max(Number(total) || 0, 1);
        const fetchProgress = 25 + Math.floor((current / safeTotal) * 50);
        return this.emitProgress(progressCallback, {
          stage: 'fetch',
          progress: Math.max(25, Math.min(75, fetchProgress)),
          message: `Fetched ${current}/${total} pages`
        });
      });
      logger.info('Content fetching completed', { successCount: fetchedContent.filter((c) => c.success).length });

      // Step 3: Analyze and generate report
      await this.emitProgress(progressCallback, { stage: 'analyze', progress: 75, message: 'Analyzing content...' });
      const report = await this.analyzeContent(topic, fetchedContent);
      logger.info('Analysis completed');
      await this.emitProgress(progressCallback, { stage: 'complete', progress: 100, message: 'Research complete' });

      return {
        success: true,
        topic,
        searchResults: searchResults.length,
        fetchedUrls: fetchedContent.filter((c) => c.success).length,
        report,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      logger.error('Deep research failed', { topic, error: err.message });
      await this.emitProgress(progressCallback, { stage: 'error', progress: 0, message: err.message });
      return {
        success: false,
        topic,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async searchTopic(topic) {
    const client = await this.mcpClient.connect();
    if (!client) {
      logger.warn('Deep research search skipped because MCP client is unavailable');
      return [];
    }

    try {
      const result = await client.callTool({
        name: 'search_industry',
        arguments: { query: topic }
      });

      const data = this.parseToolPayload(result);
      return (Array.isArray(data.results) ? data.results : [])
        .map((item) => ({
          title: item.name || item.title,
          url: item.url,
          summary: item.summary || item.description,
          relevanceScore: item.relevanceScore
        }))
        .filter((item) => Boolean(item.url));
    } catch (err) {
      logger.warn('Deep research search failed', { error: err.message });
      return [];
    }
  }

  async fetchAllContent(searchResults, maxUrls, maxRetries, progressCallback = () => {}) {
    const urls = searchResults
      .slice(0, maxUrls)
      .map((item) => String(item?.url || '').trim())
      .filter(Boolean);
    const results = [];

    for (let i = 0; i < urls.length; i += 1) {
      const content = await this.fetchWebPage(urls[i], maxRetries);
      results.push(content);
      await Promise.resolve(progressCallback(i + 1, urls.length));
    }

    return results;
  }

  async fetchWebPage(url, maxRetries) {
    const client = await this.mcpClient.connect();
    if (!client) {
      return { url, success: false, error: 'mcp_unavailable' };
    }

    try {
      const result = await client.callTool({
        name: 'fetch_web_page',
        arguments: { url, max_retries: maxRetries }
      });

      const data = this.parseToolPayload(result);
      const content = String(data.content || '');
      return {
        url,
        success: Boolean(data.success),
        title: data.title || '',
        description: data.description || '',
        content,
        contentLength: Number(data.contentLength || content.length || 0),
        attempts: Number(data.attempts || 1)
      };
    } catch (err) {
      logger.warn('Fetch failed', { url, error: err.message });
      return { url, success: false, error: err.message };
    }
  }

  async analyzeContent(topic, fetchedContent) {
    // Filter out low-quality fetches (< 100 chars)
    const successfulFetches = (Array.isArray(fetchedContent) ? fetchedContent : [])
      .filter((item) => item && item.success && Number(item.contentLength || 0) >= 100);

    if (successfulFetches.length === 0) {
      return {
        topic,
        summary: 'No quality content successfully fetched for analysis',
        dataQuality: 'insufficient',
        marketData: {
          sizes: [],
          growthRates: [],
          years: []
        },
        competitors: [],
        sources: [],
        totalContentLength: 0,
        extractionStats: {
          marketDataPoints: 0,
          growthDataPoints: 0,
          competitorsFound: 0
        }
      };
    }

    const patterns = {
      marketSize: [
        /\b(?:USD|US\$|\$|CNY|RMB)?\s?\d+(?:[.,]\d+)?\s?(?:trillion|billion|million)\b/gi,
        /\b\d+(?:[.,]\d+)?\s?(?:万亿|亿|万元|亿元|亿美元|万亿美元)\b/gi
      ],
      growth: [
        /(?:growth|cagr|increase|decline)[^.\n]{0,40}?\d+(?:\.\d+)?\s*%/gi,
        /(?:增长|下降|同比|环比|增速|复合增长率)[^。\n]{0,40}?\d+(?:\.\d+)?\s*%/gi
      ],
      competitor: [
        /(?:competitors?|leading companies?|major players?)[:\s]+([^\n.]{2,160})/gi,
        /(?:竞争对手|主要企业|主要公司|头部企业)[:：]\s*([^\n。]{2,160})/gi
      ],
      year: /\b20\d{2}\b/g
    };

    const extracted = {
      marketSizes: [],
      growthRates: [],
      competitors: new Set(),
      years: new Set()
    };
    const seenMarketSizes = new Set();
    const seenGrowthRates = new Set();

    successfulFetches.forEach((item) => {
      const text = `${item.title} ${item.description} ${item.content}`;

      // Extract market sizes
      patterns.marketSize.forEach((pattern) => {
        for (const match of text.matchAll(pattern)) {
          const value = String(match?.[0] || '').trim();
          if (!value) continue;
          const key = `${value.toLowerCase()}|${item.url}`;
          if (seenMarketSizes.has(key)) continue;
          seenMarketSizes.add(key);
          extracted.marketSizes.push({ value, source: item.url });
        }
      });

      // Extract growth rates
      patterns.growth.forEach((pattern) => {
        for (const match of text.matchAll(pattern)) {
          const value = String(match?.[0] || '').trim();
          if (!value) continue;
          const key = `${value.toLowerCase()}|${item.url}`;
          if (seenGrowthRates.has(key)) continue;
          seenGrowthRates.add(key);
          extracted.growthRates.push({ value, source: item.url });
        }
      });

      // Extract competitors
      patterns.competitor.forEach((pattern) => {
        for (const match of text.matchAll(pattern)) {
          const rawLine = String(match?.[1] || '');
          const names = rawLine
            .split(/[,;|/、，]/)
            .map((name) => name.trim())
            .filter((name) => name.length >= 2 && name.length <= 60);
          names.forEach((name) => extracted.competitors.add(name));
        }
      });

      // Extract years
      for (const match of text.matchAll(patterns.year)) {
        const year = String(match?.[0] || '').trim();
        if (year) extracted.years.add(year);
      }
    });

    return {
      topic,
      summary: `Analyzed ${successfulFetches.length} sources for ${topic}`,
      dataQuality: successfulFetches.length >= 5 ? 'excellent' : successfulFetches.length >= 3 ? 'good' : 'limited',
      marketData: {
        sizes: extracted.marketSizes.slice(0, 15),
        growthRates: extracted.growthRates.slice(0, 15),
        years: Array.from(extracted.years).sort().reverse()
      },
      competitors: Array.from(extracted.competitors).slice(0, 30),
      sources: successfulFetches.map((c) => ({
        url: c.url,
        title: c.title,
        contentLength: c.contentLength
      })),
      totalContentLength: successfulFetches.reduce((sum, c) => sum + c.contentLength, 0),
      extractionStats: {
        marketDataPoints: extracted.marketSizes.length,
        growthDataPoints: extracted.growthRates.length,
        competitorsFound: extracted.competitors.size
      }
    };
  }
}

module.exports = new DeepResearchService();