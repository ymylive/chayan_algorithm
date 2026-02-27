#!/usr/bin/env node

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const z = require('zod/v4');

const parsePositiveInt = (value, fallback, max = 100) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const parseNonNegativeFloat = (value, fallback, max = 10) => {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseCsvList = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
};

const parseJsonObject = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

const normalizeText = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const normalizeDisplayText = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const hasCjkCharacters = (value) => /[\u3400-\u9FFF]/u.test(String(value || ''));

const MCP_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.MCP_FETCH_TIMEOUT_MS, 8000, 30000);
const MCP_COMPETITOR_FANOUT = parsePositiveInt(process.env.AI_MCP_COMPETITOR_VARIANTS, 3, 6);
const MCP_INDUSTRY_FANOUT = parsePositiveInt(process.env.AI_MCP_INDUSTRY_VARIANTS, 2, 6);
const MCP_RESULT_LIMIT = parsePositiveInt(process.env.AI_MCP_RESULT_LIMIT, 12, 50);
const MCP_WEB_RESULT_LIMIT = parsePositiveInt(process.env.MCP_WEB_RESULT_LIMIT, 10, 30);
const MCP_WEB_MIN_RESULTS = parsePositiveInt(process.env.MCP_WEB_MIN_RESULTS, 18, 120);
const MCP_WEB_MAX_WAVES = parsePositiveInt(process.env.MCP_WEB_MAX_WAVES, 3, 8);
const MCP_WEB_MIN_SOURCES = parsePositiveInt(process.env.MCP_WEB_MIN_SOURCES, 3, 10);
const MCP_REMOTE_MCP_TIMEOUT_MS = parsePositiveInt(process.env.MCP_REMOTE_MCP_TIMEOUT_MS, 30000, 120000);
const MCP_RELEVANCE_MIN_SCORE = Number.parseFloat(process.env.MCP_RELEVANCE_MIN_SCORE || '1.6');
const MCP_HOST_DIVERSITY_PENALTY = parseNonNegativeFloat(process.env.MCP_HOST_DIVERSITY_PENALTY, 0.12, 2);
const MCP_HOST_DIVERSITY_WINDOW = parsePositiveInt(process.env.MCP_HOST_DIVERSITY_WINDOW, 12, 100);
const MCP_ENABLE_WIKIPEDIA_SOURCE = parseBoolean(process.env.MCP_ENABLE_WIKIPEDIA_SOURCE, true);
const MCP_ENABLE_GOOGLE_NEWS_SOURCE = parseBoolean(process.env.MCP_ENABLE_GOOGLE_NEWS_SOURCE, true);
const MCP_DISABLE_LEGACY_SOURCES = parseBoolean(process.env.MCP_DISABLE_LEGACY_SOURCES, true);
const MCP_SEARXNG_BASE_URL = String(process.env.MCP_SEARXNG_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const MCP_OPEN_WEBSEARCH_MCP_URL = String(process.env.MCP_OPEN_WEBSEARCH_MCP_URL || '')
  .trim()
  .replace(/\/+$/, '');
const MCP_OPEN_WEBSEARCH_ENGINES = String(
  process.env.MCP_OPEN_WEBSEARCH_ENGINES || 'duckduckgo,bing,baidu,csdn,juejin'
)
  .trim();
const MCP_TAVILY_API_KEY = String(process.env.TAVILY_API_KEY || process.env.MCP_TAVILY_API_KEY || '').trim();
const MCP_TAVILY_SEARCH_DEPTH = String(process.env.MCP_TAVILY_SEARCH_DEPTH || 'basic').trim() || 'basic';
const MCP_CRAWL4AI_MCP_URL = String(process.env.MCP_CRAWL4AI_MCP_URL || '')
  .trim()
  .replace(/\/+$/, '');
const MCP_CRAWL4AI_SERVER_COMMAND = String(process.env.MCP_CRAWL4AI_SERVER_COMMAND || '').trim();
const MCP_CRAWL4AI_SERVER_ARGS_JSON = String(process.env.MCP_CRAWL4AI_SERVER_ARGS_JSON || '').trim();
const MCP_CRAWL4AI_ENGINE = String(process.env.MCP_CRAWL4AI_ENGINE || 'duckduckgo').trim() || 'duckduckgo';
const MCP_ENTITY_ALIAS_MAP = parseJsonObject(String(process.env.MCP_ENTITY_ALIAS_MAP_JSON || '').trim());
const MCP_EDGAR_MCP_URL = String(process.env.MCP_EDGAR_MCP_URL || '')
  .trim()
  .replace(/\/+$/, '');
const MCP_EDGAR_RECENT_FILINGS_LIMIT = parsePositiveInt(process.env.MCP_EDGAR_RECENT_FILINGS_LIMIT, 12, 40);

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

const truncateText = (value, maxLen = 220) => {
  const text = normalizeDisplayText(value);
  if (!text) return '';
  if (!Number.isFinite(maxLen) || maxLen <= 1) return text.slice(0, 1);
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - 3)}...`;
};

const sanitizeResultTitle = (value) => normalizeDisplayText(value)
  .replace(/^\d+\s*[\|\-]\s*/i, '')
  .replace(/\s+read more\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const sanitizeResultSnippet = (value) => normalizeDisplayText(value)
  .replace(/\s+read more\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const cleanSearchRecord = (item, fallbackSource = 'web') => {
  if (!item || typeof item !== 'object') return null;

  const name = truncateText(sanitizeResultTitle(item?.name || item?.title || ''), 140);
  const description = truncateText(sanitizeResultSnippet(item?.description || item?.summary || ''), 220);
  const source = normalizeText(item?.source || fallbackSource || 'web') || 'web';
  const rawUrl = normalizeDisplayText(item?.url || item?.link || '');

  if (!name || !rawUrl) return null;

  let url = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    parsed.hash = '';
    url = parsed.toString();
  } catch {
    return null;
  }

  return {
    ...item,
    name,
    description,
    url,
    source
  };
};

const sanitizeQueryText = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/in:name,description/gi, ' ')
  .replace(/[\u200B-\u200D\uFEFF]+/g, ' ')
  .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const queryStopTerms = new Set([
  '\u54c1\u724c',
  '\u516c\u53f8',
  '\u4f01\u4e1a',
  '\u96c6\u56e2',
  '\u884c\u4e1a',
  '\u8d5b\u9053',
  '\u5e02\u573a',
  '\u8d8b\u52bf',
  '\u5b98\u7f51',
  '\u5b98\u65b9',
  'market',
  'industry',
  'trend',
  'analysis',
  'report',
  'official',
  'site',
  'homepage',
  'competitor',
  'alternative',
  'rival',
  'research',
  'intelligence'
]);

const defaultEntityAliasMap = {
  '茶颜悦色': ['cha yan yue se', 'chayan yuese', 'chayan']
};

const normalizeAliasList = (rawAliases = []) => {
  return [...new Set(
    (Array.isArray(rawAliases) ? rawAliases : [rawAliases])
      .map((item) => normalizeDisplayText(item))
      .filter((item) => item && item.length >= 2)
  )];
};

const collectEntityAliases = (aliasMap, normalizedQueryKey) => {
  if (!aliasMap || typeof aliasMap !== 'object') return [];
  const aliases = [];
  Object.entries(aliasMap).forEach(([rawKey, rawValue]) => {
    if (normalizeText(rawKey) !== normalizedQueryKey) return;
    aliases.push(...normalizeAliasList(rawValue));
  });
  return aliases;
};

const resolveEntityAliases = (query) => {
  const normalizedQuery = normalizeDisplayText(query);
  if (!normalizedQuery) return [];
  const normalizedQueryKey = normalizeText(normalizedQuery);
  const aliases = [
    ...collectEntityAliases(defaultEntityAliasMap, normalizedQueryKey),
    ...collectEntityAliases(MCP_ENTITY_ALIAS_MAP, normalizedQueryKey)
  ];
  return [...new Set(
    aliases.filter((alias) => normalizeText(alias) !== normalizedQueryKey)
  )];
};

const buildNewsSearchQueries = (query, aliases = []) => {
  const normalizedQuery = normalizeDisplayText(query);
  if (!normalizedQuery) return [];

  const queries = [
    `${normalizedQuery} latest news`,
    `${normalizedQuery} breaking news`,
    `${normalizedQuery} press release`,
    `${normalizedQuery} company update`,
    `${normalizedQuery} news`,
    `"${normalizedQuery}"`,
    normalizedQuery
  ];

  if (hasCjkCharacters(normalizedQuery)) {
    queries.push(
      `${normalizedQuery} 新闻`,
      `${normalizedQuery} 最新动态`,
      `${normalizedQuery} 官方公告`,
      `${normalizedQuery} 公司 新闻`
    );
  } else {
    queries.push(
      `${normalizedQuery} company news`,
      `${normalizedQuery} official announcement`
    );
  }

  normalizeAliasList(aliases).forEach((alias) => {
    queries.push(
      `${alias} news`,
      `${alias} latest news`,
      `${alias} company update`,
      `"${alias}"`,
      alias
    );
  });

  const dedupe = new Set();
  const result = [];
  queries.forEach((candidate) => {
    const value = normalizeDisplayText(candidate);
    if (!value) return;
    const key = normalizeText(value);
    if (!key || dedupe.has(key)) return;
    dedupe.add(key);
    result.push(value);
  });
  return result;
};

const isCjkToken = (token) => /[\u3400-\u9FFF]/u.test(String(token || ''));

const isAsciiToken = (token) => /^[a-z0-9]+$/i.test(String(token || ''));

const isUsefulAnchorToken = (token) => {
  const normalized = String(token || '').trim();
  if (!normalized || queryStopTerms.has(normalized)) return false;

  if (isCjkToken(normalized)) {
    return normalized.length >= 2;
  }
  if (isAsciiToken(normalized)) {
    return normalized.length >= 4;
  }
  return normalized.length >= 3;
};

const buildAnchorTerms = (query) => {
  const cleaned = sanitizeQueryText(query);
  const tokenCandidates = cleaned
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item
      .replace(/(\u54c1\u724c|\u516c\u53f8|\u96c6\u56e2|\u884c\u4e1a|\u8d5b\u9053|\u5e02\u573a|\u7814\u7a76|\u5206\u6790|\u62a5\u544a|market|industry|analysis|report)$/g, '')
      .trim()
    )
    .filter((item) => isUsefulAnchorToken(item));

  const cjkBigrams = [];
  if (cleaned && !cleaned.includes(' ') && /[\u4e00-\u9fff]/.test(cleaned) && cleaned.length <= 12) {
    for (let i = 0; i < cleaned.length - 1; i += 1) {
      cjkBigrams.push(cleaned.slice(i, i + 2));
    }
  }

  return [...new Set(
    [cleaned, ...tokenCandidates, ...cjkBigrams].filter((item) => isUsefulAnchorToken(item))
  )];
};

const toLowerText = (value) => String(value || '').toLowerCase();

const getHostname = (value) => {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const containsAnyTerm = (text, terms = []) => terms.some((term) => text.includes(term));

const driftTerms = [
  'watch', 'watches', 'chrono24', 'aliexpress', 'amazon',
  'youtube help', 'onedrive', 'pinterest', 'microsoft support'
];

const unsafeTerms = [
  'porn', 'xxx', 'xvideos', 'xnxx', 'sex', 'adult',
  'hentai', 'onlyfans', 'redtube', 'youporn', 'pornhub'
];

const noisyTerms = [
  'free online games', 'play now', 'crazygames', 'poki', 'play-games',
  'walkthrough', 'mod apk', 'unblocked games'
];

const competitorIntentNoiseTerms = [
  '\u83dc\u5355',
  '\u4ef7\u76ee',
  '\u4ef7\u683c',
  '\u70ed\u91cf',
  '\u4f18\u60e0',
  '\u600e\u4e48\u505a',
  '\u914d\u65b9',
  '\u505a\u6cd5',
  '\u767e\u5ea6\u77e5\u9053',
  'recipe',
  'how to make'
];

const modeContextTerms = {
  competitor: ['\u7ade\u54c1', '\u540c\u7c7b', '\u54c1\u724c', '\u5bf9\u6bd4', 'vs', 'rival', 'competitor', 'brand', 'alternative'],
  industry: ['\u884c\u4e1a', '\u5e02\u573a', '\u8d8b\u52bf', 'industry', 'market', 'trend'],
  market_report: ['market report', 'industry report', '\u5e02\u573a\u62a5\u544a', '\u884c\u4e1a\u62a5\u544a', '\u6d88\u8d39\u8d8b\u52bf'],
  financial_data: ['investor relations', 'annual report', 'earnings', '\u8d22\u62a5', '\u5e74\u62a5', '\u4e1a\u7ee9', '\u6295\u8d44\u8005\u5173\u7cfb'],
  news_stream: ['latest news', 'breaking news', 'press release', 'company update', '\u65b0\u95fb', '\u5feb\u8baf', '\u62a5\u9053', '\u53d1\u5e03']
};

const authorityTierRules = [
  {
    tier: 'filing',
    weight: 0.65,
    reasonCode: 'authority_promoted_filings',
    patterns: [
      /(^|\.)sec\.gov$/i,
      /(^|\.)edgar\.sec\.gov$/i,
      /(^|\.)cninfo\.com\.cn$/i,
      /(^|\.)hkexnews\.hk$/i,
      /(^|\.)sse\.com\.cn$/i,
      /(^|\.)szse\.cn$/i
    ]
  },
  {
    tier: 'official',
    weight: 0.48,
    reasonCode: 'authority_promoted_official',
    patterns: [/\.(gov|edu)(\.|$)/, /\.(org)(\.|$)/, /investor\./, /ir\./]
  },
  {
    tier: 'high_trust_media',
    weight: 0.26,
    reasonCode: 'authority_promoted_trusted_media',
    patterns: [
      /reuters\.com$/,
      /bloomberg\.com$/,
      /wsj\.com$/,
      /ft\.com$/,
      /economist\.com$/,
      /forbes\.com$/
    ]
  },
  {
    tier: 'platform',
    weight: -0.08,
    reasonCode: 'authority_demoted_ugc_platform',
    patterns: [
      /reddit\.com$/,
      /quora\.com$/,
      /pinterest\./,
      /youtube\.com$/,
      /facebook\.com$/,
      /x\.com$/,
      /twitter\.com$/
    ]
  },
  {
    tier: 'unknown',
    weight: 0,
    reasonCode: 'authority_neutral_unknown',
    patterns: []
  }
];

const governanceAllowRules = [
  {
    reasonCode: 'allow_financial_disclosure_context',
    test: ({ text }) => /\b(investor relations|annual report|earnings call|10-k|10-q)\b/i.test(text)
  },
  {
    reasonCode: 'allow_market_report_context',
    test: ({ text }) => /\b(industry report|market report|whitepaper|analysis report)\b/i.test(text)
  }
];

const governanceDenyRules = [
  {
    reasonCode: 'filter_low_signal_forum',
    test: ({ text }) => /\b(forum|bbs|thread|ask me anything|comment section)\b/i.test(text)
  },
  {
    reasonCode: 'filter_content_farm',
    test: ({ text }) => /\b(top\s*10|clickbait|shocking|viral\b|listicle)\b/i.test(text)
  }
];

const resolveAuthoritySignal = (host) => {
  const normalizedHost = String(host || '').toLowerCase().trim();

  const matchedRule = authorityTierRules.find((rule) => rule.patterns.some((pattern) => pattern.test(normalizedHost)));
  if (!matchedRule) {
    const fallback = authorityTierRules.find((rule) => rule.tier === 'unknown');
    return {
      authorityTier: fallback ? fallback.tier : 'unknown',
      authorityWeight: fallback ? fallback.weight : 0,
      authorityReasonCode: fallback ? fallback.reasonCode : 'authority_neutral_unknown'
    };
  }

  return {
    authorityTier: matchedRule.tier,
    authorityWeight: matchedRule.weight,
    authorityReasonCode: matchedRule.reasonCode
  };
};

const evaluateGovernanceRules = ({ hostAndText, mode }) => {
  const text = String(hostAndText || '').toLowerCase();
  const allowedBy = governanceAllowRules.filter((rule) => rule.test({ text, mode })).map((rule) => rule.reasonCode);
  const deniedBy = governanceDenyRules.filter((rule) => rule.test({ text, mode })).map((rule) => rule.reasonCode);
  const denied = deniedBy.length > 0 && allowedBy.length === 0;

  return {
    denied,
    deniedBy,
    allowedBy
  };
};

const recencyBoostConfig = {
  news_stream: {
    windowHours: 72,
    maxBoost: 0.45,
    reasonCode: 'recency_recent_news'
  }
};

const parsePublishedAt = (item) => {
  const candidate = String(
    item?.publishedAt
    || item?.published_date
    || item?.published_at
    || item?.datePublished
    || item?.pubDate
    || item?.publishDate
    || item?.updatedAt
    || item?.updated_at
    || item?.date
    || ''
  ).trim();
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};

const computeRecencyBoost = (item, mode) => {
  const config = recencyBoostConfig[mode];
  if (!config) return { boost: 0 };
  const publishedMs = parsePublishedAt(item);
  if (!publishedMs) return { boost: 0 };
  const ageMs = Date.now() - publishedMs;
  if (!Number.isFinite(ageMs) || ageMs < 0) return { boost: 0 };
  const windowMs = config.windowHours * 60 * 60 * 1000;
  if (ageMs >= windowMs) return { boost: 0 };
  const ratio = 1 - (ageMs / windowMs);
  return {
    boost: Number((config.maxBoost * ratio).toFixed(3)),
    reasonCode: config.reasonCode
  };
};

const scoreRecordRelevance = (item, anchorTerms, mode = 'generic') => {
  const name = toLowerText(item?.name);
  const desc = toLowerText(item?.description);
  const url = toLowerText(item?.url);
  const host = getHostname(item?.url);
  const primaryText = `${name} ${desc}`.trim();
  const text = `${primaryText} ${url}`.trim();
  const hostAndText = `${host} ${text}`.trim();

  let score = 0;
  let anchorHits = 0;
  let contextHits = 0;
  let blockedReason = '';
  const reasonCodes = [];

  const primaryAnchor = anchorTerms[0] || '';
  if (primaryAnchor && primaryText.includes(primaryAnchor)) {
    score += 3.7;
    anchorHits += 1;
  } else if (primaryAnchor && url.includes(primaryAnchor)) {
    score += 0.45;
    reasonCodes.push('anchor_url_only');
  }

  anchorTerms.slice(1).forEach((term) => {
    if (term && primaryText.includes(term)) {
      score += 1.35;
      anchorHits += 1;
      return;
    }
    if (term && url.includes(term)) {
      score += 0.2;
      reasonCodes.push('anchor_url_only');
    }
  });

  const contextTerms = modeContextTerms[mode] || [];
  contextTerms.forEach((term) => {
    if (primaryText.includes(term)) {
      score += 0.35;
      contextHits += 1;
    }
  });

  if (!anchorHits && driftTerms.some((term) => text.includes(term))) {
    score -= 2;
    reasonCodes.push('relevance_drift_penalty');
  }

  if (containsAnyTerm(hostAndText, unsafeTerms)) {
    blockedReason = 'unsafe_content';
    score -= 8;
    reasonCodes.push('blocked_unsafe_content');
  }

  if (!blockedReason && containsAnyTerm(hostAndText, noisyTerms)) {
    score -= 2.5;
    reasonCodes.push('noisy_term_penalty');
  }

  if (mode === 'competitor' && containsAnyTerm(text, competitorIntentNoiseTerms)) {
    score -= 2.2;
    reasonCodes.push('competitor_intent_noise_penalty');
  }

  if (mode === 'competitor' && /zhidao\.baidu\.com|baidu\.com\/question/i.test(url)) {
    score -= 1.4;
    reasonCodes.push('competitor_low_signal_qa_penalty');
  }

  const source = String(item?.source || 'web');
  if (source === 'bing_news' || source === 'google_news') score += 0.1;

  const { boost: recencyBoost, reasonCode: recencyReason } = computeRecencyBoost(item, mode);
  if (recencyBoost > 0) {
    score += recencyBoost;
    if (recencyReason) reasonCodes.push(recencyReason);
  }

  const baseRelevanceScore = Number(score.toFixed(3));
  const authoritySignal = resolveAuthoritySignal(host);
  score += authoritySignal.authorityWeight;
  if (authoritySignal.authorityReasonCode && authoritySignal.authorityReasonCode !== 'authority_neutral_unknown') {
    reasonCodes.push(authoritySignal.authorityReasonCode);
  }

  const governance = evaluateGovernanceRules({ hostAndText, mode });
  if (governance.allowedBy.length > 0) {
    reasonCodes.push(...governance.allowedBy);
  }

  if (!blockedReason && governance.denied) {
    blockedReason = 'governance_denied';
    reasonCodes.push(...governance.deniedBy);
  }

  return {
    ...item,
    relevanceScore: Number(score.toFixed(3)),
    baseRelevanceScore,
    anchorHits,
    contextHits,
    blockedReason,
    host,
    reasonCodes: [...new Set(reasonCodes)],
    governance: {
      deniedBy: governance.deniedBy,
      allowedBy: governance.allowedBy
    },
    authority: {
      tier: authoritySignal.authorityTier,
      weight: authoritySignal.authorityWeight,
      reasonCode: authoritySignal.authorityReasonCode
    }
  };
};

const sortByRelevanceWithHostDiversity = (items = [], options = {}) => {
  const hostPenalty = Number.isFinite(Number(options.hostPenalty))
    ? Number(options.hostPenalty)
    : MCP_HOST_DIVERSITY_PENALTY;
  const hostWindowSize = parsePositiveInt(options.hostWindowSize, MCP_HOST_DIVERSITY_WINDOW, 200);

  const baseSorted = [...items].sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  if (hostPenalty <= 0 || hostWindowSize <= 1) {
    return baseSorted;
  }

  const hostSeenCount = new Map();
  const adjusted = baseSorted.map((item, index) => {
    if (index >= hostWindowSize) {
      return item;
    }

    const host = String(item?.host || getHostname(item?.url)).toLowerCase();
    if (!host) {
      return item;
    }
    const repeats = Number(hostSeenCount.get(host) || 0);
    hostSeenCount.set(host, repeats + 1);
    if (repeats <= 0) {
      return item;
    }

    return {
      ...item,
      diversityAdjustedScore: Number((item.relevanceScore - (repeats * hostPenalty)).toFixed(3)),
      reasonCodes: [...new Set([...(item.reasonCodes || []), 'host_diversity_penalty'])]
    };
  });

  return adjusted.sort((a, b) => {
    const scoreA = Number.isFinite(Number(a?.diversityAdjustedScore))
      ? Number(a.diversityAdjustedScore)
      : Number(a?.relevanceScore || 0);
    const scoreB = Number.isFinite(Number(b?.diversityAdjustedScore))
      ? Number(b.diversityAdjustedScore)
      : Number(b?.relevanceScore || 0);
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
};

const rankAndFilterRecords = (records = [], options = {}) => {
  const mode = String(options.mode || 'generic');
  const anchorTerms = buildAnchorTerms(options.anchorQuery || options.query || '');
  const threshold = Number.isFinite(Number(options.minScore))
    ? Number(options.minScore)
    : MCP_RELEVANCE_MIN_SCORE;

  const scored = records
    .map((item) => scoreRecordRelevance(item, anchorTerms, mode));

  const filteredCandidates = [];
  const rememberFiltered = (item, reasonCodes = []) => {
    filteredCandidates.push({
      name: String(item?.name || '').trim(),
      url: String(item?.url || '').trim(),
      source: String(item?.source || 'web'),
      relevanceScore: Number(item?.relevanceScore || 0),
      baseRelevanceScore: Number(item?.baseRelevanceScore || 0),
      authorityTier: item?.authority?.tier || 'unknown',
      authorityWeight: Number(item?.authority?.weight || 0),
      reasonCodes: [...new Set([...(item?.reasonCodes || []), ...reasonCodes].filter(Boolean))]
    });
  };

  const safeScored = scored.filter((item) => {
    if (item.blockedReason) {
      rememberFiltered(item, [
        item.blockedReason === 'unsafe_content' ? 'filtered_unsafe_content' : 'filtered_governance_denied'
      ]);
      return false;
    }
    return true;
  });

  const candidatePool = safeScored.length > 0 ? safeScored : scored;

  const isStrictMode = ['competitor', 'industry', 'market_report', 'financial_data', 'news_stream'].includes(mode);

  const filtered = [];
  candidatePool.forEach((item) => {
    if (isStrictMode) {
      const hasAnchorHit = item.anchorHits > 0;
      const meetsThreshold = item.relevanceScore >= threshold;
      const requiresContextHit = mode === 'competitor';
      const hasContextSignal = item.contextHits > 0;
      if (hasAnchorHit && meetsThreshold && (!requiresContextHit || hasContextSignal)) {
        filtered.push(item);
      } else {
        const filterReasons = [];
        if (!hasAnchorHit) filterReasons.push('filtered_missing_anchor_hit');
        if (!meetsThreshold) filterReasons.push('filtered_below_score_threshold');
        if (requiresContextHit && !hasContextSignal) filterReasons.push('filtered_missing_context_hit');
        rememberFiltered(item, filterReasons);
      }
      return;
    }

    const include = item.anchorHits > 0 || item.relevanceScore >= threshold;
    if (include) {
      filtered.push(item);
      return;
    }
    rememberFiltered(item, ['filtered_low_relevance']);
  });

  const relaxedFallback = candidatePool
    .filter((item) => {
      if (mode === 'news_stream') {
        return item.anchorHits > 0;
      }
      return item.relevanceScore >= Math.max(0, threshold + (isStrictMode ? 0.6 : 0));
    });

  const finalPool = filtered.length > 0
    ? filtered
    : (relaxedFallback.length > 0
      ? relaxedFallback
      : (mode === 'news_stream' ? [] : candidatePool));

  const finalList = sortByRelevanceWithHostDiversity(
    finalPool,
    {
      hostPenalty: options.hostPenalty,
      hostWindowSize: options.hostWindowSize
    }
  );

  const finalKeys = new Set(finalList.map((item) => normalizeUrlForDedupe(item?.url) || normalizeText(item?.name)));
  const filteredItems = filteredCandidates.filter((item) => {
    const key = normalizeUrlForDedupe(item?.url) || normalizeText(item?.name);
    return key && !finalKeys.has(key);
  });
  const filterReasonCounts = filteredItems.reduce((acc, item) => {
    (item.reasonCodes || []).forEach((code) => {
      if (!code) return;
      acc[code] = Number(acc[code] || 0) + 1;
    });
    return acc;
  }, {});

  return {
    records: finalList,
    droppedCount: Math.max(0, scored.length - finalList.length),
    blockedCount: Math.max(0, scored.length - safeScored.length),
    filteredItems,
    filterRationale: {
      mode,
      threshold,
      isStrictMode,
      totalScored: scored.length,
      keptCount: finalList.length,
      blockedCount: Math.max(0, scored.length - safeScored.length),
      reasonCounts: filterReasonCounts
    }
  };
};

const normalizeUrlForDedupe = (rawUrl) => {
  const input = String(rawUrl || '').trim();
  if (!input) return '';
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const decodedPath = (() => {
      try {
        return decodeURIComponent(parsed.pathname || '/');
      } catch {
        return parsed.pathname || '/';
      }
    })();
    const noIndexPath = decodedPath.replace(/\/(index(\.[a-z0-9]+)?)$/i, '/');
    const normalizedPath = (noIndexPath.replace(/\/+$/, '') || '/');
    return `${hostname}${normalizedPath}`;
  } catch {
    return input.toLowerCase();
  }
};

const countSources = (items = []) => {
  return (items || []).reduce((acc, item) => {
    const source = String(item?.source || 'web').toLowerCase();
    if (!source) return acc;
    acc[source] = Number(acc[source] || 0) + 1;
    return acc;
  }, {});
};

const dedupeByName = (list = []) => {
  const seen = new Map();
  for (const item of list) {
    const key = normalizeUrlForDedupe(item?.url) || normalizeText(item?.name);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, item);
      continue;
    }
    const mergedSources = [...new Set([
      ...(Array.isArray(prev.sources) ? prev.sources : []),
      prev.source,
      item.source
    ].filter(Boolean))];
    seen.set(key, {
      ...prev,
      name: prev.name || item.name,
      url: prev.url || item.url,
      description: prev.description || item.description,
      source: prev.source || item.source,
      sources: mergedSources
    });
  }
  return [...seen.values()];
};

const remoteMcpClients = new Map();

const getOrCreateRemoteMcpClient = async (clientKey, buildTransport) => {
  const existing = remoteMcpClients.get(clientKey);
  if (existing?.client) return existing.client;

  const transport = buildTransport();
  const client = new Client({ name: 'chayan-search-mcp', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  remoteMcpClients.set(clientKey, { client });
  return client;
};

const resetRemoteMcpClient = (clientKey) => {
  const existing = remoteMcpClients.get(clientKey);
  if (!existing?.client) {
    remoteMcpClients.delete(clientKey);
    return;
  }
  Promise.resolve(existing.client.close()).catch(() => {});
  remoteMcpClients.delete(clientKey);
};

const extractMcpToolPayload = (toolResult) => {
  if (!toolResult || typeof toolResult !== 'object') return null;
  if (toolResult.structuredContent && typeof toolResult.structuredContent === 'object') {
    return toolResult.structuredContent;
  }
  const textContent = (Array.isArray(toolResult.content) ? toolResult.content : [])
    .find((item) => item?.type === 'text' && typeof item?.text === 'string');
  if (!textContent?.text) return null;
  try {
    return JSON.parse(textContent.text);
  } catch {
    return { text: textContent.text };
  }
};

const extractMcpToolErrorMessage = (toolResult, fallback = 'mcp_tool_error') => {
  if (!toolResult || typeof toolResult !== 'object') return fallback;
  const textContent = (Array.isArray(toolResult.content) ? toolResult.content : [])
    .find((item) => item?.type === 'text' && typeof item?.text === 'string');
  const text = normalizeDisplayText(textContent?.text || '');
  if (text) return truncateText(text, 320);
  const rawError = normalizeDisplayText(toolResult?.error?.message || '');
  return rawError || fallback;
};

const isMcpUnknownToolError = (message) => {
  const normalized = normalizeText(message || '');
  if (!normalized) return false;
  return (
    normalized.includes('unknown tool')
    || normalized.includes('tool not found')
    || normalized.includes('method not found')
    || normalized.includes('unsupported tool')
  );
};

const normalizeSearchRecords = (payload, source) => {
  const arraysToScan = [];
  if (Array.isArray(payload)) arraysToScan.push(payload);
  if (Array.isArray(payload?.results)) arraysToScan.push(payload.results);
  if (Array.isArray(payload?.data)) arraysToScan.push(payload.data);
  if (Array.isArray(payload?.items)) arraysToScan.push(payload.items);
  if (Array.isArray(payload?.result)) arraysToScan.push(payload.result);
  if (typeof payload?.result === 'string') {
    try {
      const parsed = JSON.parse(payload.result);
      if (Array.isArray(parsed)) arraysToScan.push(parsed);
    } catch {
      // ignore non-JSON string result
    }
  }
  if (Array.isArray(payload?.web?.results)) arraysToScan.push(payload.web.results);
  if (Array.isArray(payload?.webPages?.value)) arraysToScan.push(payload.webPages.value);

  const merged = arraysToScan.flat();
  return merged
    .map((item) => cleanSearchRecord({
      name: item?.name || item?.title || '',
      description: item?.description || item?.summary || item?.snippet || item?.content || '',
      url: item?.url || item?.link || item?.href || '',
      source: source || item?.source || 'web',
      publishedAt: item?.publishedAt
        || item?.published_date
        || item?.published_at
        || item?.datePublished
        || item?.publishDate
        || item?.pubDate
        || item?.published
        || item?.updated_at
        || item?.updatedAt
        || item?.date
    }, source || 'web'))
    .filter(Boolean);
};

const parseTimeframeToDays = (timeframe, fallbackDays = 90) => {
  const fallback = parsePositiveInt(fallbackDays, 90, 1825);
  const normalized = normalizeText(timeframe || '');
  if (!normalized) return fallback;
  if (['latest', 'recent', 'now', 'current'].includes(normalized)) return 30;
  if (['quarter', 'quarterly', 'q'].includes(normalized)) return 90;
  if (['year', 'yearly', 'annual', 'y'].includes(normalized)) return 365;

  const numericOnly = Number.parseInt(normalized, 10);
  if (Number.isFinite(numericOnly) && numericOnly > 0 && String(numericOnly) === normalized) {
    return Math.min(1825, Math.max(1, numericOnly));
  }

  const dayMatch = normalized.match(/(\d+)\s*(day|days|d)\b/i);
  if (dayMatch) return Math.min(1825, Math.max(1, Number.parseInt(dayMatch[1], 10)));

  const weekMatch = normalized.match(/(\d+)\s*(week|weeks|w)\b/i);
  if (weekMatch) return Math.min(1825, Math.max(1, Number.parseInt(weekMatch[1], 10) * 7));

  const monthMatch = normalized.match(/(\d+)\s*(month|months|mo|m)\b/i);
  if (monthMatch) return Math.min(1825, Math.max(1, Number.parseInt(monthMatch[1], 10) * 30));

  const yearMatch = normalized.match(/(\d+)\s*(year|years|yr|yrs|y)\b/i);
  if (yearMatch) return Math.min(1825, Math.max(1, Number.parseInt(yearMatch[1], 10) * 365));

  return fallback;
};

const normalizeEdgarFilingRecords = (payload, companyName = '') => {
  const arraysToScan = [];
  const addIfArray = (candidate) => {
    if (Array.isArray(candidate)) arraysToScan.push(candidate);
  };

  addIfArray(payload);
  addIfArray(payload?.filings);
  addIfArray(payload?.recent_filings);
  addIfArray(payload?.results);
  addIfArray(payload?.items);
  addIfArray(payload?.records);
  addIfArray(payload?.data);
  addIfArray(payload?.value);
  addIfArray(payload?.output);
  addIfArray(payload?.data?.filings);
  addIfArray(payload?.result?.filings);
  addIfArray(payload?.result);
  if (typeof payload?.result === 'string') {
    try {
      const parsed = JSON.parse(payload.result);
      addIfArray(parsed);
      addIfArray(parsed?.filings);
      addIfArray(parsed?.results);
      addIfArray(parsed?.data);
      addIfArray(parsed?.items);
      addIfArray(parsed?.records);
    } catch {
      // ignore non-JSON result string
    }
  }

  const normalizedCompany = normalizeDisplayText(companyName);
  const merged = arraysToScan.flat();
  const buildEdgarArchiveUrl = (cikValue, accessionValue, formType, companyLabel) => {
    const providedUrl = normalizeDisplayText(cikValue || '');
    if (/^https?:\/\//i.test(providedUrl)) return providedUrl;

    const cikDigits = String(cikValue || '').replace(/[^\d]/g, '').replace(/^0+/, '');
    const accession = String(accessionValue || '').replace(/[^\d]/g, '');
    if (cikDigits && accession) {
      return `https://www.sec.gov/Archives/edgar/data/${cikDigits}/${accession}/`;
    }
    const query = normalizeDisplayText(companyLabel || formType || '').trim();
    if (!query) return '';
    return `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(query)}`;
  };

  const records = merged
    .map((item) => {
      const formType = normalizeDisplayText(item?.form_type || item?.formType || item?.form || '');
      const accessionNumber = normalizeDisplayText(
        item?.accession_number || item?.accessionNumber || item?.accession || ''
      );
      const filingDate = normalizeDisplayText(
        item?.filing_date || item?.filingDate || item?.date_filed || item?.filed_at || item?.filedAt || item?.date || ''
      );
      const rawTitle = normalizeDisplayText(item?.title || item?.name || '');
      const rawCompany = normalizeDisplayText(item?.company_name || item?.company || item?.issuer || '');
      const effectiveCompany = rawCompany || normalizedCompany || 'Company';
      const providedUrl = normalizeDisplayText(
        item?.filing_url || item?.filingUrl || item?.document_url || item?.documentUrl || item?.url || item?.link || ''
      );
      const url = providedUrl || buildEdgarArchiveUrl(
        item?.cik,
        accessionNumber,
        formType,
        effectiveCompany
      );

      const fallbackName = [effectiveCompany, formType || 'filing', accessionNumber].filter(Boolean).join(' ');
      const summary = normalizeDisplayText(item?.summary || item?.description || '');
      const fallbackSummary = [
        formType ? `Form ${formType}` : '',
        filingDate ? `Filed ${filingDate}` : '',
        accessionNumber ? `Accession ${accessionNumber}` : ''
      ].filter(Boolean).join(' · ');

      return cleanSearchRecord({
        name: rawTitle || fallbackName,
        description: summary || fallbackSummary || 'SEC EDGAR filing',
        url,
        source: 'edgar_mcp',
        publishedAt: filingDate || item?.publishedAt || item?.published_at || item?.datePublished || item?.pubDate,
        formType,
        accessionNumber,
        filingDate
      }, 'edgar_mcp');
    })
    .filter(Boolean);

  return dedupeByName(records);
};

