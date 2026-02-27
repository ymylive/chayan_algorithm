/**
 * Deep Research Service Test - Quality and Performance Evaluation
 */
const deepResearchService = require('../src/services/deepResearchService');
const logger = require('../src/config/logger');

describe('Deep Research Service - Quality Evaluation', () => {
  jest.setTimeout(60000);

  test('should conduct research and return structured data', async () => {
    const topic = '人工智能芯片市场';
    const result = await deepResearchService.conductResearch(topic, { maxUrls: 5 });

    expect(result.success).toBe(true);
    expect(result.topic).toBe(topic);
    expect(result.report).toBeDefined();
    expect(result.report.sources).toBeDefined();

    console.log('\n=== Research Quality Report ===');
    console.log(`Topic: ${result.topic}`);
    console.log(`Search Results: ${result.searchResults}`);
    console.log(`Fetched URLs: ${result.fetchedUrls}`);
    console.log(`Data Quality: ${result.report.dataQuality}`);
    console.log(`Market Data Found: ${result.report.marketData?.sizes?.length || 0} sizes, ${result.report.marketData?.growthRates?.length || 0} growth rates`);
    console.log(`Competitors Found: ${result.report.competitors?.length || 0}`);
    console.log(`Total Content Length: ${result.report.totalContentLength}`);
  });

  test('should extract market data accurately', async () => {
    const topic = '新能源汽车市场规模';
    const result = await deepResearchService.conductResearch(topic, { maxUrls: 3 });

    expect(result.report.marketData).toBeDefined();
    const hasMarketData = result.report.marketData.sizes.length > 0 ||
                          result.report.marketData.growthRates.length > 0;

    console.log('\n=== Market Data Extraction ===');
    console.log('Sizes:', result.report.marketData.sizes);
    console.log('Growth Rates:', result.report.marketData.growthRates);
  });
});
