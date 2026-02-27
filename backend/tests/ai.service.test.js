describe('aiService.searchCompetitors', () => {
  const loadService = () => {
    jest.resetModules();

    jest.doMock('../src/config/redis', () => ({
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    }));

    jest.doMock('../src/config/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));

    jest.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
      Client: jest.fn()
    }));

    jest.doMock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
      StdioClientTransport: jest.fn()
    }));

    return require('../src/services/aiService');
  };

  test('returns MCP competitor payload directly without GitHub augmentation', async () => {
    const aiService = loadService();
    const mcpPayload = {
      query: '新能源',
      competitors: [{ name: '竞争者A', source: 'mcp' }],
      meta: { sourceCounts: { web: 1 }, sourcesUsed: ['web'] }
    };

    const mcpSpy = jest.spyOn(aiService, '_callMcpWithCache').mockResolvedValue(mcpPayload);

    const result = await aiService.searchCompetitors('新能源');

    expect(mcpSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mcpPayload);
  });

  test('passes query and cache prefix to MCP cache helper', async () => {
    const aiService = loadService();
    const mcpSpy = jest.spyOn(aiService, '_callMcpWithCache').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: 'A' }]
    });

    await aiService.searchCompetitors('新能源');

    expect(mcpSpy).toHaveBeenCalledTimes(1);
    expect(mcpSpy).toHaveBeenCalledWith(
      'search_competitors',
      '新能源',
      'competitor',
      expect.any(Function)
    );
  });

  test('returns fallback competitor mock from helper when MCP helper falls back', async () => {
    const aiService = loadService();
    jest.spyOn(aiService, '_callMcpWithCache').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: '竞品A', market_share: '15%' }]
    });

    const result = await aiService.searchCompetitors('新能源');

    expect(result).toEqual({
      query: '新能源',
      competitors: [{ name: '竞品A', market_share: '15%' }]
    });
  });

  test('returns explicit mcp_payload_invalid fallback when MCP payload shape is invalid', async () => {
    const aiService = loadService();
    const redis = require('../src/config/redis');
    process.env.AI_MCP_USE_MOCK_FALLBACK = 'false';
    process.env.AI_USE_MOCK = 'false';

    const mockClient = {
      callTool: jest.fn().mockResolvedValue({ foo: 'bar' })
    };
    jest.spyOn(aiService, 'connectMCP').mockResolvedValue(mockClient);

    const result = await aiService.searchCompetitors('新能源');

    expect(mockClient.callTool).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      query: '新能源',
      competitors: [],
      meta: expect.objectContaining({
        partialFailure: true,
        reason: 'mcp_payload_invalid'
      })
    }));
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^competitor:/),
      expect.any(Number),
      expect.stringContaining('mcp_payload_invalid')
    );
  });

  test('returns explicit mcp_payload_invalid fallback for regulatory filings when MCP payload shape is invalid', async () => {
    const aiService = loadService();
    const redis = require('../src/config/redis');
    process.env.AI_MCP_USE_MOCK_FALLBACK = 'false';
    process.env.AI_USE_MOCK = 'false';

    const mockClient = {
      callTool: jest.fn().mockResolvedValue({ foo: 'bar' })
    };
    jest.spyOn(aiService, 'connectMCP').mockResolvedValue(mockClient);

    const result = await aiService.fetchRegulatoryFilings({
      company: 'Acme Corp',
      ticker: 'ACME',
      timeframe: '12m'
    });

    expect(mockClient.callTool).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      company: 'Acme Corp',
      filings: [],
      meta: expect.objectContaining({
        partialFailure: true,
        reason: 'mcp_payload_invalid'
      })
    }));
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^filings:/),
      expect.any(Number),
      expect.stringContaining('mcp_payload_invalid')
    );
  });

  test('invalid cached MCP payload is deleted before live MCP retry', async () => {
    const aiService = loadService();
    const redis = require('../src/config/redis');
    process.env.AI_MCP_USE_MOCK_FALLBACK = 'false';
    process.env.AI_USE_MOCK = 'false';

    redis.get.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));

    const livePayload = {
      structuredContent: {
        query: '新能源',
        competitors: [{ name: '竞品A', source: 'bing_web', relevanceScore: 2.1 }],
        meta: {
          sourceCounts: { bing_web: 1 },
          sourcesUsed: ['bing_web'],
          partialFailure: false
        }
      }
    };
    const mockClient = {
      callTool: jest.fn().mockResolvedValue(livePayload)
    };
    jest.spyOn(aiService, 'connectMCP').mockResolvedValue(mockClient);

    const result = await aiService.searchCompetitors('新能源');

    expect(redis.del).toHaveBeenCalledWith(expect.stringMatching(/^competitor:/));
    expect(mockClient.callTool).toHaveBeenCalledTimes(1);
    expect(result).toEqual(livePayload.structuredContent);
  });
});

