/**
 * Math / data-transform utilities for TOPSIS + Entropy Weight analysis.
 * Extracted from mcpController to enable isolated testing and reuse.
 */

// ── Primitives ──────────────────────────────────────────────

const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const uniqueNonEmpty = (arr) => [...new Set(arr.filter(Boolean))];

const extractDisplayLabel = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (typeof item !== 'object') return String(item);
  return item.name || item.title || item.company || item.industry || item.keyword || item.text || '';
};

const normalizeList = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const keys = ['results', 'data', 'items', 'list', 'competitors'];
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
};

// ── Statistical functions ───────────────────────────────────

const minMaxNormalize = (values) => {
  if (!values || !values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
};

const entropyWeight = (matrix) => {
  if (!matrix.length) return [];

  const m = matrix.length;
  const n = matrix[0].length;
  const eps = 1e-12;

  const colSums = Array.from({ length: n }, (_, col) =>
    matrix.reduce((sum, row) => sum + row[col], 0)
  );

  const entropy = [];
  for (let col = 0; col < n; col++) {
    let e = 0;
    for (let row = 0; row < m; row++) {
      const p = matrix[row][col] / (colSums[col] || eps);
      if (p > 0) {
        e += p * Math.log(p);
      }
    }
    // Guard: Math.log(1) === 0 causes NaN when m === 1
    e = -e / Math.log(m > 1 ? m : 2);
    entropy.push(e);
  }

  const d = entropy.map((v) => 1 - v);
  const dSum = d.reduce((sum, v) => sum + v, 0) || n;
  return d.map((v) => v / dSum);
};

const topsisScores = (matrix, weights) => {
  if (!matrix.length) return [];

  const n = matrix[0].length;
  const weighted = matrix.map((row) => row.map((v, i) => v * weights[i]));

  const idealBest = Array.from({ length: n }, (_, col) =>
    Math.max(...weighted.map((row) => row[col]))
  );
  const idealWorst = Array.from({ length: n }, (_, col) =>
    Math.min(...weighted.map((row) => row[col]))
  );

  return weighted.map((row) => {
    const dBest = Math.sqrt(
      row.reduce((sum, v, i) => sum + (v - idealBest[i]) ** 2, 0)
    );
    const dWorst = Math.sqrt(
      row.reduce((sum, v, i) => sum + (v - idealWorst[i]) ** 2, 0)
    );
    return dWorst / (dBest + dWorst + 1e-12);
  });
};

const median = (arr) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const theilSenSlope = (yValues) => {
  if (!Array.isArray(yValues) || yValues.length < 2) return 0;
  const slopes = [];
  for (let i = 0; i < yValues.length; i++) {
    for (let j = i + 1; j < yValues.length; j++) {
      slopes.push((yValues[j] - yValues[i]) / (j - i));
    }
  }
  return median(slopes);
};

// ── Constants ───────────────────────────────────────────────

const TREND_THRESHOLD = 0.01;
const RECENCY_FALLBACK_DAYS = 999;
const MS_PER_DAY = 1000 * 3600 * 24;
const MODEL_METHOD = 'Entropy Weight + TOPSIS + Theil-Sen';

// ── Feature engineering ─────────────────────────────────────

const buildFeatureRows = (rows, target, industryNames, competitorNames) => {
  const targetLower = target.toLowerCase();
  const industrySet = new Set(industryNames.map((v) => String(v).toLowerCase()));
  const competitorArr = [...new Set(competitorNames.map((v) => String(v).toLowerCase()))];

  return rows.map((row, index) => {
    const name = String(row.name || '');
    const industry = String(row.industry || '');
    const industryLower = industry.toLowerCase();
    const text = `${name} ${industry}`.toLowerCase();
    const daysAgo = row.created_at
      ? Math.max(0, (Date.now() - new Date(row.created_at).getTime()) / MS_PER_DAY)
      : RECENCY_FALLBACK_DAYS;

    return {
      id: row.id,
      name,
      industry,
      created_at: row.created_at,
      index,
      relevance: text.includes(targetLower) ? 1 : 0,
      industryHit: industrySet.has(industryLower) ? 1 : 0,
      competitorHit: competitorArr.some((kw) => text.includes(kw)) ? 1 : 0,
      recency: 1 / (1 + daysAgo)
    };
  });
};

const buildModelResult = (featureRows) => {
  if (!featureRows.length) {
    return { method: MODEL_METHOD, weights: [], trendSlope: 0, trendLabel: 'insufficient_data', ranking: [] };
  }

  const cols = {
    relevance: minMaxNormalize(featureRows.map((r) => safeNumber(r.relevance))),
    industryHit: minMaxNormalize(featureRows.map((r) => safeNumber(r.industryHit))),
    competitorHit: minMaxNormalize(featureRows.map((r) => safeNumber(r.competitorHit))),
    recency: minMaxNormalize(featureRows.map((r) => safeNumber(r.recency)))
  };

  const matrix = featureRows.map((_, i) => [
    cols.relevance[i], cols.industryHit[i], cols.competitorHit[i], cols.recency[i]
  ]);

  const weights = entropyWeight(matrix);
  const scores = topsisScores(matrix, weights);

  const ranking = featureRows
    .map((row, i) => ({ id: row.id, name: row.name, industry: row.industry, topsisScore: Number(scores[i].toFixed(4)) }))
    .sort((a, b) => b.topsisScore - a.topsisScore)
    .slice(0, 10);

  const orderedScores = featureRows
    .map((row, i) => ({ index: row.index, score: scores[i] }))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.score);

  const slope = theilSenSlope(orderedScores);

  return {
    method: MODEL_METHOD,
    weights: [
      { metric: 'relevance', weight: Number((weights[0] || 0).toFixed(4)) },
      { metric: 'industryHit', weight: Number((weights[1] || 0).toFixed(4)) },
      { metric: 'competitorHit', weight: Number((weights[2] || 0).toFixed(4)) },
      { metric: 'recency', weight: Number((weights[3] || 0).toFixed(4)) }
    ],
    trendSlope: Number(slope.toFixed(4)),
    trendLabel: slope > TREND_THRESHOLD ? 'up' : slope < -TREND_THRESHOLD ? 'down' : 'stable',
    ranking
  };
};

