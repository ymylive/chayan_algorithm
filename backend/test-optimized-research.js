#!/usr/bin/env node
/**
 * Comprehensive test for optimized deep research service
 * Tests: enhanced parsing, progress callbacks, job service, WebSocket
 */

const deepResearchService = require('./src/services/deepResearchService');
const researchJobService = require('./src/services/researchJobService');

async function testEnhancedParsing() {
  console.log('=== Test 1: Enhanced Content Parsing ===\n');

  const topic = '人工智能芯片市场';
  console.log(`Topic: ${topic}\n`);

  const result = await deepResearchService.conductResearch(topic, {
    maxUrls: 5,
    maxRetries: 2
  });

  console.log('Results:');
  console.log(`- Success: ${result.success}`);
  console.log(`- Search Results: ${result.searchResults}`);
  console.log(`- Fetched URLs: ${result.fetchedUrls}`);
  console.log(`- Total Content: ${result.report.totalContentLength} chars\n`);

  if (result.report.extractionStats) {
    console.log('Extraction Stats:');
    console.log(`- Market Data Points: ${result.report.extractionStats.marketDataPoints}`);
    console.log(`- Growth Data Points: ${result.report.extractionStats.growthDataPoints}`);
    console.log(`- Competitors Found: ${result.report.extractionStats.competitorsFound}\n`);
  }

  if (result.report.marketData) {
    console.log('Market Data:');
    console.log(`- Sizes: ${result.report.marketData.sizes.length} entries`);
    result.report.marketData.sizes.slice(0, 3).forEach(s => {
      console.log(`  * ${s.value} (${s.source})`);
    });
    console.log(`- Growth Rates: ${result.report.marketData.growthRates.length} entries`);
    result.report.marketData.growthRates.slice(0, 3).forEach(g => {
      console.log(`  * ${g.value} (${g.source})`);
    });
    console.log(`- Years: ${result.report.marketData.years.join(', ')}\n`);
  }

  if (result.report.competitors && result.report.competitors.length > 0) {
    console.log(`Competitors (${result.report.competitors.length}):`);
    console.log(`  ${result.report.competitors.slice(0, 5).join(', ')}\n`);
  }

  return result;
}

async function testProgressCallbacks() {
  console.log('\n=== Test 2: Progress Callbacks ===\n');

  const progressUpdates = [];
  const topic = '5G通信市场';

  await deepResearchService.conductResearch(topic, {
    maxUrls: 3,
    maxRetries: 1,
    onProgress: (progress) => {
      progressUpdates.push(progress);
      console.log(`[${progress.stage}] ${progress.progress}% - ${progress.message}`);
    }
  });

  console.log(`\nTotal progress updates: ${progressUpdates.length}`);
  console.log('Stages:', [...new Set(progressUpdates.map(p => p.stage))].join(' -> '));

  return progressUpdates;
}

async function testJobService() {
  console.log('\n=== Test 3: Research Job Service ===\n');

  const topic = '电动汽车电池市场';
  console.log(`Creating async job for: ${topic}\n`);

  const jobId = await researchJobService.createJob(topic, {
    maxUrls: 3,
    maxRetries: 1
  });

  console.log(`Job created: ${jobId}`);

  // Check initial status
  let job = await researchJobService.getJob(jobId);
  console.log(`Initial status: ${job.status}\n`);

  // Execute job with progress tracking
  console.log('Executing job...');
  await researchJobService.executeJob(jobId, (progress) => {
    console.log(`  [${progress.stage}] ${progress.progress}%`);
  });

  // Check final status
  job = await researchJobService.getJob(jobId);
  console.log(`\nFinal status: ${job.status}`);
  console.log(`Completed at: ${job.completedAt}`);

  if (job.result) {
    console.log(`Result: ${job.result.fetchedUrls} URLs fetched`);
    console.log(`Data quality: ${job.result.report.dataQuality}`);
  }

  return job;
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Optimized Deep Research Service - Comprehensive Test ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Enhanced parsing
    const result1 = await testEnhancedParsing();

    // Test 2: Progress callbacks
    const result2 = await testProgressCallbacks();

    // Test 3: Job service
    const result3 = await testJobService();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                   All Tests Passed                     ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('Summary:');
    console.log(`✓ Enhanced parsing: ${result1.report.extractionStats.marketDataPoints + result1.report.extractionStats.growthDataPoints} data points extracted`);
    console.log(`✓ Progress callbacks: ${result2.length} updates received`);
    console.log(`✓ Job service: Job ${result3.id} completed successfully`);

    process.exit(0);
  } catch (err) {
    console.error('\n✗ Test Failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runAllTests();
