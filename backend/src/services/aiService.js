const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { toBoolean, parsePositiveInt } = require('../utils/coercion');
const { normalizeList, extractDisplayLabel, uniqueNonEmpty } = require('../utils/math');
const {
  normalizeProtocol,
  resolveResponsesEndpoint,
  shouldForceResponsesStream,
  responsesTokenKey,
  resolveResponsesTokenKeyOverride,
  overrideResponsesTokenKey,
  buildResponsesRequestPayload,
  extractResponsesText,
  normalizeResponsesFinishReason,
  extractResponsesFunctionCalls,
  createResponsesSseParser
} = require('./openaiResponsesAdapter');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ANALYSIS_PROMPT_VERSION = 'market-intel-v2.2';
const SETTINGS_FILE = path.join(__dirname, '../../data/ai-settings.json');
const PERSISTED_SETTINGS_CACHE_TTL_MS = 1000;

const resolveQualityFlags = (config = {}) => ({
  qualityContractEnabled: toBoolean(config.qualityContractEnabled, true),
  qualityStrictMode: toBoolean(config.qualityStrictMode, false),
  qualityMinCoverageSources: parsePositiveInt(config.qualityMinCoverageSources, 2, 12),
  version: typeof config.qualityPolicyVersion === 'string' && config.qualityPolicyVersion.trim()
    ? config.qualityPolicyVersion.trim().slice(0, 80)
    : 'quality-policy-v1'
});

const emitQualityTelemetry = (eventName, payload) => {
  if (typeof logger.emitQualityEvent === 'function') {
    return logger.emitQualityEvent(eventName, payload);
  }
  logger.info('quality_event', {
    eventName,
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),
    ...payload
  });
  return null;
};

const buildSafeErrorPayload = (err, fallbackStatus = 0) => ({
  status: Number.parseInt(String(err?.status || fallbackStatus), 10) || fallbackStatus,
  limitHint: String(err?.limitHint || '').slice(0, 120) || null,
  retryAfterSec: parsePositiveInt(err?.retryAfterSec, 0, 600),
  message: String(err?.message || 'unknown_error').slice(0, 200)
});

const CLAIM_SUPPORT_REPAIR_MAX_ATTEMPTS = 1;
const CLAIM_SUPPORT_MAX_UNSUPPORTED_SAMPLES = 3;
const CLAIM_SUPPORT_MIN_CLAIM_LENGTH = 8;
const CLAIM_SIGNAL_PATTERN = /(\d|%|同比|增长|下降|排名|市场|营收|利润|报告|数据显示|according|source|forecast|estimate)/i;
const CLAIM_HYPOTHESIS_TAG_PATTERN = /(?:\[\s*(?:hypothesis|假设)\s*\]|【\s*假设\s*】)/i;
const CLAIM_INFERENCE_TAG_PATTERN = /(?:\[\s*(?:inference|推断)\s*\]|【\s*推断\s*】)/i;
const CLAIM_TEMPLATE_INSTRUCTION_PATTERN = /(?:\u8bc4\u5206\u89c4\u5219|\u53ef\u590d\u73b0|\u8f93\u51fa\u683c\u5f0f|\u81f3\u5c11\d+\s*[\u6761\u4e2a]|\u542b\u9002\u7528\u573a\u666f|\u540c\u884c\u5bf9\u6807\u53ef\u6267\u884c\u7b56\u7565|(?:^|[\-\u2022]\s*)\u7b56\u7565\s*\d+\s*[:\uff1a]|(?:^|[\-\u2022]\s*)\u9009\u9879\s*[A-Da-d\uff21-\uff24\uff41-\uff44\u2460-\u2463\d]+\s*[:\uff1a]|(?:^|[\-\u2022]\s*)(?:\u52a8\u4f5c|\u8d1f\u8d23\u4eba|\u8d44\u6e90|kpi|\u91cc\u7a0b\u7891|\u5efa\u8bae\u52a8\u4f5c)\s*[:\uff1a]|(?:^|[\-\u2022]\s*)(?:\u5f71\u54cd|\u53ef\u884c\u6027|\u6210\u672c|\u98ce\u9669)\s*\d+|(?:^|[\-\u2022]\s*)\u6e20\u9053\u6570\u636e\s*[:\uff1a]|^p[0-3]\b(?:\s*[\(\uff08].*)?$|scoring\s*rule|output\s*format|at\s+least\s+\d+|(?:^|[\-\u2022]\s*)option\s*[A-Da-d1-4]\s*:|(?:^|[\-\u2022]\s*)(?:action|owner|resource|milestone|kpi|recommended\s+action)\s*:|(?:^|[\-\u2022]\s*)(?:impact|feasibility|cost|risk)\s*\d+|(?:^|[\-\u2022]\s*)channel\s+data\s*:)/i;
const CLAIM_PLACEHOLDER_REFERENCE_PATTERN = /`[^`]*(?:peers?|externalEvidence|marketReport|financialData|industryData|competitorData|modelResult|uploaded)[^`]*`/i;
const CLAIM_SECTION_LINE_PATTERN = /^\s*(?:#{1,6}\s+|(?:\d+|[一二三四五六七八九十]{1,3})(?:[.)]|、)\s*)/;
const CLAIM_SECTION_KEYWORDS = [
  '高管摘要',
  '关键洞察',
  '模型结果解读',
  '竞品',
  '战略选项',
  '行动路线',
  '数据缺口',
  'executive summary',
  'key insights',
  'model interpretation',
  'competitive benchmark',
  'strategy options',
  'roadmap',
  'data gaps'
];

const normalizeClaimText = (value) => String(value || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const isClaimSupportStructuralNoise = (value) => {
  const line = String(value || '').trim();
  if (!line) return true;
  if (/^```/.test(line)) return true;
  if (line.startsWith('**') && line.endsWith('**')) return true;
  if (/^\*{1,2}[^*]{1,80}\*{1,2}[:：]?$/.test(line)) return true;
  if (CLAIM_HYPOTHESIS_TAG_PATTERN.test(line)) return true;
  if (CLAIM_TEMPLATE_INSTRUCTION_PATTERN.test(line)) return true;
  if (CLAIM_PLACEHOLDER_REFERENCE_PATTERN.test(line)) return true;

  const normalized = normalizeClaimText(line);
  if (!normalized) return true;

  if (CLAIM_SECTION_LINE_PATTERN.test(line)) {
    const hitSectionKeyword = CLAIM_SECTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
    const hasSentencePunctuation = /[。！？?]/.test(line);
    if (hitSectionKeyword || !hasSentencePunctuation) {
      return true;
    }
  }

  return false;
};

const isClaimSupportInferenceLine = (value) => {
  const line = String(value || '').trim();
  if (!line) return false;
  return CLAIM_INFERENCE_TAG_PATTERN.test(line);
};

const addEvidenceAnchor = (anchorSet, value) => {
  const normalized = normalizeClaimText(value);
  if (!normalized || normalized.length < 2) return;
  anchorSet.add(normalized.slice(0, 140));
  normalized
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 2)
    .slice(0, 8)
    .forEach((token) => {
      anchorSet.add(token);
    });
};

const collectEvidenceAnchors = (payload = {}) => {
  const anchors = new Set();
  const addList = (items, mapper) => {
    normalizeList(items).forEach((item) => {
      const values = mapper(item);
      values.forEach((value) => {
        addEvidenceAnchor(anchors, value);
      });
    });
  };

  addEvidenceAnchor(anchors, payload?.target);
  normalizeList(payload?.industryNames).forEach((item) => {
    addEvidenceAnchor(anchors, item);
  });
  normalizeList(payload?.competitorNames).forEach((item) => {
    addEvidenceAnchor(anchors, item);
  });
  normalizeList(payload?.keyFindings).forEach((item) => {
    addEvidenceAnchor(anchors, item);
  });

  addList(payload?.peers, (item) => [item?.name, item?.industry]);
  addList(payload?.peerResearch, (item) => [item?.name, item?.source, item?.summary, item?.description]);
  addList(payload?.marketReport?.references, (item) => [item?.name, item?.summary, item?.description, item?.url]);
  addList(payload?.financialData?.references, (item) => [item?.name, item?.summary, item?.description, item?.url]);
  addList(payload?.companyIntelligence?.targetFinancial?.references, (item) => [item?.name, item?.summary, item?.description, item?.url]);
  addList(payload?.companyIntelligence?.targetRegulatoryFilings?.references, (item) => [item?.name, item?.summary, item?.description, item?.url]);
  addList(payload?.companyIntelligence?.consumerInsights?.references, (item) => [item?.name, item?.summary, item?.description, item?.url]);
  addList(payload?.companyIntelligence?.peerFinancials, (item) => [item?.company]);
  addList(
    normalizeList(payload?.companyIntelligence?.peerFinancials).flatMap((item) => normalizeList(item?.references)),
    (item) => [item?.name, item?.summary, item?.description, item?.url]
  );
  addList(payload?.companyIntelligence?.consumerInsights?.primaryAgeRanges, (item) => [item?.range]);
  addList(payload?.companyIntelligence?.consumerInsights?.primarySegments, (item) => [item?.segment]);

  return anchors;
};

const normalizeCompetitorName = (value) => String(value || '')
  .replace(/["'`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parseCompetitorCandidatesFromText = (text, maxCandidates = 8) => {
  const rawText = String(text || '').trim();
  if (!rawText) return [];

  const candidateBuckets = [];
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    candidateBuckets.push(codeBlockMatch[1].trim());
  }
  candidateBuckets.push(rawText);

  const parsedNames = [];
  candidateBuckets.forEach((candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const name = typeof item === 'string'
            ? item
            : (item?.name || item?.company || item?.brand || '');
          if (name) parsedNames.push(name);
        });
        return;
      }

      const list = parsed?.competitors || parsed?.companies || parsed?.items || [];
      if (Array.isArray(list)) {
        list.forEach((item) => {
          const name = typeof item === 'string'
            ? item
            : (item?.name || item?.company || item?.brand || '');
          if (name) parsedNames.push(name);
        });
      }
    } catch {
      // Non-JSON fallback handled below.
    }
  });

  if (parsedNames.length === 0) {
    rawText
      .split(/[\n,;|]/)
      .map((item) => item.replace(/^\s*[-*0-9.)]+\s*/, '').trim())
      .filter(Boolean)
      .forEach((item) => parsedNames.push(item));
  }

  return uniqueNonEmpty(parsedNames.map(normalizeCompetitorName))
    .filter((name) => name.length >= 2 && name.length <= 60)
    .slice(0, Math.max(1, maxCandidates));
};