const extractCikFromEdgarPayload = (payload) => {
  const directPayload = (
    typeof payload === 'string'
    || typeof payload === 'number'
  )
    ? payload
    : '';
  const candidates = [
    directPayload,
    payload?.cik,
    payload?.CIK,
    payload?.data?.cik,
    payload?.data?.CIK,
    payload?.result,
    payload?.result?.cik,
    payload?.result?.CIK,
    payload?.data?.result,
    payload?.company?.cik,
    payload?.company?.CIK
  ];

  for (const candidate of candidates) {
    const digits = String(candidate || '').replace(/[^\d]/g, '');
    if (!digits) continue;
    return digits.padStart(10, '0');
  }
  return '';
};

const fetchEdgarRecentFilingsFromMcp = async ({ company, ticker, timeframe }) => {
  const enabled = Boolean(MCP_EDGAR_MCP_URL);
  const result = {
    enabled,
    used: false,
    identifier: '',
    days: parseTimeframeToDays(timeframe, 90),
    filings: [],
    attempts: [],
    partialFailure: false
  };

  if (!enabled) {
    return result;
  }

  const companyName = normalizeDisplayText(company);
  const tickerCode = normalizeDisplayText(ticker).toUpperCase();
  const identifierCandidates = [];

  const lookupPlans = [];
  if (tickerCode) {
    lookupPlans.push(
      {
        source: 'edgar_mcp_get_cik_by_ticker',
        toolName: 'get_cik_by_ticker',
        args: { ticker: tickerCode }
      },
      {
        source: 'edgar_mcp_lookup_cik',
        toolName: 'lookup_company_cik',
        args: { ticker: tickerCode }
      }
    );
  }
  if (companyName) {
    lookupPlans.push({
      source: 'edgar_mcp_lookup_cik',
      toolName: 'lookup_company_cik',
      args: { company: companyName }
    });
  }

  for (const lookupPlan of lookupPlans) {
    try {
      const lookupResult = await callRemoteMcpToolOverHttp(
        MCP_EDGAR_MCP_URL,
        lookupPlan.toolName,
        lookupPlan.args
      );
      if (lookupResult?.isError === true) {
        throw new Error(extractMcpToolErrorMessage(lookupResult, 'lookup_cik_failed'));
      }
      const lookupPayload = extractMcpToolPayload(lookupResult);
      const cik = extractCikFromEdgarPayload(lookupPayload);
      result.attempts.push({
        source: lookupPlan.source,
        toolName: lookupPlan.toolName,
        success: true,
        resultCount: cik ? 1 : 0
      });
      if (cik && !identifierCandidates.includes(cik)) {
        identifierCandidates.push(cik);
        break;
      }
    } catch (error) {
      const errorMessage = error?.message || 'lookup_cik_failed';
      if (!isMcpUnknownToolError(errorMessage)) {
        result.partialFailure = true;
      }
      result.attempts.push({
        source: lookupPlan.source,
        toolName: lookupPlan.toolName,
        success: false,
        resultCount: 0,
        error: errorMessage
      });
    }
  }

  [tickerCode, companyName].forEach((value) => {
    const normalized = normalizeDisplayText(value);
    if (!normalized) return;
    if (!identifierCandidates.includes(normalized)) {
      identifierCandidates.push(normalized);
    }
  });

  const limit = parsePositiveInt(MCP_EDGAR_RECENT_FILINGS_LIMIT, 12, 40);
  const preferredForms = ['10-K', '10-Q', '8-K', '20-F', '6-K'];
  const preferredFormSet = new Set(preferredForms);
  const perFormLimit = Math.max(2, Math.min(10, Math.ceil(limit / preferredForms.length) + 1));

  for (const identifier of identifierCandidates) {
    try {
      const settledPerForm = await Promise.allSettled(
        preferredForms.map(async (formType) => {
          const filingsResult = await callRemoteMcpToolOverHttp(
            MCP_EDGAR_MCP_URL,
            'get_recent_filings',
            {
              identifier,
              form_type: formType,
              days: result.days,
              limit: perFormLimit
            }
          );
          if (filingsResult?.isError === true) {
            throw new Error(extractMcpToolErrorMessage(filingsResult, 'get_recent_filings_failed'));
          }
          const filingsPayload = extractMcpToolPayload(filingsResult);
          const normalizedFilings = normalizeEdgarFilingRecords(filingsPayload, companyName);
          return { formType, filings: normalizedFilings };
        })
      );

      const preferredFilings = [];
      settledPerForm.forEach((entry, idx) => {
        const formType = preferredForms[idx];
        if (entry.status === 'fulfilled') {
          preferredFilings.push(...entry.value.filings);
          result.attempts.push({
            source: 'edgar_mcp_get_recent_filings',
            identifier,
            formType,
            success: true,
            resultCount: entry.value.filings.length
          });
          return;
        }

        result.partialFailure = true;
        result.attempts.push({
          source: 'edgar_mcp_get_recent_filings',
          identifier,
          formType,
          success: false,
          resultCount: 0,
          error: entry.reason?.message || 'get_recent_filings_failed'
        });
      });

      const preferredMerged = dedupeByName(preferredFilings).slice(0, limit);
      if (preferredMerged.length > 0) {
        result.used = true;
        result.identifier = identifier;
        result.filings = preferredMerged;
        return result;
      }

      const fallbackResult = await callRemoteMcpToolOverHttp(
        MCP_EDGAR_MCP_URL,
        'get_recent_filings',
        {
          identifier,
          days: result.days,
          limit
        }
      );
      if (fallbackResult?.isError === true) {
        throw new Error(extractMcpToolErrorMessage(fallbackResult, 'get_recent_filings_failed'));
      }
      const fallbackPayload = extractMcpToolPayload(fallbackResult);
      const fallbackFilings = normalizeEdgarFilingRecords(fallbackPayload, companyName);
      const filteredFallback = fallbackFilings.filter((item) => (
        preferredFormSet.has(normalizeDisplayText(item?.formType).toUpperCase())
      ));
      const effectiveFilings = (filteredFallback.length > 0 ? filteredFallback : fallbackFilings).slice(0, limit);
      result.attempts.push({
        source: 'edgar_mcp_get_recent_filings',
        identifier,
        success: true,
        resultCount: effectiveFilings.length
      });
      if (effectiveFilings.length > 0) {
        result.used = true;
        result.identifier = identifier;
        result.filings = effectiveFilings;
        return result;
      }
    } catch (error) {
      result.partialFailure = true;
      result.attempts.push({
        source: 'edgar_mcp_get_recent_filings',
        identifier,
        success: false,
        resultCount: 0,
        error: error?.message || 'get_recent_filings_failed'
      });
    }
  }

  return result;
};

