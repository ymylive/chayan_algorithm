#!/usr/bin/env node
/**
 * Manual Test Script - Deep Research Service Validation
 * Run: node scripts/test-deep-research.js
 */

const deepResearchService = require('../src/services/deepResearchService');
const researchJobService = require('../src/services/researchJobService');

async function testProgressTracking() {
  console.log('\n=== Test 1: Progress Tracking ===');
  const progressUpdates = [];

  const result = await deepResearchService.conductResearch('人工智能芯片市场', {
    maxUrls: 3,
    onProgress: (progress) => {
      progressUpdates.push(progress);
      console.log(`  [${progress.stage}] ${progress.progress}% - ${progress.message}`);
    }
  });

  console.log(`\n✓ Progress updates: ${progressUpdates.length}`);
  console.log(`✓ Final stage: ${progressUpdates[progressUpdates.length - 1]?.stage}`);
  console.log(`✓ Research success: ${result.success}`);
  return result;
}

async function testEnhancedParsing() {
  console.log('\n=== Test 2: Enhanced Data Extraction ===');

  const result = await deepResearchService.conductResearch('新能源汽车市场规模', {
    maxUrls: 5
  });

  console.log(`\n✓ Data quality: ${result.report.dataQuality}`);
  console.log(`✓ Market sizes found: ${result.report.marketData.sizes.length}`);
  console.log(`✓ Growth rates found: ${result.report.marketData.growthRates.length}`);
  console.log(`✓ Competitors found: ${result.report.competitors.length}`);
  console.log(`✓ Years extracted: ${result.report.marketData.years?.join(', ')}`);

  if (result.report.extractionStats) {
    console.log('\nExtraction Statistics:');
    console.log(`  - Market data points: ${result.report.extractionStats.marketDataPoints}`);
    console.log(`  - Growth data points: ${result.report.extractionStats.growthDataPoints}`);
    console.log(`  - Competitors found: ${result.report.extractionStats.competitorsFound}`);
  }

  return result;
}

async function testBackgroundJobs() {
  console.log('\n=== Test 3: Background Job Execution ===');

  const jobId = await researchJobService.createJob('5G通信技术市场', { maxUrls: 3 });
  console.log(`✓ Job created: ${jobId}`);

  let job = await researchJobService.getJob(jobId);
  console.log(`✓ Initial status: ${job.status}`);

  const progressUpdates = [];
  await researchJobService.executeJob(jobId, (progress) => {
    progressUpdates.push(progress);
    console.log(`  [Job Progress] ${progress.stage}: ${progress.progress}%`);
  });

  job = await researchJobService.getJob(jobId);
  console.log(`\n✓ Final status: ${job.status}`);
  console.log(`✓ Progress updates: ${progressUpdates.length}`);
  console.log(`✓ Result available: ${!!job.result}`);

  return job;
}

async function runAllTests() {
  console.log('Deep Research Service - Manual Validation Tests');
  console.log('='.repeat(50));

  try {
    await testProgressTracking();
    await testEnhancedParsing();
    await testBackgroundJobs();

    console.log('\n' + '='.repeat(50));
    console.log('✓ All tests completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllTests();
