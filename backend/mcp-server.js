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

const GITHUB_API_BASE = String(process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_SEARCH_PER_PAGE = parsePositiveInt(process.env.GITHUB_SEARCH_PER_PAGE, 10, 30);
const MCP_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.MCP_FETCH_TIMEOUT_MS, 8000, 30000);
const MCP_COMPETITOR_FANOUT = parsePositiveInt(process.env.AI_MCP_COMPETITOR_VARIANTS, 3, 6);
const MCP_INDUSTRY_FANOUT = parsePositiveInt(process.env.AI_MCP_INDUSTRY_VARIANTS, 2, 6);
const MCP_RESULT_LIMIT = parsePositiveInt(process.env.AI_MCP_RESULT_LIMIT, 12, 50);

const toToolResult = (structuredContent) => ({
  content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  structuredContent
});

const dedupeByName = (list = []) => {
  const seen = new Map();
  for (const item of list) {
    const key = normalizeText(item?.name);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, item);
      continue;
    }
    const prevStars = Number(prev.stars || 0);
    const nextStars = Number(item.stars || 0);
    if (nextStars > prevStars) {
      seen.set(key, { ...item, url: item.url || prev.url, description: item.description || prev.description });
    } else {
      seen.set(key, { ...prev, url: prev.url || item.url, description: prev.description || item.description });
    }
  }
  return [...seen.values()];
};

const getHeaders = () => {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'chayan-mcp-server/1.0'
  };
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
};

const githubGet = async (pathAndQuery) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${GITHUB_API_BASE}${pathAndQuery}`, {
      method: 'GET',
      headers: getHeaders(),
      signal: controller.signal
    });

    const rawText = await response.text();
    let payload = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = { raw: rawText };
    }

    if (!response.ok) {
      const err = new Error(`GitHub API HTTP ${response.status}`);
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return {
      payload,
      rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
      rateLimitReset: response.headers.get('x-ratelimit-reset')
    };
  } finally {
    clearTimeout(timer);
  }
};

const normalizeRepo = (repo, source = 'mcp') => ({
  name: repo?.full_name || repo?.name || '',
  description: repo?.description || '',
  url: repo?.html_url || '',
  stars: Number(repo?.stargazers_count || 0),
  updated_at: repo?.updated_at || '',
  source
});

const runSearchFanout = async (queries = [], fanout = 1) => {
  const selected = [...new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))].slice(0, fanout);
  const settled = await Promise.allSettled(
    selected.map(async (q) => {
      const params = new URLSearchParams({
        q,
        sort: 'updated',
        order: 'desc',
        per_page: String(GITHUB_SEARCH_PER_PAGE)
      });
      const { payload, rateLimitRemaining, rateLimitReset } = await githubGet(`/search/repositories?${params.toString()}`);
      return {
        query: q,
        totalCount: Number(payload?.total_count || 0),
        incompleteResults: Boolean(payload?.incomplete_results),
        items: Array.isArray(payload?.items) ? payload.items : [],
        rateLimitRemaining,
        rateLimitReset
      };
    })
  );

  const attempts = [];
  const repos = [];
  let totalCount = 0;
  let incompleteResults = false;

  settled.forEach((entry, idx) => {
    const q = selected[idx];
    if (entry.status === 'fulfilled') {
      const val = entry.value;
      repos.push(...val.items);
      totalCount += Number(val.totalCount || 0);
      incompleteResults = incompleteResults || Boolean(val.incompleteResults);
      attempts.push({
        query: q,
        success: true,
        resultCount: val.items.length,
        totalCount: val.totalCount,
        incompleteResults: val.incompleteResults,
        rateLimitRemaining: val.rateLimitRemaining || undefined,
        rateLimitReset: val.rateLimitReset || undefined
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
    repos,
    totalCount,
    incompleteResults,
    partialFailure: attempts.some((item) => !item.success)
  };
};

const buildIndustryFallback = (query, message) => ({
  query,
  results: [{ name: '示例行业', trend: 'stable', source: 'mcp_fallback' }],
  meta: {
    source: 'mcp-local-github',
    partialFailure: true,
    warning: message || 'fallback'
  }
});

const buildCompetitorFallback = (query, message) => ({
  query,
  competitors: [{ name: '竞品A', source: 'mcp_fallback' }],
  meta: {
    sourceCounts: { mcp: 1, github: 0 },
    sourcesUsed: ['mcp'],
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
      const repos = dedupeByName(fanout.repos.map((repo) => normalizeRepo(repo, 'mcp')))
        .sort((a, b) => Number(b.stars || 0) - Number(a.stars || 0))
        .slice(0, MCP_RESULT_LIMIT);

      if (repos.length === 0) {
        return toToolResult(buildIndustryFallback(q, 'no_repo_results'));
      }

      const results = repos.map((repo) => ({
        name: repo.name,
        trend: Number(repo.stars || 0) > 50 ? 'up' : 'stable',
        source: 'mcp',
        stars: repo.stars,
        url: repo.url,
        updated_at: repo.updated_at,
        summary: repo.description
      }));

      return toToolResult({
        query: q,
        results,
        meta: {
          source: 'mcp-local-github',
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
      const competitors = dedupeByName(fanout.repos.map((repo) => normalizeRepo(repo, 'mcp')))
        .sort((a, b) => Number(b.stars || 0) - Number(a.stars || 0))
        .slice(0, MCP_RESULT_LIMIT)
        .map((repo) => ({
          name: repo.name,
          description: repo.description,
          url: repo.url,
          stars: repo.stars,
          source: 'mcp'
        }));

      if (competitors.length === 0) {
        return toToolResult(buildCompetitorFallback(q, 'no_repo_results'));
      }

      return toToolResult({
        query: q,
        competitors,
        meta: {
          sourceCounts: {
            mcp: competitors.length,
            github: 0
          },
          sourcesUsed: ['mcp'],
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

      const refs = dedupeByName(fanout.repos.map((repo) => normalizeRepo(repo, 'mcp')))
        .sort((a, b) => Number(b.stars || 0) - Number(a.stars || 0))
        .slice(0, 8)
        .map((repo) => ({
          name: repo.name,
          url: repo.url,
          stars: repo.stars,
          updated_at: repo.updated_at,
          summary: repo.description
        }));

      return toToolResult({
        industry: term,
        timeframe: timeframe || 'latest',
        report: refs.length > 0
          ? `Collected ${refs.length} market intelligence references for ${term}`
          : `No strong market references found for ${term}`,
        references: refs,
        meta: {
          source: 'mcp-local-github',
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
          source: 'mcp-local-github',
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
    description: 'Fetch lightweight financial proxy signals from open repository activity',
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

      const refs = dedupeByName(fanout.repos.map((repo) => normalizeRepo(repo, 'mcp')))
        .slice(0, 10);

      const totalStars = refs.reduce((sum, item) => sum + Number(item.stars || 0), 0);
      const response = {
        company: term,
        repoCount: refs.length,
        indicators: {
          totalStars,
          developerAttentionScore: Math.min(100, Math.round(Math.log10(totalStars + 1) * 20))
        },
        references: refs.map((item) => ({
          name: item.name,
          url: item.url,
          stars: item.stars,
          updated_at: item.updated_at
        })),
        meta: {
          source: 'mcp-local-github',
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
          totalStars: 0,
          developerAttentionScore: 0
        },
        references: [],
        meta: {
          source: 'mcp-local-github',
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