const callRemoteMcpToolOverHttp = async (baseUrl, toolName, args = {}) => {
  const normalizedBaseUrl = String(baseUrl || '').trim();
  if (!normalizedBaseUrl) return null;
  const clientKey = `http:${normalizedBaseUrl}`;
  try {
    const client = await getOrCreateRemoteMcpClient(clientKey, () => (
      new StreamableHTTPClientTransport(new URL(normalizedBaseUrl))
    ));
    return await client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout: MCP_REMOTE_MCP_TIMEOUT_MS }
    );
  } catch (error) {
    resetRemoteMcpClient(clientKey);
    throw error;
  }
};

const callRemoteMcpToolOverStdio = async (command, args = [], toolName, toolArgs = {}) => {
  const cmd = String(command || '').trim();
  if (!cmd) return null;
  const normalizedArgs = Array.isArray(args) ? args : [];
  const clientKey = `stdio:${cmd}:${JSON.stringify(normalizedArgs)}`;
  try {
    const client = await getOrCreateRemoteMcpClient(clientKey, () => (
      new StdioClientTransport({
        command: cmd,
        args: normalizedArgs
      })
    ));
    return await client.callTool(
      { name: toolName, arguments: toolArgs },
      undefined,
      { timeout: MCP_REMOTE_MCP_TIMEOUT_MS }
    );
  } catch (error) {
    resetRemoteMcpClient(clientKey);
    throw error;
  }
};