const DEMOGRAPHIC_SEGMENT_SIGNALS = [
  { segment: 'Gen Z', patterns: ['gen z', 'z generation', 'z-gen', 'zers'] },
  { segment: 'Gen Z', patterns: ['z\u4e16\u4ee3', '\u5e74\u8f7b\u4eba', '\u9752\u5e74\u7528\u6237'] },
  { segment: 'Millennials', patterns: ['millennial', 'gen y'] },
  { segment: 'Millennials', patterns: ['90\u540e', '80\u540e'] },
  { segment: 'Gen X', patterns: ['gen x'] },
  { segment: 'Students', patterns: ['student', 'campus', 'college'] },
  { segment: 'Students', patterns: ['\u5b66\u751f', '\u5927\u5b66\u751f', '\u9ad8\u6821', '\u6821\u56ed'] },
  { segment: 'White collar', patterns: ['white collar', 'office worker', 'professional'] },
  { segment: 'White collar', patterns: ['\u767d\u9886', '\u4e0a\u73ed\u65cf', '\u804c\u573a\u4eba'] },
  { segment: 'Parents', patterns: ['parent', 'family household', 'new parents'] },
  { segment: 'Parents', patterns: ['\u5b9d\u5988', '\u5b9d\u7238', '\u5bb6\u5ead\u7528\u6237', '\u4eb2\u5b50'] },
  { segment: 'Urban consumers', patterns: ['urban consumer', 'tier-1 city', 'metro'] },
  { segment: 'Urban consumers', patterns: ['\u4e00\u7ebf\u57ce\u5e02', '\u65b0\u4e00\u7ebf', '\u90fd\u5e02\u4eba\u7fa4'] },
  { segment: 'Sinking-market consumers', patterns: ['\u4e0b\u6c89\u5e02\u573a', '\u53bf\u57df', '\u4e09\u56db\u7ebf\u57ce\u5e02'] },
  { segment: 'New middle class', patterns: ['\u65b0\u4e2d\u4ea7', '\u4e2d\u4ea7\u4eba\u7fa4'] },
  { segment: 'Value seekers', patterns: ['price sensitive', 'value seeker', 'budget-conscious'] },
  { segment: 'Value seekers', patterns: ['\u6027\u4ef7\u6bd4', '\u4ef7\u683c\u654f\u611f', '\u7406\u6027\u6d88\u8d39'] },
  { segment: 'Premium consumers', patterns: ['premium', 'affluent', 'high income'] },
  { segment: 'Premium consumers', patterns: ['\u9ad8\u51c0\u503c', '\u9ad8\u6536\u5165', '\u54c1\u8d28\u6d88\u8d39'] },
  { segment: 'Female consumers', patterns: ['female consumer', 'women consumer', 'women buyer'] },
  { segment: 'Female consumers', patterns: ['\u5973\u6027\u6d88\u8d39\u8005', '\u5973\u6027\u7528\u6237'] },
  { segment: 'Male consumers', patterns: ['male consumer', 'men consumer', 'men buyer'] },
  { segment: 'Male consumers', patterns: ['\u7537\u6027\u6d88\u8d39\u8005', '\u7537\u6027\u7528\u6237'] }
];

const buildReferenceKey = (item = {}) => {
  const url = String(item?.url || '').trim().toLowerCase();
  const name = String(item?.name || item?.title || '').trim().toLowerCase();
  return `${url}|${name}`;
};

const normalizeReferenceRecord = (item = {}) => {
  const name = String(item?.name || item?.title || '').trim();
  const url = String(item?.url || '').trim();
  if (!name && !url) return null;
  return {
    name: name.slice(0, 180),
    url: url.slice(0, 520),
    summary: String(item?.summary || item?.description || '').trim().slice(0, 280),
    source: String(item?.source || '').trim() || undefined,
    relevanceScore: Number(item?.relevanceScore || 0),
    authority: item?.authority || undefined,
    reasonCodes: Array.isArray(item?.reasonCodes) ? item.reasonCodes : undefined
  };
};

const dedupeReferenceRecords = (items = [], limit = 20) => {
  const maxItems = parsePositiveInt(limit, 20, 100);
  const map = new Map();
  normalizeList(items).forEach((item) => {
    const normalized = normalizeReferenceRecord(item);
    if (!normalized) return;
    const key = buildReferenceKey(normalized);
    if (!key.trim()) return;
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  });
  return Array.from(map.values()).slice(0, maxItems);
};

const extractConsumerSignals = (references = []) => {
  const ageRangeCounts = new Map();
  const segmentCounts = new Map();
  const agePattern = /(?<!\d)(1[0-9]|[2-6][0-9])\s*(?:-|~|to|\u81f3|\u5230)\s*(1[0-9]|[2-6][0-9])(?:\s*(?:years?\s*old|yo|\u5c81))?/giu;

  normalizeList(references).forEach((item) => {
    const name = String(item?.name || item?.title || '');
    const summary = String(item?.summary || item?.description || '');
    const rawText = `${name} ${summary}`;
    const text = rawText.toLowerCase();

    const matches = rawText.matchAll(agePattern);
    for (const match of matches) {
      const low = Number.parseInt(String(match?.[1] || ''), 10);
      const high = Number.parseInt(String(match?.[2] || ''), 10);
      if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
      if (low >= high || low < 10 || high > 70) continue;
      if ((high - low) > 35) continue;
      const range = `${low}-${high}`;
      ageRangeCounts.set(range, Number(ageRangeCounts.get(range) || 0) + 1);
    }

    DEMOGRAPHIC_SEGMENT_SIGNALS.forEach((signal) => {
      if (signal.patterns.some((pattern) => text.includes(pattern))) {
        segmentCounts.set(signal.segment, Number(segmentCounts.get(signal.segment) || 0) + 1);
      }
    });
  });

  return {
    primaryAgeRanges: Array.from(ageRangeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([range, count]) => ({ range, count })),
    primarySegments: Array.from(segmentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([segment, count]) => ({ segment, count }))
  };
};

