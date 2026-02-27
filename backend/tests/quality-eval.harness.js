const fs = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'golden-benchmark');
const BASELINE_PATH = path.join(FIXTURE_DIR, 'quality-eval.baseline.json');

const EPSILON = 1e-9;

const KPIS = [
  'relevance_precision',
  'authority_precision',
  'unsupported_claim_rate',
  'degraded_rate'
];

const clamp = (value) => Math.max(0, Math.min(1, value));

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const listScenarioIds = () => fs
  .readdirSync(FIXTURE_DIR)
  .filter((fileName) => fileName.endsWith('.input.json'))
  .filter((fileName) => fileName !== 'corrupt.input.json')
  .map((fileName) => fileName.replace('.input.json', ''))
  .sort();

const isNoisyToken = (value) => /(spam|adversarial|play-now|casino|xxx|adult|xnxx|xvideos)/i.test(String(value || ''));

const buildCandidate = (input) => {
  const competitors = Array.isArray(input?.evidence?.competitors) ? input.evidence.competitors : [];
  const marketReferences = Array.isArray(input?.evidence?.marketReferences) ? input.evidence.marketReferences : [];
  const financialReferences = Array.isArray(input?.evidence?.financialReferences) ? input.evidence.financialReferences : [];

  const competitorsInsufficient = competitors.length < 2;
  const marketReferencesMissing = marketReferences.length === 0;
  const financialReferencesMissing = financialReferences.length === 0;
  const allMissing = competitors.length === 0 && marketReferencesMissing && financialReferencesMissing;

  const hasNoisyEvidence = competitors.some((item) => isNoisyToken(item.source) || isNoisyToken(item.name));
  const marketTitles = marketReferences.map((item) => String(item.title || '').toLowerCase());
  const hasUp = marketTitles.some((item) => item.includes('up'));
  const hasDown = marketTitles.some((item) => item.includes('down'));
  const hasConflictingTrend = hasUp && hasDown;

  let outcome = 'accept';
  let degraded = false;
  let confidenceBand = 'high';

  if (allMissing) {
    outcome = 'abstain';
    degraded = true;
    confidenceBand = 'low';
  } else if (
    hasNoisyEvidence
    || hasConflictingTrend
    || competitorsInsufficient
    || marketReferencesMissing
    || financialReferencesMissing
  ) {
    outcome = 'degrade';
    degraded = true;
    confidenceBand = (competitorsInsufficient || marketReferencesMissing || financialReferencesMissing) ? 'low' : 'medium';
  }

  return {
    outcome,
    degraded,
    confidenceBand,
    dataGapFlags: {
      competitorsInsufficient,
      marketReferencesMissing,
      financialReferencesMissing
    },
    hasNoisyEvidence
  };
};

const computeUnsupportedContribution = (candidate) => {
  if (candidate.outcome === 'accept') {
    return 0;
  }
  if (candidate.outcome === 'abstain') {
    return 1;
  }
  if (candidate.confidenceBand === 'medium') {
    return 0.25;
  }
  return 0.5;
};

const evaluate = (simulateRegression) => {
  const scenarioIds = listScenarioIds();
  const rows = scenarioIds.map((scenarioId) => {
    const input = readJson(path.join(FIXTURE_DIR, `${scenarioId}.input.json`));
    const expected = readJson(path.join(FIXTURE_DIR, `${scenarioId}.expected.json`));
    const candidate = buildCandidate(input);
    const expectedOutcome = expected.expected;
    return {
      scenarioId,
      expected: expectedOutcome,
      candidate,
      relevanceMatch: candidate.outcome === expectedOutcome.outcome,
      authorityMatch: candidate.hasNoisyEvidence === (input.class === 'noisy_adversarial'),
      unsupportedContribution: computeUnsupportedContribution(candidate)
    };
  });

  const total = rows.length || 1;
  const kpis = {
    relevance_precision: rows.filter((row) => row.relevanceMatch).length / total,
    authority_precision: rows.filter((row) => row.authorityMatch).length / total,
    unsupported_claim_rate: rows.reduce((acc, row) => acc + row.unsupportedContribution, 0) / total,
    degraded_rate: rows.filter((row) => row.candidate.degraded).length / total
  };

  if (simulateRegression) {
    kpis.relevance_precision = clamp(kpis.relevance_precision - 0.35);
    kpis.authority_precision = clamp(kpis.authority_precision - 0.3);
    kpis.unsupported_claim_rate = clamp(kpis.unsupported_claim_rate + 0.4);
    kpis.degraded_rate = clamp(kpis.degraded_rate + 0.2);
  }

  return {
    scenarioCount: rows.length,
    rows,
    kpis
  };
};

const compareAgainstBaseline = (candidate, baseline) => {
  const thresholds = baseline.thresholds || {};
  const criticalBreaches = [];

  KPIS.forEach((name) => {
    const current = Number(candidate.kpis[name] || 0);
    const prior = Number(baseline.kpis[name] || 0);
    const delta = current - prior;

    const rule = thresholds[name] || {};
    const minDelta = typeof rule.minDelta === 'number' ? rule.minDelta : -Infinity;
    const maxDelta = typeof rule.maxDelta === 'number' ? rule.maxDelta : Infinity;

    if (delta + EPSILON < minDelta || delta - EPSILON > maxDelta) {
      criticalBreaches.push({
        kpi: name,
        baseline: prior,
        candidate: current,
        delta,
        minDelta,
        maxDelta
      });
    }
  });

  return {
    criticalBreaches,
    passed: criticalBreaches.length === 0
  };
};

const main = () => {
  const simulateRegression = process.env.QUALITY_EVAL_SIMULATE_REGRESSION === '1';
  const baseline = readJson(BASELINE_PATH);
  const candidate = evaluate(simulateRegression);
  const comparison = compareAgainstBaseline(candidate, baseline);

  const report = {
    version: '1.0',
    fixtureVersion: baseline.fixtureVersion || '1.0',
    simulateRegression,
    scenarioCount: candidate.scenarioCount,
    baseline: baseline.kpis,
    candidate: candidate.kpis,
    thresholds: baseline.thresholds,
    criticalBreaches: comparison.criticalBreaches,
    passed: comparison.passed
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!comparison.passed) {
    process.exitCode = 1;
  }
};

main();