const fetchWithTimeout = async (url, initOrHeaders = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_FETCH_TIMEOUT_MS);
  try {
    const requestInit = (
      initOrHeaders
      && typeof initOrHeaders === 'object'
      && (Object.prototype.hasOwnProperty.call(initOrHeaders, 'method')
        || Object.prototype.hasOwnProperty.call(initOrHeaders, 'headers')
        || Object.prototype.hasOwnProperty.call(initOrHeaders, 'body'))
    )
      ? initOrHeaders
      : { headers: initOrHeaders };

    const response = await fetch(url, {
      method: 'GET',
      ...requestInit,
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
  for (;;) {
    const match = itemRegex.exec(xml);
    if (!match) break;
    const block = match[1] || '';
    const title = truncateText(decodeHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ''), 140);
    const link = decodeHtml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const description = truncateText(decodeHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || ''), 220);
    const rawPubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const parsedPubDate = rawPubDate ? new Date(rawPubDate) : null;
    const publishedAt = parsedPubDate && Number.isFinite(parsedPubDate.getTime())
      ? parsedPubDate.toISOString()
      : undefined;
    if (!title || !link) continue;
    const cleanedItem = cleanSearchRecord({
      name: title,
      description,
      url: link,
      source: 'bing_web',
      publishedAt
    }, 'bing_web');
    if (!cleanedItem) continue;
    items.push(cleanedItem);
    if (items.length >= MCP_WEB_RESULT_LIMIT) break;
  }
  return items;
};

