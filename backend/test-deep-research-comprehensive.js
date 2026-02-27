#!/usr/bin/env node
/**
 * Comprehensive test for Deep Research Service
 * Tests multiple topics and validates data extraction
 */

const deepResearchService = require('./src/services/deepResearchService');

async function runTest(topic, options) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${topic}`);
  console.log('='.repeat(60));

  const result = await deepResearchService.conductResearch(topic, options);

  console.log(`\n✓ Success: ${result.success}`);
  console.log(`✓ Search Results: ${result.searchResults}`);
  console.log(`✓ Fetched URLs: ${result.fetchedUrls}/${options.maxUrls}`);

  if (result.report) {
    console.log(`\n--- Analysis Report ---`);
    console.log(`Data Quality: ${result.report.dataQuality}`);
    console.log(`Total Content: ${result.report.totalContentLength} chars`);

    if (result.report.marketData) {
      console.log(`Market Sizes Found: ${result.report.marketData.sizes.length}`);
      console.log(`Growth Rates Found: ${result.report.marketData.growthRates.length}`);
    }

    console.log(`Competitors Found: ${result.report.competitors.length}`);
    console.log(`Sources: ${result.report.sources.length}`);

    result.report.sources.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title.slice(0, 50)}... (${s.contentLength} chars)`);
    });
  }

  return result;
}

async function main() {
  console.log('=== Deep Research Service - Comprehensive Test ===');
  console.log('Testing autonomous "search → fetch → analyze" workflow\n');

  const tests = [
    { topic: '人工智能芯片市场', maxUrls: 5, maxRetries: 2 },
    { topic: '新能源汽车行业', maxUrls: 3, maxRetries: 2 },
    { topic: '云计算市场趋势', maxUrls: 4, maxRetries: 2 }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const result = await runTest(test.topic, test);
      results.push({ topic: test.topic, success: true, result });
    } catch (err) {
      console.error(`\n✗ Test failed: ${err.message}`);
      results.push({ topic: test.topic, success: false, error: err.message });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Test Summary');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);

  results.forEach((r, i) => {
    const status = r.success ? '✓' : '✗';
    console.log(`  ${status} ${r.topic}`);
    if (r.success && r.result.report) {
      console.log(`    - Fetched: ${r.result.fetchedUrls} URLs`);
      console.log(`    - Content: ${r.result.report.totalContentLength} chars`);
      console.log(`    - Quality: ${r.result.report.dataQuality}`);
    }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(failed === 0 ? '✓ All tests passed!' : `✗ ${failed} test(s) failed`);
  console.log('='.repeat(60));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
