const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { normalizeList, extractDisplayLabel, uniqueNonEmpty } = require('../utils/math');
const {
  normalizeProtocol,
  buildResponsesRequestPayload,
  extractResponsesText,
  normalizeResponsesFinishReason,
  extractResponsesFunctionCalls,
  createResponsesSseParser
} = require('./openaiResponsesAdapter');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ANALYSIS_PROMPT_VERSION = 'market-intel-v2.1';
const SETTINGS_FILE = path.join(__dirname, '../../data/ai-settings.json');

const toBoolean = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return defaultValue;
};

const parsePositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};


const RESPONSES_MCP_TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'search_industry',
    description: 'Search industry intelligence candidates for a query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'search_competitors',
    description: 'Search competitor candidates for a target query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'fetch_market_report',
    description: 'Fetch compact market report references',
    parameters: {
      type: 'object',
      properties: {
        industry: { type: 'string' },
        query: { type: 'string' },
        timeframe: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'fetch_financial_data',
    description: 'Fetch lightweight financial proxy signals',
    parameters: {
      type: 'object',
      properties: {
        company: { type: 'string', minLength: 1 }
      },
      required: ['company'],
      additionalProperties: false
    }
  }
];

const RESPONSES_MCP_TOOL_NAMES = new Set(
  RESPONSES_MCP_TOOL_DEFINITIONS.map((item) => item.name)
);

const createInvalidToolCallError = (message) => {
  const err = new Error(message || 'Invalid MCP tool call');
  err.status = 400;
  err.limitHint = 'invalid_tool_call';
  return err;
};

const sanitizeToolString = (value, fieldName, options = {}) => {
  const required = options.required !== false;
  const maxLen = Number.isFinite(Number(options.maxLen)) ? Number(options.maxLen) : 200;
  const hasValue = value !== undefined && value !== null;

  if (!hasValue) {
    if (required) {
      throw createInvalidToolCallError(`Tool argument \`${fieldName}\` is required`);
    }
    return undefined;
  }

  if (typeof value !== 'string') {
    throw createInvalidToolCallError(`Tool argument \`${fieldName}\` must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw createInvalidToolCallError(`Tool argument \`${fieldName}\` cannot be empty`);
    }
    return undefined;
  }

  return trimmed.slice(0, maxLen);
};

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  const ms = parsePositiveInt(timeoutMs, 30000, 300000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(timeoutMessage || `operation timeout after ${ms}ms`);
      err.status = 504;
      reject(err);
    }, ms);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

const parseRetryAfterSeconds = (value) => {
  if (value === null || value === undefined || value === '') return 0;

  const asInt = Number.parseInt(String(value), 10);
  if (Number.isFinite(asInt) && asInt > 0) {
    return asInt;
  }

  const asDate = Date.parse(String(value));
  if (Number.isFinite(asDate)) {
    const diffMs = asDate - Date.now();
    if (diffMs > 0) {
      return Math.ceil(diffMs / 1000);
    }
  }

  return 0;
};

const isOpenRouterBaseURL = (baseURL) => /(^|\.)openrouter\.ai$/i.test(String(baseURL || '').replace(/^https?:\/\//i, '').split('/')[0]);

const extractChoiceText = (choice) => {
  const message = choice?.message || {};
  const rawContent = message?.content;

  if (typeof rawContent === 'string' && rawContent.trim()) {
    return rawContent.trim();
  }

  if (Array.isArray(rawContent)) {
    const joined = rawContent
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('\n')
      .trim();
    if (joined) return joined;
  }

  if (rawContent && typeof rawContent === 'object') {
    if (typeof rawContent.text === 'string' && rawContent.text.trim()) {
      return rawContent.text.trim();
    }
    if (typeof rawContent.content === 'string' && rawContent.content.trim()) {
      return rawContent.content.trim();
    }
  }

  if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content.trim();
  }

  const deltaContent = choice?.delta?.content;
  if (typeof deltaContent === 'string' && deltaContent.trim()) {
    return deltaContent.trim();
  }

  return '';
};

const extractMcpPayload = (result) => {
  if (!result || typeof result !== 'object') {
    return result;
  }

  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }

  if (Array.isArray(result.content)) {
    const textBlob = result.content
      .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n')
      .trim();

    if (textBlob) {
      try {
        return JSON.parse(textBlob);
      } catch {
        // fall back to original payload
      }
    }
  }

  return result;
};

const ANALYSIS_SYSTEM_PROMPT = `# 角色：AI市场分析专家（Market Intelligence & Strategy Analyst）
你是咨询顾问合伙人级别的市场分析专家。基于输入数据完成：多维市场分析 + 竞品对标 + 可执行增长建议。

## 必须遵守
1. 证据优先：关键结论必须绑定数据、字段或模型结果，并标注【事实】【推断】【假设】。
2. 可复现：定量结论要说明口径、方法、关键输入。
3. 不臆造数据：无数据时明确缺口与影响，允许给区间假设并写明来源逻辑。
4. 面向落地：建议必须含动作、负责人部门、资源、里程碑、KPI、风险与对策。
5. 多维覆盖：至少覆盖市场/客户/产品/渠道/竞争/增长/财务/风险/组织中的6个维度。

## 与当前项目结构对齐（重要）
- 你不能直接调用工具；你只可使用输入中的结构化数据（上传数据摘要、MCP检索摘要、模型输出、同行对标结果）。
- 数学模型为：Entropy Weight + TOPSIS + Theil-Sen，需在解读中体现其含义与限制。
- 如外部信息不足，输出“待补齐清单”，不要虚构市场规模或份额。

## 输出格式（严格按顺序）
1) 高管摘要（3条以内，每条1句话）
2) 关键洞察（分模块，至少6个维度；每条前缀【事实/推断/假设】）
3) 模型结果解读（方法、驱动因素、风险、适用边界）
4) 竞品与同行对标（矩阵式描述：对象/优势/短板/建议动作）
5) 战略选项（2~4项，按“影响×可行性×成本×风险”评分）
6) 30/60/90天行动路线图（动作、负责人、资源、KPI、里程碑）
7) 数据缺口与补齐计划（优先级P0/P1/P2）

语言：中文、专业、简洁，禁止空话。`;

