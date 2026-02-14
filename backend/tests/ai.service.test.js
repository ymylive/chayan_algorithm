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

  beforeEach(() => {
    delete process.env.AI_COMPETITOR_AUGMENT_GITHUB;
    delete process.env.AI_COMPETITOR_MIN_RESULTS;
    delete process.env.AI_COMPETITOR_MAX_RESULTS;
  });

  test('augments sparse MCP competitor results with GitHub source', async () => {
    const aiService = loadService();
    const mcpSpy = jest.spyOn(aiService, '_callMcpWithCache').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: '竞争者A', source: 'mcp' }]
    });
    const githubSpy = jest.spyOn(aiService, 'searchGitHubCompetitors').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: 'org/competitor-b', description: '新能源项目', stars: 42, source: 'github' }]
    });

    process.env.AI_COMPETITOR_MIN_RESULTS = '5';
    process.env.AI_COMPETITOR_MAX_RESULTS = '12';

    const result = await aiService.searchCompetitors('新能源');

    expect(mcpSpy).toHaveBeenCalledTimes(1);
    expect(githubSpy).toHaveBeenCalledTimes(1);
    expect(Array.isArray(result.competitors)).toBe(true);
    expect(result.competitors.map((item) => item.name)).toEqual(
      expect.arrayContaining(['竞争者A', 'org/competitor-b'])
    );
    expect(result.meta.sourceCounts.mcp).toBe(1);
    expect(result.meta.sourceCounts.github).toBe(1);
  });

  test('returns MCP data directly when enough results and no forced augmentation', async () => {
    const aiService = loadService();
    const mcpPayload = {
      query: '新能源',
      competitors: [
        { name: 'A' }, { name: 'B' }, { name: 'C' },
        { name: 'D' }, { name: 'E' }, { name: 'F' }
      ]
    };

    const mcpSpy = jest.spyOn(aiService, '_callMcpWithCache').mockResolvedValue(mcpPayload);
    const githubSpy = jest.spyOn(aiService, 'searchGitHubCompetitors').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: 'org/unused' }]
    });

    process.env.AI_COMPETITOR_MIN_RESULTS = '5';
    process.env.AI_COMPETITOR_AUGMENT_GITHUB = 'false';

    const result = await aiService.searchCompetitors('新能源');

    expect(mcpSpy).toHaveBeenCalledTimes(1);
    expect(githubSpy).not.toHaveBeenCalled();
    expect(result).toEqual(mcpPayload);
  });

  test('keeps MCP result and marks partialFailure when GitHub augmentation fails', async () => {
    const aiService = loadService();
    jest.spyOn(aiService, '_callMcpWithCache').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: '竞争者A' }]
    });
    jest.spyOn(aiService, 'searchGitHubCompetitors').mockRejectedValue(new Error('rate limit'));

    process.env.AI_COMPETITOR_MIN_RESULTS = '5';

    const result = await aiService.searchCompetitors('新能源');

    expect(result.competitors).toEqual([{ name: '竞争者A' }]);
    expect(result.meta.partialFailure).toBe(true);
    expect(result.meta.sourceCounts).toEqual({ mcp: 1, github: 0 });
    expect(result.meta.sourcesUsed).toEqual(['mcp']);
  });

  test('forces GitHub augmentation when AI_COMPETITOR_AUGMENT_GITHUB is true', async () => {
    const aiService = loadService();
    const mcpSpy = jest.spyOn(aiService, '_callMcpWithCache').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' }]
    });
    const githubSpy = jest.spyOn(aiService, 'searchGitHubCompetitors').mockResolvedValue({
      query: '新能源',
      competitors: [{ name: 'org/forced' }]
    });

    process.env.AI_COMPETITOR_MIN_RESULTS = '5';
    process.env.AI_COMPETITOR_AUGMENT_GITHUB = 'true';

    const result = await aiService.searchCompetitors('新能源');

    expect(mcpSpy).toHaveBeenCalledTimes(1);
    expect(githubSpy).toHaveBeenCalledTimes(1);
    expect(result.meta.sourceCounts).toEqual({ mcp: 6, github: 1 });
    expect(result.meta.sourcesUsed).toEqual(expect.arrayContaining(['mcp', 'github']));
  });

  test('normalizes competitor min/max limits to avoid inconsistent config', async () => {
    const aiService = loadService();
    process.env.AI_COMPETITOR_MIN_RESULTS = '20';
    process.env.AI_COMPETITOR_MAX_RESULTS = '3';

    const config = aiService.getAIConfig();

    expect(config.competitorMaxResults).toBe(3);
    expect(config.competitorMinResults).toBe(3);
  });
});

describe('aiService OpenAI Responses adapter', () => {
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
    delete process.env.AI_RETRY_MAX_ATTEMPTS;
    delete process.env.AI_RETRY_BASE_DELAY_MS;
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
      temperature: 0.2,
      max_output_tokens: 300
    }));
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
      enableMcpToolLoop: true
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

  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_FALLBACK_MODEL;
    delete process.env.AI_MODEL_FALLBACKS;
    delete process.env.AI_SECONDARY_BASE_URL;
    delete process.env.AI_SECONDARY_API_KEY;
    delete process.env.AI_SECONDARY_MODEL;
    delete process.env.AI_RETRY_MAX_ATTEMPTS;
    delete process.env.AI_RETRY_BASE_DELAY_MS;
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
    process.env.AI_RETRY_MAX_ATTEMPTS = '1';
    process.env.AI_RETRY_BASE_DELAY_MS = '1';

    global.fetch = jest.fn().mockResolvedValue({
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
    });

    expect(global.fetch).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      modelUsed: 'fallback-template',
      providerUsed: 'fallback',
      degraded: true
    }));
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });
});