describe('aiService.fetchCompanyIntelligence', () => {
  const loadService = () => {
    jest.resetModules();

    jest.doMock('../src/config/redis', () => ({
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    }));

    jest.doMock('../src/config/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));

    jest.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
      Client: jest.fn()
    }));

    jest.doMock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
      StdioClientTransport: jest.fn()
    }));

    return require('../src/services/aiService');
  };

  test('aggregates target filings, peer filings and consumer profile signals', async () => {
    const aiService = loadService();

    jest.spyOn(aiService, 'searchCompetitors').mockResolvedValue({
      competitors: [{ name: 'Peer A' }, { name: 'Peer B' }]
    });
    jest.spyOn(aiService, 'fetchFinancialData').mockImplementation(async ({ company }) => ({
      company,
      repoCount: 1,
      references: [{ name: `${company} annual report`, url: `https://example.com/${company}/annual` }]
    }));
    jest.spyOn(aiService, 'fetchRegulatoryFilings').mockImplementation(async ({ company }) => ({
      company,
      filingCount: 1,
      references: [{ name: `${company} 10-K`, url: `https://example.com/${company}/10k` }]
    }));
    jest.spyOn(aiService, 'fetchMarketReport').mockResolvedValue({
      references: [
        { name: 'Consumer profile 18-24', url: 'https://example.com/consumer-report', summary: 'Gen Z and millennials' }
      ]
    });
    const fetchNewsSpy = jest.spyOn(aiService, 'fetchNewsStream').mockResolvedValue({
      references: [
        { name: 'Target audience 25-34', url: 'https://example.com/consumer-news', summary: 'white collar parents' }
      ]
    });

    const result = await aiService.fetchCompanyIntelligence({
      target: 'Acme',
      competitorLimit: 2
    });

    expect(result.target).toBe('Acme');
    expect(result.competitorNames).toEqual(['Peer A', 'Peer B']);
    expect(result.targetFinancial.references.length).toBeGreaterThan(0);
    expect(result.targetRegulatoryFilings.references.length).toBeGreaterThan(0);
    expect(result.peerFinancials).toHaveLength(2);
    expect(result.consumerInsights.primaryAgeRanges.map((item) => item.range)).toEqual(
      expect.arrayContaining(['18-24', '25-34'])
    );
    expect(result.consumerInsights.primarySegments.map((item) => item.segment)).toEqual(
      expect.arrayContaining(['Gen Z', 'Millennials', 'White collar', 'Parents'])
    );
    const newsQueries = fetchNewsSpy.mock.calls.map(([params]) => String(params?.query || ''));
    expect(newsQueries.some((query) => /(\u8d22\u62a5|\u5e74\u62a5|annual report|investor relations)/i.test(query))).toBe(true);
    expect(newsQueries.some((query) => /(\u7528\u6237\u753b\u50cf|\u6d88\u8d39\u8005|demographics|audience)/i.test(query))).toBe(true);
  });

  test('returns partial-failure payload when target is missing', async () => {
    const aiService = loadService();
    const result = await aiService.fetchCompanyIntelligence({});

    expect(result).toEqual(expect.objectContaining({
      target: '',
      competitorNames: [],
      peerFinancials: [],
      meta: expect.objectContaining({
        partialFailure: true
      })
    }));
  });
});