const searchBingNewsRss = async (query) => {
  const params = new URLSearchParams({ q: query, format: 'rss' });
  const response = await fetchWithTimeout(`https://www.bing.com/news/search?${params.toString()}`, {
    Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
    'User-Agent': 'chayan-mcp-server/1.0'
  });

  const xml = await response.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  for (;;) {
    const match = itemRegex.exec(xml);
    if (!match) break;
    const block = match[1] || '';
    const title = truncateText(decodeHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ''), 140);
    const link = decodeHtml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const description = truncateText(decodeHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || ''), 220);
    const rawPubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const parsedPubDate = rawPubDate ? new Date(rawPubDate) : null;
    const publishedAt = parsedPubDate && Number.isFinite(parsedPubDate.getTime())
      ? parsedPubDate.toISOString()
      : undefined;
    if (!title || !link) continue;
    const cleanedItem = cleanSearchRecord({
      name: title,
      description,
      url: link,
      source: 'bing_news',
      publishedAt
    }, 'bing_news');
    if (!cleanedItem) continue;
    items.push(cleanedItem);
    if (items.length >= MCP_WEB_RESULT_LIMIT) break;
  }
  return items;
};

const searchGoogleNewsRss = async (query, options = {}) => {
  const normalizedQuery = normalizeDisplayText(query);
  if (!normalizedQuery) return [];

  const days = parsePositiveInt(options?.days, 0, 365);
  const scopedQuery = days > 0
    ? `${normalizedQuery} when:${Math.min(days, 30)}d`.trim()
    : normalizedQuery;
  const useChineseEdition = hasCjkCharacters(scopedQuery);
  const feedConfig = useChineseEdition
    ? { hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' }
    : { hl: 'en-US', gl: 'US', ceid: 'US:en' };
  const params = new URLSearchParams({
    q: scopedQuery,
    hl: feedConfig.hl,
    gl: feedConfig.gl,
    ceid: feedConfig.ceid
  });
  const response = await fetchWithTimeout(`https://news.google.com/rss/search?${params.toString()}`, {
    Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
    'User-Agent': 'chayan-mcp-server/1.0'
  });

  const xml = await response.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  for (;;) {
    const match = itemRegex.exec(xml);
    if (!match) break;
    const block = match[1] || '';
    const title = truncateText(decodeHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ''), 140);
    const link = decodeHtml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const publisher = truncateText(decodeHtml((block.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1] || ''), 80);
    const description = truncateText(decodeHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || ''), 220);
    const rawPubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const parsedPubDate = rawPubDate ? new Date(rawPubDate) : null;
    const publishedAt = parsedPubDate && Number.isFinite(parsedPubDate.getTime())
      ? parsedPubDate.toISOString()
      : undefined;
    if (!title || !link) continue;
    const cleanedItem = cleanSearchRecord({
      name: title,
      description: description || publisher,
      url: link,
      source: 'google_news',
      publishedAt
    }, 'google_news');
    if (!cleanedItem) continue;
    items.push(cleanedItem);
    if (items.length >= MCP_WEB_RESULT_LIMIT) break;
  }
  return items;
};

const normalizeDuckDuckGoHref = (href) => {
  const raw = decodeHtml(String(href || '').trim());
  if (!raw) return '';
  const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
  if (normalized.startsWith('/l/?') || normalized.includes('duckduckgo.com/l/?')) {
    try {
      const queryString = normalized.includes('?') ? normalized.split('?').slice(1).join('?') : '';
      const params = new URLSearchParams(queryString || '');
      const uddg = params.get('uddg');
      return uddg ? decodeURIComponent(uddg) : '';
    } catch {
      return '';
    }
  }
  return normalized;
};

const searchDuckDuckGoHtml = async (query) => {
  const params = new URLSearchParams({ q: query });
  const response = await fetchWithTimeout(`https://duckduckgo.com/html/?${params.toString()}`, {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent': 'Mozilla/5.0 (compatible; chayan-mcp-server/1.0)'
  });

  const html = await response.text();
  const items = [];
  const regex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (;;) {
    const match = regex.exec(html);
    if (!match) break;
    const url = normalizeDuckDuckGoHref(match[1]);
    const name = truncateText(decodeHtml(match[2]), 140);
    if (!name || !url || !/^https?:\/\//i.test(url)) continue;
    const cleanedItem = cleanSearchRecord({
      name,
      description: '',
      url,
      source: 'duckduckgo'
    }, 'duckduckgo');
    if (!cleanedItem) continue;
    items.push(cleanedItem);
    if (items.length >= MCP_WEB_RESULT_LIMIT) break;
  }

  return items;
};

const searchWikipediaOpenSearchByLang = async (query, lang = 'en') => {
  const params = new URLSearchParams({
    action: 'opensearch',
    search: query,
    limit: String(MCP_WEB_RESULT_LIMIT),
    namespace: '0',
    format: 'json'
  });
  const response = await fetchWithTimeout(`https://${lang}.wikipedia.org/w/api.php?${params.toString()}`, {
    Accept: 'application/json',
    'User-Agent': 'chayan-mcp-server/1.0'
  });

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length < 4) {
    return [];
  }

  const titles = Array.isArray(payload[1]) ? payload[1] : [];
  const descriptions = Array.isArray(payload[2]) ? payload[2] : [];
  const urls = Array.isArray(payload[3]) ? payload[3] : [];

  const items = [];
  for (let i = 0; i < Math.min(titles.length, urls.length); i += 1) {
    const cleanedItem = cleanSearchRecord({
      name: truncateText(decodeHtml(titles[i] || ''), 140),
      description: truncateText(decodeHtml(descriptions[i] || ''), 220),
      url: decodeHtml(urls[i] || ''),
      source: 'wikipedia'
    }, 'wikipedia');
    if (!cleanedItem) continue;
    items.push(cleanedItem);
    if (items.length >= MCP_WEB_RESULT_LIMIT) break;
  }
  return items;
};

const searchWikipediaOpenSearch = async (query) => {
  const settled = await Promise.allSettled([
    searchWikipediaOpenSearchByLang(query, 'en'),
    searchWikipediaOpenSearchByLang(query, 'zh')
  ]);

  const merged = [];
  let lastError = null;
  settled.forEach((entry) => {
    if (entry.status === 'fulfilled') {
      merged.push(...(Array.isArray(entry.value) ? entry.value : []));
      return;
    }
    lastError = entry.reason || lastError;
  });

  if (merged.length === 0 && lastError) {
    throw lastError;
  }
  return dedupeByName(merged).slice(0, MCP_WEB_RESULT_LIMIT);
};

