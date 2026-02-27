const fs = require('fs');
const path = require('path');

jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

describe('settingsController', () => {
  const settingsFile = path.join(__dirname, '../data/ai-settings.json');
  const settingsDir = path.dirname(settingsFile);

  let pool;

  const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    jest.resetModules();
    pool = require('../src/config/database');
    pool.query.mockReset();
    delete process.env.AI_ALLOWED_ENDPOINT_HOSTS;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_FALLBACK_MODEL;
    delete process.env.AI_MODEL_FALLBACKS;
    delete process.env.AI_PROTOCOL;
    delete process.env.AI_SECONDARY_BASE_URL;
    delete process.env.AI_SECONDARY_API_KEY;
    delete process.env.AI_SECONDARY_MODEL;
    delete process.env.AI_TEMPERATURE;
    delete process.env.AI_MAX_TOKENS;
    delete process.env.AI_USE_MOCK;
    delete process.env.AI_QUALITY_CONTRACT_ENABLED;
    delete process.env.AI_QUALITY_STRICT_MODE;
    delete process.env.AI_QUALITY_MIN_COVERAGE_SOURCES;
    delete process.env.AI_QUALITY_POLICY_VERSION;
    await fs.promises.rm(settingsDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.promises.rm(settingsDir, { recursive: true, force: true });
  });

  test('returns 403 when requester has no DB user identity', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { role: 'admin' },
      body: { apiEndpoint: 'https://openrouter.ai/api/v1' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Forbidden' });
  });

  test('returns 400 for malformed API endpoint URL', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 7, role: 'user' },
      body: { apiEndpoint: 'not-a-url' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid API endpoint URL' });
  });

  test('returns 400 for non-https API endpoint', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 7, role: 'user' },
      body: { apiEndpoint: 'http://openrouter.ai/api/v1' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'API endpoint must use HTTPS' });
  });

  test('returns 400 for non-allowlisted API endpoint host', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 7, role: 'user' },
      body: { apiEndpoint: 'https://example.com/api/v1' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'API endpoint host is not allowed' });
  });

  test('seeds first-time user settings from env + legacy defaults and masks secret', async () => {
    process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.AI_MODEL = 'env/model';
    process.env.AI_TEMPERATURE = '0.61';

    await fs.promises.mkdir(settingsDir, { recursive: true });
    await fs.promises.writeFile(settingsFile, JSON.stringify({
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: 'legacy-secret',
      model: 'legacy/model',
      temperature: 0.22,
      maxTokens: 2300,
      useMock: true
    }), 'utf8');

    const seeded = {
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: 'legacy-secret',
      model: 'env/model',
      temperature: 0.61,
      maxTokens: 2300,
      useMock: true
    };

    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ settings_json: seeded }] });

    const { getSettings } = require('../src/controllers/settingsController');
    const req = { user: { id: 11, role: 'user' } };
    const res = buildRes();

    await getSettings(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1'),
      [11]
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_ai_settings'),
      [11, expect.objectContaining({ model: 'env/model', apiKey: 'legacy-secret' })]
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        apiKey: '********',
        model: 'env/model'
      })
    });
  });

  test('does not overwrite existing secret when placeholder is submitted', async () => {
    const existing = {
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: 'real-secret',
      model: 'old/model',
      temperature: 0.33,
      maxTokens: 1400,
      useMock: false
    };
    const updated = {
      ...existing,
      model: 'new/model'
    };

    pool.query
      .mockResolvedValueOnce({ rows: [{ settings_json: existing }] })
      .mockResolvedValueOnce({ rows: [{ settings_json: updated }] });

    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 3, role: 'user' },
      body: { apiKey: '********', model: 'new/model' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_ai_settings'),
      [3, expect.objectContaining({ apiKey: 'real-secret', model: 'new/model' })]
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });
  });

  test('persists protocol/fallback fields and keeps secondary key when placeholder is submitted', async () => {
    const existing = {
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: 'real-secret',
      model: 'old/model',
      protocol: 'chat_completions',
      fallbackModel: 'old/fallback',
      modelFallbacks: 'old/a,old/b',
      secondaryApiEndpoint: 'https://secondary.old/v1',
      secondaryProtocol: 'chat_completions',
      secondaryApiKey: 'secondary-secret',
      secondaryModel: 'old/secondary',
      tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
      tertiaryProtocol: 'chat_completions',
      tertiaryApiKey: 'tertiary-secret',
      tertiaryModel: 'third/model',
      temperature: 0.33,
      maxTokens: 1400,
      useMock: false
    };

    pool.query
      .mockResolvedValueOnce({ rows: [{ settings_json: existing }] })
      .mockResolvedValueOnce({
        rows: [{
          settings_json: {
            ...existing,
            protocol: 'responses',
            fallbackModel: 'next/fallback',
            modelFallbacks: 'first/model,second/model',
            secondaryApiEndpoint: 'https://secondary.new/v1',
            secondaryProtocol: 'chat_completions',
            secondaryModel: 'next/secondary'
          }
        }]
      });

    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 5, role: 'user' },
      body: {
        protocol: 'responses',
        fallbackModel: 'next/fallback',
        modelFallbacks: [' first/model ', 'second/model', 'first/model'],
        secondaryApiEndpoint: 'https://secondary.new/v1',
        secondaryProtocol: 'openai-completions',
        secondaryApiKey: '********',
        secondaryModel: 'next/secondary',
        tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
        tertiaryProtocol: 'openai-completions',
        tertiaryApiKey: '********',
        tertiaryModel: 'third/model'
      }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_ai_settings'),
      [5, expect.objectContaining({
        protocol: 'responses',
        fallbackModel: 'next/fallback',
        modelFallbacks: 'first/model,second/model',
        secondaryApiEndpoint: 'https://secondary.new/v1',
        secondaryProtocol: 'chat_completions',
        secondaryApiKey: 'secondary-secret',
        secondaryModel: 'next/secondary',
        tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
        tertiaryProtocol: 'chat_completions',
        tertiaryApiKey: 'tertiary-secret',
        tertiaryModel: 'third/model'
      })]
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });
  });

  test('does not mutate global env during per-user settings update', async () => {
    process.env.AI_BASE_URL = 'https://seed-only.example/v1';
    process.env.AI_API_KEY = 'seed-api-key';
    process.env.AI_MODEL = 'seed/model';
    process.env.AI_TEMPERATURE = '0.44';
    process.env.AI_MAX_TOKENS = '1999';
    process.env.AI_USE_MOCK = 'true';

    const existing = {
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: 'old-secret',
      model: 'old/model',
      temperature: 0.22,
      maxTokens: 1200,
      useMock: false
    };

    pool.query
      .mockResolvedValueOnce({ rows: [{ settings_json: existing }] })
      .mockResolvedValueOnce({
        rows: [{ settings_json: { ...existing, model: 'user/specific', apiKey: 'new-secret' } }]
      });

    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 33, role: 'user' },
      body: { model: 'user/specific', apiKey: 'new-secret' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(process.env.AI_BASE_URL).toBe('https://seed-only.example/v1');
    expect(process.env.AI_API_KEY).toBe('seed-api-key');
    expect(process.env.AI_MODEL).toBe('seed/model');
    expect(process.env.AI_TEMPERATURE).toBe('0.44');
    expect(process.env.AI_MAX_TOKENS).toBe('1999');
    expect(process.env.AI_USE_MOCK).toBe('true');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });
  });

  test('isolates settings reads by authenticated user id', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ settings_json: { model: 'user-one', apiKey: 'k1' } }] })
      .mockResolvedValueOnce({ rows: [{ settings_json: { model: 'user-two', apiKey: 'k2' } }] });

    const { getSettings } = require('../src/controllers/settingsController');
    const resA = buildRes();
    const resB = buildRes();

    await getSettings({ user: { id: 1, role: 'user' } }, resA);
    await getSettings({ user: { id: 2, role: 'user' } }, resB);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE user_id = $1'),
      [1]
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE user_id = $1'),
      [2]
    );
    expect(resA.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ model: 'user-one', apiKey: '********' })
    });
    expect(resB.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ model: 'user-two', apiKey: '********' })
    });
  });

  test('returns protocol/fallback fields and masks both primary/secondary keys', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        settings_json: {
          apiEndpoint: 'https://openrouter.ai/api/v1',
          apiKey: 'primary-secret',
          model: 'main/model',
          protocol: 'responses',
          fallbackModel: 'fallback/model',
          modelFallbacks: 'fb1,fb2',
          secondaryApiEndpoint: 'https://secondary.example/v1',
          secondaryProtocol: 'chat_completions',
          secondaryApiKey: 'secondary-secret',
          secondaryModel: 'secondary/model',
          tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
          tertiaryProtocol: 'chat_completions',
          tertiaryApiKey: 'tertiary-secret',
          tertiaryModel: 'third/model',
          temperature: 0.35,
          maxTokens: 1400,
          useMock: false
        }
      }]
    });

    const { getSettings } = require('../src/controllers/settingsController');
    const res = buildRes();

    await getSettings({ user: { id: 9, role: 'user' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        protocol: 'responses',
        fallbackModel: 'fallback/model',
        modelFallbacks: 'fb1,fb2',
        secondaryApiEndpoint: 'https://secondary.example/v1',
        secondaryProtocol: 'chat_completions',
        secondaryModel: 'secondary/model',
        tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
        tertiaryProtocol: 'chat_completions',
        tertiaryModel: 'third/model',
        apiKey: '********',
        secondaryApiKey: '********',
        tertiaryApiKey: '********'
      })
    });
  });

  test('normalizes quality feature-flag fields during settings update', async () => {
    const existing = {
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: 'primary-secret',
      model: 'main/model',
      protocol: 'responses',
      fallbackModel: 'fallback/model',
      modelFallbacks: '',
      secondaryApiEndpoint: '',
      secondaryProtocol: 'chat_completions',
      secondaryApiKey: '',
      secondaryModel: '',
      tertiaryApiEndpoint: '',
      tertiaryProtocol: 'chat_completions',
      tertiaryApiKey: '',
      tertiaryModel: '',
      temperature: 0.35,
      maxTokens: 1400,
      useMock: false,
      qualityContractEnabled: true,
      qualityStrictMode: false,
      qualityMinCoverageSources: 2
    };

    pool.query
      .mockResolvedValueOnce({ rows: [{ settings_json: existing }] })
      .mockResolvedValueOnce({ rows: [{ settings_json: existing }] });

    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 15, role: 'user' },
      body: {
        qualityContractEnabled: '0',
        qualityStrictMode: 'yes',
        qualityMinCoverageSources: '6'
      }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_ai_settings'),
      [15, expect.objectContaining({
        qualityContractEnabled: false,
        qualityStrictMode: true,
        qualityMinCoverageSources: 6
      })]
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });
  });

  test('rejects tuning update without baseline/candidate KPI evidence', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 19, role: 'user' },
      body: {
        qualityTuningDecision: {
          inputs: {
            onlineKpiTrend: {
              trend: 'down',
              windowSize: 4,
              breachCount: 3,
              maxBreachCount: 2
            },
            errorBuckets: {
              timeout: 2
            }
          }
        }
      }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Tuning update rejected: baseline/candidate KPI delta evidence is required'
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('auto-disables quality contract when canary breach window triggers rollback', async () => {
    const existing = {
      apiEndpoint: 'https://openrouter.ai/api/v1',
      apiKey: 'primary-secret',
      model: 'main/model',
      protocol: 'responses',
      fallbackModel: 'fallback/model',
      modelFallbacks: '',
      secondaryApiEndpoint: '',
      secondaryProtocol: 'chat_completions',
      secondaryApiKey: '',
      secondaryModel: '',
      tertiaryApiEndpoint: '',
      tertiaryProtocol: 'chat_completions',
      tertiaryApiKey: '',
      tertiaryModel: '',
      temperature: 0.35,
      maxTokens: 1400,
      useMock: false,
      qualityContractEnabled: true,
      qualityStrictMode: false,
      qualityMinCoverageSources: 2,
      qualityPolicyVersion: 'quality-policy-v1',
      qualityCanaryPolicy: {
        enabled: true,
        autoRollback: true,
        breachWindowSize: 5,
        maxBreachCount: 1
      },
      qualityTuningHistory: [],
      qualityLastRollback: null
    };

    pool.query
      .mockResolvedValueOnce({ rows: [{ settings_json: existing }] })
      .mockResolvedValueOnce({ rows: [{ settings_json: existing }] });

    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { id: 22, role: 'user' },
      body: {
        qualityPolicyVersion: 'quality-policy-v2',
        qualityTuningDecision: {
          inputs: {
            offlineKpiDelta: {
              baseline: {
                relevance_precision: 0.81,
                unsupported_claim_rate: 0.07
              },
              candidate: {
                relevance_precision: 0.86,
                unsupported_claim_rate: 0.09
              }
            },
            onlineKpiTrend: {
              trend: 'down',
              windowSize: 5,
              breachCount: 3,
              maxBreachCount: 1
            },
            errorBuckets: {
              timeout: 5,
              unsupported_claim_detected: 2
            }
          },
          adjustments: {
            prompt: ['narrow-evidence-anchors'],
            routing: ['primary->secondary when support ratio < 0.75'],
            threshold: ['raise_min_coverage_sources_to_3']
          }
        }
      }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_ai_settings'),
      [22, expect.objectContaining({
        qualityContractEnabled: false,
        qualityPolicyVersion: 'quality-policy-v2',
        qualityLastRollback: expect.objectContaining({
          triggered: true,
          reason: 'canary_kpi_breach_window',
          action: 'qualityContractEnabled_auto_disabled',
          canary: expect.objectContaining({
            breachWindowSize: 5,
            breachCount: 3,
            maxBreachCount: 1
          })
        }),
        qualityTuningHistory: expect.arrayContaining([
          expect.objectContaining({
            policyVersion: 'quality-policy-v2',
            inputs: expect.objectContaining({
              offlineKpiDelta: expect.objectContaining({
                baseline: expect.objectContaining({ relevance_precision: 0.81 }),
                candidate: expect.objectContaining({ relevance_precision: 0.86 }),
                delta: expect.objectContaining({ relevance_precision: 0.05 })
              })
            })
          })
        ])
      })]
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });
  });
});