describe('aiService OpenAI Responses adapter', () => {
  let mockLogger;

  const loadService = () => {
    jest.resetModules();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      emitQualityEvent: jest.fn()
    };

    jest.doMock('../src/config/redis', () => ({
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    }));

    jest.doMock('../src/config/logger', () => mockLogger);

    jest.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
      Client: jest.fn()
    }));

    jest.doMock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
      StdioClientTransport: jest.fn()
    }));

    return require('../src/services/aiService');
  };

  const originalFetch = global.fetch;

  const buildNarrativePayload = () => ({
    target: '新能源',
    uploaded: { matchedCount: 0, usedCount: 0, topIndustries: [] },
    industryNames: [],
    competitorNames: [],
    model: { method: 'Entropy Weight + TOPSIS + Theil-Sen', trendLabel: 'stable', trendSlope: 0, weights: [], ranking: [] },
    peers: [],
    peerResearch: [],
    keyFindings: [],
    suggestions: []
  });

  beforeEach(() => {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_FALLBACK_MODEL;
    delete process.env.AI_PROTOCOL;
    delete process.env.AI_RESPONSES_INCLUDE_TEMPERATURE;
    delete process.env.AI_PROTOCOL;
    delete process.env.AI_RETRY_MAX_ATTEMPTS;
    delete process.env.AI_RETRY_BASE_DELAY_MS;
    delete process.env.AI_QUALITY_CONTRACT_ENABLED;
    delete process.env.AI_QUALITY_STRICT_MODE;
    delete process.env.AI_QUALITY_MIN_COVERAGE_SOURCES;
    delete process.env.AI_QUALITY_POLICY_VERSION;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('supports streaming responses with partial chunks and deterministic completion', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';

    const encoder = new TextEncoder();
    const fullStream = [
      'event: response.output_text.delta\n',
      'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n',
      'event: response.output_text.delta\n',
      'data: {"type":"response.output_text.delta","delta":"world"}\n\n',
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"status":"completed","model":"gpt-4.1-mini","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Hello world"}]}]}}\n\n',
      'data: [DONE]\n\n'
    ].join('');

    const body = new ReadableStream({
      start(controller) {
        const splitA = 57;
        const splitB = 131;
        controller.enqueue(encoder.encode(fullStream.slice(0, splitA)));
        controller.enqueue(encoder.encode(fullStream.slice(splitA, splitB)));
        controller.enqueue(encoder.encode(fullStream.slice(splitB)));
        controller.close();
      }
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue('text/event-stream') },
      body
    });

    const streamEvents = [];
    const result = await aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      maxTokens: 200,
      stream: true,
      messages: [
        { role: 'system', content: '你是分析助手' },
        { role: 'user', content: '输出流式分析结果' }
      ],
      responseFormat: {
        type: 'json_schema',
        name: 'analysis_result',
        schema: {
          type: 'object',
          properties: {
            headline: { type: 'string' }
          },
          required: ['headline'],
          additionalProperties: false
        },
        strict: true
      },
      onEvent: (event) => streamEvents.push(event)
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.stream).toBe(true);
    expect(requestBody.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'analysis_result',
        schema: {
          type: 'object',
          properties: {
            headline: { type: 'string' }
          },
          required: ['headline'],
          additionalProperties: false
        },
        strict: true
      }
    });
    expect(streamEvents.some((event) => event.type === 'response.output_text.delta')).toBe(true);
    expect(streamEvents.some((event) => event.type === 'response.completed')).toBe(true);
    expect(result).toEqual(expect.objectContaining({
      content: 'Hello world',
      finishReason: 'stop',
      modelUsed: 'gpt-4.1-mini'
    }));
  });

  test('uses responses endpoint when AI_PROTOCOL is responses', async () => {
    const aiService = loadService();

    process.env.AI_PROTOCOL = 'responses';
    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'gpt-4.1-mini';
    process.env.AI_FALLBACK_MODEL = 'gpt-4.1-mini';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'responses narrative output' }]
        }]
      }))
    });

    const result = await aiService.generateAnalysisNarrative(buildNarrativePayload());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('/responses');
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      text: 'responses narrative output'
    }));
  });

  test('builds structured output request payload for responses protocol', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"headline":"ok"}' }]
        }]
      }))
    });

    await aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      maxTokens: 300,
      messages: [
        { role: 'system', content: '你是分析助手' },
        { role: 'user', content: '输出结构化结果' }
      ],
      responseFormat: {
        type: 'json_schema',
        name: 'analysis_result',
        schema: {
          type: 'object',
          properties: {
            headline: { type: 'string' }
          },
          required: ['headline'],
          additionalProperties: false
        },
        strict: true
      }
    });

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody).toEqual(expect.objectContaining({
      model: 'gpt-4.1-mini',
      max_output_tokens: 300
    }));
    expect(requestBody).not.toHaveProperty('temperature');
    expect(requestBody.input).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'system' }),
      expect.objectContaining({ role: 'user' })
    ]));
    expect(requestBody.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'analysis_result',
        schema: {
          type: 'object',
          properties: {
            headline: { type: 'string' }
          },
          required: ['headline'],
          additionalProperties: false
        },
        strict: true
      }
    });
  });

  test('forces stream mode for non-official responses hosts and accepts JSON fallback bodies', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://gmn.chuangzuoli.com/v1';
    process.env.AI_API_KEY = 'test-key';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue('application/json') },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'forced stream ok' }]
        }]
      }))
    });

    const result = await aiService.callResponsesCompletion({
      model: 'gpt-5.2',
      temperature: 0.2,
      maxTokens: 256,
      messages: [{ role: 'user', content: 'hello' }]
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestHeaders = global.fetch.mock.calls[0][1].headers;
    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestHeaders.Accept).toBe('text/event-stream');
    expect(requestBody.stream).toBe(true);
    expect(result).toEqual(expect.objectContaining({
      content: 'forced stream ok',
      finishReason: 'stop'
    }));
  });

  test('uses max_tokens key for non-openai responses providers', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue('application/json') },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'ok' }]
        }]
      }))
    });

    await aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      maxTokens: 300,
      messages: [{ role: 'user', content: 'hello' }]
    });

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.max_tokens).toBe(300);
    expect(requestBody.max_output_tokens).toBeUndefined();
  });

  test('retries once with token-key override when responses provider rejects max_output_tokens', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://gmn.chuangzuoli.com/v1';
    process.env.AI_API_KEY = 'test-key';

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          error: { message: 'Unsupported parameter: max_output_tokens' }
        }))
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          status: 'completed',
          output: [{
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'retry succeeded' }]
          }]
        }))
      });

    const result = await aiService.callResponsesCompletion({
      model: 'gpt-5.2',
      temperature: 0.2,
      maxTokens: 180,
      messages: [{ role: 'user', content: 'hello' }]
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(firstBody.max_output_tokens).toBe(180);
    expect(secondBody.max_tokens).toBe(180);
    expect(secondBody.max_output_tokens).toBeUndefined();
    expect(result).toEqual(expect.objectContaining({
      content: 'retry succeeded'
    }));
  });

  test('includes responses temperature only when explicitly enabled', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_RESPONSES_INCLUDE_TEMPERATURE = 'true';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'ok' }]
        }]
      }))
    });

    await aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      maxTokens: 120,
      messages: [{ role: 'user', content: 'hello' }]
    });

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.temperature).toBe(0.2);
  });

  test('runs MCP tool-call loop and resumes responses completion', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';

    const mockClient = {
      callTool: jest.fn().mockResolvedValue({
        structuredContent: {
          competitors: [{ name: '竞品A' }]
        }
      })
    };
    jest.spyOn(aiService, 'connectMCP').mockResolvedValue(mockClient);

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          id: 'resp_1',
          status: 'completed',
          output: [{
            type: 'function_call',
            name: 'search_competitors',
            call_id: 'call_1',
            arguments: '{"query":"新能源"}'
          }]
        }))
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          status: 'completed',
          output: [{
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'tool-informed narrative' }]
          }]
        }))
      });

    const result = await aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      maxTokens: 300,
      messages: [
        { role: 'system', content: '你是分析助手' },
        { role: 'user', content: '请调用工具后给出结论' }
      ],
      enableMcpToolLoop: true,
      telemetryContext: {
        analysisRequestId: 'req-tool-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'search_competitors',
      arguments: { query: '新能源' }
    });

    const secondRequestBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(secondRequestBody.previous_response_id).toBe('resp_1');
    expect(secondRequestBody.input).toEqual([
      expect.objectContaining({
        type: 'function_call_output',
        call_id: 'call_1'
      })
    ]);

    expect(result).toEqual(expect.objectContaining({
      content: 'tool-informed narrative',
      finishReason: 'stop'
    }));

    const telemetryCall = mockLogger.emitQualityEvent.mock.calls.find((call) => call[0] === 'quality.ai.tool_call.executed');
    expect(telemetryCall).toBeTruthy();
    expect(telemetryCall[1]).toEqual(expect.objectContaining({
      analysisRequestId: 'req-tool-1',
      stage: 'service_tool_call',
      status: 'ok'
    }));
  });

  test('runs MCP tool-call loop for fetch_news_stream and normalizes limit', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';

    const mockClient = {
      callTool: jest.fn().mockResolvedValue({
        structuredContent: {
          query: 'acme',
          timeframe: '7d',
          news: [{ title: 'Acme update' }],
          meta: { limit: 5 }
        }
      })
    };
    jest.spyOn(aiService, 'connectMCP').mockResolvedValue(mockClient);

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          id: 'resp_news_1',
          status: 'completed',
          output: [{
            type: 'function_call',
            name: 'fetch_news_stream',
            call_id: 'call_news_1',
            arguments: '{"query":"acme","timeframe":"7d","limit":"5"}'
          }]
        }))
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          status: 'completed',
          output: [{
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'news tool narrative' }]
          }]
        }))
      });

    const result = await aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      maxTokens: 300,
      messages: [
        { role: 'system', content: 'you are an analyst assistant' },
        { role: 'user', content: 'use news tool then respond' }
      ],
      enableMcpToolLoop: true
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'fetch_news_stream',
      arguments: { query: 'acme', timeframe: '7d', limit: 5 }
    });

    const secondRequestBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(secondRequestBody.previous_response_id).toBe('resp_news_1');
    expect(secondRequestBody.input).toEqual([
      expect.objectContaining({
        type: 'function_call_output',
        call_id: 'call_news_1'
      })
    ]);

    expect(result).toEqual(expect.objectContaining({
      content: 'news tool narrative',
      finishReason: 'stop'
    }));
  });

  test('rejects unknown tool calls before MCP dispatch', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';

    const connectSpy = jest.spyOn(aiService, 'connectMCP').mockResolvedValue({
      callTool: jest.fn()
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        id: 'resp_unsafe',
        status: 'completed',
        output: [{
          type: 'function_call',
          name: 'shell_exec',
          call_id: 'call_unsafe',
          arguments: '{"command":"rm -rf /"}'
        }]
      }))
    });

    await expect(aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      maxTokens: 150,
      messages: [{ role: 'user', content: '执行危险命令' }],
      enableMcpToolLoop: true
    })).rejects.toMatchObject({
      status: 400,
      limitHint: 'invalid_tool_call'
    });

    expect(connectSpy).not.toHaveBeenCalled();
  });

  test('maps responses rate-limit and timeout errors into deterministic status fields', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_API_KEY = 'test-key';

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: jest.fn().mockReturnValue('7') },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          error: {
            message: 'provider_rate_limited',
            metadata: { retry_after: 7 }
          }
        }))
      })
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      maxTokens: 100
    })).rejects.toMatchObject({
      status: 429,
      retryAfterSec: 7,
      limitHint: 'provider_rate_limited'
    });

    await expect(aiService.callResponsesCompletion({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      maxTokens: 100,
      requestTimeoutMs: 20
    })).rejects.toMatchObject({
      status: 504
    });
  });
});

