/**
 * Deep Research Service - Autonomous search, fetch, and analysis workflow
 */
const MCPClient = require('./mcpClient');
const logger = require('../config/logger');

class DeepResearchService {
  constructor() {
    this.mcpClient = new MCPClient();
  }

  async conductResearch(topic, options = {}) {
    const maxUrls = options.maxUrls || 10;
    const maxRetries = options.maxRetries || 2;
    const progressCallback = options.onProgress || (() => {});

    logger.info('Starting deep research', { topic, maxUrls });

    try {
      progressCallback({ stage: 'search', progress: 0, message: 'Searching for information...' });

      // Step 1: Search for information
      const searchResults = await this.searchTopic(topic);
      logger.info('Search completed', { resultCount: searchResults.length });
      progressCallback({ stage: 'search', progress: 25, message: `Found ${searchResults.length} sources` });

      // Step 2: Fetch full content from URLs
      progressCallback({ stage: 'fetch', progress: 25, message: 'Fetching content...' });
      const fetchedContent = await this.fetchAllContent(searchResults, maxUrls, maxRetries, (current, total) => {
        const fetchProgress = 25 + Math.floor((current / total) * 50);
        progressCallback({ stage: 'fetch', progress: fetchProgress, message: `Fetched ${current}/${total} pages` });
      });
      logger.info('Content fetching completed', { successCount: fetchedContent.filter(c => c.success).length });

      // Step 3: Analyze and generate report
      progressCallback({ stage: 'analyze', progress: 75, message: 'Analyzing content...' });
      const report = await this.analyzeContent(topic, fetchedContent);
      logger.info('Analysis completed');
      progressCallback({ stage: 'complete', progress: 100, message: 'Research complete' });

      return {
        success: true,
        topic,
        searchResults: searchResults.length,
        fetchedUrls: fetchedContent.filter(c => c.success).length,
        report,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      logger.error('Deep research failed', { topic, error: err.message });
      progressCallback({ stage: 'error', progress: 0, message: err.message });
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
      return this.mockSearchResults(topic);
    }

    try {
      const result = await client.callTool({
        name: 'search_industry',
        arguments: { query: topic }
      });

      const data = result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
      return (data.results || []).map(item => ({
        title: item.name || item.title,
        url: item.url,
        summary: item.summary || item.description,
        relevanceScore: item.relevanceScore
      }));
    } catch (err) {
      logger.warn('Search failed, using mock', { error: err.message });
      return this.mockSearchResults(topic);
    }
  }

  async fetchAllContent(searchResults, maxUrls, maxRetries, progressCallback = () => {}) {
    const urls = searchResults.slice(0, maxUrls).map(r => r.url);
    const results = [];

    for (let i = 0; i < urls.length; i++) {
      const content = await this.fetchWebPage(urls[i], maxRetries);
      results.push(content);
      progressCallback(i + 1, urls.length);
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

      const data = result?.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
      return {
        url,
        success: data.success || false,
        title: data.title || '',
        description: data.description || '',
        content: data.content || '',
        contentLength: data.contentLength || 0,
        attempts: data.attempts || 1
      };
    } catch (err) {
      logger.warn('Fetch failed', { url, error: err.message });
      return { url, success: false, error: err.message };
    }
  }

  async analyzeContent(topic, fetchedContent) {
    // Filter out low-quality fetches (< 100 chars)
    const successfulFetches = fetchedContent.filter(c => c.success && c.contentLength >= 100);

    if (successfulFetches.length === 0) {
      return {
        topic,
        summary: 'No quality content successfully fetched for analysis',
        dataQuality: 'insufficient',
        sources: [],
        totalContentLength: 0
      };
    }

    // Enhanced patterns for better data extraction
    const marketSizePattern = /(\d+(?:[.,]\d+)?)\s*(?:亿|billion|万亿|trillion|百万|million)\s*(?:元|美元|dollar|USD|CNY|人民币)/gi;
    const growthPattern = /(?:增长|growth|上升|increase|提升|涨幅|CAGR|年均增长).*?(\d+(?:\.\d+)?)\s*%/gi;
    const competitorPattern = /(?:竞争对手|competitor|公司|company|企业|厂商|品牌|主要企业|leading companies?)[:：\s]+([^\n。，,；;]{2,50})/gi;
    const yearPattern = /20\d{2}年?/g;

    const marketSizes = [];
    const growthRates = [];
    const competitors = new Set();
    const years = new Set();

    successfulFetches.forEach(item => {
      const text = `${item.title} ${item.description} ${item.content}`;

      // Extract market sizes
      patterns.marketSize.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          extracted.marketSizes.push({ value: match[0], source: item.url });
        }
      });

      // Extract growth rates
      patterns.growth.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          extracted.growthRates.push({ value: match[0], source: item.url });
        }
      });

      // Extract competitors
      patterns.competitor.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const names = match[1].split(/[,，、]/).map(n => n.trim()).filter(n => n.length > 2);
          names.forEach(name => extracted.competitors.add(name));
        }
      });

      // Extract years
      let match;
      while ((match = patterns.year.exec(text)) !== null) {
        extracted.years.add(match[0]);
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
      sources: successfulFetches.map(c => ({
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

  mockSearchResults(topic) {
    return [
      { title: `${topic} - Mock Result 1`, url: 'https://example.com/1', summary: 'Mock summary 1' },
      { title: `${topic} - Mock Result 2`, url: 'https://example.com/2', summary: 'Mock summary 2' }
    ];
  }
}

module.exports = new DeepResearchService();
