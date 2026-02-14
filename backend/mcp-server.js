#!/usr/bin/env node

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod/v4');

const parsePositiveInt = (value, fallback, max = 100) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const MCP_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.MCP_FETCH_TIMEOUT_MS, 8000, 30000);
const MCP_COMPETITOR_FANOUT = parsePositiveInt(process.env.AI_MCP_COMPETITOR_VARIANTS, 3, 6);
const MCP_INDUSTRY_FANOUT = parsePositiveInt(process.env.AI_MCP_INDUSTRY_VARIANTS, 2, 6);
const MCP_RESULT_LIMIT = parsePositiveInt(process.env.AI_MCP_RESULT_LIMIT, 12, 50);
const MCP_WEB_RESULT_LIMIT = parsePositiveInt(process.env.MCP_WEB_RESULT_LIMIT, 10, 30);

const toToolResult = (structuredContent) => ({
  content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  structuredContent
});

const decodeHtml = (value) => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const dedupeByName = (list = []) => {
  const seen = new Map();
  for (const item of list) {
    const key = normalizeText(item?.url || item?.name);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, item);
      continue;
    }
    seen.set(key, {
      ...prev,
      name: prev.name || item.name,
      url: prev.url || item.url,
      description: prev.description || item.description,
      source: prev.source || item.source
    });
  }
  return [...seen.values()];
};

const fetchWithTimeout = async (url, headers = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const err = new Error(`Web search HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
};

const searchBingRss = async (query) => {
  const params = new URLSearchParams({ q: query, format: 'rss' });
  const response = await fetchWithTimeout(`https://www.bing.com/search?${params.toString()}`, {
    Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
    'User-Agent': 'chayan-mcp-server/1.0'
  });

  const xml = await response.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || '';
    const title = decodeHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = decodeHtml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const description = decodeHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '');
    if (!title || !link) continue;
    items.push({
      name: title,
      description,
      url: link,
      source: 'web'
    });
    if (items.length >= MCP_WEB_RESULT_LIMIT) break;
  }
  return items;
};

const runSearchFanout = async (queries = [], fanout = 1) => {
  const selected = [...new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))].slice(0, fanout);
  const settled = await Promise.allSettled(
    selected.map(async (q) => {
      const items = await searchBingRss(q);
      return {
        query: q,
        totalCount: items.length,
        incompleteResults: false,
        items
      };
    })
  );

  const attempts = [];
  const records = [];
  let totalCount = 0;
  let incompleteResults = false;

  settled.forEach((entry, idx) => {
    const q = selected[idx];
    if (entry.status === 'fulfilled') {
      const val = entry.value;
      records.push(...val.items);
      totalCount += Number(val.totalCount || 0);
      incompleteResults = incompleteResults || Boolean(val.incompleteResults);
      attempts.push({
        query: q,
        success: true,
        resultCount: val.items.length,
        totalCount: val.totalCount,
        incompleteResults: val.incompleteResults
      });
    } else {
      attempts.push({
        query: q,
        success: false,
        resultCount: 0,
        error: entry.reason?.message || String(entry.reason || 'unknown_error')
      });
    }
  });

  return {
    attempts,
    repos: records,
    totalCount,
    incompleteResults,
    partialFailure: attempts.some((item) => !item.success)
  };
};

const buildIndustryFallback = (query, message) => ({
  query,
  results: [{ name: '示例行业', trend: 'stable', source: 'mcp_fallback' }],
  meta: {
    source: 'mcp-web-aggregate',
    partialFailure: true,
    warning: message || 'fallback'
  }
});

const buildCompetitorFallback = (query, message) => ({
  query,
  competitors: [{ name: '竞品A', source: 'mcp_fallback' }],
  meta: {
    sourceCounts: { web: 1 },
    sourcesUsed: ['web'],
    partialFailure: true,
    warning: message || 'fallback'
  }
});

const server = new McpServer({
  name: 'chayan-search-mcp',
  version: '1.0.0'
});

server.registerTool(
  'search_industry',
  {
    description: 'Search industry intelligence candidates for a query',
    inputSchema: {
      query: z.string().min(1)
    }
  },
  async ({ query }) => {
    try {
      const q = String(query || '').trim();
      const candidates = [
        `${q} in:name,description`,
        `${q} industry in:name,description`,
        `${q} market in:name,description`,
        `${q} trend in:name,description`
      ];

      const fanout = await runSearchFanout(candidates, MCP_INDUSTRY_FANOUT);
      const refs = dedupeByName(fanout.repos)
        .slice(0, MCP_RESULT_LIMIT);

      if (refs.length === 0) {
        return toToolResult(buildIndustryFallback(q, 'no_repo_results'));
      }

      const results = refs.map((item) => ({
        name: item.name,
        trend: 'stable',
        source: 'web',
        url: item.url,
        summary: item.description
      }));

      return toToolResult({
        query: q,
        results,
        meta: {
          source: 'mcp-web-aggregate',
          totalCount: fanout.totalCount,
          incompleteResults: fanout.incompleteResults,
          partialFailure: fanout.partialFailure,
          attempts: fanout.attempts
        }
      });
    } catch (err) {
      return toToolResult(buildIndustryFallback(query, err?.message || 'industry_search_failed'));
    }
  }
);