describe('aiService.generateAnalysisNarrative', () => {
  let mockLogger;

  const buildNarrativePayload = () => ({
    target: '新能源',
    uploaded: { matchedCount: 0, usedCount: 0, topIndustries: [] },
    industryNames: ['新能源'],
    competitorNames: ['星能科技'],
    model: { method: 'Entropy Weight + TOPSIS + Theil-Sen', trendLabel: 'stable', trendSlope: 0, weights: [], ranking: [] },
    peers: [{ name: '星能科技', industry: '新能源' }],
    peerResearch: [],
    keyFindings: ['新能源赛道竞争加剧'],
    suggestions: [],
    marketReport: {
      references: [{ name: '新能源行业年度报告', url: 'https://example.com/report-2025', summary: '行业规模增长' }]
    },
    financialData: {
      references: [{ name: '企业年报', url: 'https://example.com/annual' }]
    }
  });

  const loadService = () => {
    jest.resetModules();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      emitQualityEvent: jest.fn()
    };

    jest.doMock('../src/config/redis', () => ({
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    }));

    jest.doMock('../src/config/logger', () => mockLogger);

    jest.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
      Client: jest.fn()
    }));

    jest.doMock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
      StdioClientTransport: jest.fn()
    }));

    return require('../src/services/aiService');
  };

  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.AI_USE_MOCK;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_FALLBACK_MODEL;
    delete process.env.AI_MODEL_FALLBACKS;
    delete process.env.AI_SECONDARY_BASE_URL;
    delete process.env.AI_SECONDARY_API_KEY;
    delete process.env.AI_SECONDARY_MODEL;
    delete process.env.AI_RESPONSES_INCLUDE_TEMPERATURE;
    delete process.env.AI_RETRY_MAX_ATTEMPTS;
    delete process.env.AI_RETRY_BASE_DELAY_MS;
    delete process.env.AI_REQUEST_TIMEOUT_MS;
    delete process.env.AI_QUALITY_CONTRACT_ENABLED;
    delete process.env.AI_QUALITY_STRICT_MODE;
    delete process.env.AI_QUALITY_MIN_COVERAGE_SOURCES;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('degrades to template fallback when provider stays rate-limited', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_RETRY_MAX_ATTEMPTS = '2';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: jest.fn().mockReturnValue('1') },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          error: { message: 'rate_limited' }
        }))
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: jest.fn().mockReturnValue('1') },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          error: { message: 'rate_limited' }
        }))
      });

    const result = await aiService.generateAnalysisNarrative({
      target: '新能源',
      uploaded: { matchedCount: 0, usedCount: 0, topIndustries: [] },
      industryNames: [],
      competitorNames: [],
      model: { method: 'Entropy Weight + TOPSIS + Theil-Sen', trendLabel: 'stable', trendSlope: 0, weights: [], ranking: [] },
      peers: [],
      peerResearch: [],
      keyFindings: [],
      suggestions: []
    }, {
      telemetryContext: {
        analysisRequestId: 'req-retry-1'
      }
    });

    expect(global.fetch).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      modelUsed: 'fallback-template',
      providerUsed: 'fallback',
      degraded: true,
      degradedReason: 'provider_rate_limited'
    }));
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);

    const retryCall = mockLogger.emitQualityEvent.mock.calls.find((call) => call[0] === 'quality.ai.provider_retry');
    const terminalCall = mockLogger.emitQualityEvent.mock.calls.filter((call) => call[0] === 'quality.ai.provider_terminal').pop();
    expect(retryCall).toBeTruthy();
    expect(retryCall[1]).toEqual(expect.objectContaining({
      analysisRequestId: 'req-retry-1',
      stage: 'service_provider_retry'
    }));
    expect(terminalCall).toBeTruthy();
    expect(terminalCall[1]).toEqual(expect.objectContaining({
      analysisRequestId: 'req-retry-1',
      status: 'degraded'
    }));
    expect(JSON.stringify(terminalCall[1])).not.toMatch(/test-key|authorization|cookie|prompt|messages/i);
  });

  test('maps quality feature flags into narrative metadata', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_CONTRACT_ENABLED = '0';
    process.env.AI_QUALITY_STRICT_MODE = 'yes';
    process.env.AI_QUALITY_MIN_COVERAGE_SOURCES = '5';
    process.env.AI_QUALITY_POLICY_VERSION = 'quality-policy-v2';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{ message: { content: '结构化测试输出' }, finish_reason: 'stop' }],
        model: 'primary-model'
      }))
    });

    const result = await aiService.generateAnalysisNarrative({
      target: '新能源',
      uploaded: { matchedCount: 0, usedCount: 0, topIndustries: [] },
      industryNames: [],
      competitorNames: [],
      model: { method: 'Entropy Weight + TOPSIS + Theil-Sen', trendLabel: 'stable', trendSlope: 0, weights: [], ranking: [] },
      peers: [],
      peerResearch: [],
      keyFindings: [],
      suggestions: []
    });

    expect(result).toEqual(expect.objectContaining({
      qualityFlags: {
        qualityContractEnabled: false,
        qualityStrictMode: true,
        qualityMinCoverageSources: 5,
        version: 'quality-policy-v2'
      }
    }));
  });

  test('builds project-specific structured prompt with evidence id constraints', () => {
    const aiService = loadService();
    const messages = aiService.buildNarrativeMessages(buildNarrativePayload());
    const userMessage = messages.find((item) => item.role === 'user');

    expect(userMessage?.content).toContain('evidence_ids');
    expect(userMessage?.content).toContain('company_financial_statement_analysis');
    expect(userMessage?.content).toContain('peer_financial_benchmark');
    expect(userMessage?.content).toContain('consumer_demographics');
    expect(userMessage?.content).toContain('data_gaps');
  });

  test('repairs unsupported-claim output and degrades with explicit reason when still unsupported', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_STRICT_MODE = 'true';

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          choices: [{ message: { content: '2025年该行业规模达到1000亿元，头部企业利润率为70%。' }, finish_reason: 'stop' }],
          model: 'primary-model'
        }))
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
        text: jest.fn().mockResolvedValue(JSON.stringify({
          choices: [{ message: { content: '预计未来三年行业规模翻倍，利润率维持70%。' }, finish_reason: 'stop' }],
          model: 'primary-model'
        }))
      });

    const unsupportedPayload = buildNarrativePayload();
    unsupportedPayload.target = '茶饮品牌';
    unsupportedPayload.industryNames = [];
    unsupportedPayload.competitorNames = [];
    unsupportedPayload.keyFindings = [];
    unsupportedPayload.marketReport = { references: [] };
    unsupportedPayload.financialData = { references: [] };

    const result = await aiService.generateAnalysisNarrative(unsupportedPayload, {
      telemetryContext: {
        analysisRequestId: 'req-unsupported-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({
      degraded: true,
      degradedReason: 'unsupported_claim_detected',
      modelUsed: 'fallback-template',
      providerUsed: 'fallback',
      claimSupport: expect.objectContaining({
        repairAttempted: true,
        repairSucceeded: false,
        reasonCode: 'unsupported_claim_detected'
      })
    }));
    expect(result.claimSupport.unsupportedClaims).toBeGreaterThan(0);
  });

  test('keeps provider output in non-strict mode when claim support is degraded', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_STRICT_MODE = 'false';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{ message: { content: '2025年该行业规模达到1000亿元，头部企业利润率为20%。' }, finish_reason: 'stop' }],
        model: 'primary-model'
      }))
    });

    const unsupportedPayload = buildNarrativePayload();
    unsupportedPayload.target = '茶饮品牌';
    unsupportedPayload.industryNames = [];
    unsupportedPayload.competitorNames = [];
    unsupportedPayload.keyFindings = [];
    unsupportedPayload.marketReport = { references: [] };
    unsupportedPayload.financialData = { references: [] };

    const result = await aiService.generateAnalysisNarrative(unsupportedPayload, {
      telemetryContext: {
        analysisRequestId: 'req-unsupported-nonstrict-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      degradedReason: null,
      modelUsed: 'primary-model',
      providerUsed: 'primary',
      claimSupport: expect.objectContaining({
        repairAttempted: false,
        repairSucceeded: false,
        reasonCode: 'unsupported_claim_detected'
      })
    }));
  });

  test('ignores structural headings and hypothesis lines in claim-support counting', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_STRICT_MODE = 'false';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{
          message: {
            content: [
              '1) 高管摘要（3条以内，每条1句话）',
              '【假设】未来三年行业规模翻倍。',
              '行业报告显示新能源赛道增长。'
            ].join('\n')
          },
          finish_reason: 'stop'
        }],
        model: 'primary-model'
      }))
    });

    const result = await aiService.generateAnalysisNarrative(buildNarrativePayload(), {
      telemetryContext: {
        analysisRequestId: 'req-claim-filter-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      providerUsed: 'primary',
      claimSupport: expect.objectContaining({
        unsupportedClaims: 0,
        supportRatio: 1,
        inferenceClaimCount: 0
      })
    }));
  });

  test('ignores scoring/template instruction lines in claim-support counting', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_STRICT_MODE = 'false';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{
          message: {
            content: [
              '同行对标可执行策略（至少3条，含适用场景）',
              '- 策略1：城市分层的开店模型',
              '评分规则（可复现）：1-5分，5分代表更优。',
              '- 影响 4｜可行性 4｜成本 3｜风险 3（【事实+推断】已有零售店型信号，延展相对可行）',
              'P0（没有就无法做量化模型与ROI决策）',
              '- 渠道数据：外卖/到店/自提/零售GMV占比、转化漏斗（影响：无法判断增长来自哪里）',
              '行业报告显示新能源赛道增长。'
            ].join('\n')
          },
          finish_reason: 'stop'
        }],
        model: 'primary-model'
      }))
    });

    const result = await aiService.generateAnalysisNarrative(buildNarrativePayload(), {
      telemetryContext: {
        analysisRequestId: 'req-claim-template-filter-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      providerUsed: 'primary',
      claimSupport: expect.objectContaining({
        unsupportedClaims: 0,
        supportRatio: 1,
        inferenceClaimCount: 0
      })
    }));
  });

  test('ignores option-style strategy headings in claim-support counting', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_STRICT_MODE = 'false';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{
          message: {
            content: [
              '- 选项A：门店规模优先',
              '- Option B: Retail-first expansion',
              '行业报告显示新能源赛道增长。'
            ].join('\n')
          },
          finish_reason: 'stop'
        }],
        model: 'primary-model'
      }))
    });

    const result = await aiService.generateAnalysisNarrative(buildNarrativePayload(), {
      telemetryContext: {
        analysisRequestId: 'req-claim-option-filter-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      providerUsed: 'primary',
      claimSupport: expect.objectContaining({
        unsupportedClaims: 0,
        supportRatio: 1
      })
    }));
  });

  test('ignores action-plan template lines in claim-support counting', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_STRICT_MODE = 'false';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{
          message: {
            content: [
              '负责人：零售事业部',
              '- 动作：在2-3个候选城市做验证',
              'KPI：首月动销率达标',
              '- 建议动作：见第6部分路线图（数据底座、零售曲线、IP护城河、区域扩张打法）',
              '- 优势：【事实】信号源明确指向“千店规模+去地域标签”议题（`peers[1].name`）',
              '行业报告显示新能源赛道增长。'
            ].join('\n')
          },
          finish_reason: 'stop'
        }],
        model: 'primary-model'
      }))
    });

    const result = await aiService.generateAnalysisNarrative(buildNarrativePayload(), {
      telemetryContext: {
        analysisRequestId: 'req-claim-action-template-filter-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      providerUsed: 'primary',
      claimSupport: expect.objectContaining({
        unsupportedClaims: 0,
        supportRatio: 1
      })
    }));
  });

  test('tracks inference-tagged lines as warning-only and excludes them from unsupported claims', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_QUALITY_STRICT_MODE = 'false';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{
          message: {
            content: [
              '【推断】增长抓手应优先做渠道联动。',
              '行业报告显示新能源赛道增长。'
            ].join('\n')
          },
          finish_reason: 'stop'
        }],
        model: 'primary-model'
      }))
    });

    const result = await aiService.generateAnalysisNarrative(buildNarrativePayload(), {
      telemetryContext: {
        analysisRequestId: 'req-claim-inference-filter-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      providerUsed: 'primary',
      claimSupport: expect.objectContaining({
        inferenceClaimCount: 1,
        unsupportedClaims: 0,
        supportRatio: 1
      })
    }));
    expect(result.claimSupport.inferenceSamples[0]).toContain('推断');
  });

  test('keeps supported-claim output healthy and emits claim-support metrics', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue(null) },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        choices: [{ message: { content: '新能源行业年度报告显示市场规模增长，星能科技在新能源赛道竞争加剧背景下保持稳定。' }, finish_reason: 'stop' }],
        model: 'primary-model'
      }))
    });

    const result = await aiService.generateAnalysisNarrative(buildNarrativePayload(), {
      telemetryContext: {
        analysisRequestId: 'req-supported-1'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      degraded: false,
      claimSupport: expect.objectContaining({
        repairAttempted: false,
        unsupportedClaims: 0
      })
    }));
    expect(result.claimSupport.supportedClaims).toBeGreaterThan(0);
  });

  test('keeps timeout mapping deterministic when provider times out', async () => {
    const aiService = loadService();

    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'primary-model';
    process.env.AI_FALLBACK_MODEL = 'primary-model';
    process.env.AI_PROTOCOL = 'chat_completions';
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';
    process.env.AI_REQUEST_TIMEOUT_MS = '5';

    const timeoutErr = new Error('request timeout');
    timeoutErr.status = 504;
    timeoutErr.limitHint = 'provider_timeout';
    global.fetch = jest.fn().mockRejectedValue(timeoutErr);

    await expect(aiService.generateAnalysisNarrative(buildNarrativePayload(), {
      telemetryContext: {
        analysisRequestId: 'req-timeout-1'
      }
    })).rejects.toMatchObject({
      status: 504,
      limitHint: 'provider_timeout'
    });
  });
});
