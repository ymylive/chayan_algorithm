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

    const normalizedTarget = target.toLowerCase();
    const cacheKey = `aiAnalyze:${normalizedTarget}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      logger.info(`Cache hit for aiAnalyze: ${normalizedTarget}`);
      return res.json(JSON.parse(cached));
    }

    const escapedTarget = target.replace(/[%_]/g, '\\$&');

    const matchedSql = `
      SELECT id, name, industry, created_at
      FROM enterprises
      WHERE name ILIKE $1 OR industry ILIKE $1
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const matchedRows = (await pool.query(matchedSql, [`%${escapedTarget}%`])).rows;

    let usedRows = matchedRows;
    if (matchedRows.length === 0) {
      const recentSql = `
        SELECT id, name, industry, created_at
        FROM enterprises
        ORDER BY created_at DESC
        LIMIT 50
      `;
      usedRows = (await pool.query(recentSql)).rows;
    }

    const [industryData, competitorData] = await Promise.all([
      aiService.searchIndustryData(target),
      aiService.searchCompetitors(target)
    ]);

    const industryList = normalizeList(industryData);
    const competitorList = normalizeList(competitorData);

    const industryNames = uniqueNonEmpty(industryList.map(extractDisplayLabel)).slice(0, 8);
    const competitorNames = uniqueNonEmpty(competitorList.map(extractDisplayLabel)).slice(0, 8);

    const industryStat = {};
    for (const row of usedRows) {
      if (!row.industry) continue;
      industryStat[row.industry] = (industryStat[row.industry] || 0) + 1;
    }

    const topIndustries = Object.entries(industryStat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

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

    const aiNarrativeResult = await aiService.generateAnalysisNarrative({
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
      suggestions
    });

    const summary = `${keyFindings.join('；')}。`;

    const response = {
      success: true,
      data: {
        target,
        uploaded: {
          matchedCount: matchedRows.length,
          usedCount: usedRows.length,
          samples: usedRows.slice(0, 10),
          topIndustries
        },
        mcp: {
          industryData,
          competitorData
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
            degraded: aiNarrativeResult.degraded,
            promptVersion: aiNarrativeResult.promptVersion || 'unknown'
          }
        }
      }
    };

    await redis.setex(cacheKey, AI_ANALYZE_CACHE_TTL_SECONDS, JSON.stringify(response)).catch(() => {});
    res.json(response);
  } catch (err) {
    logger.error('MCP aiAnalyze error:', err);
    next(err);
  }
};
