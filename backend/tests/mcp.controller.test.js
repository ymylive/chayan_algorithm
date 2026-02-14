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

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('../src/services/aiService', () => mockAiService);
    jest.doMock('../src/config/database', () => mockPool);
    jest.doMock('../src/config/redis', () => mockRedis);
    jest.doMock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.doMock('../src/utils/math', () => mockMath);
  });

  test('returns competitor data without githubData projection field', async () => {
    const { aiAnalyze } = require('../src/controllers/mcpController');

    mockRedis.get.mockResolvedValueOnce(null);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: '新能源', created_at: new Date().toISOString() }] });

    mockAiService.searchIndustryData.mockResolvedValueOnce({ results: [{ name: '新能源' }] });
    mockAiService.searchCompetitors.mockResolvedValueOnce({
      competitors: [
        { name: 'comp/a', source: 'web' },
        { name: 'org/b', source: 'web' }
      ],
      meta: { sourceCounts: { web: 2 } }
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
    expect(res.status).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.mcp.competitorData).toEqual(expect.objectContaining({
      competitors: [
        { name: 'comp/a', source: 'web' },
        { name: 'org/b', source: 'web' }
      ]
    }));
    expect(payload.data.mcp.githubData).toBeUndefined();
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

});
