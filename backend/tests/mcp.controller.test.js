const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('mcpController.aiAnalyze', () => {
  const mockAiService = {
    searchIndustryData: jest.fn(),
    searchCompetitors: jest.fn(),
    extractCompetitorCompanies: jest.fn(),
    fetchMarketReport: jest.fn(),
    fetchFinancialData: jest.fn(),
    fetchRegulatoryFilings: jest.fn(),
    fetchNewsStream: jest.fn(),
    generateAnalysisNarrative: jest.fn(),
    generateAnalysisNarrativeStream: jest.fn()
  };

  const mockPool = {
    query: jest.fn()
  };

  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  };

  const mockMath = {
    normalizeList: jest.fn((value) => {
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.competitors)) return value.competitors;
      if (Array.isArray(value?.results)) return value.results;
      if (Array.isArray(value?.data)) return value.data;
      return [];
    }),
    extractDisplayLabel: jest.fn((item) => item?.name || item?.title || item?.company || ''),
    uniqueNonEmpty: jest.fn((arr) => [...new Set((arr || []).filter(Boolean))]),
    buildFeatureRows: jest.fn(() => [{ id: 1, name: 'A', industry: '新能源', relevance: 1, industryHit: 1, competitorHit: 1, recency: 1 }]),
    buildModelResult: jest.fn(() => ({
      method: 'Entropy Weight + TOPSIS + Theil-Sen',
      weights: [],
      trendSlope: 0,
      trendLabel: 'stable',
      ranking: [{ id: 1, name: 'A', industry: '新能源', topsisScore: 0.8 }]
    })),
    buildPeerCandidates: jest.fn(() => [{ name: 'A', industry: '新能源', source: 'model_ranking', topsisScore: 0.8 }]),
    buildPeerIndustrySummary: jest.fn(() => [{ industry: '新能源', count: 1, avgTopsisScore: 0.8, maxTopsisScore: 0.8 }]),
    buildPeerInsights: jest.fn(() => []),
    buildPeerSuggestions: jest.fn(() => [])
  };

  const mockAiSettingsService = {
    resolveUserId: jest.fn(),
    getOrCreateUserSettings: jest.fn()
  };

  const mockAiAnalyzeJobService = {
    createJob: jest.fn(),
    appendProgress: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    listJobs: jest.fn(),
    getJob: jest.fn(),
    startBackgroundJob: jest.fn(),
    toJobSummary: jest.fn()
  };

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    emitQualityEvent: jest.fn(),
    getQualityTelemetryReport: jest.fn()
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('../src/services/aiService', () => mockAiService);
    jest.doMock('../src/services/aiSettingsService', () => mockAiSettingsService);
    jest.doMock('../src/services/aiAnalyzeJobService', () => mockAiAnalyzeJobService);
    jest.doMock('../src/config/database', () => mockPool);
    jest.doMock('../src/config/redis', () => mockRedis);
    jest.doMock('../src/config/logger', () => mockLogger);
    jest.doMock('../src/utils/math', () => mockMath);

    mockAiSettingsService.resolveUserId.mockReturnValue(null);
    mockAiSettingsService.getOrCreateUserSettings.mockResolvedValue(null);
    mockAiService.searchIndustryData.mockResolvedValue({ results: [] });
    mockAiService.searchCompetitors.mockResolvedValue({ competitors: [] });
    mockAiService.extractCompetitorCompanies.mockResolvedValue([]);
    mockAiService.fetchMarketReport.mockResolvedValue({ references: [] });
    mockAiService.fetchFinancialData.mockResolvedValue({ repoCount: 0, references: [] });
    mockAiService.fetchRegulatoryFilings.mockResolvedValue({ filingCount: 0, references: [] });
    mockAiService.fetchNewsStream.mockResolvedValue({ references: [] });
    mockAiAnalyzeJobService.createJob.mockResolvedValue({
      id: 'job-1',
      status: 'queued',
      progress: 0,
      workflow_step: 'queued',
      target: 'default'
    });
    mockAiAnalyzeJobService.appendProgress.mockResolvedValue(null);
    mockAiAnalyzeJobService.markCompleted.mockResolvedValue(null);
    mockAiAnalyzeJobService.markFailed.mockResolvedValue(null);
    mockAiAnalyzeJobService.listJobs.mockResolvedValue([]);
    mockAiAnalyzeJobService.getJob.mockResolvedValue(null);
    mockAiAnalyzeJobService.startBackgroundJob.mockImplementation((_jobId, runner) => {
      if (typeof runner === 'function') {
        Promise.resolve().then(() => runner()).catch(() => {});
      }
      return true;
    });
    mockAiAnalyzeJobService.toJobSummary.mockImplementation((job) => ({
      id: job?.id || 'job-1',
      jobId: job?.id || 'job-1',
      target: job?.target || 'default',
      status: job?.status || 'queued',
      progress: Number(job?.progress || 0),
      workflowStep: job?.workflow_step || 'queued'
    }));
    mockLogger.getQualityTelemetryReport.mockReturnValue({ totalEvents: 1, degradedRate: 0, failureRate: 0 });
  });

  test('returns competitor data without githubData projection field', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValueOnce({
      competitors: [
        { name: 'comp/a', source: 'bing_web', relevanceScore: 2.1 },
        { name: 'org/b', source: 'duckduckgo', relevanceScore: 1.7 }
      ],
      meta: { sourceCounts: { bing_web: 1, duckduckgo: 1 }, coverageSourceCounts: { bing_web: 2, duckduckgo: 2 } }
    });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({
      references: [{ name: '市场报告A', url: 'https://example.com/market-a' }]
    });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({
      repoCount: 1,
      references: [{ name: '财务参考A', url: 'https://example.com/finance-a' }]
    });
    mockAiService.fetchRegulatoryFilings.mockResolvedValueOnce({
      fillingCount: 2,
      references: [
        { name: '监管披露A', url: 'https://example.com/filing-a' },
        { name: '财务参考A', url: 'https://example.com/finance-a' }
      ]
    });
    mockAiService.fetchNewsStream.mockResolvedValueOnce({
      references: [
        { name: '市场报告A', url: 'https://example.com/market-a' },
        { name: '新闻快讯A', url: 'https://example.com/news-a' }
      ]
    });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      claimSupport: {
        totalClaims: 2,
        supportedClaims: 2,
        unsupportedClaims: 0,
        supportRatio: 1,
        repairAttempted: false,
        repairSucceeded: false,
        reasonCode: null
      },
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.mcp.mcpHealth).toEqual(expect.objectContaining({
      usedFallback: false,
      fallbackReasons: [],
      partialFailureSources: []
    }));
    expect(payload.data.mcp.competitorData).toEqual(expect.objectContaining({
      competitors: [
        expect.objectContaining({ name: 'comp/a', source: 'bing_web' }),
        expect.objectContaining({ name: 'org/b', source: 'duckduckgo' })
      ]
    }));
    expect(mockAiService.fetchRegulatoryFilings).toHaveBeenCalledWith({
      company: req.body.target,
      timeframe: 'latest'
    });
    expect(mockAiService.fetchNewsStream).toHaveBeenCalledWith({
      query: req.body.target,
      timeframe: 'latest'
    });
    expect(payload.data.mcp.regulatoryFilings).toEqual(expect.objectContaining({
      filingCount: 2,
      fillingCount: 2,
      references: [
        expect.objectContaining({ name: '监管披露A' }),
        expect.objectContaining({ name: '财务参考A' })
      ]
    }));
    expect(payload.data.mcp.newsStream).toEqual(expect.objectContaining({
      references: [
        expect.objectContaining({ name: '市场报告A' }),
        expect.objectContaining({ name: '新闻快讯A' })
      ]
    }));
    expect(payload.data.mcp.marketReport.references).toHaveLength(2);
    expect(payload.data.mcp.financialData.references).toHaveLength(2);
    expect(payload.data.mcp.financialData.repoCount).toBe(2);
    expect(payload.data.analysis.evidence).toEqual(expect.objectContaining({
      competitorTopSources: expect.any(Array),
      marketTopReferences: expect.any(Array),
      financialTopReferences: expect.any(Array),
      dataCompleteness: expect.objectContaining({
        dataGapFlags: expect.any(Object),
        dataGapReasons: expect.any(Array),
        suggestedQueries: expect.any(Array)
      })
    }));
    expect(payload.data.analysis.qualityContract).toEqual(expect.objectContaining({
      contractVersion: expect.any(String),
      featureFlags: expect.objectContaining({
        qualityContractEnabled: expect.any(Boolean),
        qualityStrictMode: expect.any(Boolean),
        qualityMinCoverageSources: expect.any(Number)
      }),
      qualityGate: expect.objectContaining({
        status: expect.any(String),
        checks: expect.objectContaining({
          claimSupport: expect.objectContaining({
            unsupportedClaims: 0,
            supportRatio: 1
          })
        })
      })
    }));
    expect(payload.data.analysis.evidence.dataCompleteness.dataGapCount).toBeGreaterThan(0);
    expect(payload.data.analysis.evidence.dataCompleteness.dataGapFlags).toEqual(expect.objectContaining({
      competitorsInsufficient: true,
      marketReferencesMissing: false,
      financialReferencesMissing: false
    }));
    expect(mockAiService.generateAnalysisNarrative).toHaveBeenCalledWith(expect.objectContaining({
      mcpCoverage: expect.objectContaining({
        dataGapFlags: expect.any(Object),
        dataGapCount: expect.any(Number),
        dataGapFollowupQueries: expect.any(Array)
      })
    }), expect.any(Object));
    expect(payload.data.mcp.githubData).toBeUndefined();
  });

  test('scopes enterprise matching by user_id for non-admin users', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockAiSettingsService.resolveUserId.mockReturnValue(88);
    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 11, name: '茶颜悦色', industry: '茶饮', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '茶饮' }] });
    mockAiService.searchCompetitors.mockResolvedValue({ competitors: [{ name: '喜茶', source: 'bing_web', relevanceScore: 2.3 }] });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({ references: [{ name: '行业报告', url: 'https://example.com/report' }] });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({ repoCount: 1, references: [{ name: '财务参考', url: 'https://example.com/finance' }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = {
      body: { target: '茶颜悦色' },
      user: { id: 88, role: 'user', email: 'member@example.com' }
    };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockPool.query).toHaveBeenCalled();
    expect(mockPool.query.mock.calls[0][0]).toContain('user_id = $2');
    expect(mockPool.query.mock.calls[0][1][1]).toBe(88);
  });

  test('uses user-scoped aiAnalyze cache key for non-admin users', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockAiSettingsService.resolveUserId.mockReturnValue(88);
    const cachedPayload = {
      success: true,
      data: {
        analysis: {
          aiMeta: {
            degraded: false
          }
        },
        source: 'cache'
      }
    };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedPayload));

    const req = {
      body: { target: 'TeaBrand' },
      user: { id: 88, role: 'user', email: 'member@example.com' }
    };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockRedis.get).toHaveBeenCalledWith('aiAnalyze:user:88:teabrand');
    expect(mockPool.query).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(cachedPayload);
  });

  test('expands tea-brand competitor queries with mapped company names', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 21, name: '茶颜悦色', industry: '茶饮', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '茶饮' }] });
    mockAiService.searchCompetitors.mockResolvedValue({
      competitors: [{ name: '喜茶', source: 'bing_web', relevanceScore: 2.4 }],
      meta: { sourceCounts: { bing_web: 1 }, coverageSourceCounts: { bing_web: 1, bing_news: 1 } }
    });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({ references: [{ name: '行业报告', url: 'https://example.com/report' }] });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({ repoCount: 1, references: [{ name: '财务参考', url: 'https://example.com/finance' }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '茶颜悦色' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const competitorQueries = mockAiService.searchCompetitors.mock.calls.map((call) => call[0]);
    expect(competitorQueries).toEqual(expect.arrayContaining(['喜茶', '茶百道', '奈雪的茶', '蜜雪冰城']));
  });

  test('uses AI-selected competitor company names as additional MCP search queries', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 31, name: '目标公司A', industry: '零售', created_at: new Date().toISOString() }] });

    mockAiService.extractCompetitorCompanies.mockResolvedValueOnce(['竞品公司甲', '竞品公司乙']);
    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '零售' }] });
    mockAiService.searchCompetitors.mockResolvedValue({
      competitors: [{ name: '竞品公司甲', source: 'bing_web', relevanceScore: 2.2 }],
      meta: { sourceCounts: { bing_web: 1 }, coverageSourceCounts: { bing_web: 1, bing_news: 1 } }
    });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({ references: [{ name: '行业报告', url: 'https://example.com/report' }] });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({ repoCount: 1, references: [{ name: '财务参考', url: 'https://example.com/finance' }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '目标公司A' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockAiService.extractCompetitorCompanies).toHaveBeenCalledWith('目标公司A', expect.any(Object));
    const competitorQueries = mockAiService.searchCompetitors.mock.calls.map((call) => call[0]);
    expect(competitorQueries).toEqual(expect.arrayContaining(['竞品公司甲', '竞品公司乙']));
  });

  test('startAiAnalyzeJob returns queued job summary and dispatches background execution', async () => {
    const { startAiAnalyzeJob } = require('../src/controllers/mcpController');

    mockAiSettingsService.resolveUserId.mockReturnValue(9);
    mockAiAnalyzeJobService.createJob.mockResolvedValueOnce({
      id: 'job-queue-9',
      user_id: 9,
      target: '茶颜悦色',
      status: 'queued',
      progress: 0,
      workflow_step: 'queued'
    });
    mockAiAnalyzeJobService.toJobSummary.mockReturnValueOnce({
      id: 'job-queue-9',
      jobId: 'job-queue-9',
      target: '茶颜悦色',
      status: 'queued',
      progress: 0,
      workflowStep: 'queued'
    });
    mockAiAnalyzeJobService.startBackgroundJob.mockImplementationOnce(() => true);

    const req = {
      body: { target: '茶颜悦色' },
      user: { id: 9, role: 'user', email: 'u9@example.com' }
    };
    const res = buildRes();
    const next = jest.fn();

    await startAiAnalyzeJob(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockAiAnalyzeJobService.createJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      target: '茶颜悦色'
    }));
    expect(mockAiAnalyzeJobService.startBackgroundJob).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        jobId: 'job-queue-9',
        status: 'queued'
      })
    }));
  });

  test('getAiAnalyzeJobResult returns 202 when async job is still running', async () => {
    const { getAiAnalyzeJobResult } = require('../src/controllers/mcpController');

    mockAiSettingsService.resolveUserId.mockReturnValue(15);
    mockAiAnalyzeJobService.getJob.mockResolvedValueOnce({
      id: 'job-running-15',
      user_id: 15,
      target: 'Acme Corp',
      status: 'running',
      progress: 52,
      workflow_step: 'collect_signals',
      result_json: null
    });
    mockAiAnalyzeJobService.toJobSummary.mockReturnValueOnce({
      id: 'job-running-15',
      jobId: 'job-running-15',
      target: 'Acme Corp',
      status: 'running',
      progress: 52,
      workflowStep: 'collect_signals'
    });

    const req = {
      params: { jobId: 'job-running-15' },
      user: { id: 15, role: 'user', email: 'u15@example.com' }
    };
    const res = buildRes();
    const next = jest.fn();

    await getAiAnalyzeJobResult(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockAiAnalyzeJobService.getJob).toHaveBeenCalledWith('job-running-15', {
      userId: 15,
      isAdmin: false
    });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Result is not ready',
      data: expect.objectContaining({ jobId: 'job-running-15' })
    }));
  });

  test('getAiAnalyzeJobResult returns 409 when async job failed', async () => {
    const { getAiAnalyzeJobResult } = require('../src/controllers/mcpController');

    mockAiSettingsService.resolveUserId.mockReturnValue(19);
    mockAiAnalyzeJobService.getJob.mockResolvedValueOnce({
      id: 'job-failed-19',
      user_id: 19,
      target: 'Beta Corp',
      status: 'failed',
      error_message: 'AI provider unavailable',
      result_json: null
    });

    const req = {
      params: { jobId: 'job-failed-19' },
      user: { id: 19, role: 'user', email: 'u19@example.com' }
    };
    const res = buildRes();
    const next = jest.fn();

    await getAiAnalyzeJobResult(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'AI provider unavailable'
    });
  });

  test('getAiAnalyzeJobResult returns result payload for completed jobs', async () => {
    const { getAiAnalyzeJobResult } = require('../src/controllers/mcpController');

    mockAiSettingsService.resolveUserId.mockReturnValue(21);
    mockAiAnalyzeJobService.getJob.mockResolvedValueOnce({
      id: 'job-complete-21',
      user_id: 21,
      target: 'Gamma Corp',
      status: 'completed',
      progress: 100,
      workflow_step: 'completed',
      result_json: {
        analysis: {
          summary: 'Completed'
        }
      }
    });
    mockAiAnalyzeJobService.toJobSummary.mockReturnValueOnce({
      id: 'job-complete-21',
      jobId: 'job-complete-21',
      target: 'Gamma Corp',
      status: 'completed',
      progress: 100,
      workflowStep: 'completed'
    });

    const req = {
      params: { jobId: 'job-complete-21' },
      user: { id: 21, role: 'user', email: 'u21@example.com' }
    };
    const res = buildRes();
    const next = jest.fn();

    await getAiAnalyzeJobResult(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        analysis: {
          summary: 'Completed'
        }
      },
      meta: expect.objectContaining({
        jobId: 'job-complete-21',
        status: 'completed'
      })
    });
  });

  test('surfaces MCP fallback health signals for partial competitor failures', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({
      results: [{ name: '新能源' }],
      meta: { partialFailure: false }
    });
    mockAiService.searchCompetitors.mockResolvedValue({
      competitors: [
        { name: 'comp/a', source: 'bing_web', relevanceScore: 2.3 },
        { name: 'comp/b', source: 'duckduckgo', relevanceScore: 2.2 }
      ],
      meta: {
        sourceCounts: { bing_web: 1, duckduckgo: 1 },
        coverageSourceCounts: { bing_web: 1, duckduckgo: 1 },
        partialFailure: true,
        reason: 'mcp_tool_failed'
      }
    });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({
      references: [{ name: '行业报告', url: 'https://example.com/report' }],
      meta: { partialFailure: false }
    });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({
      repoCount: 1,
      references: [{ name: '企业年报', url: 'https://example.com/ir' }],
      meta: { partialFailure: false }
    });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      providerUsed: 'primary',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.mcp.mcpHealth).toEqual(expect.objectContaining({
      usedFallback: true,
      fallbackReasons: expect.arrayContaining(['mcp_tool_failed']),
      fallbackReasonLabels: expect.arrayContaining(['MCP 工具调用失败']),
      partialFailureSources: expect.arrayContaining(['competitor'])
    }));
  });

  test('runs bounded gap follow-up waves when critical gaps exceed threshold', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValue({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockImplementation((query) => {
      if (String(query).includes('同类品牌 对比')) {
        return Promise.resolve({
          competitors: [
            { name: '竞品A', source: 'bing_web', relevanceScore: 2.6 },
            { name: '竞品B', source: 'duckduckgo', relevanceScore: 2.3 },
            { name: '竞品C', source: 'bing_news', relevanceScore: 2.2 },
            { name: '竞品D', source: 'sogou', relevanceScore: 2.1 }
          ],
          meta: {
            sourceCounts: { bing_web: 1, duckduckgo: 1, bing_news: 1, sogou: 1 },
            coverageSourceCounts: { bing_web: 1, duckduckgo: 1, bing_news: 1, sogou: 1 }
          }
        });
      }
      return Promise.resolve({ competitors: [{ name: '竞品A', source: 'bing_web', relevanceScore: 1.1 }], meta: { sourceCounts: { bing_web: 1 } } });
    });
    mockAiService.fetchMarketReport.mockImplementation((params = {}) => {
      if (params.query && params.query !== '新能源') {
        return Promise.resolve({ references: [{ name: '行业报告', url: 'https://example.com/report' }] });
      }
      return Promise.resolve({ references: [] });
    });
    mockAiService.fetchFinancialData.mockImplementation((params = {}) => {
      if (params.query) {
        return Promise.resolve({ repoCount: 1, references: [{ name: '企业年报', url: 'https://example.com/ir' }] });
      }
      return Promise.resolve({ repoCount: 0, references: [] });
    });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockAiService.searchCompetitors).toHaveBeenCalledWith('新能源 同类品牌 对比');
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.analysis.evidence.dataCompleteness.followup).toEqual(expect.objectContaining({
      triggered: true,
      attempts: expect.any(Number),
      stopReason: 'gaps_recovered',
      exhausted: false
    }));
    expect(payload.data.analysis.aiMeta.degraded).toBe(false);
  });

  test('returns explicit completeness degraded reason when follow-up budget exhausts', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValue({ results: [] });
    mockAiService.searchCompetitors.mockResolvedValue({ competitors: [{ name: '竞品A', source: 'bing_web', relevanceScore: 1.1 }], meta: { sourceCounts: { bing_web: 1 } } });
    mockAiService.fetchMarketReport.mockResolvedValue({ references: [] });
    mockAiService.fetchFinancialData.mockResolvedValue({ repoCount: 0, references: [] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.analysis.evidence.dataCompleteness.followup).toEqual(expect.objectContaining({
      triggered: true,
      exhausted: true,
      stopReason: 'insufficient_new_evidence'
    }));
    expect(payload.data.analysis.aiMeta.degraded).toBe(true);
    expect(payload.data.analysis.aiMeta.degradedReason).toBe('data_completeness_insufficient:insufficient_new_evidence');
    expect(payload.data.analysis.evidence.dataCompleteness.degradedReason).toBe('data_completeness_insufficient:insufficient_new_evidence');
  });

  test('does not run gap follow-up when critical threshold is not exceeded', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValue({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValue({
      competitors: [
        { name: '竞品A', source: 'bing_web', relevanceScore: 2.2 },
        { name: '竞品B', source: 'duckduckgo', relevanceScore: 2.4 },
        { name: '竞品C', source: 'bing_news', relevanceScore: 2.3 },
        { name: '竞品D', source: 'sogou', relevanceScore: 2.1 }
      ],
      meta: {
        sourceCounts: { bing_web: 1, duckduckgo: 1, bing_news: 1, sogou: 1 },
        coverageSourceCounts: { bing_web: 1, duckduckgo: 1, bing_news: 1, sogou: 1 }
      }
    });
    mockAiService.fetchMarketReport.mockResolvedValue({ references: [{ name: '行业报告', url: 'https://example.com/report' }] });
    mockAiService.fetchFinancialData.mockResolvedValue({ repoCount: 1, references: [{ name: '企业年报', url: 'https://example.com/ir' }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.analysis.evidence.dataCompleteness.followup).toEqual(expect.objectContaining({
      triggered: false,
      attempts: 0,
      stopReason: 'not_triggered'
    }));
    expect(mockAiService.searchCompetitors).not.toHaveBeenCalledWith('新能源 同类品牌 对比');
  });

  test('merges duplicated competitors by highest relevance score', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors
      .mockResolvedValueOnce({
        competitors: [{ name: '同名竞品', source: 'bing_web', relevanceScore: 1.2 }],
        meta: { sourceCounts: { bing_web: 1 } }
      })
      .mockResolvedValueOnce({
        competitors: [{ name: '同名竞品', source: 'duckduckgo', relevanceScore: 2.4 }],
        meta: { sourceCounts: { duckduckgo: 1 } }
      })
      .mockResolvedValueOnce({
        competitors: [{ name: '另一竞品', source: 'bing_news', relevanceScore: 1.5 }],
        meta: { sourceCounts: { bing_news: 1 } }
      });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({ references: [{ name: '行业报告', url: 'https://example.com/report' }] });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({ repoCount: 1, references: [{ name: '企业年报', url: 'https://example.com/ir' }] });

    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    const competitors = payload.data.mcp.competitorData.competitors;
    const sameName = competitors.find((item) => item.name === '同名竞品');

    expect(competitors).toHaveLength(2);
    expect(sameName).toEqual(expect.objectContaining({
      source: 'duckduckgo',
      relevanceScore: 2.4
    }));
    expect(competitors[0]).toEqual(expect.objectContaining({ name: '同名竞品' }));
  });

  test('filters unsafe and noisy MCP evidence for non-gaming targets', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '茶饮', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '茶饮' }] });
    mockAiService.searchCompetitors.mockResolvedValue({
      competitors: [
        { name: 'CrazyGames - Play Now', source: 'bing_web', relevanceScore: 2.3 },
        { name: '喜茶', source: 'bing_news', relevanceScore: 2.6, url: 'https://www.heytea.com/' }
      ]
    });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({
      references: [
        { name: 'XNXX', url: 'https://www.xnxx.com' },
        { name: '茶饮行业报告', url: 'https://example.com/tea-report' }
      ]
    });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({
      repoCount: 2,
      references: [
        { name: 'xvideos finance', url: 'https://xvideos.com/finance' },
        { name: '企业年报', url: 'https://example.com/annual-report', relevanceScore: 1.5 }
      ]
    });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '茶颜悦色' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];

    expect(payload.data.analysis.evidence.competitorTopSources.map((item) => item.name)).toEqual(['喜茶']);
    expect(payload.data.analysis.evidence.marketTopReferences.map((item) => item.name)).toEqual(['茶饮行业报告']);
    expect(payload.data.analysis.evidence.financialTopReferences.map((item) => item.name)).toEqual(['企业年报']);
  });

  test('ignores invalid cached JSON and recalculates response', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce('not-json');
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValueOnce({ competitors: [{ name: 'comp/a', source: 'mcp' }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalled();
  });

  test('returns retry hints when AI provider is rate-limited', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValue({ competitors: [{ name: 'comp/a', source: 'mcp' }] });

    const rateLimitErr = new Error('AI provider rate limited');
    rateLimitErr.status = 429;
    rateLimitErr.retryAfterSec = 12;
    rateLimitErr.limitHint = 'provider_rate_limited';
    mockAiService.generateAnalysisNarrative.mockRejectedValueOnce(rateLimitErr);

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      retryable: true,
      retryAfter: 12,
      limitHint: 'provider_rate_limited'
    }));
  });

  test('does not cache degraded aiAnalyze responses', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValue({ competitors: [{ name: 'comp/a', source: 'web' }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'fallback narrative',
      modelUsed: 'fallback-template',
      providerUsed: 'fallback',
      degraded: true,
      degradedReason: 'provider_rate_limited',
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  test('skips degraded cache entry and recomputes', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(JSON.stringify({
      success: true,
      data: {
        analysis: {
          aiMeta: {
            degraded: true
          }
        }
      }
    }));
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValue({
      competitors: [{ name: 'comp/a', source: 'web', relevanceScore: 2.2 }],
      meta: {
        sourceCounts: { web: 1 },
        coverageSourceCounts: { web: 1, news: 1 }
      }
    });
    mockAiService.fetchMarketReport.mockResolvedValueOnce({ references: [{ name: '行业报告', url: 'https://example.com/report' }] });
    mockAiService.fetchFinancialData.mockResolvedValueOnce({ repoCount: 1, references: [{ name: '企业年报', url: 'https://example.com/ir' }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'non degraded narrative',
      modelUsed: 'model-x',
      providerUsed: 'primary',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
    expect(mockRedis.setex).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalled();
  });

  test('streams aiAnalyze over SSE when stream flag is enabled', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValue({ competitors: [{ name: 'comp/a', source: 'mcp' }] });

    mockAiService.generateAnalysisNarrativeStream.mockImplementationOnce(async (_payload, options = {}) => {
      if (typeof options.onEvent === 'function') {
        options.onEvent({ type: 'response.output_text.delta', delta: 'stream-part' });
        options.onEvent({ type: 'response.completed', finishReason: 'stop', model: 'gpt-4.1-mini' });
      }

      return {
        text: 'stream-part',
        modelUsed: 'gpt-4.1-mini',
        providerUsed: 'primary',
        degraded: false,
        promptVersion: 'v1',
        finishReason: 'stop'
      };
    });

    const req = { body: { target: '新能源', stream: true } };
    const res = buildRes();
    res.setHeader = jest.fn();
    res.flushHeaders = jest.fn();
    res.write = jest.fn();
    res.end = jest.fn();
    res.on = jest.fn();

    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: response.output_text.delta'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: ai_analyze.completed'));
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  test('emits telemetry envelope with shared correlation id and versioned metadata', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValue({ competitors: [{ name: 'comp/a', source: 'mcp', relevanceScore: 2.2 }] });
    mockAiService.generateAnalysisNarrative.mockResolvedValueOnce({
      text: 'ok',
      modelUsed: 'model-x',
      providerUsed: 'primary',
      degraded: false,
      promptVersion: 'v1'
    });

    const req = { body: { target: '新能源' } };
    const res = buildRes();
    const next = jest.fn();

    await aiAnalyze(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockLogger.emitQualityEvent).toHaveBeenCalled();
    const startCall = mockLogger.emitQualityEvent.mock.calls.find((call) => call[0] === 'quality.ai_analyze.start');
    const completeCall = mockLogger.emitQualityEvent.mock.calls.find((call) => call[0] === 'quality.ai_analyze.completed');
    expect(startCall).toBeTruthy();
    expect(completeCall).toBeTruthy();
    const sharedRequestId = startCall[1].analysisRequestId;
    expect(typeof sharedRequestId).toBe('string');
    expect(sharedRequestId.length).toBeGreaterThan(5);
    expect(completeCall[1].analysisRequestId).toBe(sharedRequestId);

    expect(mockAiService.generateAnalysisNarrative).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        telemetryContext: expect.objectContaining({ analysisRequestId: sharedRequestId })
      })
    );

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.analysis.aiMeta).toEqual(expect.objectContaining({
      analysisRequestId: sharedRequestId,
      eventVersion: '1.0'
    }));
  });

  test('routes regulatory_filings fetch to aiService', async () => {
    const { fetch } = require('../src/controllers/mcpController');
    const expected = {
      company: '茶颜悦色',
      filingCount: 1,
      references: [{ name: 'Sample filing', url: 'https://www.sec.gov/example' }]
    };
    mockAiService.fetchRegulatoryFilings.mockResolvedValueOnce(expected);

    const req = {
      body: {
        dataType: 'regulatory_filings',
        params: { company: '茶颜悦色', timeframe: 'latest' }
      }
    };
    const res = buildRes();
    const next = jest.fn();

    await fetch(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockAiService.fetchRegulatoryFilings).toHaveBeenCalledWith(req.body.params);
    expect(res.json).toHaveBeenCalledWith(expected);
  });

  test('routes news_stream fetch to aiService', async () => {
    const { fetch } = require('../src/controllers/mcpController');
    const expected = {
      query: '茶颜悦色',
      references: [{ name: 'Sample news', url: 'https://example.com/news' }]
    };
    mockAiService.fetchNewsStream.mockResolvedValueOnce(expected);

    const req = {
      body: {
        dataType: 'news_stream',
        params: { query: '茶颜悦色', timeframe: 'latest', limit: 5 }
      }
    };
    const res = buildRes();
    const next = jest.fn();

    await fetch(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockAiService.fetchNewsStream).toHaveBeenCalledWith(req.body.params);
    expect(res.json).toHaveBeenCalledWith(expected);
  });

});
