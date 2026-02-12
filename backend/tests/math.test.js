const {
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
  buildPeerIndustrySummary
} = require('../src/utils/math');

// ── safeNumber ──────────────────────────────────────────────

describe('safeNumber', () => {
  test('converts valid numbers', () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber('3.14')).toBeCloseTo(3.14);
    expect(safeNumber(0)).toBe(0);
  });

  test('returns fallback for invalid input', () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber('abc')).toBe(0);
    expect(safeNumber(NaN)).toBe(0);
    expect(safeNumber(Infinity)).toBe(0);
    expect(safeNumber(NaN, 99)).toBe(99);
  });
});

// ── uniqueNonEmpty ──────────────────────────────────────────

describe('uniqueNonEmpty', () => {
  test('removes duplicates and falsy values', () => {
    expect(uniqueNonEmpty(['a', 'b', 'a', '', null, 'c'])).toEqual(['a', 'b', 'c']);
  });

  test('handles empty array', () => {
    expect(uniqueNonEmpty([])).toEqual([]);
  });
});

// ── extractDisplayLabel ─────────────────────────────────────

describe('extractDisplayLabel', () => {
  test('extracts from object with name', () => {
    expect(extractDisplayLabel({ name: 'Foo' })).toBe('Foo');
  });

  test('returns string directly', () => {
    expect(extractDisplayLabel('bar')).toBe('bar');
  });

  test('handles null/undefined', () => {
    expect(extractDisplayLabel(null)).toBe('');
    expect(extractDisplayLabel(undefined)).toBe('');
  });
});

// ── normalizeList ───────────────────────────────────────────

describe('normalizeList', () => {
  test('returns array directly', () => {
    expect(normalizeList([1, 2])).toEqual([1, 2]);
  });

  test('extracts from known keys', () => {
    expect(normalizeList({ results: [1] })).toEqual([1]);
    expect(normalizeList({ data: [2] })).toEqual([2]);
    expect(normalizeList({ competitors: [3] })).toEqual([3]);
  });

  test('returns empty for non-objects', () => {
    expect(normalizeList(null)).toEqual([]);
    expect(normalizeList('string')).toEqual([]);
    expect(normalizeList(123)).toEqual([]);
  });
});

// ── minMaxNormalize ─────────────────────────────────────────