// ── Peer analysis ───────────────────────────────────────────

const buildPeerCandidates = (target, competitorNames = [], ranking = []) => {
  const rankedPeers = (ranking || []).slice(0, 6).map((item) => ({
    name: item.name, industry: item.industry || '', source: 'model_ranking', topsisScore: safeNumber(item.topsisScore)
  }));
  const competitorPeers = (competitorNames || []).slice(0, 8).map((name) => ({
    name: String(name || '').trim(), industry: '', source: 'mcp_competitor', topsisScore: null
  }));
  const targetPeer = target ? [{ name: target, industry: '', source: 'target', topsisScore: null }] : [];

  const seen = new Set();
  return [...targetPeer, ...rankedPeers, ...competitorPeers]
    .filter((item) => {
      const key = String(item.name || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
};

const buildPeerIndustrySummary = (peerRows) => {
  const stats = {};
  for (const row of peerRows) {
    const industry = row.industry || '未分类';
    if (!stats[industry]) stats[industry] = { industry, count: 0, avgTopsisScore: 0, maxTopsisScore: 0 };
    stats[industry].count += 1;
    stats[industry].avgTopsisScore += safeNumber(row.topsisScore);
    stats[industry].maxTopsisScore = Math.max(stats[industry].maxTopsisScore, safeNumber(row.topsisScore));
  }
  return Object.values(stats)
    .map((s) => ({ ...s, avgTopsisScore: Number((s.avgTopsisScore / s.count).toFixed(4)), maxTopsisScore: Number(s.maxTopsisScore.toFixed(4)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
};

const buildPeerInsights = (peers = [], peerIndustryStats = []) => {
  const insights = [];
  if (peers.length > 0) insights.push(`已识别同行样本 ${peers.length} 个，覆盖目标对象与相似竞争对手`);
  if (peerIndustryStats.length > 0) {
    const top = peerIndustryStats[0];
    insights.push(`同行集中行业：${top.industry}（样本 ${top.count}，均分 ${top.avgTopsisScore}）`);
  }
  const highPeers = peers
    .filter((p) => safeNumber(p.topsisScore) > 0)
    .sort((a, b) => safeNumber(b.topsisScore) - safeNumber(a.topsisScore))
    .slice(0, 3)
    .map((p) => `${p.name}(${safeNumber(p.topsisScore).toFixed(4)})`);
  if (highPeers.length > 0) insights.push(`对标优先队列：${highPeers.join('、')}`);
  return insights;
};

const buildPeerSuggestions = (peerIndustryStats = [], peers = []) => {
  const suggestions = [];
  if (peerIndustryStats.length > 0) {
    suggestions.push(`围绕 ${peerIndustryStats[0].industry} 行业建立同行月度对标看板（产品、价格、渠道、传播）`);
  }
  if (peers.length > 0) {
    suggestions.push(`对 ${peers.slice(0, 3).map((p) => p.name).join('、')} 进行季度竞争力复盘，输出差异化策略与落地计划`);
  }
  suggestions.push('将 MCP 竞品检索结果与上传经营数据联动，持续刷新 TOPSIS 排名与风险预警');
  return suggestions;
};

module.exports = {
  safeNumber,
  uniqueNonEmpty,
  extractDisplayLabel,
  normalizeList,
  minMaxNormalize,
  entropyWeight,
  topsisScores,
  median,
  theilSenSlope,
  buildFeatureRows,
  buildModelResult,
  buildPeerCandidates,
  buildPeerIndustrySummary,
  buildPeerInsights,
  buildPeerSuggestions
};