const searchSearxng = async (query) => {
  if (!MCP_SEARXNG_BASE_URL) return [];
  const buildHeaders = (accept) => ({
    Accept: accept,
    'User-Agent': 'chayan-mcp-server/1.0',
    'X-Forwarded-For': '127.0.0.1',
    'X-Real-IP': '127.0.0.1'
  });

  const parseJsonResults = async () => {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      language: 'auto',
      safesearch: '0'
    });
    const response = await fetchWithTimeout(`${MCP_SEARXNG_BASE_URL}/search?${params.toString()}`, buildHeaders('application/json'));
    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const items = [];

    for (const item of results) {
      const cleanedItem = cleanSearchRecord({
        name: truncateText(decodeHtml(item?.title || item?.url || ''), 140),
        description: truncateText(decodeHtml(item?.content || item?.description || ''), 220),
        url: decodeHtml(item?.url || ''),
        source: 'searxng'
      }, 'searxng');
      if (!cleanedItem) continue;
      items.push(cleanedItem);
      if (items.length >= MCP_WEB_RESULT_LIMIT) break;
    }
    return items;
  };

  try {
    return await parseJsonResults();
  } catch (error) {
    if (Number(error?.status) !== 403) {
      throw error;
    }
  }

  const htmlParams = new URLSearchParams({
    q: query,
    language: 'auto',
    safesearch: '0'
  });
  const htmlResponse = await fetchWithTimeout(
    `${MCP_SEARXNG_BASE_URL}/search?${htmlParams.toString()}`,
    buildHeaders('text/html,application/xhtml+xml')
  );
  const html = await htmlResponse.text();
  const blocks = html.match(/<article[\s\S]*?<\/article>/gi) || [];
  const items = [];

  for (const block of blocks) {
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const descriptionMatch = block.match(/<p[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (!titleMatch) continue;
    const cleanedItem = cleanSearchRecord({
      name: truncateText(decodeHtml(titleMatch[2] || ''), 140),
      description: truncateText(decodeHtml(descriptionMatch?.[1] || ''), 220),
      url: decodeHtml(titleMatch[1] || ''),
      source: 'searxng'
    }, 'searxng');
    if (!cleanedItem) continue;
    items.push(cleanedItem);
    if (items.length >= MCP_WEB_RESULT_LIMIT) break;
  }

  return items;
};

const searchOpenWebSearchMcp = async (query) => {
  if (!MCP_OPEN_WEBSEARCH_MCP_URL) return [];
  const requestedEngines = parseCsvList(MCP_OPEN_WEBSEARCH_ENGINES)
    .map((item) => item.toLowerCase())
    .filter((item) => item && item !== 'brave');
  const fallbackEngines = ['duckduckgo', 'bing', 'baidu'];
  const engines = requestedEngines.length > 0 ? requestedEngines : fallbackEngines;

  const result = await callRemoteMcpToolOverHttp(
    MCP_OPEN_WEBSEARCH_MCP_URL,
    'search',
    {
      query,
      limit: MCP_WEB_RESULT_LIMIT,
      engines
    }
  );

  const payload = extractMcpToolPayload(result);
  const normalized = normalizeSearchRecords(payload, 'open_websearch');
  return dedupeByName(normalized).slice(0, MCP_WEB_RESULT_LIMIT);
};

const searchTavilyApi = async (query, options = {}) => {
  if (!MCP_TAVILY_API_KEY) return [];
  const mode = String(options?.mode || 'generic');
  const days = parsePositiveInt(options?.days, 0, 365);
  const requestBody = {
    api_key: MCP_TAVILY_API_KEY,
    query,
    search_depth: MCP_TAVILY_SEARCH_DEPTH,
    max_results: MCP_WEB_RESULT_LIMIT,
    include_images: false,
    include_raw_content: false
  };
  if (mode === 'news_stream') {
    requestBody.topic = 'news';
    if (days > 0) {
      requestBody.days = days;
    }
  }

  const response = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'chayan-mcp-server/1.0'
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json();
  const normalized = normalizeSearchRecords(payload, 'tavily');
  return dedupeByName(normalized).slice(0, MCP_WEB_RESULT_LIMIT);
};

const searchCrawl4AiMcp = async (query) => {
  const hasHttp = Boolean(MCP_CRAWL4AI_MCP_URL);
  const hasStdio = Boolean(MCP_CRAWL4AI_SERVER_COMMAND);
  if (!hasHttp && !hasStdio) return [];
  const selectedEngine = (
    hasCjkCharacters(query)
    && String(MCP_CRAWL4AI_ENGINE || '').toLowerCase() === 'duckduckgo'
  )
    ? 'baidu'
    : MCP_CRAWL4AI_ENGINE;

  const result = hasHttp
    ? await callRemoteMcpToolOverHttp(MCP_CRAWL4AI_MCP_URL, 'search', {
      query,
      num_results: MCP_WEB_RESULT_LIMIT,
      engine: selectedEngine
    })
    : await callRemoteMcpToolOverStdio(
      MCP_CRAWL4AI_SERVER_COMMAND,
      parseJsonArray(MCP_CRAWL4AI_SERVER_ARGS_JSON),
      'search',
      {
        query,
        num_results: MCP_WEB_RESULT_LIMIT,
        engine: selectedEngine
      }
    );

  const payload = extractMcpToolPayload(result);
  const normalized = normalizeSearchRecords(payload, 'crawl4ai');
  return dedupeByName(normalized).slice(0, MCP_WEB_RESULT_LIMIT);
};

const searchAcrossSources = async (query, options = {}) => {
  const preferredTasks = [
    MCP_OPEN_WEBSEARCH_MCP_URL ? { source: 'open_websearch', execute: () => searchOpenWebSearchMcp(query) } : null,
    MCP_SEARXNG_BASE_URL ? { source: 'searxng', execute: () => searchSearxng(query) } : null,
    MCP_TAVILY_API_KEY ? { source: 'tavily', execute: () => searchTavilyApi(query, options) } : null,
    MCP_ENABLE_GOOGLE_NEWS_SOURCE ? { source: 'google_news', execute: () => searchGoogleNewsRss(query, options) } : null,
    (MCP_CRAWL4AI_MCP_URL || MCP_CRAWL4AI_SERVER_COMMAND)
      ? { source: 'crawl4ai', execute: () => searchCrawl4AiMcp(query) }
      : null
  ].filter(Boolean);

  const legacyTasks = [
    { source: 'bing_web', execute: () => searchBingRss(query) },
    { source: 'bing_news', execute: () => searchBingNewsRss(query) },
    { source: 'duckduckgo', execute: () => searchDuckDuckGoHtml(query) },
    MCP_ENABLE_WIKIPEDIA_SOURCE ? { source: 'wikipedia', execute: () => searchWikipediaOpenSearch(query) } : null
  ].filter(Boolean);

  const sourceTasks = (() => {
    if (preferredTasks.length === 0) {
      return legacyTasks;
    }
    if (MCP_DISABLE_LEGACY_SOURCES) {
      return preferredTasks;
    }
    return [...preferredTasks, ...legacyTasks];
  })();

  const settled = await Promise.allSettled(
    sourceTasks.map(async (task) => {
      const items = await task.execute();
      return { source: task.source, items };
    })
  );

  const items = [];
  const sourceCounts = {};
  const sourceAttempts = [];
  let partialFailure = false;

  settled.forEach((entry, index) => {
    const source = sourceTasks[index].source;
    if (entry.status === 'fulfilled') {
      const sourceItems = (Array.isArray(entry.value?.items) ? entry.value.items : [])
        .map((item) => cleanSearchRecord(item, source))
        .filter(Boolean);
      items.push(...sourceItems);
      sourceCounts[source] = sourceItems.length;
      sourceAttempts.push({ source, success: true, resultCount: sourceItems.length });
      return;
    }

    partialFailure = true;
    sourceCounts[source] = 0;
    sourceAttempts.push({
      source,
      success: false,
      resultCount: 0,
      error: entry.reason?.message || String(entry.reason || 'unknown_error')
    });
  });

  return {
    items,
    sourceCounts,
    sourceAttempts,
    partialFailure
  };
};

const runSearchFanout = async (queries = [], fanout = 1, options = {}) => {
  const selected = [...new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))];
  const mode = String(options.mode || 'generic');
  const anchorQuery = String(options.anchorQuery || selected[0] || '').trim();
  const minSources = parsePositiveInt(options.minSources, MCP_WEB_MIN_SOURCES, 20);
  const minResults = parsePositiveInt(options.minResults, MCP_WEB_MIN_RESULTS, 200);
  const maxWaves = parsePositiveInt(options.maxWaves, MCP_WEB_MAX_WAVES, 10);
  const searchExecutor = typeof options.searchExecutor === 'function'
    ? options.searchExecutor
    : searchAcrossSources;
  const sourceCoverageBoostSuffixByMode = {
    competitor: ['competitor list', '\u540c\u7c7b \u54c1\u724c \u5bf9\u6bd4', 'brand alternatives'],
    industry: ['industry report', 'market size', '\u884c\u4e1a \u8d8b\u52bf \u62a5\u544a'],
    market_report: ['market intelligence', '\u884c\u4e1a \u767d\u76ae\u4e66', 'latest market report'],
    financial_data: ['investor relations', 'annual report', '\u8d22\u62a5', 'earnings call'],
    news_stream: ['latest updates', 'breaking coverage', 'press release', '\u6700\u65b0 \u65b0\u95fb'],
    generic: ['official site', 'latest news', 'analysis report']
  };
  const sourceCoverageBoostQueries = anchorQuery
    ? (sourceCoverageBoostSuffixByMode[mode] || sourceCoverageBoostSuffixByMode.generic)
      .map((suffix) => `${anchorQuery} ${suffix}`.trim())
      .filter(Boolean)
    : [];

  const attempts = [];
  const records = [];
  const aggregatedSourceCounts = {};
  let cursor = 0;
  let wavesExecuted = 0;
  let incompleteResults = false;
  let partialFailure = false;
  let sourceCoverageBoostInjected = false;

  while (cursor < selected.length && wavesExecuted < maxWaves) {
    const waveQueries = selected.slice(cursor, cursor + fanout);
    cursor += fanout;
    wavesExecuted += 1;

    const settled = await Promise.allSettled(
      waveQueries.map(async (q) => {
        const sourceResult = await searchExecutor(q, {
          mode,
          anchorQuery: anchorQuery || selected[0] || '',
          wave: wavesExecuted,
          timeframe: options.timeframe,
          days: options.days
        });
        return {
          query: q,
          totalCount: sourceResult.items.length,
          incompleteResults: false,
          partialFailure: sourceResult.partialFailure,
          sourceCounts: sourceResult.sourceCounts,
          sourceAttempts: sourceResult.sourceAttempts,
          items: sourceResult.items
        };
      })
    );

    settled.forEach((entry, idx) => {
      const q = waveQueries[idx];
      if (entry.status === 'fulfilled') {
        const val = entry.value;
        records.push(...val.items);
        incompleteResults = incompleteResults || Boolean(val.incompleteResults);
        partialFailure = partialFailure || Boolean(val.partialFailure);
        Object.entries(val.sourceCounts || {}).forEach(([source, count]) => {
          aggregatedSourceCounts[source] = Number(aggregatedSourceCounts[source] || 0) + Number(count || 0);
        });
        attempts.push({
          query: q,
          success: true,
          resultCount: val.items.length,
          totalCount: val.totalCount,
          incompleteResults: val.incompleteResults,
          sourceCounts: val.sourceCounts,
          sourceAttempts: val.sourceAttempts,
          partialFailure: val.partialFailure
        });
      } else {
        partialFailure = true;
        attempts.push({
          query: q,
          success: false,
          resultCount: 0,
          error: entry.reason?.message || String(entry.reason || 'unknown_error')
        });
      }
    });

    const dedupedCount = dedupeByName(records).length;
    const reachedDistinctSources = Object.values(aggregatedSourceCounts)
      .filter((count) => Number(count || 0) > 0)
      .length;
    const meetsSourceDiversity = reachedDistinctSources >= minSources;

    if (dedupedCount >= minResults && meetsSourceDiversity) {
      break;
    }

    if (
      dedupedCount >= minResults
      && !meetsSourceDiversity
      && !sourceCoverageBoostInjected
      && sourceCoverageBoostQueries.length > 0
    ) {
      const existing = new Set(selected.map((q) => normalizeText(q)));
      sourceCoverageBoostQueries.forEach((queryText) => {
        const key = normalizeText(queryText);
        if (!key || existing.has(key)) return;
        existing.add(key);
        selected.push(queryText);
      });
      sourceCoverageBoostInjected = true;
    }
  }

  const dedupedRecords = dedupeByName(records);

  const ranked = rankAndFilterRecords(dedupedRecords, {
    mode,
    anchorQuery: anchorQuery || selected[0] || '',
    minScore: options.minScore,
    hostPenalty: options.hostPenalty,
    hostWindowSize: options.hostWindowSize
  });
  const sourceDiversityCount = Object.values(aggregatedSourceCounts)
    .filter((count) => Number(count || 0) > 0)
    .length;

  return {
    attempts,
    repos: ranked.records,
    totalCount: records.length,
    rawCount: records.length,
    dedupedCount: dedupedRecords.length,
    filteredOutCount: ranked.droppedCount,
    blockedOutCount: ranked.blockedCount,
    filterRationale: ranked.filterRationale,
    filteredItems: ranked.filteredItems,
    sourceCounts: aggregatedSourceCounts,
    sourceDiversityCount,
    sourceDiversityTarget: minSources,
    sourceCoverageSatisfied: sourceDiversityCount >= minSources,
    sourceCoverageBoostInjected,
    wavesExecuted,
    incompleteResults,
    partialFailure: partialFailure || attempts.some((item) => !item.success)
  };
};

