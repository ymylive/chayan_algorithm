const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const logger = require('../config/logger');
const redis = require('../config/redis');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ANALYSIS_PROMPT_VERSION = 'market-intel-v2.1';

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

  getAIConfig() {
    const baseURL = String(process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const apiKey = process.env.AI_API_KEY || '';
    const model = process.env.AI_MODEL || 'tngtech/deepseek-r1t2-chimera:free';
    const fallbackModel = process.env.AI_FALLBACK_MODEL || model;
    const httpReferer = process.env.AI_HTTP_REFERER || '';
    const title = process.env.AI_X_TITLE || '';
    const temperature = Number(process.env.AI_TEMPERATURE || 0.35);
    const maxTokens = Number(process.env.AI_MAX_TOKENS || 1400);

    return {
      baseURL,
      apiKey,
      model,
      fallbackModel,
      httpReferer,
      title,
      temperature: Number.isFinite(temperature) ? temperature : 0.35,
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 1400
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

  async callChatCompletion({ model, messages, temperature, maxTokens }) {
    const config = this.getAIConfig();
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.httpReferer ? { 'HTTP-Referer': config.httpReferer } : {}),
        ...(config.title ? { 'X-Title': config.title } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      })
    });

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
      throw err;
    }

    const choice = data?.choices?.[0] || {};
    const content = String(choice?.message?.content || '').trim();

    return {
      content,
      finishReason: choice?.finish_reason,
      modelUsed: model
    };
  }

  buildNarrativeMessages(payload) {
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
        topIndustries: (payload?.uploaded?.topIndustries || []).slice(0, 5)
      },
      model: {
        method: payload?.model?.method,
        trendLabel: payload?.model?.trendLabel,
        trendSlope: payload?.model?.trendSlope,
        weights: (payload?.model?.weights || []).slice(0, 6),
        ranking: (payload?.model?.ranking || []).slice(0, 6)
      },
      peers: (payload?.peers || []).slice(0, 6),
      peerResearch: (payload?.peerResearch || []).slice(0, 6),
      mcpSignals: {
        industries: (payload?.industryNames || []).slice(0, 8),
        competitors: (payload?.competitorNames || []).slice(0, 8)
      },
      keyFindings: (payload?.keyFindings || []).slice(0, 8)
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
    if (!config.apiKey || !config.baseURL) {
      return {
        text: this.buildNarrativeFallback(payload),
        modelUsed: 'fallback-template',
        degraded: true
      };
    }

    const run = async () => {
      const messages = this.buildNarrativeMessages(payload);
      const modelQueue = [config.model, config.fallbackModel].filter(Boolean);
      let lastError = null;

      for (const model of modelQueue) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const result = await this.callChatCompletion({
              model,
              messages,
              temperature: config.temperature,
              maxTokens: config.maxTokens
            });

            if (result.content) {
              return {
                text: result.content,
                modelUsed: result.modelUsed,
                degraded: false,
                promptVersion: ANALYSIS_PROMPT_VERSION
              };
            }

            const emptyErr = new Error('AI response content is empty');
            emptyErr.status = result.finishReason === 'length' ? 206 : 204;
            throw emptyErr;
          } catch (err) {
            lastError = err;
            logger.warn(
              `AI narrative failed model=${model} attempt=${attempt}: ${err?.message || 'unknown error'}`
            );
            if (Number(err?.status) === 429) {
              await sleep(700 * attempt);
              continue;
            }
            if (attempt < 2) {
              await sleep(300 * attempt);
            }
          }
        }
      }

      logger.error('AI narrative degraded to template fallback:', lastError?.message || lastError);
      return {
        text: this.buildNarrativeFallback(payload),
        modelUsed: 'fallback-template',
        degraded: true,
        promptVersion: ANALYSIS_PROMPT_VERSION
      };
    };

    return run();
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
    if (cached) return JSON.parse(cached);

    const client = await this.connectMCP();
    if (!client) {
      const mock = mockFn(args);
      await redis.setex(cacheKey, 3600, JSON.stringify(mock)).catch(() => {});
      return mock;
    }

    try {
      const toolArgs = typeof args === 'string' ? { query: args } : args;
      const result = await client.callTool({ name: toolName, arguments: toolArgs });
      await redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
      return result;
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