server.registerTool(
  'search_competitors',
  {
    description: 'Search competitor candidates for a target',
    inputSchema: {
      query: z.string().min(1)
    }
  },
  async ({ query }) => {
    try {
      const q = String(query || '').trim();
      const candidates = [
        `${q} in:name,description`,
        `${q} competitor in:name,description`,
        `${q} alternative in:name,description`,
        `${q} sdk in:name,description`,
        `${q} agent in:name,description`
      ];

      const fanout = await runSearchFanout(candidates, MCP_COMPETITOR_FANOUT);
      const competitors = dedupeByName(fanout.repos)
        .slice(0, MCP_RESULT_LIMIT)
        .map((item) => ({
          name: item.name,
          description: item.description,
          url: item.url,
          source: 'web'
        }));

      if (competitors.length === 0) {
        return toToolResult(buildCompetitorFallback(q, 'no_repo_results'));
      }

      return toToolResult({
        query: q,
        competitors,
        meta: {
          sourceCounts: {
            web: competitors.length
          },
          sourcesUsed: ['web'],
          partialFailure: fanout.partialFailure,
          totalCount: fanout.totalCount,
          incompleteResults: fanout.incompleteResults,
          attempts: fanout.attempts
        }
      });
    } catch (err) {
      return toToolResult(buildCompetitorFallback(query, err?.message || 'competitor_search_failed'));
    }
  }
);

server.registerTool(
  'fetch_market_report',
  {
    description: 'Fetch compact market report references for a query',
    inputSchema: {
      industry: z.string().optional(),
      query: z.string().optional(),
      timeframe: z.string().optional()
    }
  },
  async ({ industry, query, timeframe }) => {
    try {
      const term = String(industry || query || '').trim() || 'market';
      const fanout = await runSearchFanout([
        `${term} market report analysis in:name,description`,
        `${term} trend research in:name,description`
      ], 2);

      const refs = dedupeByName(fanout.repos)
        .slice(0, 8)
        .map((item) => ({
          name: item.name,
          url: item.url,
          summary: item.description
        }));

      return toToolResult({
        industry: term,
        timeframe: timeframe || 'latest',
        report: refs.length > 0
          ? `Collected ${refs.length} market intelligence references for ${term}`
          : `No strong market references found for ${term}`,
        references: refs,
        meta: {
          source: 'mcp-web-aggregate',
          partialFailure: fanout.partialFailure,
          totalCount: fanout.totalCount,
          incompleteResults: fanout.incompleteResults,
          attempts: fanout.attempts
        }
      });
    } catch (err) {
      return toToolResult({
        industry: String(industry || query || 'market'),
        timeframe: timeframe || 'latest',
        report: 'Market report fallback response',
        references: [],
        meta: {
          source: 'mcp-web-aggregate',
          partialFailure: true,
          warning: err?.message || 'market_report_failed'
        }
      });
    }
  }
);

server.registerTool(
  'fetch_financial_data',
  {
    description: 'Fetch lightweight financial proxy signals from public web references',
    inputSchema: {
      company: z.string().min(1)
    }
  },
  async ({ company }) => {
    try {
      const term = String(company || '').trim();
      const fanout = await runSearchFanout([
        `${term} investor relations in:name,description`,
        `${term} financial report in:name,description`
      ], 2);

      const refs = dedupeByName(fanout.repos)
        .slice(0, 10);

      const totalSignals = refs.length;
      const response = {
        company: term,
        repoCount: refs.length,
        indicators: {
          totalSignals,
          developerAttentionScore: Math.min(100, totalSignals * 10)
        },
        references: refs.map((item) => ({
          name: item.name,
          url: item.url
        })),
        meta: {
          source: 'mcp-web-aggregate',
          partialFailure: fanout.partialFailure,
          totalCount: fanout.totalCount,
          incompleteResults: fanout.incompleteResults,
          attempts: fanout.attempts
        }
      };

      return toToolResult(response);
    } catch (err) {
      return toToolResult({
        company: String(company || ''),
        repoCount: 0,
        indicators: {
          totalSignals: 0,
          developerAttentionScore: 0
        },
        references: [],
        meta: {
          source: 'mcp-web-aggregate',
          partialFailure: true,
          warning: err?.message || 'financial_data_failed'
        }
      });
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('chayan-search-mcp running on stdio');
}

main().catch((error) => {
  console.error('mcp-server startup error:', error);
  process.exit(1);
});