const buildIndustryFallback = (query, message) => ({
  query,
  results: [],
  meta: {
    source: 'mcp-web-aggregate',
    partialFailure: true,
    warning: message || 'fallback'
  }
});

const buildCompetitorFallback = (query, message) => ({
  query,
  competitors: [],
  meta: {
    sourceCounts: {},
    sourcesUsed: [],
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
      const q = normalizeDisplayText(query);
      const candidates = [
        `${q} \u884c\u4e1a \u8d8b\u52bf`,
        `${q} market trend`,
        `${q} \u884c\u4e1a \u5206\u6790`,
        `${q} industry outlook`
      ];

      const fanout = await runSearchFanout(candidates, MCP_INDUSTRY_FANOUT, {
        mode: 'industry',
        anchorQuery: q,
        minScore: 1.2
      });
      const refs = fanout.repos
        .slice(0, MCP_RESULT_LIMIT);

      if (refs.length === 0) {
        return toToolResult(buildIndustryFallback(q, 'no_repo_results'));
      }

      const results = refs.map((item) => ({
        name: item.name,
        trend: 'stable',
          source: item.source || 'web',
          relevanceScore: item.relevanceScore,
          baseRelevanceScore: item.baseRelevanceScore,
          authority: item.authority,
          reasonCodes: item.reasonCodes,
          url: item.url,
          summary: item.description
        }));

      return toToolResult({
        query: q,
        results,
        meta: {
          source: 'mcp-web-aggregate',
          totalCount: fanout.totalCount,
          dedupedCount: fanout.dedupedCount,
          sourceCounts: fanout.sourceCounts,
          sourcesUsed: Object.keys(fanout.sourceCounts || {}),
          sourceDiversityCount: fanout.sourceDiversityCount,
          sourceDiversityTarget: fanout.sourceDiversityTarget,
          sourceCoverageSatisfied: fanout.sourceCoverageSatisfied,
          sourceCoverageBoostInjected: fanout.sourceCoverageBoostInjected,
          filteredOutCount: fanout.filteredOutCount,
          blockedOutCount: fanout.blockedOutCount,
          filterRationale: fanout.filterRationale,
          filteredItems: fanout.filteredItems,
          wavesExecuted: fanout.wavesExecuted,
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
      const q = normalizeDisplayText(query);
      const candidates = [
        `${q} competitor brand`,
        `${q} rival`,
        `${q} \u7ade\u54c1`,
        `${q} \u540c\u7c7b \u54c1\u724c`
      ];

      const fanout = await runSearchFanout(candidates, MCP_COMPETITOR_FANOUT, {
        mode: 'competitor',
        anchorQuery: q,
        minScore: 1.8
      });
      const competitors = fanout.repos
        .slice(0, MCP_RESULT_LIMIT)
        .map((item) => ({
          name: item.name,
          description: item.description,
          url: item.url,
          source: item.source || 'web',
          relevanceScore: item.relevanceScore,
          baseRelevanceScore: item.baseRelevanceScore,
          authority: item.authority,
          reasonCodes: item.reasonCodes
        }));

      if (competitors.length === 0) {
        return toToolResult(buildCompetitorFallback(q, 'no_repo_results'));
      }

      const finalSourceCounts = countSources(competitors);
      const avgRelevanceScore = Number((
        competitors.reduce((sum, item) => sum + Number(item?.relevanceScore || 0), 0) / competitors.length
      ).toFixed(3));

      return toToolResult({
        query: q,
        competitors,
        meta: {
          sourceCounts: finalSourceCounts,
          sourcesUsed: Object.keys(finalSourceCounts),
          avgRelevanceScore,
          coverageSourceCounts: fanout.sourceCounts,
          sourceDiversityCount: fanout.sourceDiversityCount,
          sourceDiversityTarget: fanout.sourceDiversityTarget,
          sourceCoverageSatisfied: fanout.sourceCoverageSatisfied,
          sourceCoverageBoostInjected: fanout.sourceCoverageBoostInjected,
          filteredOutCount: fanout.filteredOutCount,
          blockedOutCount: fanout.blockedOutCount,
          filterRationale: fanout.filterRationale,
          filteredItems: fanout.filteredItems,
          dedupedCount: fanout.dedupedCount,
          wavesExecuted: fanout.wavesExecuted,
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
        `${term} \u5e02\u573a \u62a5\u544a`,
        `${term} \u884c\u4e1a \u62a5\u544a`,
        `${term} market intelligence`,
        `${term} industry outlook`
      ], 2, {
        mode: 'market_report',
        anchorQuery: term,
        minScore: 1.4
      });

      const refs = fanout.repos
        .slice(0, 8)
        .map((item) => ({
          name: item.name,
          url: item.url,
            summary: item.description,
            relevanceScore: item.relevanceScore,
            baseRelevanceScore: item.baseRelevanceScore,
            authority: item.authority,
            reasonCodes: item.reasonCodes
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
          sourceCounts: fanout.sourceCounts,
          sourcesUsed: Object.keys(fanout.sourceCounts || {}),
          sourceDiversityCount: fanout.sourceDiversityCount,
          sourceDiversityTarget: fanout.sourceDiversityTarget,
          sourceCoverageSatisfied: fanout.sourceCoverageSatisfied,
          sourceCoverageBoostInjected: fanout.sourceCoverageBoostInjected,
          filteredOutCount: fanout.filteredOutCount,
          blockedOutCount: fanout.blockedOutCount,
          filterRationale: fanout.filterRationale,
          filteredItems: fanout.filteredItems,
          dedupedCount: fanout.dedupedCount,
          wavesExecuted: fanout.wavesExecuted,
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
        `${term} investor relations`,
        `${term} annual report`,
        `${term} \u8d22\u62a5`,
        `${term} earnings`
      ], 2, {
        mode: 'financial_data',
        anchorQuery: term,
        minScore: 1.2
      });

      const refs = fanout.repos
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
          url: item.url,
          relevanceScore: item.relevanceScore,
          baseRelevanceScore: item.baseRelevanceScore,
          authority: item.authority,
          reasonCodes: item.reasonCodes
        })),
        meta: {
          source: 'mcp-web-aggregate',
          sourceCounts: fanout.sourceCounts,
          sourcesUsed: Object.keys(fanout.sourceCounts || {}),
          sourceDiversityCount: fanout.sourceDiversityCount,
          sourceDiversityTarget: fanout.sourceDiversityTarget,
          sourceCoverageSatisfied: fanout.sourceCoverageSatisfied,
          sourceCoverageBoostInjected: fanout.sourceCoverageBoostInjected,
          filteredOutCount: fanout.filteredOutCount,
          blockedOutCount: fanout.blockedOutCount,
          filterRationale: fanout.filterRationale,
          filteredItems: fanout.filteredItems,
          dedupedCount: fanout.dedupedCount,
          wavesExecuted: fanout.wavesExecuted,
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

server.registerTool(
  'fetch_regulatory_filings',
  {
    description: 'Fetch regulatory filing references for a company',
    inputSchema: {
      company: z.string().min(1),
      ticker: z.string().optional(),
      timeframe: z.string().optional()
    }
  },
  async ({ company, ticker, timeframe }) => {
    try {
      const companyName = String(company || '').trim();
      const tickerCode = String(ticker || '').trim();
      const timeframeValue = String(timeframe || '').trim();
      const timeframeQuerySuffix = timeframeValue ? ` ${timeframeValue}` : '';
      const term = tickerCode ? `${companyName} ${tickerCode}`.trim() : companyName;

      const [edgarResult, fanout] = await Promise.all([
        fetchEdgarRecentFilingsFromMcp({
          company: companyName,
          ticker: tickerCode,
          timeframe: timeframeValue
        }),
        runSearchFanout([
          `${term} SEC filing${timeframeQuerySuffix}`.trim(),
          `${term} 10-K${timeframeQuerySuffix}`.trim(),
          `${term} 10-Q${timeframeQuerySuffix}`.trim(),
          `${term} regulatory filing${timeframeQuerySuffix}`.trim()
        ], 2, {
          mode: 'financial_data',
          anchorQuery: term,
          minScore: 1.2
        })
      ]);

      const prioritizedEdgarRecords = (Array.isArray(edgarResult.filings) ? edgarResult.filings : []).map((item) => ({
        name: item.name,
        description: item.description,
        url: item.url,
        source: 'edgar_mcp',
        publishedAt: item.publishedAt || item.filingDate,
        relevanceScore: Number(item.relevanceScore || 9.8),
        baseRelevanceScore: Number(item.baseRelevanceScore || 9.8),
        authority: item.authority || {
          tier: 'filing',
          weight: 0.65,
          reasonCode: 'authority_promoted_filings'
        },
        reasonCodes: [...new Set([
          ...(Array.isArray(item.reasonCodes) ? item.reasonCodes : []),
          'authority_promoted_filings',
          'edgar_mcp_direct'
        ])]
      }));

      const mergedRecords = dedupeByName([
        ...prioritizedEdgarRecords,
        ...fanout.repos
      ]);

      const sourceCounts = {
        ...(fanout.sourceCounts || {})
      };
      if (prioritizedEdgarRecords.length > 0) {
        sourceCounts.edgar_mcp = prioritizedEdgarRecords.length;
      }
      const sourcesUsed = Object.keys(sourceCounts).filter((sourceName) => Number(sourceCounts[sourceName] || 0) > 0);
      const sourceDiversityCount = sourcesUsed.length;
      const sourceDiversityTarget = Number(fanout.sourceDiversityTarget || 0);

      const filings = mergedRecords
        .slice(0, 10)
        .map((item) => ({
          name: item.name,
          url: item.url,
          summary: item.description,
          source: item.source || 'web',
          relevanceScore: item.relevanceScore,
          baseRelevanceScore: item.baseRelevanceScore,
          authority: item.authority,
          reasonCodes: item.reasonCodes
        }));

      return toToolResult({
        company: companyName,
        ticker: tickerCode || undefined,
        timeframe: timeframeValue || 'latest',
        filingCount: filings.length,
        fillingCount: filings.length,
        filings,
        references: filings,
        meta: {
          source: 'mcp-web-aggregate',
          primaryRegulatorySource: prioritizedEdgarRecords.length > 0 ? 'edgar_mcp' : 'web_fanout',
          edgar: {
            enabled: edgarResult.enabled,
            used: edgarResult.used,
            identifier: edgarResult.identifier || undefined,
            days: edgarResult.days,
            resultCount: prioritizedEdgarRecords.length,
            partialFailure: edgarResult.partialFailure,
            attempts: edgarResult.attempts
          },
          sourceCounts,
          sourcesUsed,
          sourceDiversityCount,
          sourceDiversityTarget,
          sourceCoverageSatisfied: sourceDiversityTarget > 0
            ? sourceDiversityCount >= sourceDiversityTarget
            : fanout.sourceCoverageSatisfied,
          sourceCoverageBoostInjected: fanout.sourceCoverageBoostInjected,
          filteredOutCount: fanout.filteredOutCount,
          blockedOutCount: fanout.blockedOutCount,
          filterRationale: fanout.filterRationale,
          filteredItems: fanout.filteredItems,
          dedupedCount: mergedRecords.length,
          wavesExecuted: fanout.wavesExecuted,
          partialFailure: Boolean(fanout.partialFailure || edgarResult.partialFailure),
          totalCount: Number(fanout.totalCount || 0) + prioritizedEdgarRecords.length,
          incompleteResults: fanout.incompleteResults,
          attempts: [
            ...(Array.isArray(edgarResult.attempts) ? edgarResult.attempts : []),
            ...(Array.isArray(fanout.attempts) ? fanout.attempts : [])
          ]
        }
      });
    } catch (err) {
      return toToolResult({
        company: String(company || ''),
        ticker: String(ticker || '').trim() || undefined,
        timeframe: String(timeframe || '').trim() || 'latest',
        filingCount: 0,
        fillingCount: 0,
        filings: [],
        references: [],
        meta: {
          source: 'mcp-web-aggregate',
          partialFailure: true,
          warning: err?.message || 'regulatory_filings_failed'
        }
      });
    }
  }
);

server.registerTool(
  'fetch_news_stream',
  {
    description: 'Fetch ranked news stream references for a query',
    inputSchema: {
      query: z.string().min(1),
      timeframe: z.string().optional(),
      limit: z.coerce.number().int().positive().max(20).optional()
    }
  },
  async ({ query, timeframe, limit }) => {
    try {
      const q = String(query || '').trim();
      const timeframeValue = String(timeframe || '').trim();
      const timeframeDays = parseTimeframeToDays(timeframeValue, 30);
      const cappedLimit = parsePositiveInt(limit, 10, 20);
      const entityAliases = resolveEntityAliases(q);
      const anchorQuery = [q, ...entityAliases].filter(Boolean).join(' ').trim() || q;
      const effectiveQueries = buildNewsSearchQueries(q, entityAliases);

      let fanout = await runSearchFanout(effectiveQueries, 2, {
        mode: 'news_stream',
        anchorQuery,
        minScore: 1.1,
        timeframe: timeframeValue || undefined,
        days: timeframeDays
      });
      let effectiveTimeframeDays = timeframeDays;
      let timeframeExpanded = false;

      if ((Array.isArray(fanout.repos) ? fanout.repos.length : 0) === 0 && timeframeDays < 45) {
        const expandedDays = Math.min(120, Math.max(45, timeframeDays * 3));
        const expandedFanout = await runSearchFanout(effectiveQueries, 2, {
          mode: 'news_stream',
          anchorQuery,
          minScore: 1.1,
          timeframe: `${expandedDays}d`,
          days: expandedDays
        });
        if ((Array.isArray(expandedFanout.repos) ? expandedFanout.repos.length : 0) > 0) {
          fanout = expandedFanout;
          effectiveTimeframeDays = expandedDays;
          timeframeExpanded = true;
        }
      }

      const news = fanout.repos
        .slice(0, cappedLimit)
        .map((item) => ({
          title: item.name,
          url: item.url,
          summary: item.description,
          source: item.source || 'web',
          relevanceScore: item.relevanceScore,
          baseRelevanceScore: item.baseRelevanceScore,
          authority: item.authority,
          reasonCodes: item.reasonCodes
        }));

      return toToolResult({
        query: q,
        timeframe: timeframeValue || 'latest',
        count: news.length,
        sources: Object.keys(fanout.sourceCounts || {}).filter((sourceName) => Number(fanout.sourceCounts?.[sourceName] || 0) > 0),
        news,
        references: news.map((item) => ({
          name: item.title || '',
          url: item.url,
          summary: item.summary,
          source: item.source,
          relevanceScore: item.relevanceScore,
          baseRelevanceScore: item.baseRelevanceScore,
          authority: item.authority,
          reasonCodes: item.reasonCodes
        })),
        meta: {
          limit: cappedLimit,
          timeframeDays: effectiveTimeframeDays,
          requestedTimeframeDays: timeframeDays,
          timeframeExpanded,
          entityAliases,
          source: 'mcp-web-aggregate',
          sourceCounts: fanout.sourceCounts,
          sourcesUsed: Object.keys(fanout.sourceCounts || {}),
          sourceDiversityCount: fanout.sourceDiversityCount,
          sourceDiversityTarget: fanout.sourceDiversityTarget,
          sourceCoverageSatisfied: fanout.sourceCoverageSatisfied,
          sourceCoverageBoostInjected: fanout.sourceCoverageBoostInjected,
          filteredOutCount: fanout.filteredOutCount,
          blockedOutCount: fanout.blockedOutCount,
          filterRationale: fanout.filterRationale,
          filteredItems: fanout.filteredItems,
          dedupedCount: fanout.dedupedCount,
          wavesExecuted: fanout.wavesExecuted,
          partialFailure: fanout.partialFailure,
          totalCount: fanout.totalCount,
          incompleteResults: fanout.incompleteResults,
          attempts: fanout.attempts
        }
      });
    } catch (err) {
      return toToolResult({
        query: String(query || ''),
        timeframe: String(timeframe || '').trim() || 'latest',
        news: [],
        references: [],
        meta: {
          limit: parsePositiveInt(limit, 10, 20),
          source: 'mcp-web-aggregate',
          partialFailure: true,
          warning: err?.message || 'news_stream_failed'
        }
      });
    }
  }
);

server.registerTool(
  'fetch_web_page',
  {
    description: 'Fetch and extract full content from a web page URL with retry mechanism',
    inputSchema: {
      url: z.string().url(),
      max_retries: z.coerce.number().int().min(0).max(3).optional()
    }
  },
  async ({ url, max_retries }) => {
    const targetUrl = String(url || '').trim();
    if (!targetUrl) {
      return toToolResult({ url: '', success: false, error: 'url_required' });
    }

    const maxRetries = parsePositiveInt(max_retries, 2, 3);
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(targetUrl, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        });

        if (!response.ok) {
          lastError = `http_${response.status}`;
          if (response.status === 403 || response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            continue;
          }
          return toToolResult({ url: targetUrl, success: false, error: lastError, statusCode: response.status, attempts: attempt + 1 });
        }

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        const title = titleMatch ? decodeHtml(titleMatch[1]) : '';

        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
        const description = descMatch ? decodeHtml(descMatch[1]) : '';

        const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i);
        const keywords = keywordsMatch ? decodeHtml(keywordsMatch[1]) : '';

        let content = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return toToolResult({
          url: targetUrl,
          success: true,
          title,
          description,
          keywords,
          content,
          contentLength: content.length,
          htmlLength: html.length,
          attempts: attempt + 1
        });
      } catch (err) {
        lastError = err?.message || 'fetch_failed';
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
      }
    }

    return toToolResult({
      url: targetUrl,
      success: false,
      error: lastError,
      attempts: maxRetries + 1
    });
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('chayan-search-mcp running on stdio');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('mcp-server startup error:', error);
    process.exit(1);
  });
}

module.exports = {
  scoreRecordRelevance,
  rankAndFilterRecords,
  runSearchFanout
};