class AIService {
  constructor() {
    this.mcpClient = null;
  }

  readPersistedSettings() {
    try {
      if (!fs.existsSync(SETTINGS_FILE)) {
        return {};
      }

      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      logger.warn('Failed to read persisted AI settings:', err?.message || err);
    }
    return {};
  }

  getAIConfig() {
    const persisted = this.readPersistedSettings();
    const baseURL = String(process.env.AI_BASE_URL || persisted.apiEndpoint || 'https://gmn.chuangzuoli.com/v1').replace(/\/+$/, '');
    const apiKey = process.env.AI_API_KEY || persisted.apiKey || '';
    const model = process.env.AI_MODEL || persisted.model || 'gpt-5.2';
    const fallbackModel = process.env.AI_FALLBACK_MODEL || persisted.fallbackModel || model;
    const protocol = normalizeProtocol(process.env.AI_PROTOCOL || persisted.protocol || 'responses');
    const modelFallbacks = uniqueNonEmpty(
      String(process.env.AI_MODEL_FALLBACKS || persisted.modelFallbacks || '')
        .split(',')
        .map((item) => item.trim())
    );
    const httpReferer = process.env.AI_HTTP_REFERER || '';
    const title = process.env.AI_X_TITLE || '';
    const temperature = Number(process.env.AI_TEMPERATURE || persisted.temperature || 0.35);
    const maxTokens = Number(process.env.AI_MAX_TOKENS || persisted.maxTokens || 1400);
    const useMock = toBoolean(process.env.AI_USE_MOCK, toBoolean(persisted.useMock, false));
    const aiRequestTimeoutMs = parsePositiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 85000, 180000);
    const aiNarrativeTotalTimeoutMs = parsePositiveInt(process.env.AI_NARRATIVE_TOTAL_TIMEOUT_MS, 110000, 300000);
    const mcpToolTimeoutMs = parsePositiveInt(process.env.MCP_TOOL_TIMEOUT_MS, 12000, 60000);
    const aiRetryMaxAttempts = parsePositiveInt(process.env.AI_RETRY_MAX_ATTEMPTS, 2, 4);
    const aiRetryBaseDelayMs = parsePositiveInt(process.env.AI_RETRY_BASE_DELAY_MS, 1000, 10000);

    const secondaryBaseURL = String(
      process.env.AI_SECONDARY_BASE_URL || persisted.secondaryApiEndpoint || ''
    ).replace(/\/+$/, '');
    const secondaryApiKey = process.env.AI_SECONDARY_API_KEY || persisted.secondaryApiKey || '';
    const secondaryModel = process.env.AI_SECONDARY_MODEL || persisted.secondaryModel || '';
    const secondaryProtocol = normalizeProtocol(
      process.env.AI_SECONDARY_PROTOCOL || persisted.secondaryProtocol || 'chat_completions'
    );
    const tertiaryBaseURL = String(
      process.env.AI_TERTIARY_BASE_URL || persisted.tertiaryApiEndpoint || ''
    ).replace(/\/+$/, '');
    const tertiaryApiKey = process.env.AI_TERTIARY_API_KEY || persisted.tertiaryApiKey || '';
    const tertiaryModel = process.env.AI_TERTIARY_MODEL || persisted.tertiaryModel || '';
    const tertiaryProtocol = normalizeProtocol(
      process.env.AI_TERTIARY_PROTOCOL || persisted.tertiaryProtocol || 'chat_completions'
    );

