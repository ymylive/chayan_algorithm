const fs = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures/golden-benchmark');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const listFiles = (suffix) => fs
  .readdirSync(FIXTURE_DIR)
  .filter((fileName) => fileName.endsWith(suffix))
  .sort();

describe('golden benchmark fixture contracts', () => {
  const inputFiles = listFiles('.input.json').filter((fileName) => fileName !== 'corrupt.input.json');
  const expectedFiles = listFiles('.expected.json').filter((fileName) => fileName !== 'corrupt.expected.json');

  const pairedScenarios = inputFiles.map((inputFileName) => {
    const scenario = inputFileName.replace('.input.json', '');
    const expectedFileName = `${scenario}.expected.json`;
    return {
      scenario,
      inputFileName,
      expectedFileName,
      input: readJson(path.join(FIXTURE_DIR, inputFileName)),
      expected: readJson(path.join(FIXTURE_DIR, expectedFileName))
    };
  });

  test('contains required representative scenario classes', () => {
    const classes = new Set(pairedScenarios.map((item) => item.input.class));

    expect(classes).toEqual(new Set([
      'normal',
      'noisy_adversarial',
      'low_evidence',
      'conflicting_evidence',
      'insufficient_evidence'
    ]));
  });

  test('keeps one-to-one input and expected fixture pairs', () => {
    expect(inputFiles.length).toBe(expectedFiles.length);

    pairedScenarios.forEach((item) => {
      expect(expectedFiles).toContain(item.expectedFileName);
      expect(item.input.scenarioId).toBe(item.scenario);
      expect(item.expected.scenarioId).toBe(item.scenario);
      expect(item.input.fixtureVersion).toBe('1.0');
      expect(item.expected.fixtureVersion).toBe('1.0');
    });
  });

  test('enforces deterministic offline fixture constraints', () => {
    const seenScenarioIds = new Set();

    pairedScenarios.forEach((item) => {
      expect(seenScenarioIds.has(item.scenario)).toBe(false);
      seenScenarioIds.add(item.scenario);

      expect(item.input.constraints.offlineOnly).toBe(true);
      expect(typeof item.input.constraints.deterministicSeed).toBe('string');
      expect(item.input.constraints.deterministicSeed.length).toBeGreaterThan(2);
    });
  });

  test('enforces class-to-outcome/degrade contract semantics', () => {
    const expectedContracts = {
      normal: { outcome: 'accept', degraded: false, confidenceBand: 'high' },
      noisy_adversarial: { outcome: 'degrade', degraded: true, confidenceBand: 'medium' },
      low_evidence: { outcome: 'degrade', degraded: true, confidenceBand: 'low' },
      conflicting_evidence: { outcome: 'degrade', degraded: true, confidenceBand: 'medium' },
      insufficient_evidence: { outcome: 'abstain', degraded: true, confidenceBand: 'low' }
    };

    pairedScenarios.forEach((item) => {
      const contract = expectedContracts[item.input.class];

      expect(item.expected.expected.outcome).toBe(contract.outcome);
      expect(item.expected.expected.degraded).toBe(contract.degraded);
      expect(item.expected.expected.confidenceBand).toBe(contract.confidenceBand);
      expect(Array.isArray(item.expected.expected.topFindings)).toBe(true);
      expect(item.expected.expected.topFindings.length).toBeGreaterThan(0);
    });
  });

  test('tracks explicit corrupt fixture artifacts as negative cases', () => {
    expect(fs.existsSync(path.join(FIXTURE_DIR, 'corrupt.input.json'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURE_DIR, 'corrupt.expected.json'))).toBe(true);
  });
});
