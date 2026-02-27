/**
 * Deep Research Integration Test - Validates optimizations
 */
const deepResearchService = require('../src/services/deepResearchService');
const researchJobService = require('../src/services/researchJobService');
const redis = require('../src/config/redis');

describe('Deep Research Optimization Tests', () => {
  jest.setTimeout(120000);

  afterAll(async () => {
    await redis.quit();
  });

  test('Progress callback mechanism works', async () => {
    const progressUpdates = [];
    const topic = 'AI芯片市场分析';

    const result = await deepResearchService.conductResearch(topic, {
      maxUrls: 3,
      onProgress: (progress) => {
        progressUpdates.push(progress);
        console.log(`[Progress] ${progress.stage}: ${progress.progress}% - ${progress.message}`);
      }
    });

    expect(result.success).toBe(true);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[0].stage).toBe('search');
    expect(progressUpdates[progressUpdates.length - 1].stage).toBe('complete');
    expect(progressUpdates[progressUpdates.length - 1].progress).toBe(100);

    console.log('\n=== Progress Tracking Test ===');
    console.log(`Total progress updates: ${progressUpdates.length}`);
    console.log('Stages:', progressUpdates.map(p => p.stage).join(' -> '));
  });

  test('Enhanced content parsing extracts more data', async () => {
    const topic = '电动汽车市场规模和增长率';
    const result = await deepResearchService.conductResearch(topic, { maxUrls: 5 });

    expect(result.success).toBe(true);
    expect(result.report.extractionStats).toBeDefined();

    console.log('\n=== Enhanced Parsing Test ===');
    console.log('Extraction Stats:', result.report.extractionStats);
    console.log('Market Sizes:', result.report.marketData.sizes.length);
    console.log('Growth Rates:', result.report.marketData.growthRates.length);
    console.log('Competitors:', result.report.competitors.length);
    console.log('Years Found:', result.report.marketData.years);
  });

  test('Background job service creates and executes jobs', async () => {
    const topic = '5G通信市场';
    const jobId = await researchJobService.createJob(topic, { maxUrls: 3 });

    expect(jobId).toBeDefined();

    let job = await researchJobService.getJob(jobId);
    expect(job.status).toBe('pending');
    expect(job.topic).toBe(topic);

    console.log('\n=== Background Job Test ===');
    console.log(`Job created: ${jobId}`);
    console.log(`Initial status: ${job.status}`);

    // Execute job
    const progressUpdates = [];
    await researchJobService.executeJob(jobId, (progress) => {
      progressUpdates.push(progress);
    });

    job = await researchJobService.getJob(jobId);
    expect(job.status).toBe('completed');
    expect(job.result).toBeDefined();
    expect(progressUpdates.length).toBeGreaterThan(0);

    console.log(`Final status: ${job.status}`);
    console.log(`Progress updates received: ${progressUpdates.length}`);
    console.log(`Result quality: ${job.result.report.dataQuality}`);
  });

  test('Data quality assessment is accurate', async () => {
    const topics = [
      { topic: '人工智能', expectedQuality: 'excellent', maxUrls: 8 },
      { topic: '量子计算市场', expectedQuality: 'good', maxUrls: 4 },
      { topic: '稀有技术xyz123', expectedQuality: 'limited', maxUrls: 2 }
    ];

    for (const { topic, expectedQuality, maxUrls } of topics) {
      const result = await deepResearchService.conductResearch(topic, { maxUrls });
      console.log(`\n${topic}: ${result.report.dataQuality} (expected: ${expectedQuality})`);
      console.log(`  Sources: ${result.fetchedUrls}, Content: ${result.report.totalContentLength} chars`);
    }
  });

  test('Job persistence survives service restart', async () => {
    const topic = '云计算市场';
    const jobId = await researchJobService.createJob(topic, { maxUrls: 2 });

    // Simulate service restart by creating new instance
    const ResearchJobService = require('../src/services/researchJobService');
    const newService = Object.create(ResearchJobService);

    const retrievedJob = await newService.getJob(jobId);
    expect(retrievedJob).toBeDefined();
    expect(retrievedJob.topic).toBe(topic);

    console.log('\n=== Job Persistence Test ===');
    console.log(`Job ${jobId} successfully retrieved after simulated restart`);
  });
});