    return {
      baseURL,
      apiKey,
      model,
      fallbackModel,
      protocol,
      modelFallbacks,
      httpReferer,
      title,
      useMock,
      aiRequestTimeoutMs,
      aiNarrativeTotalTimeoutMs,
      mcpToolTimeoutMs,
      aiRetryMaxAttempts,
      aiRetryBaseDelayMs,
      secondaryBaseURL,
      secondaryApiKey,
      secondaryModel,
      secondaryProtocol,
      tertiaryBaseURL,
      tertiaryApiKey,
      tertiaryModel,
      tertiaryProtocol,
      temperature: Number.isFinite(temperature) ? temperature : 0.35,
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 1400
    };
  }

  getPromptLimits() {
    return {
      topIndustries: parsePositiveInt(process.env.AI_PROMPT_TOP_INDUSTRIES_LIMIT, 8, 30),
      ranking: parsePositiveInt(process.env.AI_PROMPT_RANKING_LIMIT, 12, 50),
      peers: parsePositiveInt(process.env.AI_PROMPT_PEERS_LIMIT, 12, 50),
      peerResearch: parsePositiveInt(process.env.AI_PROMPT_PEER_RESEARCH_LIMIT, 12, 50),
      mcpSignals: parsePositiveInt(process.env.AI_PROMPT_MCP_SIGNAL_LIMIT, 20, 80),
      keyFindings: parsePositiveInt(process.env.AI_PROMPT_KEY_FINDINGS_LIMIT, 12, 80)
    };
  }

  buildMockIndustry(query) {
    return { query, results: [{ name: '示例行业', trend: '上升', data: [] }] };
  }

  buildMockCompetitor(query) {
    return { query, competitors: [{ name: '竞品A', market_share: '15%' }] };
  }

  buildMockMarketReport() {
    return { report: '市场报告示例', date: new Date().toISOString() };
  }

  buildMockFinancialData(params) {
    return { company: params.company, revenue: 1000000, profit: 50000 };
  }

  buildNarrativeFallback(input) {
    const target = input?.target || '当前对象';
    const peers = (input?.peers || [])
      .slice(0, 3)
      .map((item) => `${item.name}(分数${item.topsisScore ?? '-'})`)
      .join('、');
    const trend = input?.model?.trendLabel || 'stable';
    const trendSlope = input?.model?.trendSlope ?? 0;
    const topIndustries = (input?.uploaded?.topIndustries || [])
      .slice(0, 3)
      .map((item) => `${item.name}(${item.count})`)
      .join('、');

    const trendText = trend === 'up' ? '上升' : trend === 'down' ? '下降' : '稳定';

    return [
      `基于上传数据、MCP 检索与数学模型，对“${target}”完成综合评估。`,
      topIndustries ? `当前样本主要集中在：${topIndustries}。` : '当前样本行业标签偏少，需继续补充结构化数据。',
      `TOPSIS-TheilSen 趋势为${trendText}（斜率 ${trendSlope}）。`,
      peers ? `同行对标建议优先关注：${peers}。` : '同行样本仍不足，建议补充更完整竞品清单。',
      '建议以“市场需求、价格变化、竞品动作、渠道效率”四维建立月度跟踪看板并持续校准模型权重。'
    ].join('\n');
  }

  async callChatCompletion({
    model,
    messages,
    temperature,
    maxTokens,
    requestTimeoutMs,
    baseURL,
    apiKey,
    httpReferer,
    title
  }) {
    const config = this.getAIConfig();
    const timeoutMs = parsePositiveInt(requestTimeoutMs, config.aiRequestTimeoutMs, 180000);
    const resolvedBaseURL = String(baseURL || config.baseURL || '').replace(/\/+$/, '');
    const resolvedApiKey = apiKey || config.apiKey;
    const resolvedHttpReferer = httpReferer !== undefined ? httpReferer : config.httpReferer;
    const resolvedTitle = title !== undefined ? title : config.title;

    if (!resolvedBaseURL || !resolvedApiKey) {
      const configErr = new Error('AI provider config is incomplete');
      configErr.status = 502;
      throw configErr;
    }

    const providerHeaders = {
      Authorization: `Bearer ${resolvedApiKey}`,
      'Content-Type': 'application/json'
    };

    if (isOpenRouterBaseURL(resolvedBaseURL)) {
      if (resolvedHttpReferer) {
        providerHeaders['HTTP-Referer'] = resolvedHttpReferer;
      }
      if (resolvedTitle) {
        providerHeaders['X-Title'] = resolvedTitle;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${resolvedBaseURL}/chat/completions`, {
        method: 'POST',
        headers: providerHeaders,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens
        }),
        signal: controller.signal
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error(`AI gateway timeout after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      data = { raw: rawText };
    }

    if (!response.ok) {
      const err = new Error(`AI gateway error: HTTP ${response.status}`);
      err.status = response.status;
      err.payload = data;
      const retryAfterHeader = response.headers?.get('retry-after');
      const retryAfterFromPayload = parsePositiveInt(
        data?.error?.metadata?.retry_after || data?.retry_after,
        0,
        600
      );
      const retryAfterSec = parseRetryAfterSeconds(retryAfterHeader) || retryAfterFromPayload;
      if (retryAfterSec > 0) {
        err.retryAfterSec = retryAfterSec;
      }
      err.limitHint = data?.error?.message || data?.message || '';
      throw err;
    }

    const choice = data?.choices?.[0] || {};
    const content = extractChoiceText(choice);

    return {
      content,
      finishReason: choice?.finish_reason,
      modelUsed: model
    };
  }

  emitResponsesEvent(onEvent, eventPayload) {
    if (typeof onEvent !== 'function') return;
    try {
      onEvent(eventPayload);
    } catch (err) {
      logger.warn('Responses stream event handler failed:', err?.message || err);
    }
  }

  normalizeResponsesToolArguments(toolName, rawArguments) {
    let parsedArguments = rawArguments;
    if (typeof parsedArguments === 'string') {
      const trimmed = parsedArguments.trim();
      if (!trimmed) {
        parsedArguments = {};
      } else {
        try {
          parsedArguments = JSON.parse(trimmed);
        } catch {
          throw createInvalidToolCallError(`Tool \`${toolName}\` arguments must be valid JSON`);
        }
      }
    }

    if (!parsedArguments || typeof parsedArguments !== 'object' || Array.isArray(parsedArguments)) {
      throw createInvalidToolCallError(`Tool \`${toolName}\` arguments must be an object`);
    }

    if (toolName === 'search_industry' || toolName === 'search_competitors') {
      return {
        query: sanitizeToolString(parsedArguments.query, 'query', { required: true, maxLen: 200 })
      };
    }

    if (toolName === 'fetch_market_report') {
      const industry = sanitizeToolString(parsedArguments.industry, 'industry', { required: false, maxLen: 200 });
      const query = sanitizeToolString(parsedArguments.query, 'query', { required: false, maxLen: 200 });
      const timeframe = sanitizeToolString(parsedArguments.timeframe, 'timeframe', { required: false, maxLen: 100 });

      if (!industry && !query) {
        throw createInvalidToolCallError('Tool `fetch_market_report` requires `industry` or `query`');
      }

      return {
        ...(industry ? { industry } : {}),
        ...(query ? { query } : {}),
        ...(timeframe ? { timeframe } : {})
      };
    }

    if (toolName === 'fetch_financial_data') {
      return {
        company: sanitizeToolString(parsedArguments.company, 'company', { required: true, maxLen: 200 })
      };
    }

    throw createInvalidToolCallError(`Unsupported tool: ${toolName}`);
  }

  validateResponsesToolCall(toolCall) {
    const name = String(toolCall?.name || '').trim();
    if (!RESPONSES_MCP_TOOL_NAMES.has(name)) {
      throw createInvalidToolCallError(`Unsupported tool: ${name || 'unknown'}`);
    }

    const callId = String(toolCall?.id || toolCall?.call_id || toolCall?.callId || '').trim();
    if (!callId) {
      throw createInvalidToolCallError(`Tool \`${name}\` is missing call id`);
    }

    const toolArguments = this.normalizeResponsesToolArguments(name, toolCall.arguments);
    return {
      callId,
      name,
      arguments: toolArguments
    };
  }

  async dispatchResponsesToolCall(toolCall) {
    const validated = this.validateResponsesToolCall(toolCall);
    const client = await this.connectMCP();

    if (!client) {
      const unavailableErr = new Error('MCP server is unavailable');
      unavailableErr.status = 502;
      unavailableErr.limitHint = 'mcp_unavailable';
      throw unavailableErr;
    }

    try {
      const rawResult = await withTimeout(
        client.callTool({
          name: validated.name,
          arguments: validated.arguments
        }),
        this.getAIConfig().mcpToolTimeoutMs,
        `MCP tool ${validated.name} timeout`
      );

      const normalizedPayload = extractMcpPayload(rawResult);
      return {
        callId: validated.callId,
        name: validated.name,
        payload: normalizedPayload,
        output: typeof normalizedPayload === 'string'
          ? normalizedPayload
          : JSON.stringify(normalizedPayload ?? {})
      };
    } catch (err) {
      if (err?.status === 400 && err?.limitHint === 'invalid_tool_call') {
        throw err;
      }
      const wrapped = new Error(`MCP tool ${validated.name} failed`);
      wrapped.status = Number.parseInt(String(err?.status || ''), 10) || 502;
      wrapped.limitHint = err?.limitHint || 'mcp_tool_failed';
      wrapped.cause = err;
      throw wrapped;
    }
  }

  async parseJsonResponseBody(response) {
    const rawText = await response.text();
    try {
      return rawText ? JSON.parse(rawText) : {};
    } catch {
      return { raw: rawText };
    }
  }

  buildResponsesHttpError(response, data) {
    const err = new Error(`AI gateway error: HTTP ${response.status}`);
    err.status = response.status;
    err.payload = data;
    const retryAfterHeader = response.headers?.get('retry-after');
    const retryAfterFromPayload = parsePositiveInt(
      data?.error?.metadata?.retry_after || data?.retry_after,
      0,
      600
    );
    const retryAfterSec = parseRetryAfterSeconds(retryAfterHeader) || retryAfterFromPayload;
    if (retryAfterSec > 0) {
      err.retryAfterSec = retryAfterSec;
    }
    err.limitHint = data?.error?.code || data?.error?.message || data?.message || '';
    return err;
  }

  assertNoResponsesPayloadError(data) {
    if (data?.error && typeof data.error === 'object') {
      const providerErr = new Error(data.error.message || 'AI responses protocol error');
      const parsedStatus = Number.parseInt(String(data.error.status || ''), 10);
      providerErr.status = Number.isFinite(parsedStatus) && parsedStatus > 0 ? parsedStatus : 502;
      providerErr.limitHint = data.error.code || data.error.type || data.error.message || 'provider_error';
      throw providerErr;
    }
  }

  async callResponsesJsonTurn({
    resolvedBaseURL,
    providerHeaders,
    requestPayload,
    timeoutMs,
    model
  }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${resolvedBaseURL}/responses`, {
        method: 'POST',
        headers: providerHeaders,
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error(`AI gateway timeout after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const data = await this.parseJsonResponseBody(response);
    if (!response.ok) {
      throw this.buildResponsesHttpError(response, data);
    }
    this.assertNoResponsesPayloadError(data);

    return {
      responseId: data?.id,
      content: extractResponsesText(data),
      finishReason: normalizeResponsesFinishReason(data),
      modelUsed: data?.model || model,
      toolCalls: extractResponsesFunctionCalls(data)
    };
  }

  applyStreamToolEventState(state, eventType, payload) {
    const ensureToolCall = (callId, toolName) => {
      const normalizedId = String(callId || '').trim();
      if (!normalizedId) return null;
      const existing = state.toolCalls.get(normalizedId) || {
        id: normalizedId,
        name: String(toolName || '').trim(),
        arguments: ''
      };
      if (toolName && !existing.name) {
        existing.name = String(toolName).trim();
      }
      state.toolCalls.set(normalizedId, existing);
      return existing;
    };

    if (eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
      const item = payload?.item || payload?.output_item;
      if (item?.type === 'function_call') {
        const call = ensureToolCall(item.call_id || item.id, item.name);
        if (call && typeof item.arguments === 'string') {
          call.arguments = item.arguments;
        }
      }
      return;
    }

    if (eventType === 'response.function_call_arguments.delta') {
      const call = ensureToolCall(payload?.call_id || payload?.item_id || payload?.output_item_id, payload?.name);
      if (call && typeof payload?.delta === 'string') {
        call.arguments += payload.delta;
      }
      return;
    }

    if (eventType === 'response.function_call_arguments.done') {
      const call = ensureToolCall(payload?.call_id || payload?.item_id || payload?.output_item_id, payload?.name);
      if (call && typeof payload?.arguments === 'string') {
        call.arguments = payload.arguments;
      }
    }
  }

  async callResponsesStreamTurn({
    resolvedBaseURL,
    providerHeaders,
    requestPayload,
    timeoutMs,
    model,
    onEvent
  }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${resolvedBaseURL}/responses`, {
        method: 'POST',
        headers: providerHeaders,
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error(`AI gateway timeout after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const data = await this.parseJsonResponseBody(response);
      throw this.buildResponsesHttpError(response, data);
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
      const data = await this.parseJsonResponseBody(response);
      this.assertNoResponsesPayloadError(data);
      return {
        responseId: data?.id,
        content: extractResponsesText(data),
        finishReason: normalizeResponsesFinishReason(data),
        modelUsed: data?.model || model,
        toolCalls: extractResponsesFunctionCalls(data)
      };
    }

    const parser = createResponsesSseParser();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state = {
      responseId: '',
      modelUsed: model,
      finishReason: undefined,
      deltaText: [],
      completedPayload: null,
      completionSeen: false,
      doneSeen: false,
      toolCalls: new Map()
    };

    const handleEvent = (event) => {
      this.emitResponsesEvent(onEvent, event);

      if (event?.done) {
        state.doneSeen = true;
        return;
      }

      const payload = event?.data && typeof event.data === 'object' ? event.data : null;
      const eventType = String(payload?.type || event?.type || '').trim();
      if (!payload || !eventType) return;

      if (!state.responseId) {
        state.responseId = String(payload?.response?.id || payload?.response_id || payload?.id || '').trim();
      }

      if (payload?.response?.model && !state.modelUsed) {
        state.modelUsed = payload.response.model;
      }

      if (eventType === 'response.output_text.delta' && typeof payload.delta === 'string') {
        state.deltaText.push(payload.delta);
      }

      if (eventType === 'response.output_text.done' && typeof payload.text === 'string') {
        state.deltaText.push(payload.text);
      }

      if (eventType === 'response.failed') {
        const failure = payload?.response?.error || payload?.error || {};
        const failureErr = new Error(failure?.message || 'AI responses stream failed');
        failureErr.status = parsePositiveInt(failure?.status, 502, 599);
        failureErr.limitHint = failure?.code || failure?.type || 'provider_error';
        throw failureErr;
      }

      if (eventType === 'response.completed') {
        state.completionSeen = true;
        state.completedPayload = payload?.response && typeof payload.response === 'object'
          ? payload.response
          : payload;
        state.finishReason = normalizeResponsesFinishReason(state.completedPayload) || state.finishReason;
        state.modelUsed = state.completedPayload?.model || state.modelUsed;
        state.responseId = String(state.completedPayload?.id || state.responseId || '').trim();
      }

      this.applyStreamToolEventState(state, eventType, payload);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      const events = parser.push(chunkText);
      events.forEach(handleEvent);
    }

    const finalChunk = decoder.decode();
    const trailingEvents = [
      ...parser.push(finalChunk),
      ...parser.flush()
    ];
    trailingEvents.forEach(handleEvent);

    const completedPayload = state.completedPayload && typeof state.completedPayload === 'object'
      ? state.completedPayload
      : {};
    this.assertNoResponsesPayloadError(completedPayload);

    const completionToolCalls = extractResponsesFunctionCalls(completedPayload);
    const mergedToolCalls = new Map();
    completionToolCalls.forEach((call) => {
      mergedToolCalls.set(String(call.id || ''), call);
    });

    state.toolCalls.forEach((call) => {
      const key = String(call?.id || '').trim();
      if (!key) return;
      const existing = mergedToolCalls.get(key);
      mergedToolCalls.set(key, {
        id: key,
        name: String(call?.name || existing?.name || '').trim(),
        arguments: call?.arguments || existing?.arguments || '{}'
      });
    });

    return {
      responseId: String(completedPayload?.id || state.responseId || '').trim() || undefined,
      content: extractResponsesText(completedPayload) || state.deltaText.join('').trim(),
      finishReason: normalizeResponsesFinishReason(completedPayload)
        || state.finishReason
        || ((state.completionSeen || state.doneSeen) ? 'stop' : undefined),
      modelUsed: completedPayload?.model || state.modelUsed || model,
      toolCalls: [...mergedToolCalls.values()].filter((call) => call && call.name)
    };
  }

  async callResponsesCompletion({
    model,
    messages,
    temperature,
    maxTokens,
    requestTimeoutMs,
    baseURL,
    apiKey,
    httpReferer,
    title,
    responseFormat,
    stream,
    onEvent,
    enableMcpToolLoop
  }) {
    const config = this.getAIConfig();
    const timeoutMs = parsePositiveInt(requestTimeoutMs, config.aiRequestTimeoutMs, 180000);
    const resolvedBaseURL = String(baseURL || config.baseURL || '').replace(/\/+$/, '');
    const resolvedApiKey = apiKey || config.apiKey;
    const resolvedHttpReferer = httpReferer !== undefined ? httpReferer : config.httpReferer;
    const resolvedTitle = title !== undefined ? title : config.title;
    const useStream = toBoolean(stream, false);
    const useToolLoop = toBoolean(enableMcpToolLoop, false);
    const maxToolRounds = parsePositiveInt(process.env.AI_RESPONSES_MAX_TOOL_ROUNDS, 4, 8);

    if (!resolvedBaseURL || !resolvedApiKey) {
      const configErr = new Error('AI provider config is incomplete');
      configErr.status = 502;
      throw configErr;
    }

    const providerHeaders = {
      Authorization: `Bearer ${resolvedApiKey}`,
      'Content-Type': 'application/json'
    };

    if (isOpenRouterBaseURL(resolvedBaseURL)) {
      if (resolvedHttpReferer) {
        providerHeaders['HTTP-Referer'] = resolvedHttpReferer;
      }
      if (resolvedTitle) {
        providerHeaders['X-Title'] = resolvedTitle;
      }
    }

    const initialPayload = buildResponsesRequestPayload({
      model,
      messages,
      temperature,
      maxTokens,
      responseFormat,
      stream: useStream
    });

    const stableFormat = initialPayload?.text;

    let requestPayload = {
      ...initialPayload
    };

    if (useToolLoop) {
      requestPayload.tools = RESPONSES_MCP_TOOL_DEFINITIONS;
      requestPayload.tool_choice = 'auto';
    }

    for (let round = 0; round < maxToolRounds; round++) {
      const turnResult = useStream
        ? await this.callResponsesStreamTurn({
          resolvedBaseURL,
          providerHeaders,
          requestPayload,
          timeoutMs,
          model,
          onEvent
        })
        : await this.callResponsesJsonTurn({
          resolvedBaseURL,
          providerHeaders,
          requestPayload,
          timeoutMs,
          model
        });

      const toolCalls = useToolLoop ? (turnResult.toolCalls || []) : [];
      if (toolCalls.length === 0) {
        return {
          content: turnResult.content,
          finishReason: turnResult.finishReason,
          modelUsed: turnResult.modelUsed
        };
      }

      const previousResponseId = String(turnResult.responseId || '').trim();
      if (!previousResponseId) {
        const loopErr = new Error('Responses tool loop missing response id');
        loopErr.status = 502;
        loopErr.limitHint = 'tool_loop_missing_response_id';
        throw loopErr;
      }

      const toolOutputs = [];
      for (const toolCall of toolCalls) {
        const dispatchResult = await this.dispatchResponsesToolCall(toolCall);
        toolOutputs.push({
          type: 'function_call_output',
          call_id: dispatchResult.callId,
          output: dispatchResult.output
        });

        this.emitResponsesEvent(onEvent, {
          type: 'mcp.tool_call.executed',
          call_id: dispatchResult.callId,
          name: dispatchResult.name
        });
      }

      requestPayload = {
        model,
        previous_response_id: previousResponseId,
        input: toolOutputs,
        temperature,
        max_output_tokens: maxTokens
      };

      if (stableFormat) {
        requestPayload.text = stableFormat;
      }
      if (useStream) {
        requestPayload.stream = true;
      }
      if (useToolLoop) {
        requestPayload.tools = RESPONSES_MCP_TOOL_DEFINITIONS;
        requestPayload.tool_choice = 'auto';
      }
    }

    const exceededErr = new Error(`Responses tool loop exceeded ${maxToolRounds} rounds`);
    exceededErr.status = 502;
    exceededErr.limitHint = 'tool_loop_exceeded';
    throw exceededErr;
  }

  async callProviderCompletion({ protocol, ...request }) {
    if (protocol === 'responses') {
      return this.callResponsesCompletion(request);
    }
    return this.callChatCompletion(request);
  }

  buildNarrativeMessages(payload) {
    const limits = this.getPromptLimits();
    const context = {
      goal: payload?.goal || '围绕目标对象形成可执行增长与竞争策略',
      region: payload?.region || '未指定',
      timeRange: payload?.timeRange || '未指定',
      constraints: payload?.constraints || '预算/人力/合规约束未明确',
      successMetrics: payload?.successMetrics || []
    };

    const compactPayload = {
      target: payload?.target,
      context,
      uploaded: {
        matchedCount: payload?.uploaded?.matchedCount || 0,
        usedCount: payload?.uploaded?.usedCount || 0,
        topIndustries: (payload?.uploaded?.topIndustries || []).slice(0, limits.topIndustries)
      },
      model: {
        method: payload?.model?.method,
        trendLabel: payload?.model?.trendLabel,
        trendSlope: payload?.model?.trendSlope,
        weights: (payload?.model?.weights || []).slice(0, 6),
        ranking: (payload?.model?.ranking || []).slice(0, limits.ranking)
      },
      peers: (payload?.peers || []).slice(0, limits.peers),
      peerResearch: (payload?.peerResearch || []).slice(0, limits.peerResearch),
      mcpSignals: {
        industries: (payload?.industryNames || []).slice(0, limits.mcpSignals),
        competitors: (payload?.competitorNames || []).slice(0, limits.mcpSignals)
      },
      keyFindings: (payload?.keyFindings || []).slice(0, limits.keyFindings)
    };

    return [
      {
        role: 'system',
        content: ANALYSIS_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: `请基于以下项目数据，输出完整分析报告。

补充要求：
- 关键结论必须可追溯到输入数据字段或模型结果。
- 对“同行对标”给出至少3条可执行策略，并写明适用场景。
- 对任何不确定项明确为“假设”并说明影响范围。

输入数据(JSON)：
${JSON.stringify(compactPayload, null, 2)}`
      }
    ];
  }

  async generateAnalysisNarrative(payload) {
    const config = this.getAIConfig();
    if (config.useMock) {
      return {
        text: this.buildNarrativeFallback(payload),
        modelUsed: 'fallback-template',
        degraded: true
      };
    }

    if (!config.apiKey || !config.baseURL) {
      logger.warn('AI provider config missing, degraded to template fallback');
      return {
        text: this.buildNarrativeFallback(payload),
        modelUsed: 'fallback-template',
        providerUsed: 'fallback',
        degraded: true,
        promptVersion: ANALYSIS_PROMPT_VERSION
      };
    }

    const run = async () => {
      const messages = this.buildNarrativeMessages(payload);
      const providerQueue = [];

      const primaryModels = uniqueNonEmpty([config.model, ...(config.modelFallbacks || []), config.fallbackModel]);
      primaryModels.forEach((modelName) => {
        providerQueue.push({
          provider: 'primary',
          protocol: config.protocol,
          model: modelName,
          baseURL: config.baseURL,
          apiKey: config.apiKey,
          httpReferer: config.httpReferer,
          title: config.title
        });
      });

      if (config.secondaryBaseURL && config.secondaryApiKey && config.secondaryModel) {
        providerQueue.push({
          provider: 'secondary',
          protocol: config.secondaryProtocol,
          model: config.secondaryModel,
          baseURL: config.secondaryBaseURL,
          apiKey: config.secondaryApiKey,
          httpReferer: '',
          title: ''
        });
      }

      if (config.tertiaryBaseURL && config.tertiaryApiKey && config.tertiaryModel) {
        providerQueue.push({
          provider: 'tertiary',
          protocol: config.tertiaryProtocol,
          model: config.tertiaryModel,
          baseURL: config.tertiaryBaseURL,
          apiKey: config.tertiaryApiKey,
          httpReferer: '',
          title: ''
        });
      }

      const modelQueue = providerQueue;
      const deadline = Date.now() + config.aiNarrativeTotalTimeoutMs;
      let lastError = null;
      let hadRateLimit = false;
      let hadTimeout = false;

      for (const target of modelQueue) {
        for (let attempt = 1; attempt <= config.aiRetryMaxAttempts; attempt++) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 1000) {
            const timeoutErr = new Error(`AI narrative total timeout after ${config.aiNarrativeTotalTimeoutMs}ms`);
            timeoutErr.status = 504;
            timeoutErr.limitHint = 'provider_timeout';
            lastError = timeoutErr;
            break;
          }

          try {
            const result = await this.callProviderCompletion({
              protocol: target.protocol,
              model: target.model,
              baseURL: target.baseURL,
              apiKey: target.apiKey,
              httpReferer: target.httpReferer,
              title: target.title,
              messages,
              temperature: config.temperature,
              maxTokens: config.maxTokens,
              requestTimeoutMs: Math.min(config.aiRequestTimeoutMs, remainingMs),
              responseFormat: payload?.responseFormat,
              enableMcpToolLoop: target.protocol === 'responses'
            });

            if (result.content) {
              return {
                text: result.content,
                modelUsed: result.modelUsed,
                providerUsed: target.provider,
                degraded: false,
                promptVersion: ANALYSIS_PROMPT_VERSION
              };
            }

            const emptyErr = new Error('AI response content is empty');
            emptyErr.status = result.finishReason === 'length' ? 206 : 204;
            throw emptyErr;
          } catch (err) {
            lastError = err;
            const status = Number(err?.status || 0);
            const retryable = [408, 429, 500, 502, 503, 504].includes(status);
            if (status === 429) hadRateLimit = true;
            if (status === 504) hadTimeout = true;
            const retryAfterSec = parsePositiveInt(err?.retryAfterSec, 0, 600);
            const fallbackDelayMs = Math.min(
              config.aiRetryBaseDelayMs * Math.pow(2, attempt - 1),
              20000
            );
            const waitMs = retryAfterSec > 0
              ? Math.min(retryAfterSec * 1000, 20000)
              : fallbackDelayMs;

            logger.warn(
              `AI narrative failed provider=${target.provider} model=${target.model} attempt=${attempt} status=${status || 'unknown'}: ${err?.message || 'unknown error'}`
            );

            if (retryable && attempt < config.aiRetryMaxAttempts) {
              const remainingForWait = deadline - Date.now() - 500;
              const boundedWaitMs = Math.min(waitMs, Math.max(0, remainingForWait));
              if (boundedWaitMs > 0) {
                await sleep(boundedWaitMs);
              }
              continue;
            }

            if (!retryable) break;
          }
        }
      }

      logger.error('AI narrative failed after retries:', lastError?.message || lastError);
      const lastStatus = Number(lastError?.status || 502);
      const effectiveStatus = hadRateLimit ? 429 : (hadTimeout ? 504 : lastStatus);

      if (effectiveStatus === 429) {
        logger.warn('AI narrative rate limited, degraded to template fallback');
        return {
          text: this.buildNarrativeFallback(payload),
          modelUsed: 'fallback-template',
          providerUsed: 'fallback',
          degraded: true,
          promptVersion: ANALYSIS_PROMPT_VERSION
        };
      }

      if (effectiveStatus !== 504) {
        logger.error('AI narrative degraded to template fallback:', lastError?.message || lastError);
        return {
          text: this.buildNarrativeFallback(payload),
          modelUsed: 'fallback-template',
          providerUsed: 'fallback',
          degraded: true,
          promptVersion: ANALYSIS_PROMPT_VERSION
        };
      }

      const err = new Error(
        effectiveStatus === 429
          ? 'AI provider rate limited'
          : effectiveStatus === 504
            ? 'AI provider timeout'
            : 'AI narrative generation failed'
      );
      err.status = [429, 504].includes(effectiveStatus) ? effectiveStatus : 502;
      err.retryAfterSec = parsePositiveInt(lastError?.retryAfterSec, 0, 600) || (err.status === 429 ? 10 : 0);
      err.limitHint = lastError?.limitHint || (err.status === 429 ? 'provider_rate_limited' : (err.status === 504 ? 'provider_timeout' : 'provider_error'));
      err.cause = lastError;
      throw err;
    };

    return run();
  }

  async generateAnalysisNarrativeStream(payload, options = {}) {
    const onEvent = typeof options?.onEvent === 'function' ? options.onEvent : null;
    const emitFallback = (text, modelName = 'fallback-template') => {
      this.emitResponsesEvent(onEvent, {
        type: 'response.output_text.delta',
        delta: text
      });
      this.emitResponsesEvent(onEvent, {
        type: 'response.completed',
        response: {
          status: 'completed',
          model: modelName,
          output: [{
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text }]
          }]
        }
      });
    };

    const config = this.getAIConfig();
    if (config.useMock) {
      const text = this.buildNarrativeFallback(payload);
      emitFallback(text);
      return {
        text,
        modelUsed: 'fallback-template',
        providerUsed: 'fallback',
        degraded: true,
        finishReason: 'stop',
        promptVersion: ANALYSIS_PROMPT_VERSION
      };
    }

    if (!config.apiKey || !config.baseURL) {
      logger.warn('AI provider config missing, degraded to template fallback');
      const text = this.buildNarrativeFallback(payload);
      emitFallback(text);
      return {
        text,
        modelUsed: 'fallback-template',
        providerUsed: 'fallback',
        degraded: true,
        finishReason: 'stop',
        promptVersion: ANALYSIS_PROMPT_VERSION
      };
    }

    const messages = this.buildNarrativeMessages(payload);
    const providerQueue = [];
    const primaryModels = uniqueNonEmpty([config.model, ...(config.modelFallbacks || []), config.fallbackModel]);
    primaryModels.forEach((modelName) => {
      providerQueue.push({
        provider: 'primary',
        protocol: config.protocol,
        model: modelName,
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        httpReferer: config.httpReferer,
        title: config.title
      });
    });

    if (config.secondaryBaseURL && config.secondaryApiKey && config.secondaryModel) {
      providerQueue.push({
        provider: 'secondary',
        protocol: config.secondaryProtocol,
        model: config.secondaryModel,
        baseURL: config.secondaryBaseURL,
        apiKey: config.secondaryApiKey,
        httpReferer: '',
        title: ''
      });
    }

    if (config.tertiaryBaseURL && config.tertiaryApiKey && config.tertiaryModel) {
      providerQueue.push({
        provider: 'tertiary',
        protocol: config.tertiaryProtocol,
        model: config.tertiaryModel,
        baseURL: config.tertiaryBaseURL,
        apiKey: config.tertiaryApiKey,
        httpReferer: '',
        title: ''
      });
    }

    const deadline = Date.now() + config.aiNarrativeTotalTimeoutMs;
    let lastError = null;
    let hadRateLimit = false;
    let hadTimeout = false;

    for (const target of providerQueue) {
      for (let attempt = 1; attempt <= config.aiRetryMaxAttempts; attempt++) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 1000) {
          const timeoutErr = new Error(`AI narrative total timeout after ${config.aiNarrativeTotalTimeoutMs}ms`);
          timeoutErr.status = 504;
          timeoutErr.limitHint = 'provider_timeout';
          lastError = timeoutErr;
          break;
        }

        try {
          const result = await this.callProviderCompletion({
            protocol: target.protocol,
            model: target.model,
            baseURL: target.baseURL,
            apiKey: target.apiKey,
            httpReferer: target.httpReferer,
            title: target.title,
            messages,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            requestTimeoutMs: Math.min(config.aiRequestTimeoutMs, remainingMs),
            responseFormat: payload?.responseFormat,
            stream: true,
            onEvent,
            enableMcpToolLoop: target.protocol === 'responses'
          });

          if (result.content) {
            return {
              text: result.content,
              modelUsed: result.modelUsed,
              providerUsed: target.provider,
              degraded: false,
              finishReason: result.finishReason || 'stop',
              promptVersion: ANALYSIS_PROMPT_VERSION
            };
          }

          const emptyErr = new Error('AI response content is empty');
          emptyErr.status = result.finishReason === 'length' ? 206 : 204;
          throw emptyErr;
        } catch (err) {
          lastError = err;
          const status = Number(err?.status || 0);
          const retryable = [408, 429, 500, 502, 503, 504].includes(status);
          if (status === 429) hadRateLimit = true;
          if (status === 504) hadTimeout = true;

          const retryAfterSec = parsePositiveInt(err?.retryAfterSec, 0, 600);
          const fallbackDelayMs = Math.min(
            config.aiRetryBaseDelayMs * Math.pow(2, attempt - 1),
            20000
          );
          const waitMs = retryAfterSec > 0
            ? Math.min(retryAfterSec * 1000, 20000)
            : fallbackDelayMs;

          logger.warn(
            `AI streaming narrative failed provider=${target.provider} model=${target.model} attempt=${attempt} status=${status || 'unknown'}: ${err?.message || 'unknown error'}`
          );

          if (retryable && attempt < config.aiRetryMaxAttempts) {
            const remainingForWait = deadline - Date.now() - 500;
            const boundedWaitMs = Math.min(waitMs, Math.max(0, remainingForWait));
            if (boundedWaitMs > 0) {
              await sleep(boundedWaitMs);
            }
            continue;
          }

          if (!retryable) break;
        }
      }
    }

    logger.error('AI streaming narrative failed after retries:', lastError?.message || lastError);
    const lastStatus = Number(lastError?.status || 502);
    const effectiveStatus = hadRateLimit ? 429 : (hadTimeout ? 504 : lastStatus);

    if (effectiveStatus === 429 || effectiveStatus !== 504) {
      const text = this.buildNarrativeFallback(payload);
      emitFallback(text);
      return {
        text,
        modelUsed: 'fallback-template',
        providerUsed: 'fallback',
        degraded: true,
        finishReason: 'stop',
        promptVersion: ANALYSIS_PROMPT_VERSION
      };
    }

    const err = new Error(
      effectiveStatus === 429
        ? 'AI provider rate limited'
        : effectiveStatus === 504
          ? 'AI provider timeout'
          : 'AI narrative generation failed'
    );
    err.status = [429, 504].includes(effectiveStatus) ? effectiveStatus : 502;
    err.retryAfterSec = parsePositiveInt(lastError?.retryAfterSec, 0, 600) || (err.status === 429 ? 10 : 0);
    err.limitHint = lastError?.limitHint || (err.status === 429 ? 'provider_rate_limited' : (err.status === 504 ? 'provider_timeout' : 'provider_error'));
    err.cause = lastError;
    throw err;
  }

  async connectMCP() {
    if (this.mcpClient) return this.mcpClient;

    try {
      const transport = new StdioClientTransport({
        command: process.env.MCP_SERVER_COMMAND || 'node',
        args: [process.env.MCP_SERVER_PATH || './mcp-server.js']
      });

      this.mcpClient = new Client({ name: 'chayan-backend', version: '1.0.0' }, { capabilities: {} });
      await this.mcpClient.connect(transport);
      logger.info('MCP client connected');
      return this.mcpClient;
    } catch (err) {
      logger.warn('MCP connection failed:', err.message);
      return null;
    }
  }

  async _callMcpWithCache(toolName, args, cachePrefix, mockFn) {
    const cacheKey = `${cachePrefix}:${typeof args === 'string' ? args : JSON.stringify(args)}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return extractMcpPayload(JSON.parse(cached));
      } catch {
        await redis.del(cacheKey).catch(() => {});
      }
    }

    const client = await this.connectMCP();
    if (!client) {
      const mock = mockFn(args);
      await redis.setex(cacheKey, 3600, JSON.stringify(mock)).catch(() => {});
      return mock;
    }

    try {
      const toolArgs = typeof args === 'string' ? { query: args } : args;
      const result = await withTimeout(
        client.callTool({ name: toolName, arguments: toolArgs }),
        this.getAIConfig().mcpToolTimeoutMs,
        `MCP tool ${toolName} timeout`
      );
      const payload = extractMcpPayload(result);
      await redis.setex(cacheKey, 3600, JSON.stringify(payload)).catch(() => {});
      return payload;
    } catch (err) {
      logger.error(`MCP ${toolName} failed:`, err);
      this.mcpClient = null;
      const mock = mockFn(args);
      await redis.setex(cacheKey, 60, JSON.stringify(mock)).catch(() => {});
      return mock;
    }
  }


  async searchIndustryData(query) {
    return this._callMcpWithCache('search_industry', query, 'industry', (q) => this.buildMockIndustry(q));
  }

  async searchCompetitors(query) {
    return this._callMcpWithCache('search_competitors', query, 'competitor', (q) => this.buildMockCompetitor(q));
  }

  async fetchMarketReport(params) {
    return this._callMcpWithCache('fetch_market_report', params, 'market', () => this.buildMockMarketReport());
  }

  async fetchFinancialData(params) {
    return this._callMcpWithCache('fetch_financial_data', params, 'financial', (p) => this.buildMockFinancialData(p));
  }

  async analyzeData() {
    return { result: 'pending' };
  }
}

module.exports = new AIService();
