#!/usr/bin/env node
/**
 * Test script for Deep Research Service
 * Tests the autonomous "search → fetch → analyze" workflow
 */

const deepResearchService = require('./src/services/deepResearchService');

async function testDeepResearch() {
  console.log('=== Deep Research Service Test ===\n');

  const topic = '量子计算芯片市场';
  console.log(`Topic: ${topic}\n`);

  try {
    console.log('Starting autonomous research workflow...\n');

    const result = await deepResearchService.conductResearch(topic, {
      maxUrls: 5,
      maxRetries: 2
    });

    console.log('=== Research Results ===\n');
    console.log(`Success: ${result.success}`);
    console.log(`Search Results: ${result.searchResults}`);
    console.log(`Fetched URLs: ${result.fetchedUrls}`);
    console.log(`Timestamp: ${result.timestamp}\n`);

    if (result.report) {
      console.log('=== Analysis Report ===\n');
      console.log(`Topic: ${result.report.topic}`);
      console.log(`Summary: ${result.report.summary}`);
      console.log(`Data Quality: ${result.report.dataQuality}`);
      console.log(`Total Content Length: ${result.report.totalContentLength} chars\n`);

      if (result.report.marketData) {
        console.log('Market Data:');
        console.log(`  Sizes: ${result.report.marketData.sizes.length} entries`);
        console.log(`  Growth Rates: ${result.report.marketData.growthRates.length} entries\n`);
      }

      if (result.report.competitors) {
        console.log(`Competitors Found: ${result.report.competitors.length}`);
        console.log(`  ${result.report.competitors.slice(0, 5).join(', ')}\n`);
      }

      if (result.report.sources) {
        console.log('Sources:');
        result.report.sources.forEach((source, idx) => {
          console.log(`  ${idx + 1}. ${source.title}`);
          console.log(`     URL: ${source.url}`);
          console.log(`     Content: ${source.contentLength} chars`);
        });
      }
    }

    console.log('\n=== Test Completed Successfully ===');
    process.exit(0);
  } catch (err) {
    console.error('\n=== Test Failed ===');
    console.error(`Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

testDeepResearch();