describe('minMaxNormalize', () => {
  test('normalizes range [0, 1]', () => {
    const result = minMaxNormalize([10, 20, 30]);
    expect(result).toEqual([0, 0.5, 1]);
  });

  test('all identical values -> 0.5', () => {
    expect(minMaxNormalize([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
  });

  test('single value -> 0.5', () => {
    expect(minMaxNormalize([42])).toEqual([0.5]);
  });

  test('empty array -> empty', () => {
    expect(minMaxNormalize([])).toEqual([]);
  });
});

// ── entropyWeight ───────────────────────────────────────────

describe('entropyWeight', () => {
  test('returns weights summing to ~1', () => {
    const matrix = [
      [0.2, 0.8],
      [0.5, 0.5],
      [0.9, 0.1]
    ];
    const weights = entropyWeight(matrix);
    expect(weights.length).toBe(2);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  test('empty matrix -> empty', () => {
    expect(entropyWeight([])).toEqual([]);
  });

  test('single row (m=1) does NOT produce NaN', () => {
    const weights = entropyWeight([[0.5, 0.5]]);
    expect(weights.length).toBe(2);
    weights.forEach((w) => {
      expect(Number.isFinite(w)).toBe(true);
      expect(Number.isNaN(w)).toBe(false);
    });
  });

  test('all identical rows produce equal weights', () => {
    const matrix = [
      [0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5]
    ];
    const weights = entropyWeight(matrix);
    expect(weights[0]).toBeCloseTo(weights[1], 10);
    expect(weights[1]).toBeCloseTo(weights[2], 10);
  });
});

// ── topsisScores ────────────────────────────────────────────

describe('topsisScores', () => {
  test('returns scores between 0 and 1', () => {
    const matrix = [
      [0.2, 0.8],
      [0.9, 0.1]
    ];
    const weights = [0.5, 0.5];
    const scores = topsisScores(matrix, weights);
    expect(scores.length).toBe(2);
    scores.forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  test('empty matrix -> empty', () => {
    expect(topsisScores([], [0.5, 0.5])).toEqual([]);
  });

  test('all identical rows produce equal scores', () => {
    const matrix = [
      [0.5, 0.5],
      [0.5, 0.5]
    ];
    const scores = topsisScores(matrix, [0.5, 0.5]);
    expect(scores[0]).toBeCloseTo(scores[1], 10);
  });
});

// ── median ──────────────────────────────────────────────────

describe('median', () => {
  test('odd length', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  test('even length', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test('empty -> 0', () => {
    expect(median([])).toBe(0);
  });

  test('single element', () => {
    expect(median([7])).toBe(7);
  });
});

// ── theilSenSlope ───────────────────────────────────────────

describe('theilSenSlope', () => {
  test('constant values -> 0', () => {
    expect(theilSenSlope([5, 5, 5, 5])).toBe(0);
  });

  test('linear upward', () => {
    expect(theilSenSlope([1, 2, 3, 4])).toBeCloseTo(1, 10);
  });

  test('linear downward', () => {
    expect(theilSenSlope([4, 3, 2, 1])).toBeCloseTo(-1, 10);
  });

  test('less than 2 values -> 0', () => {
    expect(theilSenSlope([5])).toBe(0);
    expect(theilSenSlope([])).toBe(0);
  });

  test('non-array -> 0', () => {
    expect(theilSenSlope(null)).toBe(0);
    expect(theilSenSlope(undefined)).toBe(0);
  });
});

// ── buildFeatureRows ────────────────────────────────────────

describe('buildFeatureRows', () => {
  const rows = [
    { id: 1, name: '茶颜悦色', industry: '茶饮', created_at: new Date().toISOString() },
    { id: 2, name: '星巴克', industry: '咖啡', created_at: null }
  ];

  test('produces correct structure', () => {
    const result = buildFeatureRows(rows, '茶颜', ['茶饮'], ['星巴克']);
    expect(result.length).toBe(2);
    expect(result[0]).toHaveProperty('relevance');
    expect(result[0]).toHaveProperty('industryHit');
    expect(result[0]).toHaveProperty('competitorHit');
    expect(result[0]).toHaveProperty('recency');
  });

  test('handles missing created_at gracefully', () => {
    const result = buildFeatureRows(rows, '茶颜', [], []);
    const noDateRow = result.find((r) => r.id === 2);
    expect(noDateRow.recency).toBeCloseTo(1 / 1000, 4); // 1/(1+999)
  });

  test('empty rows -> empty result', () => {
    expect(buildFeatureRows([], 'test', [], [])).toEqual([]);
  });
});

// ── buildModelResult ────────────────────────────────────────

describe('buildModelResult', () => {
  test('empty featureRows -> insufficient_data', () => {
    const result = buildModelResult([]);
    expect(result.trendLabel).toBe('insufficient_data');
    expect(result.ranking).toEqual([]);
  });

  test('produces valid result with data', () => {
    const featureRows = [
      { id: 1, name: 'A', industry: 'X', index: 0, relevance: 1, industryHit: 1, competitorHit: 0, recency: 0.5 },
      { id: 2, name: 'B', industry: 'Y', index: 1, relevance: 0, industryHit: 0, competitorHit: 1, recency: 0.3 },
      { id: 3, name: 'C', industry: 'X', index: 2, relevance: 1, industryHit: 0, competitorHit: 0, recency: 0.1 }
    ];
    const result = buildModelResult(featureRows);
    expect(result.method).toBe('Entropy Weight + TOPSIS + Theil-Sen');
    expect(result.weights.length).toBe(4);
    expect(result.ranking.length).toBeLessThanOrEqual(10);
    expect(Number.isFinite(result.trendSlope)).toBe(true);
    expect(['up', 'down', 'stable']).toContain(result.trendLabel);
  });
});

// ── buildPeerCandidates ─────────────────────────────────────

describe('buildPeerCandidates', () => {
  test('deduplicates by name (case-insensitive)', () => {
    const peers = buildPeerCandidates('Alpha', ['alpha', 'Beta'], [{ name: 'Alpha', industry: 'X', topsisScore: 0.8 }]);
    const names = peers.map((p) => p.name.toLowerCase());
    const uniqueNames = [...new Set(names)];
    expect(names.length).toBe(uniqueNames.length);
  });

  test('limits to 10', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Company${i}`);
    const peers = buildPeerCandidates('Target', many, []);
    expect(peers.length).toBeLessThanOrEqual(10);
  });
});

// ── buildPeerIndustrySummary ────────────────────────────────

describe('buildPeerIndustrySummary', () => {
  test('groups by industry', () => {
    const rows = [
      { industry: '茶饮', topsisScore: 0.8 },
      { industry: '茶饮', topsisScore: 0.6 },
      { industry: '咖啡', topsisScore: 0.4 }
    ];
    const result = buildPeerIndustrySummary(rows);
    expect(result.length).toBe(2);
    const tea = result.find((r) => r.industry === '茶饮');
    expect(tea.count).toBe(2);
    expect(tea.avgTopsisScore).toBeCloseTo(0.7, 4);
    expect(tea.maxTopsisScore).toBeCloseTo(0.8, 4);
  });

  test('defaults to "未分类" for missing industry', () => {
    const result = buildPeerIndustrySummary([{ topsisScore: 0.5 }]);
    expect(result[0].industry).toBe('未分类');
  });
});
