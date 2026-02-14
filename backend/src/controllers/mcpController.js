const aiService = require('../services/aiService');
const logger = require('../config/logger');
const pool = require('../config/database');
const redis = require('../config/redis');
const {
  normalizeList, extractDisplayLabel, uniqueNonEmpty,
  buildFeatureRows, buildModelResult,
  buildPeerCandidates, buildPeerIndustrySummary, buildPeerInsights, buildPeerSuggestions
} = require('../utils/math');

const AI_ANALYZE_CACHE_TTL_SECONDS = 300;

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const setupSse = (res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
};

const writeSseEvent = (res, eventName, payload) => {
  const name = String(eventName || 'message').trim() || 'message';
  const serialized = JSON.stringify(payload === undefined ? null : payload);
  res.write(`event: ${name}\ndata: ${serialized}\n\n`);
};

const parsePositiveInt = (value, fallback, max = 500) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const AI_ANALYZE_MATCH_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_MATCH_LIMIT, 120, 500);
const AI_ANALYZE_SIGNAL_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_SIGNAL_LIMIT, 20, 100);
const AI_ANALYZE_TOP_INDUSTRY_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_TOP_INDUSTRY_LIMIT, 10, 50);
const AI_ANALYZE_SAMPLE_LIMIT = parsePositiveInt(process.env.AI_ANALYZE_SAMPLE_LIMIT, 20, 100);
const AI_MCP_COMPETITOR_VARIANTS = parsePositiveInt(process.env.AI_MCP_COMPETITOR_VARIANTS, 3, 6);
const AI_MCP_COMPETITOR_RESULT_LIMIT = parsePositiveInt(process.env.AI_MCP_COMPETITOR_RESULT_LIMIT, 24, 100);

const buildCompetitorQueries = (target, maxVariants) => {
  const base = String(target || '').trim();
  if (!base) return [];
  const candidates = [
    base,
    `${base} competitor`,
    `${base} alternative`,
    `${base} market`
  ];
  return uniqueNonEmpty(candidates).slice(0, Math.max(1, maxVariants));
};