const buildClaimSupportMetrics = (text, payload) => {
  const normalizedText = String(text || '');
  const evidenceAnchors = collectEvidenceAnchors(payload);
  const filteredClaims = normalizedText
    .split(/[。！？!?;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= CLAIM_SUPPORT_MIN_CLAIM_LENGTH)
    .filter((item) => !isClaimSupportStructuralNoise(item))
    .filter((item) => CLAIM_SIGNAL_PATTERN.test(item));
  const inferenceClaims = filteredClaims.filter((item) => isClaimSupportInferenceLine(item));
  const claims = filteredClaims.filter((item) => !isClaimSupportInferenceLine(item));

  if (evidenceAnchors.size === 0) {
    return {
      validationSkipped: true,
      skipReason: 'no_evidence_anchors',
      evidenceAnchorCount: 0,
      totalClaims: claims.length,
      supportedClaims: 0,
      unsupportedClaims: 0,
      supportRatio: 1,
      inferenceClaimCount: inferenceClaims.length,
      inferenceSamples: inferenceClaims.slice(0, CLAIM_SUPPORT_MAX_UNSUPPORTED_SAMPLES).map((item) => item.slice(0, 180)),
      unsupportedSamples: []
    };
  }

  let supportedClaims = 0;
  const unsupportedSamples = [];

  claims.forEach((claim) => {
    const normalizedClaim = normalizeClaimText(claim);
    const supported = Array.from(evidenceAnchors).some((anchor) => (
      anchor.length >= 2 && normalizedClaim.includes(anchor)
    ));
    if (supported) {
      supportedClaims += 1;
      return;
    }
    if (unsupportedSamples.length < CLAIM_SUPPORT_MAX_UNSUPPORTED_SAMPLES) {
      unsupportedSamples.push(claim.slice(0, 180));
    }
  });

  const totalClaims = claims.length;
  const unsupportedClaims = Math.max(0, totalClaims - supportedClaims);
  const supportRatio = totalClaims === 0 ? 1 : Number((supportedClaims / totalClaims).toFixed(4));

  return {
    validationSkipped: false,
    evidenceAnchorCount: evidenceAnchors.size,
    totalClaims,
    supportedClaims,
    unsupportedClaims,
    supportRatio,
    inferenceClaimCount: inferenceClaims.length,
    inferenceSamples: inferenceClaims.slice(0, CLAIM_SUPPORT_MAX_UNSUPPORTED_SAMPLES).map((item) => item.slice(0, 180)),
    unsupportedSamples
  };
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
  },
  {
    type: 'function',
    name: 'fetch_regulatory_filings',
    description: 'Fetch regulatory filing references for a company',
    parameters: {
      type: 'object',
      properties: {
        company: { type: 'string', minLength: 1 },
        ticker: { type: 'string' },
        timeframe: { type: 'string' }
      },
      required: ['company'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'fetch_news_stream',
    description: 'Fetch ranked news stream references for a query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        timeframe: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 }
      },
      required: ['query'],
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

const stableJsonStringify = (value) => {
  const normalize = (input) => {
    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }
    if (input && typeof input === 'object') {
      return Object.keys(input)
        .sort()
        .reduce((acc, key) => {
          acc[key] = normalize(input[key]);
          return acc;
        }, {});
    }
    return input;
  };

  try {
    return JSON.stringify(normalize(value));
  } catch {
    return JSON.stringify(String(value || ''));
  }
};

const ANALYSIS_SYSTEM_PROMPT = `# 角色
你是 Market Intelligence & Strategy Analyst。你需要基于输入数据输出专业、结构化、可执行的商业分析。

## 硬性规则
1. 仅使用输入 JSON 的证据字段，不得编造数据、结论或来源。
2. 每条关键结论必须标注 claim_type: 事实|推断|假设，并绑定 evidence_ids。
3. 所有量化结论必须附 evidence_ids；证据不足时必须写入 data_gaps，不能给确定性断言。
4. 输出需覆盖：市场、客户、产品、渠道、竞争、增长、财务、风险。
5. 模型解读必须包含 Entropy Weight + TOPSIS + Theil-Sen 的方法含义、驱动因素、边界和风险。

## 输出结构
请按以下结构输出（Markdown），并在关键项附 evidence_ids：
1) 高管摘要（<=3条）
2) 关键洞察（分模块，至少6个维度）
3) 模型结果解读
4) 竞品与同行对标（对象/优势/短板/建议动作）
5) 战略选项（2-4项，含影响/可行性/成本/风险评分）
6) 30/60/90天行动路线图
7) 数据缺口与补齐计划（P0/P1/P2）

语言要求：中文、专业、简洁、可落地。`;

class AIService {
  constructor() {
    this.mcpClient = null;
    this.persistedSettingsCache = {
      value: {},
      fileMtimeMs: 0,
      expiresAt: 0,
      hasValue: false
    };
  }

  readPersistedSettings() {
    const now = Date.now();
    if (this.persistedSettingsCache.hasValue && now < this.persistedSettingsCache.expiresAt) {
      return this.persistedSettingsCache.value;
    }

    try {
      const stats = fs.statSync(SETTINGS_FILE);
      const fileMtimeMs = Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : 0;

      if (
        this.persistedSettingsCache.hasValue
        && this.persistedSettingsCache.fileMtimeMs === fileMtimeMs
      ) {
        this.persistedSettingsCache.expiresAt = now + PERSISTED_SETTINGS_CACHE_TTL_MS;
        return this.persistedSettingsCache.value;
      }

      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.persistedSettingsCache = {
          value: parsed,
          fileMtimeMs,
          expiresAt: now + PERSISTED_SETTINGS_CACHE_TTL_MS,
          hasValue: true
        };
        return parsed;
      }

      this.persistedSettingsCache = {
        value: {},
        fileMtimeMs,
        expiresAt: now + PERSISTED_SETTINGS_CACHE_TTL_MS,
        hasValue: true
      };
    } catch (err) {
      if (err?.code === 'ENOENT') {
        this.persistedSettingsCache = {
          value: {},
          fileMtimeMs: 0,
          expiresAt: now + PERSISTED_SETTINGS_CACHE_TTL_MS,
          hasValue: true
        };
        return {};
      }

      logger.warn('Failed to read persisted AI settings:', err?.message || err);
      this.persistedSettingsCache = {
        value: {},
        fileMtimeMs: 0,
        expiresAt: now + PERSISTED_SETTINGS_CACHE_TTL_MS,
        hasValue: true
      };
    }
    return {};
  }

  normalizeConfigOverride(override) {
    if (!override || typeof override !== 'object') return null;

    const normalized = {};
    if (typeof override.apiEndpoint === 'string' && override.apiEndpoint.trim()) {
      normalized.baseURL = override.apiEndpoint.trim().replace(/\/+$/, '');
    }
    if (typeof override.apiKey === 'string') {
      normalized.apiKey = override.apiKey;
    }
    if (typeof override.model === 'string' && override.model.trim()) {
      normalized.model = override.model.trim();
    }
    if (typeof override.fallbackModel === 'string' && override.fallbackModel.trim()) {
      normalized.fallbackModel = override.fallbackModel.trim();
    }
    if (override.protocol !== undefined) {
      normalized.protocol = normalizeProtocol(override.protocol);
    }
    if (override.modelFallbacks !== undefined) {
      normalized.modelFallbacks = uniqueNonEmpty(
        (Array.isArray(override.modelFallbacks)
          ? override.modelFallbacks
          : String(override.modelFallbacks || '').split(','))
          .map((item) => String(item || '').trim())
      );
    }
    if (typeof override.secondaryApiEndpoint === 'string') {
      normalized.secondaryBaseURL = override.secondaryApiEndpoint.trim().replace(/\/+$/, '');
    }
    if (typeof override.secondaryApiKey === 'string') {
      normalized.secondaryApiKey = override.secondaryApiKey;
    }
    if (typeof override.secondaryModel === 'string') {
      normalized.secondaryModel = override.secondaryModel.trim();
    }
    if (override.secondaryProtocol !== undefined) {
      normalized.secondaryProtocol = normalizeProtocol(override.secondaryProtocol);
    }
    if (typeof override.tertiaryApiEndpoint === 'string') {
      normalized.tertiaryBaseURL = override.tertiaryApiEndpoint.trim().replace(/\/+$/, '');
    }
    if (typeof override.tertiaryApiKey === 'string') {
      normalized.tertiaryApiKey = override.tertiaryApiKey;
    }
    if (typeof override.tertiaryModel === 'string') {
      normalized.tertiaryModel = override.tertiaryModel.trim();
    }
    if (override.tertiaryProtocol !== undefined) {
      normalized.tertiaryProtocol = normalizeProtocol(override.tertiaryProtocol);
    }
    if (Number.isFinite(Number(override.temperature))) {
      normalized.temperature = Number(override.temperature);
    }
    if (Number.isFinite(Number(override.maxTokens))) {
      normalized.maxTokens = Number(override.maxTokens);
    }
    if (override.qualityContractEnabled !== undefined) {
      normalized.qualityContractEnabled = toBoolean(override.qualityContractEnabled, true);
    }
    if (override.qualityStrictMode !== undefined) {
      normalized.qualityStrictMode = toBoolean(override.qualityStrictMode, false);
    }
    if (override.qualityMinCoverageSources !== undefined) {
      normalized.qualityMinCoverageSources = parsePositiveInt(override.qualityMinCoverageSources, 2, 12);
    }
    if (typeof override.qualityPolicyVersion === 'string' && override.qualityPolicyVersion.trim()) {
      normalized.qualityPolicyVersion = override.qualityPolicyVersion.trim().slice(0, 80);
    }

    return normalized;
  }

  getAIConfig(configOverride = null) {
    const persisted = this.readPersistedSettings();
    const baseURL = String(process.env.AI_BASE_URL || persisted.apiEndpoint || 'https://gmn.chuangzuoli.com/v1/responses').replace(/\/+$/, '');
    const apiKey = process.env.AI_API_KEY || persisted.apiKey || 'sk-dff5b9f31c0e7ae501b74cf57f9d3887964fa6d7cf94e255209ad495611344b0';
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
    const useMock = false;
    const aiRequestTimeoutMs = parsePositiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 85000, 180000);
    const aiNarrativeTotalTimeoutMs = parsePositiveInt(process.env.AI_NARRATIVE_TOTAL_TIMEOUT_MS, 110000, 300000);
    const mcpToolTimeoutMs = parsePositiveInt(process.env.MCP_TOOL_TIMEOUT_MS, 12000, 240000);
    const aiRetryMaxAttempts = parsePositiveInt(process.env.AI_RETRY_MAX_ATTEMPTS, 2, 4);
    const aiRetryBaseDelayMs = parsePositiveInt(process.env.AI_RETRY_BASE_DELAY_MS, 1000, 10000);
    const qualityContractEnabled = toBoolean(
      process.env.AI_QUALITY_CONTRACT_ENABLED,
      toBoolean(persisted.qualityContractEnabled, true)
    );
    const qualityStrictMode = toBoolean(
      process.env.AI_QUALITY_STRICT_MODE,
      toBoolean(persisted.qualityStrictMode, false)
    );
    const qualityMinCoverageSources = parsePositiveInt(
      process.env.AI_QUALITY_MIN_COVERAGE_SOURCES,
      parsePositiveInt(persisted.qualityMinCoverageSources, 2, 12),
      12
    );
    const qualityPolicyVersion = String(
      process.env.AI_QUALITY_POLICY_VERSION || persisted.qualityPolicyVersion || 'quality-policy-v1'
    ).trim().slice(0, 80) || 'quality-policy-v1';

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

    const resolved = {
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
      qualityContractEnabled,
      qualityStrictMode,
      qualityMinCoverageSources,
      qualityPolicyVersion,
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

    const override = this.normalizeConfigOverride(configOverride);
    if (!override) return resolved;

    return {
      ...resolved,
      ...override,
      protocol: override.protocol || resolved.protocol,
      secondaryProtocol: override.secondaryProtocol || resolved.secondaryProtocol,
      tertiaryProtocol: override.tertiaryProtocol || resolved.tertiaryProtocol,
      modelFallbacks: Array.isArray(override.modelFallbacks) ? override.modelFallbacks : resolved.modelFallbacks
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
    return { query, results: [{ name: 'Sample Industry', trend: 'up', data: [] }] };
  }

  buildMockCompetitor(query) {
    return { query, competitors: [{ name: 'Competitor A', market_share: '15%' }] };
  }

  buildMockMarketReport() {
    return { report: 'Sample market report', date: new Date().toISOString() };
  }

  buildMockFinancialData(params) {
    return { company: params.company, revenue: 1000000, profit: 50000 };
  }

  buildMockRegulatoryFilings(params = {}) {
    const company = String(params?.company || '').trim();
    const ticker = String(params?.ticker || '').trim();
    const timeframe = String(params?.timeframe || '').trim() || 'latest';
    return {
      company,
      ...(ticker ? { ticker } : {}),
      timeframe,
      filings: [],
      meta: {
        source: 'mcp_mock_empty',
        partialFailure: true
      }
    };
  }

  buildMockNewsStream(params = {}) {
    const query = String(params?.query || '').trim();
    const timeframe = String(params?.timeframe || '').trim() || 'latest';
    const limit = parsePositiveInt(params?.limit, 10, 20);
    return {
      query,
      timeframe,
      news: [],
      meta: {
        limit,
        source: 'mcp_mock_empty',
        partialFailure: true
      }
    };
  }

  buildMcpFallbackPayload(toolName, args, reason = 'mcp_unavailable') {
    const query = typeof args === 'string' ? args : (args?.query || '');

    if (toolName === 'search_industry') {
      return {
        query,
        results: [],
        meta: {
          source: 'mcp_fallback_empty',
          partialFailure: true,
          reason
        }
      };
    }

    if (toolName === 'search_competitors') {
      return {
        query,
        competitors: [],
        meta: {
          sourceCounts: {},
          sourcesUsed: [],
          partialFailure: true,
          reason
        }
      };
    }

    if (toolName === 'fetch_market_report') {
      return {
        industry: String(args?.industry || args?.query || '').trim(),
        timeframe: String(args?.timeframe || 'latest'),
        report: 'No market references available from MCP fallback.',
        references: [],
        meta: {
          source: 'mcp_fallback_empty',
          partialFailure: true,
          reason
        }
      };
    }

    if (toolName === 'fetch_financial_data') {
      return {
        company: String(args?.company || '').trim(),
        repoCount: 0,
        indicators: {
          totalSignals: 0,
          developerAttentionScore: 0
        },
        references: [],
        meta: {
          source: 'mcp_fallback_empty',
          partialFailure: true,
          reason
        }
      };
    }

    if (toolName === 'fetch_regulatory_filings') {
      const company = String(args?.company || '').trim();
      const ticker = String(args?.ticker || '').trim();
      return {
        company,
        ...(ticker ? { ticker } : {}),
        timeframe: String(args?.timeframe || '').trim() || 'latest',
        filings: [],
        meta: {
          source: 'mcp_fallback_empty',
          partialFailure: true,
          reason
        }
      };
    }

    if (toolName === 'fetch_news_stream') {
      return {
        query: String(query || '').trim(),
        timeframe: String(args?.timeframe || '').trim() || 'latest',
        news: [],
        meta: {
          limit: parsePositiveInt(args?.limit, 10, 20),
          source: 'mcp_fallback_empty',
          partialFailure: true,
          reason
        }
      };
    }

    return {
      query,
      meta: {
        source: 'mcp_fallback_empty',
        partialFailure: true,
        reason
      }
    };
  }

  buildNarrativeFallback(input) {
    const target = input?.target || 'current target';
    const peers = (input?.peers || [])
      .slice(0, 3)
      .map((item) => `${item.name}(score ${item.topsisScore ?? '-'})`)
      .join(', ');
    const trend = input?.model?.trendLabel || 'stable';
    const trendSlope = input?.model?.trendSlope ?? 0;
    const topIndustries = (input?.uploaded?.topIndustries || [])
      .slice(0, 3)
      .map((item) => `${item.name}(${item.count})`)
      .join(', ');

    const trendText = trend === 'up' ? 'upward' : trend === 'down' ? 'downward' : 'stable';

    return [
      `Generated fallback narrative for "${target}" based on uploaded rows, MCP evidence, and model output.`,
      topIndustries
        ? `Top industries in uploaded samples: ${topIndustries}.`
        : 'Industry labels in uploaded samples are limited; enrich structured enterprise data for stronger explainability.',
      `TOPSIS-TheilSen trend is ${trendText} (slope ${trendSlope}).`,
      peers
        ? `Peer benchmark focus: ${peers}.`
        : 'Peer sample coverage is limited; add a broader competitor list for stronger benchmarking.',
      'Recommended tracking dimensions: demand, pricing, competitor moves, and channel efficiency.'
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

    if (toolName === 'fetch_regulatory_filings') {
      const company = sanitizeToolString(parsedArguments.company, 'company', { required: true, maxLen: 200 });
      const ticker = sanitizeToolString(parsedArguments.ticker, 'ticker', { required: false, maxLen: 50 });
      const timeframe = sanitizeToolString(parsedArguments.timeframe, 'timeframe', { required: false, maxLen: 100 });
      return {
        company,
        ...(ticker ? { ticker } : {}),
        ...(timeframe ? { timeframe } : {})
      };
    }

    if (toolName === 'fetch_news_stream') {
      const query = sanitizeToolString(parsedArguments.query, 'query', { required: true, maxLen: 200 });
      const timeframe = sanitizeToolString(parsedArguments.timeframe, 'timeframe', { required: false, maxLen: 100 });
      let limit;
      const rawLimit = parsedArguments.limit;
      if (rawLimit !== undefined && rawLimit !== null) {
        if (typeof rawLimit === 'number') {
          limit = rawLimit;
        } else if (typeof rawLimit === 'string') {
          const trimmedLimit = rawLimit.trim();
          if (!/^\d+$/.test(trimmedLimit)) {
            throw createInvalidToolCallError('Tool `fetch_news_stream` optional `limit` must be a number');
          }
          limit = Number.parseInt(trimmedLimit, 10);
        } else {
          throw createInvalidToolCallError('Tool `fetch_news_stream` optional `limit` must be a number');
        }

        if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
          throw createInvalidToolCallError('Tool `fetch_news_stream` optional `limit` must be an integer between 1 and 20');
        }
      }

      return {
        query,
        ...(timeframe ? { timeframe } : {}),
        ...(limit !== undefined ? { limit } : {})
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

  coerceMcpToolPayload(toolName, payload, args, options = {}) {
    const fallbackOnInvalid = options.fallbackOnInvalid !== false;
    const normalized = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : null;

    if (!normalized) {
      return fallbackOnInvalid ? this.buildMcpFallbackPayload(toolName, args, 'mcp_payload_invalid') : null;
    }

    let valid = false;
    let normalizedPayload = normalized;
    if (toolName === 'search_industry') {
      valid = Array.isArray(normalized.results);
    } else if (toolName === 'search_competitors') {
      valid = Array.isArray(normalized.competitors);
    } else if (toolName === 'fetch_market_report') {
      valid = Array.isArray(normalized.references);
    } else if (toolName === 'fetch_financial_data') {
      valid = Array.isArray(normalized.references);
    } else if (toolName === 'fetch_regulatory_filings') {
      if (Array.isArray(normalized.filings)) {
        valid = true;
      } else if (Array.isArray(normalized.references)) {
        valid = true;
        normalizedPayload = {
          ...normalized,
          filings: normalized.references
        };
      }
    } else if (toolName === 'fetch_news_stream') {
      if (Array.isArray(normalized.news)) {
        valid = true;
      } else if (Array.isArray(normalized.references)) {
        valid = true;
        normalizedPayload = {
          ...normalized,
          news: normalized.references.map((item) => ({
            title: item?.title || item?.name || '',
            url: item?.url || '',
            summary: item?.summary || item?.description || '',
            source: item?.source,
            relevanceScore: item?.relevanceScore,
            baseRelevanceScore: item?.baseRelevanceScore,
            authority: item?.authority,
            reasonCodes: item?.reasonCodes
          }))
        };
      }
    } else {
      valid = true;
    }

    if (valid) return normalizedPayload;
    return fallbackOnInvalid ? this.buildMcpFallbackPayload(toolName, args, 'mcp_payload_invalid') : null;
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

      const extractedPayload = extractMcpPayload(rawResult);
      const normalizedPayload = this.coerceMcpToolPayload(
        validated.name,
        extractedPayload,
        validated.arguments,
        { fallbackOnInvalid: false }
      );
      if (!normalizedPayload) {
        const invalidPayloadErr = new Error(`MCP tool ${validated.name} returned invalid payload`);
        invalidPayloadErr.status = 502;
        invalidPayloadErr.limitHint = 'mcp_payload_invalid';
        throw invalidPayloadErr;
      }
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

  buildResponsesErrorBodyText(data) {
    if (typeof data?.raw === 'string') {
      return data.raw;
    }
    try {
      return JSON.stringify(data || {});
    } catch {
      return String(data || '');
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
    responsesEndpoint,
    providerHeaders,
    requestPayload,
    timeoutMs,
    model,
    maxTokens
  }) {
    let retriedTokenOverride = false;
    let nextPayload = requestPayload;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(responsesEndpoint, {
          method: 'POST',
          headers: providerHeaders,
          body: JSON.stringify(nextPayload),
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
        if (response.status === 400 && !retriedTokenOverride) {
          const overrideKey = resolveResponsesTokenKeyOverride(this.buildResponsesErrorBodyText(data));
          if (overrideKey !== null) {
            retriedTokenOverride = true;
            nextPayload = overrideResponsesTokenKey(
              nextPayload,
              overrideKey,
              parsePositiveInt(maxTokens, 1000, 200000)
            );
            logger.warn(
              `AI responses retry with token key override: ${overrideKey || 'none'}`
            );
            continue;
          }
        }
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
    responsesEndpoint,
    providerHeaders,
    requestPayload,
    timeoutMs,
    model,
    onEvent,
    maxTokens
  }) {
    let retriedTokenOverride = false;
    let nextPayload = requestPayload;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(responsesEndpoint, {
          method: 'POST',
          headers: providerHeaders,
          body: JSON.stringify(nextPayload),
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
        if (response.status === 400 && !retriedTokenOverride) {
          const overrideKey = resolveResponsesTokenKeyOverride(this.buildResponsesErrorBodyText(data));
          if (overrideKey !== null) {
            retriedTokenOverride = true;
            nextPayload = overrideResponsesTokenKey(
              nextPayload,
              overrideKey,
              parsePositiveInt(maxTokens, 1000, 200000)
            );
            logger.warn(
              `AI responses stream retry with token key override: ${overrideKey || 'none'}`
            );
            continue;
          }
        }
        throw this.buildResponsesHttpError(response, data);
      }

      const contentType = String(response.headers?.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('text/event-stream')) {
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
    enableMcpToolLoop,
    telemetryContext
  }) {
    const config = this.getAIConfig();
    const timeoutMs = parsePositiveInt(requestTimeoutMs, config.aiRequestTimeoutMs, 180000);
    const resolvedBaseURL = String(baseURL || config.baseURL || '').replace(/\/+$/, '');
    const responsesEndpoint = resolveResponsesEndpoint(resolvedBaseURL);
    const resolvedApiKey = apiKey || config.apiKey;
    const resolvedHttpReferer = httpReferer !== undefined ? httpReferer : config.httpReferer;
    const resolvedTitle = title !== undefined ? title : config.title;
    const useStream = toBoolean(stream, false);
    const useToolLoop = toBoolean(enableMcpToolLoop, false);
    const maxToolRounds = parsePositiveInt(process.env.AI_RESPONSES_MAX_TOOL_ROUNDS, 4, 8);
    const includeResponsesTemperature = toBoolean(process.env.AI_RESPONSES_INCLUDE_TEMPERATURE, false);

    if (!responsesEndpoint || !resolvedApiKey) {
      const configErr = new Error('AI provider config is incomplete');
      configErr.status = 502;
      throw configErr;
    }

    const forceStream = shouldForceResponsesStream(responsesEndpoint, 'responses');
    const effectiveStream = useStream || forceStream;
    if (forceStream && !useStream) {
      logger.info(`AI responses stream forced for endpoint host: ${responsesEndpoint}`);
    }

    const providerHeaders = {
      Authorization: `Bearer ${resolvedApiKey}`,
      'Content-Type': 'application/json',
      Accept: effectiveStream ? 'text/event-stream' : 'application/json'
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
      temperature: includeResponsesTemperature ? temperature : undefined,
      maxTokens,
      responseFormat,
      stream: effectiveStream,
      baseURL: responsesEndpoint
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
      const turnResult = effectiveStream
        ? await this.callResponsesStreamTurn({
          responsesEndpoint,
          providerHeaders,
          requestPayload,
          timeoutMs,
          model,
          onEvent,
          maxTokens
        })
        : await this.callResponsesJsonTurn({
          responsesEndpoint,
          providerHeaders,
          requestPayload,
          timeoutMs,
          model,
          maxTokens
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
        emitQualityTelemetry('quality.ai.tool_call.executed', {
          analysisRequestId: String(telemetryContext?.analysisRequestId || 'unknown'),
          stage: 'service_tool_call',
          status: 'ok',
          quality: {
            toolName: dispatchResult.name,
            hasPayload: dispatchResult.payload !== undefined && dispatchResult.payload !== null
          },
          perf: {
            round: round + 1
          },
          tags: {
            layer: 'service',
            toolCallId: String(dispatchResult.callId || '').slice(0, 120)
          }
        });
      }

      requestPayload = {
        model,
        previous_response_id: previousResponseId,
        input: toolOutputs
      };

      requestPayload = overrideResponsesTokenKey(
        requestPayload,
        responsesTokenKey(responsesEndpoint),
        parsePositiveInt(maxTokens, 1000, 200000)
      );

      if (includeResponsesTemperature) {
        requestPayload.temperature = temperature;
      }

      if (stableFormat) {
        requestPayload.text = stableFormat;
      }
      if (effectiveStream) {
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
        industries: (payload?.industryNames || []).slice(0, Math.min(limits.mcpSignals, 12)),
        competitors: (payload?.competitorNames || []).slice(0, Math.min(limits.mcpSignals, 12))
      },
      externalEvidence: {
        marketReferences: normalizeList(payload?.marketReport?.references || [])
          .slice(0, Math.min(limits.mcpSignals, 6))
          .map((item) => ({
            name: String(item?.name || '').trim().slice(0, 120),
            url: String(item?.url || '').trim().slice(0, 220),
            summary: String(item?.summary || item?.description || '').trim().slice(0, 180)
          })),
        financialReferences: normalizeList(payload?.financialData?.references || [])
          .slice(0, Math.min(limits.mcpSignals, 6))
          .map((item) => ({
            name: String(item?.name || '').trim().slice(0, 120),
            url: String(item?.url || '').trim().slice(0, 220)
          })),
        financialIndicators: payload?.financialData?.indicators || {},
        targetFinancialReferences: dedupeReferenceRecords([
          ...normalizeList(payload?.companyIntelligence?.targetFinancial?.references),
          ...normalizeList(payload?.companyIntelligence?.targetRegulatoryFilings?.references)
        ], Math.min(limits.mcpSignals, 6)).map((item) => ({
          name: String(item?.name || '').trim().slice(0, 120),
          url: String(item?.url || '').trim().slice(0, 220)
        })),
        peerFinancialReferences: dedupeReferenceRecords(
          normalizeList(payload?.companyIntelligence?.peerFinancials)
            .flatMap((item) => normalizeList(item?.references)),
          Math.min(limits.mcpSignals, 6)
        ).map((item) => ({
          name: String(item?.name || '').trim().slice(0, 120),
          url: String(item?.url || '').trim().slice(0, 220)
        })),
        consumerReferences: dedupeReferenceRecords(
          normalizeList(payload?.companyIntelligence?.consumerInsights?.references),
          Math.min(limits.mcpSignals, 6)
        ).map((item) => ({
          name: String(item?.name || '').trim().slice(0, 120),
          url: String(item?.url || '').trim().slice(0, 220),
          summary: String(item?.summary || '').trim().slice(0, 180)
        })),
        consumerProfile: {
          primaryAgeRanges: normalizeList(payload?.companyIntelligence?.consumerInsights?.primaryAgeRanges)
            .slice(0, 5),
          primarySegments: normalizeList(payload?.companyIntelligence?.consumerInsights?.primarySegments)
            .slice(0, 6)
        }
      },
      companyIntelligence: {
        target: payload?.companyIntelligence?.target || payload?.target,
        competitorNames: normalizeList(payload?.companyIntelligence?.competitorNames).slice(0, 8),
        peerFinancials: normalizeList(payload?.companyIntelligence?.peerFinancials)
          .slice(0, 5)
          .map((item) => ({
            company: String(item?.company || '').trim().slice(0, 120),
            referenceCount: Number(item?.referenceCount || 0),
            partialFailure: Boolean(item?.partialFailure)
          })),
        consumerInsights: {
          primaryAgeRanges: normalizeList(payload?.companyIntelligence?.consumerInsights?.primaryAgeRanges).slice(0, 5),
          primarySegments: normalizeList(payload?.companyIntelligence?.consumerInsights?.primarySegments).slice(0, 6)
        }
      },
      mcpCoverage: payload?.mcpCoverage || {},
      keyFindings: (payload?.keyFindings || []).slice(0, limits.keyFindings)
    };

    return [
      {
        role: 'system',
        content: ANALYSIS_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: `请基于以下项目数据输出结构化分析。
输出要求（必须遵守）：
1) 严格区分【事实/推断/假设】。
2) 关键结论必须附 evidence_ids。
3) 量化结论无证据时必须写入 data_gaps。
4) 必须包含 company_financial_statement_analysis、peer_financial_benchmark、consumer_demographics、actions_30_60_90。
5) 对数据不足场景明确缺口和下一步检索查询。
输出建议 JSON 结构：
{
  executive_summary: [{ claim, claim_type, confidence, evidence_ids }],
  key_insights: [{ dimension, claim, claim_type, evidence_ids }],
  company_financial_statement_analysis: [{ metric, period, finding, evidence_ids }],
  peer_financial_benchmark: [{ peer, finding, evidence_ids }],
  consumer_demographics: {
    age_ranges: [{ range, evidence_ids }],
    segments: [{ segment, evidence_ids }]
  },
  strategy_options: [{ option, impact, feasibility, cost, risk, rationale, evidence_ids }],
  actions_30_60_90: [{ horizon, action, owner, kpi, evidence_ids }],
  data_gaps: [{ gap_type, missing_fields, next_queries }]
}
输入数据(JSON)：${JSON.stringify(compactPayload, null, 2)}`
      }
    ];
  }

  buildPrimaryResponsesNarrativePayload(payload) {
    return {
      ...payload,
      industryNames: (payload?.industryNames || []).slice(0, 6),
      competitorNames: (payload?.competitorNames || []).slice(0, 6),
      peers: (payload?.peers || []).slice(0, 4),
      peerResearch: (payload?.peerResearch || []).slice(0, 4),
      keyFindings: (payload?.keyFindings || []).slice(0, 6),
      suggestions: (payload?.suggestions || []).slice(0, 4),
      marketReport: {
        ...(payload?.marketReport || {}),
        references: normalizeList(payload?.marketReport?.references || []).slice(0, 3)
      },
      financialData: {
        ...(payload?.financialData || {}),
        references: normalizeList(payload?.financialData?.references || []).slice(0, 3)
      },
      companyIntelligence: {
        ...(payload?.companyIntelligence || {}),
        targetFinancial: {
          ...(payload?.companyIntelligence?.targetFinancial || {}),
          references: normalizeList(payload?.companyIntelligence?.targetFinancial?.references || []).slice(0, 3)
        },
        targetRegulatoryFilings: {
          ...(payload?.companyIntelligence?.targetRegulatoryFilings || {}),
          references: normalizeList(payload?.companyIntelligence?.targetRegulatoryFilings?.references || []).slice(0, 3)
        },
        peerFinancials: normalizeList(payload?.companyIntelligence?.peerFinancials || [])
          .slice(0, 3)
          .map((item) => ({
            ...item,
            references: normalizeList(item?.references || []).slice(0, 3)
          })),
        consumerInsights: {
          ...(payload?.companyIntelligence?.consumerInsights || {}),
          references: normalizeList(payload?.companyIntelligence?.consumerInsights?.references || []).slice(0, 3),
          primaryAgeRanges: normalizeList(payload?.companyIntelligence?.consumerInsights?.primaryAgeRanges || []).slice(0, 4),
          primarySegments: normalizeList(payload?.companyIntelligence?.consumerInsights?.primarySegments || []).slice(0, 4)
        }
      }
    };
  }

  buildClaimSupportRepairMessages(payload, draftText, unsupportedSamples = []) {
    const samples = normalizeList(unsupportedSamples)
      .slice(0, CLAIM_SUPPORT_MAX_UNSUPPORTED_SAMPLES)
      .map((item, index) => `${index + 1}. ${String(item || '').trim().slice(0, 180)}`)
      .join('\n');
    const sampleBlock = samples ? `\n寰呬慨澶嶆柇瑷€鏍蜂緥锛歕n${samples}` : '';

    return [
      ...this.buildNarrativeMessages(payload),
      {
        role: 'assistant',
        content: String(draftText || '').slice(0, 7000)
      },
      {
        role: 'user',
        content: `璇蜂慨璁笂涓€鐗堝垎鏋愭枃鏈紝鍙繚鐣欏彲鐢辫緭鍏ユ暟鎹瓧娈垫垨澶栭儴鍙傝€冪洿鎺ユ敮鎾戠殑缁撹銆俓n瑕佹眰锛歕n- 鍒犻櫎鎴栨敼鍐欐棤娉曞湪杈撳叆璇佹嵁涓壘鍒伴敋鐐圭殑鏂█锛沑n- 瀵逛笉纭畾鍐呭鐢ㄢ€滃亣璁锯€濇爣璁帮紱\n- 涓嶈鏂板杈撳叆涓笉瀛樺湪鐨勬暟鎹垨鏉ユ簮锛沑n- 杈撳嚭浠嶄繚鎸佸畬鏁村垎鏋愮粨鏋勩€?{sampleBlock}`
      }
    ];
  }

  async generateAnalysisNarrative(payload, options = {}) {
    const config = this.getAIConfig(options?.configOverride || null);
    const qualityFlags = resolveQualityFlags(config);
    const telemetryContext = options?.telemetryContext || {};
    const analysisRequestId = String(telemetryContext.analysisRequestId || 'unknown');
    if (config.useMock) {
      return {
        text: this.buildNarrativeFallback(payload),
        modelUsed: 'fallback-template',
        providerUsed: 'mock',
        protocol: 'mock',
        degraded: true,
        degradedReason: 'mock_mode_enabled',
        promptVersion: ANALYSIS_PROMPT_VERSION,
        qualityFlags
      };
    }

    if (!config.apiKey || !config.baseURL) {
      const err = new Error('AI provider config missing');
      err.status = 502;
      err.limitHint = 'provider_config_missing';
      throw err;
    }

    const run = async () => {
      const messages = this.buildNarrativeMessages(payload);
      const primaryResponsesMessages = this.buildNarrativeMessages(
        this.buildPrimaryResponsesNarrativePayload(payload)
      );
      const enableResponsesToolLoop = toBoolean(process.env.AI_RESPONSES_ENABLE_TOOL_LOOP, false);
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

      if (config.protocol === 'responses') {
        primaryModels.forEach((modelName) => {
          providerQueue.push({
            provider: 'primary',
            protocol: 'chat_completions',
            model: modelName,
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            httpReferer: config.httpReferer,
            title: config.title
          });
        });
      }

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
            const usePrimaryResponsesLitePrompt = target.provider === 'primary' && target.protocol === 'responses';
            const requestMessages = usePrimaryResponsesLitePrompt ? primaryResponsesMessages : messages;
            const requestMaxTokens = usePrimaryResponsesLitePrompt ? Math.min(config.maxTokens, 700) : config.maxTokens;
            emitQualityTelemetry('quality.ai.provider_attempt', {
              analysisRequestId,
              stage: 'service_provider_attempt',
              status: 'ok',
              quality: {
                provider: target.provider,
                protocol: target.protocol,
                model: target.model,
                degraded: false
              },
              perf: {
                attempt,
                maxAttempts: config.aiRetryMaxAttempts,
                promptChars: JSON.stringify(requestMessages).length,
                maxTokens: requestMaxTokens
              },
              tags: {
                layer: 'service'
              }
            });
            logger.info(
              `AI narrative request provider=${target.provider} protocol=${target.protocol} model=${target.model} promptChars=${JSON.stringify(requestMessages).length} maxTokens=${requestMaxTokens}`
            );
            const result = await this.callProviderCompletion({
              protocol: target.protocol,
              model: target.model,
              baseURL: target.baseURL,
              apiKey: target.apiKey,
              httpReferer: target.httpReferer,
              title: target.title,
              messages: requestMessages,
              temperature: config.temperature,
              maxTokens: requestMaxTokens,
              requestTimeoutMs: Math.min(config.aiRequestTimeoutMs, remainingMs),
              responseFormat: payload?.responseFormat,
              enableMcpToolLoop: target.protocol === 'responses' && enableResponsesToolLoop,
              telemetryContext
            });

            if (result.content) {
              const initialClaimSupport = buildClaimSupportMetrics(result.content, payload);
              emitQualityTelemetry('quality.ai.claim_support', {
                analysisRequestId,
                stage: 'service_claim_support_validation',
                status: initialClaimSupport.unsupportedClaims > 0 ? 'degraded' : 'ok',
                quality: {
                  provider: target.provider,
                  protocol: target.protocol,
                  model: result.modelUsed || target.model,
                  claimSupport: {
                    totalClaims: initialClaimSupport.totalClaims,
                    supportedClaims: initialClaimSupport.supportedClaims,
                    unsupportedClaims: initialClaimSupport.unsupportedClaims,
                    supportRatio: initialClaimSupport.supportRatio,
                    validationSkipped: initialClaimSupport.validationSkipped === true,
                    skipReason: initialClaimSupport.skipReason || null
                  }
                },
                tags: {
                  layer: 'service'
                }
              });

              if (initialClaimSupport.unsupportedClaims > 0) {
                if (!qualityFlags.qualityStrictMode) {
                  const nonStrictClaimSupport = {
                    ...initialClaimSupport,
                    repairAttempted: false,
                    repairSucceeded: false,
                    degradedByUnsupportedClaim: true,
                    reasonCode: 'unsupported_claim_detected'
                  };
                  emitQualityTelemetry('quality.ai.claim_support', {
                    analysisRequestId,
                    stage: 'service_claim_support_terminal',
                    status: 'ok',
                    quality: {
                      provider: target.provider,
                      protocol: target.protocol,
                      model: result.modelUsed || target.model,
                      degraded: false,
                      degradedReason: null,
                      claimSupportWarning: true,
                      claimSupport: {
                        totalClaims: nonStrictClaimSupport.totalClaims,
                        supportedClaims: nonStrictClaimSupport.supportedClaims,
                        unsupportedClaims: nonStrictClaimSupport.unsupportedClaims,
                        supportRatio: nonStrictClaimSupport.supportRatio,
                        repaired: false,
                        repairAttempted: false
                      }
                    },
                    tags: {
                      layer: 'service'
                    }
                  });
                  return {
                    text: result.content,
                    modelUsed: result.modelUsed,
                    providerUsed: target.provider,
                    protocol: target.protocol,
                    degraded: false,
                    degradedReason: null,
                    promptVersion: ANALYSIS_PROMPT_VERSION,
                    qualityFlags,
                    claimSupport: nonStrictClaimSupport
                  };
                }

                let repairClaimSupport = {
                  ...initialClaimSupport,
                  repairAttempted: true,
                  repairSucceeded: false,
                  degradedByUnsupportedClaim: true,
                  reasonCode: 'unsupported_claim_detected'
                };
                let repaired = false;

                for (let repairAttempt = 1; repairAttempt <= CLAIM_SUPPORT_REPAIR_MAX_ATTEMPTS; repairAttempt++) {
                  const repairRemainingMs = deadline - Date.now();
                  if (repairRemainingMs <= 1000) {
                    break;
                  }

                  try {
                    const repairMessages = this.buildClaimSupportRepairMessages(
                      payload,
                      result.content,
                      initialClaimSupport.unsupportedSamples
                    );
                    const repairResult = await this.callProviderCompletion({
                      protocol: target.protocol,
                      model: target.model,
                      baseURL: target.baseURL,
                      apiKey: target.apiKey,
                      httpReferer: target.httpReferer,
                      title: target.title,
                      messages: repairMessages,
                      temperature: config.temperature,
                      maxTokens: requestMaxTokens,
                      requestTimeoutMs: Math.min(config.aiRequestTimeoutMs, repairRemainingMs),
                      responseFormat: payload?.responseFormat,
                      enableMcpToolLoop: false,
                      telemetryContext
                    });

                    const repairedText = String(repairResult?.content || '').trim();
                    if (!repairedText) {
                      continue;
                    }
                    const repairedMetrics = buildClaimSupportMetrics(repairedText, payload);
                    repairClaimSupport = {
                      ...repairedMetrics,
                      repairAttempted: true,
                      repairSucceeded: repairedMetrics.unsupportedClaims === 0,
                      degradedByUnsupportedClaim: repairedMetrics.unsupportedClaims > 0,
                      reasonCode: repairedMetrics.unsupportedClaims > 0 ? 'unsupported_claim_detected' : null
                    };
                    if (repairedMetrics.unsupportedClaims === 0) {
                      repaired = true;
                      emitQualityTelemetry('quality.ai.claim_support', {
                        analysisRequestId,
                        stage: 'service_claim_support_repair',
                        status: 'ok',
                        quality: {
                          provider: target.provider,
                          protocol: target.protocol,
                          model: repairResult.modelUsed || result.modelUsed || target.model,
                          claimSupport: {
                            totalClaims: repairedMetrics.totalClaims,
                            supportedClaims: repairedMetrics.supportedClaims,
                            unsupportedClaims: repairedMetrics.unsupportedClaims,
                            supportRatio: repairedMetrics.supportRatio,
                            repaired: true
                          }
                        },
                        tags: {
                          layer: 'service'
                        }
                      });
                      return {
                        text: repairedText,
                        modelUsed: repairResult.modelUsed || result.modelUsed,
                        providerUsed: target.provider,
                        protocol: target.protocol,
                        degraded: false,
                        promptVersion: ANALYSIS_PROMPT_VERSION,
                        qualityFlags,
                        claimSupport: repairClaimSupport
                      };
                    }
                  } catch (repairErr) {
                    logger.warn(
                      `AI claim-support repair failed provider=${target.provider} model=${target.model} attempt=${repairAttempt}: ${repairErr?.message || 'unknown error'}`
                    );
                  }
                }

                if (!repaired) {
                  emitQualityTelemetry('quality.ai.claim_support', {
                    analysisRequestId,
                    stage: 'service_claim_support_terminal',
                    status: 'degraded',
                    quality: {
                      provider: 'fallback',
                      protocol: 'fallback',
                      model: 'fallback-template',
                      degraded: true,
                      degradedReason: 'unsupported_claim_detected',
                      claimSupport: {
                        totalClaims: repairClaimSupport.totalClaims,
                        supportedClaims: repairClaimSupport.supportedClaims,
                        unsupportedClaims: repairClaimSupport.unsupportedClaims,
                        supportRatio: repairClaimSupport.supportRatio,
                        repaired: false,
                        repairAttempted: true
                      }
                    },
                    tags: {
                      layer: 'service'
                    }
                  });

                  return {
                    text: this.buildNarrativeFallback(payload),
                    modelUsed: 'fallback-template',
                    providerUsed: 'fallback',
                    protocol: 'fallback',
                    degraded: true,
                    degradedReason: 'unsupported_claim_detected',
                    promptVersion: ANALYSIS_PROMPT_VERSION,
                    qualityFlags,
                    claimSupport: repairClaimSupport
                  };
                }
              }

              emitQualityTelemetry('quality.ai.provider_terminal', {
                analysisRequestId,
                stage: 'service_provider_terminal',
                status: 'ok',
                quality: {
                  provider: target.provider,
                  protocol: target.protocol,
                  model: result.modelUsed || target.model,
                  degraded: false
                },
                perf: {
                  attempt,
                  maxAttempts: config.aiRetryMaxAttempts
                },
                tags: {
                  layer: 'service'
                }
              });
              return {
                text: result.content,
                modelUsed: result.modelUsed,
                providerUsed: target.provider,
                protocol: target.protocol,
                degraded: false,
                promptVersion: ANALYSIS_PROMPT_VERSION,
                qualityFlags,
                claimSupport: {
                  ...initialClaimSupport,
                  repairAttempted: false,
                  repairSucceeded: false,
                  degradedByUnsupportedClaim: false,
                  reasonCode: null
                }
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
              `AI narrative failed provider=${target.provider} protocol=${target.protocol} model=${target.model} attempt=${attempt} status=${status || 'unknown'}: ${err?.message || 'unknown error'}`
            );

            if (retryable && attempt < config.aiRetryMaxAttempts) {
              emitQualityTelemetry('quality.ai.provider_retry', {
                analysisRequestId,
                stage: 'service_provider_retry',
                status: 'degraded',
                quality: {
                  provider: target.provider,
                  protocol: target.protocol,
                  model: target.model,
                  retryable: true
                },
                perf: {
                  attempt,
                  maxAttempts: config.aiRetryMaxAttempts,
                  waitMs
                },
                error: buildSafeErrorPayload(err, status || 0),
                tags: {
                  layer: 'service'
                }
              });
              const remainingForWait = deadline - Date.now() - 500;
              const boundedWaitMs = Math.min(waitMs, Math.max(0, remainingForWait));
              if (boundedWaitMs > 0) {
                await sleep(boundedWaitMs);
              }
              continue;
            }

            emitQualityTelemetry('quality.ai.provider_terminal', {
              analysisRequestId,
              stage: 'service_provider_terminal',
              status: retryable ? 'degraded' : 'error',
              quality: {
                provider: target.provider,
                protocol: target.protocol,
                model: target.model,
                retryable
              },
              perf: {
                attempt,
                maxAttempts: config.aiRetryMaxAttempts
              },
              error: buildSafeErrorPayload(err, status || 0),
              tags: {
                layer: 'service'
              }
            });

            if (!retryable) break;
          }
        }
      }

      logger.error('AI narrative failed after retries:', lastError?.message || lastError);
      const lastStatus = Number(lastError?.status || 502);
      const effectiveStatus = hadRateLimit ? 429 : (hadTimeout ? 504 : lastStatus);

      if (effectiveStatus === 429) {
        logger.warn('AI narrative rate limited, degraded to template fallback');
        emitQualityTelemetry('quality.ai.provider_terminal', {
          analysisRequestId,
          stage: 'service_provider_terminal',
          status: 'degraded',
          quality: {
            provider: 'fallback',
            protocol: 'fallback',
            model: 'fallback-template',
            degraded: true,
            degradedReason: 'provider_rate_limited'
          },
          perf: {
            maxAttempts: config.aiRetryMaxAttempts
          },
          tags: {
            layer: 'service'
          }
        });
        return {
          text: this.buildNarrativeFallback(payload),
          modelUsed: 'fallback-template',
          providerUsed: 'fallback',
          protocol: 'fallback',
          degraded: true,
          degradedReason: 'provider_rate_limited',
          promptVersion: ANALYSIS_PROMPT_VERSION,
          qualityFlags
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
      emitQualityTelemetry('quality.ai.provider_terminal', {
        analysisRequestId,
        stage: 'service_provider_terminal',
        status: 'error',
        quality: {
          provider: 'none',
          protocol: 'none',
          model: 'none',
          degraded: false
        },
        perf: {
          maxAttempts: config.aiRetryMaxAttempts
        },
        error: buildSafeErrorPayload(err, err.status),
        tags: {
          layer: 'service'
        }
      });
      throw err;
    };

    return run();
  }

  async generateAnalysisNarrativeStream(payload, options = {}) {
    const onEvent = typeof options?.onEvent === 'function' ? options.onEvent : null;
    const telemetryContext = options?.telemetryContext || {};
    const analysisRequestId = String(telemetryContext.analysisRequestId || 'unknown');
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

    const config = this.getAIConfig(options?.configOverride || null);
    const qualityFlags = resolveQualityFlags(config);
    if (config.useMock) {
      const text = this.buildNarrativeFallback(payload);
      emitFallback(text);
      return {
        text,
        modelUsed: 'fallback-template',
        providerUsed: 'mock',
        protocol: 'mock',
        degraded: true,
        degradedReason: 'mock_mode_enabled',
        finishReason: 'stop',
        promptVersion: ANALYSIS_PROMPT_VERSION,
        qualityFlags
      };
    }

    if (!config.apiKey || !config.baseURL) {
      const err = new Error('AI provider config missing');
      err.status = 502;
      err.limitHint = 'provider_config_missing';
      throw err;
    }

    const messages = this.buildNarrativeMessages(payload);
    const primaryResponsesMessages = this.buildNarrativeMessages(
      this.buildPrimaryResponsesNarrativePayload(payload)
    );
    const enableResponsesToolLoop = toBoolean(process.env.AI_RESPONSES_ENABLE_TOOL_LOOP, false);
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

    if (config.protocol === 'responses') {
      primaryModels.forEach((modelName) => {
        providerQueue.push({
          provider: 'primary',
          protocol: 'chat_completions',
          model: modelName,
          baseURL: config.baseURL,
          apiKey: config.apiKey,
          httpReferer: config.httpReferer,
          title: config.title
        });
      });
    }

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
          const usePrimaryResponsesLitePrompt = target.provider === 'primary' && target.protocol === 'responses';
          const requestMessages = usePrimaryResponsesLitePrompt ? primaryResponsesMessages : messages;
          const requestMaxTokens = usePrimaryResponsesLitePrompt ? Math.min(config.maxTokens, 700) : config.maxTokens;
          emitQualityTelemetry('quality.ai.provider_attempt', {
            analysisRequestId,
            stage: 'service_provider_attempt',
            status: 'ok',
            quality: {
              provider: target.provider,
              protocol: target.protocol,
              model: target.model,
              degraded: false,
              stream: true
            },
            perf: {
              attempt,
              maxAttempts: config.aiRetryMaxAttempts,
              promptChars: JSON.stringify(requestMessages).length,
              maxTokens: requestMaxTokens
            },
            tags: {
              layer: 'service'
            }
          });
          logger.info(
            `AI streaming narrative request provider=${target.provider} protocol=${target.protocol} model=${target.model} promptChars=${JSON.stringify(requestMessages).length} maxTokens=${requestMaxTokens}`
          );
          const result = await this.callProviderCompletion({
            protocol: target.protocol,
            model: target.model,
            baseURL: target.baseURL,
            apiKey: target.apiKey,
            httpReferer: target.httpReferer,
            title: target.title,
            messages: requestMessages,
            temperature: config.temperature,
            maxTokens: requestMaxTokens,
            requestTimeoutMs: Math.min(config.aiRequestTimeoutMs, remainingMs),
            responseFormat: payload?.responseFormat,
            stream: true,
            onEvent,
            enableMcpToolLoop: target.protocol === 'responses' && enableResponsesToolLoop,
            telemetryContext
          });

          if (result.content) {
            emitQualityTelemetry('quality.ai.provider_terminal', {
              analysisRequestId,
              stage: 'service_provider_terminal',
              status: 'ok',
              quality: {
                provider: target.provider,
                protocol: target.protocol,
                model: result.modelUsed || target.model,
                degraded: false,
                stream: true
              },
              perf: {
                attempt,
                maxAttempts: config.aiRetryMaxAttempts
              },
              tags: {
                layer: 'service'
              }
            });
            return {
              text: result.content,
              modelUsed: result.modelUsed,
              providerUsed: target.provider,
              protocol: target.protocol,
              degraded: false,
              finishReason: result.finishReason || 'stop',
              promptVersion: ANALYSIS_PROMPT_VERSION,
              qualityFlags
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
            `AI streaming narrative failed provider=${target.provider} protocol=${target.protocol} model=${target.model} attempt=${attempt} status=${status || 'unknown'}: ${err?.message || 'unknown error'}`
          );

          if (retryable && attempt < config.aiRetryMaxAttempts) {
            emitQualityTelemetry('quality.ai.provider_retry', {
              analysisRequestId,
              stage: 'service_provider_retry',
              status: 'degraded',
              quality: {
                provider: target.provider,
                protocol: target.protocol,
                model: target.model,
                retryable: true,
                stream: true
              },
              perf: {
                attempt,
                maxAttempts: config.aiRetryMaxAttempts,
                waitMs
              },
              error: buildSafeErrorPayload(err, status || 0),
              tags: {
                layer: 'service'
              }
            });
            const remainingForWait = deadline - Date.now() - 500;
            const boundedWaitMs = Math.min(waitMs, Math.max(0, remainingForWait));
            if (boundedWaitMs > 0) {
              await sleep(boundedWaitMs);
            }
            continue;
          }

          emitQualityTelemetry('quality.ai.provider_terminal', {
            analysisRequestId,
            stage: 'service_provider_terminal',
            status: retryable ? 'degraded' : 'error',
            quality: {
              provider: target.provider,
              protocol: target.protocol,
              model: target.model,
              retryable,
              stream: true
            },
            perf: {
              attempt,
              maxAttempts: config.aiRetryMaxAttempts
            },
            error: buildSafeErrorPayload(err, status || 0),
            tags: {
              layer: 'service'
            }
          });

          if (!retryable) break;
        }
      }
    }

    logger.error('AI streaming narrative failed after retries:', lastError?.message || lastError);
    const lastStatus = Number(lastError?.status || 502);
    const effectiveStatus = hadRateLimit ? 429 : (hadTimeout ? 504 : lastStatus);

    if (effectiveStatus === 429) {
      const text = this.buildNarrativeFallback(payload);
      emitFallback(text);
      emitQualityTelemetry('quality.ai.provider_terminal', {
        analysisRequestId,
        stage: 'service_provider_terminal',
        status: 'degraded',
        quality: {
          provider: 'fallback',
          protocol: 'fallback',
          model: 'fallback-template',
          degraded: true,
          degradedReason: 'provider_rate_limited',
          stream: true
        },
        perf: {
          maxAttempts: config.aiRetryMaxAttempts
        },
        tags: {
          layer: 'service'
        }
      });
      return {
        text,
        modelUsed: 'fallback-template',
        providerUsed: 'fallback',
        protocol: 'fallback',
        degraded: true,
        degradedReason: 'provider_rate_limited',
        finishReason: 'stop',
        promptVersion: ANALYSIS_PROMPT_VERSION,
        qualityFlags
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
    emitQualityTelemetry('quality.ai.provider_terminal', {
      analysisRequestId,
      stage: 'service_provider_terminal',
      status: 'error',
      quality: {
        provider: 'none',
        protocol: 'none',
        model: 'none',
        degraded: false,
        stream: true
      },
      perf: {
        maxAttempts: config.aiRetryMaxAttempts
      },
      error: buildSafeErrorPayload(err, err.status),
      tags: {
        layer: 'service'
      }
    });
    throw err;
  }

  async connectMCP() {
    if (this.mcpClient) return this.mcpClient;

    try {
      // StdioClientTransport only inherits a safe env subset by default.
      // Pass full env so MCP_* source configuration reaches mcp-server.js.
      const inheritedEnv = Object.entries(process.env).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = String(value);
        }
        return acc;
      }, {});

      const transport = new StdioClientTransport({
        command: process.env.MCP_SERVER_COMMAND || 'node',
        args: [process.env.MCP_SERVER_PATH || './mcp-server.js'],
        env: inheritedEnv
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

  async extractCompetitorCompanies(target, options = {}) {
    const normalizedTarget = String(target || '').trim();
    if (!normalizedTarget) return [];

    const maxCandidates = parsePositiveInt(options?.maxCandidates, 6, 12);
    const config = this.getAIConfig(options?.configOverride || null);
    if (!config.apiKey || !config.baseURL) {
      return [];
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a market research assistant. Return only valid JSON.'
      },
      {
        role: 'user',
        content: [
          `Target company: ${normalizedTarget}`,
          `Task: list up to ${maxCandidates} direct competitor companies/brands in the same business arena.`,
          'Output JSON only in this exact shape: {"competitors":[{"name":"..."}]}',
          'Rules: no explanations, no markdown, no events/topics, no products-only entries.'
        ].join('\n')
      }
    ];

    try {
      const completion = await this.callProviderCompletion({
        protocol: config.protocol,
        model: config.model,
        messages,
        temperature: 0.2,
        maxTokens: 220,
        requestTimeoutMs: Math.min(config.aiRequestTimeoutMs, 30000),
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        httpReferer: config.httpReferer,
        title: config.title,
        tokenKeyOverride: config.tokenKeyOverride
      });

      const rawText = String(completion?.content || '').trim();
      const candidates = parseCompetitorCandidatesFromText(rawText, maxCandidates);
      const normalizedTargetKey = normalizeCompetitorName(normalizedTarget).toLowerCase();

      return candidates.filter((name) => normalizeCompetitorName(name).toLowerCase() !== normalizedTargetKey);
    } catch (err) {
      logger.warn('AI competitor candidate extraction failed:', err?.message || err);
      return [];
    }
  }

  async _callMcpWithCache(toolName, args, cachePrefix, mockFn) {
    const argKey = typeof args === 'string' ? args : stableJsonStringify(args);
    const cacheKey = `${cachePrefix}:${argKey}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        const cachedPayload = extractMcpPayload(JSON.parse(cached));
        const normalizedCachedPayload = this.coerceMcpToolPayload(toolName, cachedPayload, args, {
          fallbackOnInvalid: false
        });
        if (normalizedCachedPayload) {
          return normalizedCachedPayload;
        }
        await redis.del(cacheKey).catch(() => {});
      } catch {
        await redis.del(cacheKey).catch(() => {});
      }
    }

    const client = await this.connectMCP();
    const useMockFallback = false;
    const buildFallbackPayload = (reason) => {
      if (useMockFallback) {
        return mockFn(args);
      }
      return this.buildMcpFallbackPayload(toolName, args, reason);
    };

    if (!client) {
      const fallbackPayload = buildFallbackPayload('mcp_client_unavailable');
      await redis.setex(cacheKey, useMockFallback ? 300 : 30, JSON.stringify(fallbackPayload)).catch(() => {});
      return fallbackPayload;
    }

    try {
      const toolArgs = typeof args === 'string' ? { query: args } : args;
      const requestTimeoutMs = this.getAIConfig().mcpToolTimeoutMs;
      const result = await withTimeout(
        client.callTool(
          { name: toolName, arguments: toolArgs },
          undefined,
          { timeout: requestTimeoutMs }
        ),
        requestTimeoutMs + 2000,
        `MCP tool ${toolName} timeout`
      );
      const extractedPayload = extractMcpPayload(result);
      const payload = this.coerceMcpToolPayload(toolName, extractedPayload, args, {
        fallbackOnInvalid: false
      });
      if (!payload) {
        const invalidPayloadErr = new Error(`MCP ${toolName} returned invalid payload`);
        invalidPayloadErr.status = 502;
        invalidPayloadErr.limitHint = 'mcp_payload_invalid';
        throw invalidPayloadErr;
      }
      await redis.setex(cacheKey, 3600, JSON.stringify(payload)).catch(() => {});
      return payload;
    } catch (err) {
      logger.error(`MCP ${toolName} failed:`, err);
      this.mcpClient = null;
      const fallbackReason = String(err?.limitHint || '').trim() || 'mcp_tool_failed';
      const fallbackPayload = buildFallbackPayload(fallbackReason);
      await redis.setex(cacheKey, useMockFallback ? 60 : 15, JSON.stringify(fallbackPayload)).catch(() => {});
      return fallbackPayload;
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

  async fetchRegulatoryFilings(params) {
    return this._callMcpWithCache('fetch_regulatory_filings', params, 'filings', (p) => this.buildMockRegulatoryFilings(p));
  }

  async fetchNewsStream(params) {
    return this._callMcpWithCache('fetch_news_stream', params, 'news', (p) => this.buildMockNewsStream(p));
  }

  async fetchCompanyIntelligence(params = {}) {
    const target = String(params?.target || params?.company || '').trim().slice(0, 200);
    const timeframe = String(params?.timeframe || 'latest').trim().slice(0, 80) || 'latest';
    const competitorLimit = parsePositiveInt(params?.competitorLimit, 4, 8);
    const seed = params?.seed && typeof params.seed === 'object' ? params.seed : {};
    const settleOne = async (promise) => {
      try {
        return { status: 'fulfilled', value: await promise };
      } catch (reason) {
        return { status: 'rejected', reason };
      }
    };

    if (!target) {
      return {
        target: '',
        timeframe,
        competitorNames: [],
        targetFinancial: { company: '', repoCount: 0, references: [] },
        targetRegulatoryFilings: { company: '', filingCount: 0, references: [] },
        peerFinancials: [],
        consumerInsights: {
          query: '',
          references: [],
          primaryAgeRanges: [],
          primarySegments: []
        },
        meta: {
          partialFailure: true,
          failureReasons: ['target_required'],
          competitorCount: 0,
          peerCoverageCount: 0
        }
      };
    }

    const normalizedTargetKey = normalizeCompetitorName(target).toLowerCase();
    let competitorNames = uniqueNonEmpty(
      normalizeList(params?.competitors).map((item) => extractDisplayLabel(item))
    )
      .map((name) => normalizeCompetitorName(name))
      .filter((name) => name && name.toLowerCase() !== normalizedTargetKey)
      .slice(0, competitorLimit);

    if (competitorNames.length === 0) {
      const seedCompetitors = normalizeList(seed?.competitorData?.competitors);
      if (seedCompetitors.length > 0) {
        competitorNames = uniqueNonEmpty(seedCompetitors.map((item) => extractDisplayLabel(item)))
          .map((name) => normalizeCompetitorName(name))
          .filter((name) => name && name.toLowerCase() !== normalizedTargetKey)
          .slice(0, competitorLimit);
      }
    }

    if (competitorNames.length === 0) {
      const competitorResult = await settleOne(this.searchCompetitors(`${target} competitor benchmark`));
      if (competitorResult.status === 'fulfilled') {
        competitorNames = uniqueNonEmpty(
          normalizeList(competitorResult.value?.competitors).map((item) => extractDisplayLabel(item))
        )
          .map((name) => normalizeCompetitorName(name))
          .filter((name) => name && name.toLowerCase() !== normalizedTargetKey)
          .slice(0, competitorLimit);
      }
    }

    const consumerMarketQuery = `${target} 用户画像 年龄 性别 城市 消费分层`;
    const consumerNewsQuery = `${target} 消费者调研 主要消费人群 年龄段`;
    const targetFinancialNewsQuery = `${target} 财报 年报 营收 净利润 投资者关系`;
    const peerFinancialNewsQuery = (companyName) => (
      `${companyName} 财报 年报 营收 净利润 investor relations`
    );

    const targetFinancialTask = seed?.financialData
      ? Promise.resolve(seed.financialData)
      : this.fetchFinancialData({ company: target });
    const targetRegulatoryTask = seed?.regulatoryFilings
      ? Promise.resolve(seed.regulatoryFilings)
      : this.fetchRegulatoryFilings({ company: target, timeframe });
    const consumerMarketTask = seed?.marketReport
      ? Promise.resolve(seed.marketReport)
      : this.fetchMarketReport({ query: consumerMarketQuery, timeframe });
    const consumerNewsTask = seed?.newsStream
      ? Promise.resolve(seed.newsStream)
      : this.fetchNewsStream({ query: consumerNewsQuery, timeframe, limit: 12 });
    const targetFinancialNewsTask = this.fetchNewsStream({ query: targetFinancialNewsQuery, timeframe, limit: 12 });

    const peerFinancialTasks = competitorNames.map(async (companyName) => {
      const [financialSettled, filingsSettled, peerNewsSettled] = await Promise.all([
        settleOne(this.fetchFinancialData({ company: companyName })),
        settleOne(this.fetchRegulatoryFilings({ company: companyName, timeframe })),
        settleOne(this.fetchNewsStream({
          query: peerFinancialNewsQuery(companyName),
          timeframe,
          limit: 8
        }))
      ]);

      const financialPayload = financialSettled.status === 'fulfilled'
        ? financialSettled.value
        : this.buildMcpFallbackPayload('fetch_financial_data', { company: companyName }, 'peer_financial_failed');
      const filingPayload = filingsSettled.status === 'fulfilled'
        ? filingsSettled.value
        : this.buildMcpFallbackPayload('fetch_regulatory_filings', { company: companyName, timeframe }, 'peer_filings_failed');
      const peerNewsPayload = peerNewsSettled.status === 'fulfilled'
        ? peerNewsSettled.value
        : this.buildMcpFallbackPayload('fetch_news_stream', { query: peerFinancialNewsQuery(companyName), timeframe, limit: 8 }, 'peer_financial_news_failed');

      const references = dedupeReferenceRecords([
        ...normalizeList(financialPayload?.references),
        ...normalizeList(filingPayload?.references || filingPayload?.filings),
        ...normalizeList(peerNewsPayload?.references || peerNewsPayload?.news)
      ], 10);

      return {
        company: companyName,
        referenceCount: references.length,
        references,
        financialData: {
          repoCount: Number(
            financialPayload?.repoCount
            || normalizeList(financialPayload?.references).length
            || normalizeList(peerNewsPayload?.references || peerNewsPayload?.news).length
            || 0
          ),
          references: dedupeReferenceRecords([
            ...normalizeList(financialPayload?.references),
            ...normalizeList(peerNewsPayload?.references || peerNewsPayload?.news)
          ], 8)
        },
        regulatoryFilings: {
          filingCount: Number(
            filingPayload?.filingCount
            || filingPayload?.fillingCount
            || normalizeList(filingPayload?.references || filingPayload?.filings).length
            || 0
          ),
          references: dedupeReferenceRecords(filingPayload?.references || filingPayload?.filings, 8)
        },
        partialFailure: Boolean(
          financialSettled.status !== 'fulfilled'
          || filingsSettled.status !== 'fulfilled'
          || peerNewsSettled.status !== 'fulfilled'
          || financialPayload?.meta?.partialFailure
          || filingPayload?.meta?.partialFailure
          || peerNewsPayload?.meta?.partialFailure
        )
      };
    });

    const [
      targetFinancialSettled,
      targetRegulatorySettled,
      consumerMarketSettled,
      consumerNewsSettled,
      targetFinancialNewsSettled,
      peerSettled
    ] = await Promise.all([
      settleOne(targetFinancialTask),
      settleOne(targetRegulatoryTask),
      settleOne(consumerMarketTask),
      settleOne(consumerNewsTask),
      settleOne(targetFinancialNewsTask),
      Promise.allSettled(peerFinancialTasks)
    ]);

    const failureReasons = [];
    if (targetFinancialSettled.status !== 'fulfilled') failureReasons.push('target_financial_failed');
    if (targetRegulatorySettled.status !== 'fulfilled') failureReasons.push('target_filings_failed');
    if (consumerMarketSettled.status !== 'fulfilled') failureReasons.push('consumer_market_failed');
    if (consumerNewsSettled.status !== 'fulfilled') failureReasons.push('consumer_news_failed');
    if (targetFinancialNewsSettled.status !== 'fulfilled') failureReasons.push('target_financial_news_failed');

    const targetFinancialPayload = targetFinancialSettled.status === 'fulfilled'
      ? targetFinancialSettled.value
      : this.buildMcpFallbackPayload('fetch_financial_data', { company: target }, 'target_financial_failed');
    const targetFilingsPayload = targetRegulatorySettled.status === 'fulfilled'
      ? targetRegulatorySettled.value
      : this.buildMcpFallbackPayload('fetch_regulatory_filings', { company: target, timeframe }, 'target_filings_failed');
    const consumerMarketPayload = consumerMarketSettled.status === 'fulfilled'
      ? consumerMarketSettled.value
      : this.buildMcpFallbackPayload('fetch_market_report', { query: target, timeframe }, 'consumer_market_failed');
    const consumerNewsPayload = consumerNewsSettled.status === 'fulfilled'
      ? consumerNewsSettled.value
      : this.buildMcpFallbackPayload('fetch_news_stream', { query: target, timeframe }, 'consumer_news_failed');
    const targetFinancialNewsPayload = targetFinancialNewsSettled.status === 'fulfilled'
      ? targetFinancialNewsSettled.value
      : this.buildMcpFallbackPayload('fetch_news_stream', { query: targetFinancialNewsQuery, timeframe, limit: 12 }, 'target_financial_news_failed');

    let peerFinancials = peerSettled
      .filter((entry) => {
        if (entry.status === 'fulfilled') return true;
        failureReasons.push('peer_financial_task_failed');
        return false;
      })
      .map((entry) => entry.value);

    let consumerReferences = dedupeReferenceRecords([
      ...normalizeList(consumerMarketPayload?.references),
      ...normalizeList(consumerNewsPayload?.references || consumerNewsPayload?.news)
    ], 16);
    let consumerSignals = extractConsumerSignals(consumerReferences);

    const peerCoverageThreshold = Math.min(Math.max(1, competitorNames.length), 2);
    const initialPeerCoverageCount = peerFinancials
      .filter((item) => Number(item?.referenceCount || 0) > 0)
      .length;
    const needsPeerSupplement = initialPeerCoverageCount < peerCoverageThreshold;
    const needsConsumerSupplement = (
      consumerReferences.length < 3
      || consumerSignals.primaryAgeRanges.length === 0
      || consumerSignals.primarySegments.length === 0
    );

    if (needsPeerSupplement || needsConsumerSupplement) {
      const supplementalTasks = [];
      if (needsConsumerSupplement) {
        supplementalTasks.push({
          kind: 'consumer_market',
          promise: this.fetchMarketReport({ query: `${target} 用户画像 主要消费群体 年龄段`, timeframe })
        });
        supplementalTasks.push({
          kind: 'consumer_news',
          promise: this.fetchNewsStream({ query: `${target} 消费者 年龄段 用户画像 调查`, timeframe, limit: 12 })
        });
      }

      if (needsPeerSupplement) {
        peerFinancials
          .filter((item) => Number(item?.referenceCount || 0) === 0)
          .slice(0, 2)
          .forEach((item) => {
            const companyName = String(item?.company || '').trim();
            if (!companyName) return;
            supplementalTasks.push({
              kind: 'peer_news',
              company: companyName,
              promise: this.fetchNewsStream({ query: peerFinancialNewsQuery(companyName), timeframe, limit: 8 })
            });
          });
      }

      if (supplementalTasks.length > 0) {
        const supplementalSettled = await Promise.allSettled(supplementalTasks.map((task) => task.promise));
        supplementalSettled.forEach((entry, index) => {
          const task = supplementalTasks[index];
          if (entry.status !== 'fulfilled' || !entry.value) {
            failureReasons.push(`supplemental_${task.kind}_failed`);
            return;
          }
          const payload = entry.value;
          if (task.kind === 'consumer_market' || task.kind === 'consumer_news') {
            consumerReferences = dedupeReferenceRecords([
              ...consumerReferences,
              ...normalizeList(payload?.references || payload?.news)
            ], 20);
            return;
          }
          const peerRefs = dedupeReferenceRecords(payload?.references || payload?.news, 8);
          if (peerRefs.length === 0) return;
          peerFinancials = peerFinancials.map((peer) => {
            if (String(peer?.company || '').trim().toLowerCase() !== String(task.company || '').trim().toLowerCase()) {
              return peer;
            }
            const mergedRefs = dedupeReferenceRecords([
              ...normalizeList(peer?.references),
              ...peerRefs
            ], 12);
            return {
              ...peer,
              references: mergedRefs,
              referenceCount: mergedRefs.length
            };
          });
        });
        consumerSignals = extractConsumerSignals(consumerReferences);
      }
    }

    const targetFinancialReferences = dedupeReferenceRecords([
      ...normalizeList(targetFinancialPayload?.references),
      ...normalizeList(targetFinancialNewsPayload?.references || targetFinancialNewsPayload?.news)
    ], 12);
    const targetFilingReferences = dedupeReferenceRecords(
      targetFilingsPayload?.references || targetFilingsPayload?.filings,
      10
    );

    const peerCoverageCount = peerFinancials
      .filter((item) => Number(item?.referenceCount || 0) > 0)
      .length;
    const hasPartialFailure = failureReasons.length > 0
      || Boolean(targetFinancialPayload?.meta?.partialFailure)
      || Boolean(targetFilingsPayload?.meta?.partialFailure)
      || Boolean(consumerMarketPayload?.meta?.partialFailure)
      || Boolean(consumerNewsPayload?.meta?.partialFailure)
      || Boolean(targetFinancialNewsPayload?.meta?.partialFailure)
      || peerFinancials.some((item) => Boolean(item?.partialFailure));

    return {
      target,
      timeframe,
      competitorNames,
      targetFinancial: {
        company: target,
        repoCount: Math.max(Number(targetFinancialPayload?.repoCount || 0), targetFinancialReferences.length),
        references: targetFinancialReferences
      },
      targetRegulatoryFilings: {
        company: target,
        filingCount: Number(targetFilingsPayload?.filingCount || targetFilingsPayload?.fillingCount || targetFilingReferences.length || 0),
        references: targetFilingReferences
      },
      peerFinancials,
      consumerInsights: {
        query: consumerMarketQuery,
        references: consumerReferences,
        primaryAgeRanges: consumerSignals.primaryAgeRanges,
        primarySegments: consumerSignals.primarySegments
      },
      meta: {
        partialFailure: hasPartialFailure,
        failureReasons: uniqueNonEmpty(failureReasons),
        competitorCount: competitorNames.length,
        peerCoverageCount
      }
    };
  }

  async analyzeData() {
    return { result: 'pending' };
  }
}

module.exports = new AIService();