const mergeCompetitorSearchResults = (target, queries, settledResults) => {
  const mergedByName = new Map();
  const sourceCounts = { mcp: 0, github: 0 };
  const sourceSet = new Set();
  const attempts = [];
  let partialFailure = false;

  settledResults.forEach((entry, index) => {
    const query = queries[index] || target;
    if (entry.status !== 'fulfilled') {
      partialFailure = true;
      attempts.push({
        query,
        success: false,
        resultCount: 0,
        error: entry.reason?.message || String(entry.reason || 'unknown_error')
      });
      return;
    }

    const payload = entry.value && typeof entry.value === 'object' ? entry.value : { query, competitors: [] };
    const list = normalizeList(payload);
    const meta = payload?.meta || {};
    const listedSources = new Set((meta.sourcesUsed || []).map((v) => String(v || '').toLowerCase()).filter(Boolean));
    const mcpCount = Number(meta?.sourceCounts?.mcp || 0);
    const githubCount = Number(meta?.sourceCounts?.github || 0);

    if (mcpCount > 0 || githubCount > 0) {
      sourceCounts.mcp += mcpCount;
      sourceCounts.github += githubCount;
    } else {
      list.forEach((item) => {
        const source = String(item?.source || 'mcp').toLowerCase();
        if (source === 'github') sourceCounts.github += 1;
        else sourceCounts.mcp += 1;
      });
    }

    list.forEach((item) => {
      const source = String(item?.source || 'mcp').toLowerCase();
      listedSources.add(source);
      const name = String(extractDisplayLabel(item) || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const prev = mergedByName.get(key);
      const prevStars = Number(prev?.stars || 0);
      const nextStars = Number(item?.stars || 0);

      if (!prev || nextStars > prevStars) {
        mergedByName.set(key, { ...item, name, source });
      } else {
        mergedByName.set(key, {
          ...prev,
          description: prev.description || item.description,
          url: prev.url || item.url,
          stars: Math.max(prevStars, nextStars)
        });
      }
    });

    if (meta.partialFailure) {
      partialFailure = true;
    }

    listedSources.forEach((source) => sourceSet.add(source));
    attempts.push({
      query,
      success: true,
      resultCount: list.length,
      partialFailure: Boolean(meta.partialFailure)
    });
  });

  const competitors = [...mergedByName.values()]
    .sort((a, b) => Number(b?.stars || 0) - Number(a?.stars || 0))
    .slice(0, AI_MCP_COMPETITOR_RESULT_LIMIT);

  return {
    query: target,
    competitors,
    meta: {
      sourceCounts,
      sourcesUsed: uniqueNonEmpty([...sourceSet]),
      partialFailure,
      attempts
    }
  };
};

exports.search = async (req, res, next) => {
  try {
    const { query, type } = req.query;
    if (!query || !type) {
      return res.status(400).json({ error: 'Missing query or type parameter' });
    }

    let result;
    if (type === 'industry') {
      result = await aiService.searchIndustryData(query);
    } else if (type === 'competitor') {
      result = await aiService.searchCompetitors(query);
    } else {
      return res.status(400).json({ error: 'Invalid type. Use industry or competitor' });
    }

    res.json(result);
  } catch (err) {
    logger.error('MCP search error:', err);
    next(err);
  }
};

exports.fetch = async (req, res, next) => {
  try {
    const { dataType, params } = req.body;
    if (!dataType) {
      return res.status(400).json({ error: 'Missing dataType' });
    }

    let result;
    if (dataType === 'market_report') {
      result = await aiService.fetchMarketReport(params || {});
    } else if (dataType === 'financial_data') {
      result = await aiService.fetchFinancialData(params || {});
    } else {
      return res.status(400).json({ error: 'Invalid dataType' });
    }

    res.json(result);
  } catch (err) {
    logger.error('MCP fetch error:', err);
    next(err);
  }
};

exports.aiAnalyze = async (req, res, next) => {
  try {
    const target = (req.body?.target || '').trim().slice(0, 200);
    if (!target) {
      return res.status(400).json({ success: false, message: 'Missing target' });
    }

    const streamRequested = toBoolean(req.body?.stream, false);
    let streamEnded = false;
    const endStreamOnce = () => {
      if (!streamRequested || streamEnded) return;
      streamEnded = true;
      try {
        res.end();
      } catch {
        // ignore response close errors
      }
    };

    if (streamRequested) {
      setupSse(res);
      if (typeof req.on === 'function') {
        req.on('close', () => {
          streamEnded = true;
        });
      }
    }

    const normalizedTarget = target.toLowerCase();
    const cacheKey = `aiAnalyze:${normalizedTarget}`;
    if (!streamRequested) {
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        try {
          logger.info(`Cache hit for aiAnalyze: ${normalizedTarget}`);
          return res.json(JSON.parse(cached));
        } catch {
          await redis.del(cacheKey).catch(() => {});
        }
      }
    }

    const escapedTarget = target.replace(/[%_]/g, '\\$&');

    const matchedSql = `
      SELECT id, name, industry, created_at
      FROM enterprises
      WHERE name ILIKE $1 OR industry ILIKE $1
      ORDER BY created_at DESC
      LIMIT ${AI_ANALYZE_MATCH_LIMIT}
    `;

    const matchedRows = (await pool.query(matchedSql, [`%${escapedTarget}%`])).rows;

    let usedRows = matchedRows;
    if (matchedRows.length === 0) {
      const recentSql = `
        SELECT id, name, industry, created_at
        FROM enterprises
        ORDER BY created_at DESC
        LIMIT ${AI_ANALYZE_MATCH_LIMIT}
      `;
      usedRows = (await pool.query(recentSql)).rows;
    }

    const competitorQueries = buildCompetitorQueries(target, AI_MCP_COMPETITOR_VARIANTS);
    const industryPromise = aiService.searchIndustryData(target);
    const competitorSettled = await Promise.allSettled(
      competitorQueries.map((query) => aiService.searchCompetitors(query))
    );
    const industryData = await industryPromise;
    const competitorData = mergeCompetitorSearchResults(target, competitorQueries, competitorSettled);

    const industryList = normalizeList(industryData);
    const competitorList = normalizeList(competitorData);

    const industryNames = uniqueNonEmpty(industryList.map(extractDisplayLabel)).slice(0, AI_ANALYZE_SIGNAL_LIMIT);
    const competitorNames = uniqueNonEmpty(competitorList.map(extractDisplayLabel)).slice(0, AI_ANALYZE_SIGNAL_LIMIT);

    const industryStat = {};
    for (const row of usedRows) {
      if (!row.industry) continue;
      industryStat[row.industry] = (industryStat[row.industry] || 0) + 1;
    }

    const topIndustries = Object.entries(industryStat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, AI_ANALYZE_TOP_INDUSTRY_LIMIT)
      .map(([name, count]) => ({ name, count }));

    const competitorSourceCounts = competitorData?.meta?.sourceCounts || {};

    const featureRows = buildFeatureRows(usedRows, target, industryNames, competitorNames);
    const modelResult = buildModelResult(featureRows);

    const peers = buildPeerCandidates(target, competitorNames, modelResult.ranking);

    const peerRows = peers
      .map((peer) => {
        const rankingItem = (modelResult.ranking || []).find(
          (item) => String(item.name || '').toLowerCase() === String(peer.name || '').toLowerCase()
        );
        return {
          name: peer.name,
          industry: rankingItem?.industry || peer.industry || '未分类',
          source: peer.source,
          topsisScore: rankingItem?.topsisScore ?? 0
        };
      })
      .slice(0, 10);

    const peerIndustryStats = buildPeerIndustrySummary(peerRows);
    const peerInsights = buildPeerInsights(peerRows, peerIndustryStats);
    const peerSuggestions = buildPeerSuggestions(peerIndustryStats, peerRows);

    const keyFindings = [
      `分析对象：${target}`,
      matchedRows.length > 0
        ? `上传数据中命中 ${matchedRows.length} 条企业记录`
        : '上传数据未直接命中对象，已使用最新上传数据进行参考分析',
      topIndustries.length > 0
        ? `上传数据行业分布TOP：${topIndustries.map((i) => `${i.name}(${i.count})`).join('、')}`
        : '上传数据行业字段较少，行业分布信息不足',
      (Number(competitorSourceCounts.mcp || 0) + Number(competitorSourceCounts.github || 0)) > 0
        ? `竞品信号来源：MCP ${Number(competitorSourceCounts.mcp || 0)} 条，GitHub ${Number(competitorSourceCounts.github || 0)} 条`
        : `竞品信号条数：${competitorList.length}`,
      `模型方法：${modelResult.method}`,
      `TOPSIS 趋势（Theil-Sen）：${modelResult.trendLabel}（斜率 ${modelResult.trendSlope}）`,
      ...peerInsights
    ];

    const suggestions = [
      topIndustries.length > 0
        ? `优先围绕 ${topIndustries[0].name} 行业建立月度跟踪指标（需求、价格、竞品动作）`
        : '补充上传企业的行业字段，提升分析可解释性',
      matchedRows.length === 0
        ? '建议上传与分析对象直接相关的企业数据，以提高结果针对性'
        : '建议对命中企业按规模和细分赛道做分组对比',
      modelResult.ranking.length > 0
        ? `优先关注TOP样本：${modelResult.ranking.slice(0, 3).map((item) => item.name).join('、')}`
        : '当前样本不足，建议先上传更多企业数据再做稳定建模',
      ...peerSuggestions
    ];

    let aiNarrativeResult;
    try {
      const narrativePayload = {
        target,
        uploaded: {
          matchedCount: matchedRows.length,
          usedCount: usedRows.length,
          topIndustries
        },
        industryNames,
        competitorNames,
        model: modelResult,
        peers: peerRows,
        peerResearch: peerIndustryStats,
        keyFindings,
        suggestions,
        responseFormat: req.body?.responseFormat
      };

      if (streamRequested) {
        aiNarrativeResult = await aiService.generateAnalysisNarrativeStream(narrativePayload, {
          onEvent: (event) => {
            if (streamEnded) return;
            writeSseEvent(res, event?.type || 'ai_analyze.event', event);
          }
        });
      } else {
        aiNarrativeResult = await aiService.generateAnalysisNarrative(narrativePayload);
      }
    } catch (aiErr) {
      logger.error('MCP aiAnalyze narrative generation failed:', aiErr?.message || aiErr);
      const status = Number(aiErr?.status || 502);
      const retryAfter = parsePositiveInt(aiErr?.retryAfterSec, 0, 300);
      const isRateLimited = status === 429;
      const isTimeout = status === 504;
      const responseStatus = isRateLimited ? 429 : (isTimeout ? 504 : 502);

      if (streamRequested) {
        if (!streamEnded) {
          writeSseEvent(res, 'ai_analyze.error', {
            success: false,
            status: responseStatus,
            message: isRateLimited
              ? 'AI 模型限流，正在退避重试，请稍后再试'
              : isTimeout
                ? 'AI 模型响应超时，请稍后重试'
                : 'AI 模型调用失败，请检查 AI Key、模型配置或稍后重试',
            retryable: isRateLimited || isTimeout,
            retryAfter: retryAfter > 0 ? retryAfter : undefined,
            limitHint: aiErr?.limitHint || (isRateLimited ? 'provider_rate_limited' : (isTimeout ? 'provider_timeout' : 'provider_error'))
          });
        }
        endStreamOnce();
        return;
      }

      return res.status(responseStatus).json({
        success: false,
        message: isRateLimited
          ? 'AI 模型限流，正在退避重试，请稍后再试'
          : isTimeout
            ? 'AI 模型响应超时，请稍后重试'
            : 'AI 模型调用失败，请检查 AI Key、模型配置或稍后重试',
        retryable: isRateLimited || isTimeout,
        retryAfter: retryAfter > 0 ? retryAfter : undefined,
        limitHint: aiErr?.limitHint || (isRateLimited ? 'provider_rate_limited' : (isTimeout ? 'provider_timeout' : 'provider_error'))
      });
    }

    const summary = `${keyFindings.join('；')}。`;

    const response = {
      success: true,
      data: {
        target,
        uploaded: {
          matchedCount: matchedRows.length,
          usedCount: usedRows.length,
          samples: usedRows.slice(0, AI_ANALYZE_SAMPLE_LIMIT),
          topIndustries
        },
        mcp: {
          industryData,
          competitorData,
          githubData: (normalizeList(competitorData) || []).filter((item) => String(item?.source || '').toLowerCase() === 'github')
        },
        peerAnalysis: {
          peers: peerRows,
          industryStats: peerIndustryStats
        },
        model: modelResult,
        analysis: {
          summary,
          keyFindings,
          suggestions,
          aiNarrative: aiNarrativeResult.text,
          aiMeta: {
            modelUsed: aiNarrativeResult.modelUsed,
            providerUsed: aiNarrativeResult.providerUsed,
            degraded: aiNarrativeResult.degraded,
            promptVersion: aiNarrativeResult.promptVersion || 'unknown'
          }
        }
      }
    };

    await redis.setex(cacheKey, AI_ANALYZE_CACHE_TTL_SECONDS, JSON.stringify(response)).catch(() => {});

    if (streamRequested) {
      if (!streamEnded) {
        writeSseEvent(res, 'ai_analyze.completed', response);
      }
      endStreamOnce();
      return;
    }

    res.json(response);
  } catch (err) {
    logger.error('MCP aiAnalyze error:', err);

    if (toBoolean(req.body?.stream, false)) {
      try {
        writeSseEvent(res, 'ai_analyze.error', {
          success: false,
          status: 500,
          message: 'MCP aiAnalyze internal error'
        });
      } catch {
        // ignore response write errors
      }

      try {
        res.end();
      } catch {
        // ignore response close errors
      }
      return;
    }

    next(err);
  }
};
