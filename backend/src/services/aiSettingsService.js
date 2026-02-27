const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const logger = require('../config/logger');
const { toBoolean, parsePositiveInt, resolveUserId } = require('../utils/coercion');
const { normalizeProtocol } = require('./openaiResponsesAdapter');

const SETTINGS_FILE = path.join(__dirname, '../../data/ai-settings.json');

const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://gmn.chuangzuoli.com/v1',
  model: 'gpt-5.2',
  protocol: 'responses',
  fallbackModel: 'gpt-5.2',
  modelFallbacks: '',
  secondaryApiEndpoint: 'https://api-inference.modelscope.cn/v1',
  secondaryProtocol: 'chat_completions',
  secondaryModel: 'ZhipuAI/GLM-5',
  tertiaryApiEndpoint: 'https://openrouter.ai/api/v1',
  tertiaryProtocol: 'chat_completions',
  tertiaryModel: 'deepseek/deepseek-r1-0528:free',
  temperature: 0.35,
  maxTokens: 1400,
  useMock: false,
  qualityContractEnabled: true,
  qualityStrictMode: false,
  qualityMinCoverageSources: 2,
  qualityPolicyVersion: 'quality-policy-v1',
  qualityCanaryPolicy: {
    enabled: false,
    autoRollback: true,
    breachWindowSize: 5,
    maxBreachCount: 2
  },
  qualityTuningHistory: [],
  qualityLastRollback: null
};

const QUALITY_TUNING_HISTORY_MAX = 20;

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseNonNegativeInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

const normalizePolicyVersion = (value, fallback = DEFAULT_SETTINGS.qualityPolicyVersion) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().slice(0, 80);
  return normalized || fallback;
};

const normalizeKpiMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const normalized = {};
  Object.keys(value).forEach((key) => {
    const metric = String(key || '').trim().slice(0, 80);
    if (!metric) return;
    const num = Number(value[key]);
    if (!Number.isFinite(num)) return;
    normalized[metric] = Number(num.toFixed(6));
  });

  return normalized;
};

const normalizeErrorBuckets = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const normalized = {};
  Object.keys(value).forEach((key) => {
    const bucket = String(key || '').trim().slice(0, 80);
    if (!bucket) return;
    normalized[bucket] = parseNonNegativeInt(value[key], 0, 1000000);
  });

  return normalized;
};

const normalizeOnlineKpiTrend = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    trend: typeof source.trend === 'string' && source.trend.trim()
      ? source.trend.trim().slice(0, 40)
      : 'unknown',
    windowSize: parsePositiveInt(source.windowSize, 0, 1000),
    breachCount: parseNonNegativeInt(source.breachCount, 0, 1000),
    maxBreachCount: parseNonNegativeInt(source.maxBreachCount, 0, 1000)
  };
};

const normalizeCanaryPolicy = (value, fallback = DEFAULT_SETTINGS.qualityCanaryPolicy) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: toBoolean(source.enabled, toBoolean(fallback.enabled, false)),
    autoRollback: toBoolean(source.autoRollback, toBoolean(fallback.autoRollback, true)),
    breachWindowSize: parsePositiveInt(source.breachWindowSize, parsePositiveInt(fallback.breachWindowSize, 5, 1000), 1000),
    maxBreachCount: parseNonNegativeInt(source.maxBreachCount, parseNonNegativeInt(fallback.maxBreachCount, 2, 1000), 1000)
  };
};

const hasKpiEvidence = (inputs) => {
  const baseline = normalizeKpiMap(inputs?.offlineKpiDelta?.baseline);
  const candidate = normalizeKpiMap(inputs?.offlineKpiDelta?.candidate);
  return Object.keys(baseline).length > 0 && Object.keys(candidate).length > 0;
};

const buildOfflineKpiDelta = (inputs) => {
  const baseline = normalizeKpiMap(inputs?.offlineKpiDelta?.baseline);
  const candidate = normalizeKpiMap(inputs?.offlineKpiDelta?.candidate);
  const allMetrics = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
  const delta = {};
  allMetrics.forEach((metric) => {
    const baseVal = baseline[metric];
    const candidateVal = candidate[metric];
    if (!Number.isFinite(baseVal) || !Number.isFinite(candidateVal)) return;
    delta[metric] = Number((candidateVal - baseVal).toFixed(6));
  });

  return {
    baseline,
    candidate,
    delta
  };
};

const buildCanaryObservation = (inputs, canaryPolicy) => {
  const trend = normalizeOnlineKpiTrend(inputs?.onlineKpiTrend);
  return {
    trend: trend.trend,
    breachWindowSize: trend.windowSize || canaryPolicy.breachWindowSize,
    breachCount: trend.breachCount,
    maxBreachCount: trend.maxBreachCount || canaryPolicy.maxBreachCount
  };
};

const shouldTriggerRollback = (canaryPolicy, canaryObservation) => {
  if (!canaryPolicy.enabled || !canaryPolicy.autoRollback) return false;
  const windowSize = parsePositiveInt(canaryObservation.breachWindowSize, 0, 1000);
  if (windowSize <= 0) return false;
  return canaryObservation.breachCount > canaryObservation.maxBreachCount;
};

const normalizeAdjustments = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalizeStrings = (input) => {
    if (Array.isArray(input)) {
      return input
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 20);
    }
    if (typeof input === 'string' && input.trim()) {
      return [input.trim().slice(0, 120)];
    }
    return [];
  };

  return {
    prompt: normalizeStrings(source.prompt),
    routing: normalizeStrings(source.routing),
    threshold: normalizeStrings(source.threshold)
  };
};

const buildTuningDecisionRecord = (decisionInput, policyVersion, canaryPolicy) => {
  const inputSource = decisionInput && typeof decisionInput === 'object' && !Array.isArray(decisionInput)
    ? decisionInput
    : {};
  const inputs = inputSource.inputs && typeof inputSource.inputs === 'object' && !Array.isArray(inputSource.inputs)
    ? inputSource.inputs
    : inputSource;

  const offlineKpiDelta = buildOfflineKpiDelta(inputs);
  const canaryObservation = buildCanaryObservation(inputs, canaryPolicy);
  const rollbackTriggered = shouldTriggerRollback(canaryPolicy, canaryObservation);
  const now = new Date().toISOString();

  return {
    decisionId: `tune-${Date.now()}`,
    decidedAt: now,
    policyVersion: normalizePolicyVersion(policyVersion),
    inputs: {
      offlineKpiDelta,
      onlineKpiTrend: {
        trend: canaryObservation.trend,
        windowSize: canaryObservation.breachWindowSize,
        breachCount: canaryObservation.breachCount,
        maxBreachCount: canaryObservation.maxBreachCount
      },
      errorBuckets: normalizeErrorBuckets(inputs.errorBuckets)
    },
    adjustments: normalizeAdjustments(inputSource.adjustments),
    rollback: rollbackTriggered
      ? {
          triggered: true,
          triggeredAt: now,
          reason: 'canary_kpi_breach_window',
          action: 'qualityContractEnabled_auto_disabled',
          canary: {
            breachWindowSize: canaryObservation.breachWindowSize,
            breachCount: canaryObservation.breachCount,
            maxBreachCount: canaryObservation.maxBreachCount,
            trend: canaryObservation.trend
          }
        }
      : null
  };
};

const normalizeTuningHistory = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .slice(-QUALITY_TUNING_HISTORY_MAX);
};

const normalizeModelFallbacks = (value) => {
  const parts = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  const seen = new Set();
  const normalized = [];
  for (const part of parts) {
    const item = String(part || '').trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized.join(',');
};

const normalizeSettings = (settings) => ({
  apiEndpoint: settings.apiEndpoint || DEFAULT_SETTINGS.apiEndpoint,
  apiKey: settings.apiKey || '',
  model: settings.model || DEFAULT_SETTINGS.model,
  protocol: normalizeProtocol(settings.protocol || DEFAULT_SETTINGS.protocol),
  fallbackModel: settings.fallbackModel || settings.model || DEFAULT_SETTINGS.model,
  modelFallbacks: normalizeModelFallbacks(settings.modelFallbacks),
  secondaryApiEndpoint: settings.secondaryApiEndpoint || '',
  secondaryProtocol: normalizeProtocol(settings.secondaryProtocol || DEFAULT_SETTINGS.secondaryProtocol),
  secondaryApiKey: settings.secondaryApiKey || '',
  secondaryModel: settings.secondaryModel || '',
  tertiaryApiEndpoint: settings.tertiaryApiEndpoint || '',
  tertiaryProtocol: normalizeProtocol(settings.tertiaryProtocol || DEFAULT_SETTINGS.tertiaryProtocol),
  tertiaryApiKey: settings.tertiaryApiKey || '',
  tertiaryModel: settings.tertiaryModel || '',
  temperature: typeof settings.temperature === 'number' ? settings.temperature : DEFAULT_SETTINGS.temperature,
  maxTokens: typeof settings.maxTokens === 'number' ? settings.maxTokens : DEFAULT_SETTINGS.maxTokens,
  useMock: false,
  qualityContractEnabled: toBoolean(settings.qualityContractEnabled, DEFAULT_SETTINGS.qualityContractEnabled),
  qualityStrictMode: toBoolean(settings.qualityStrictMode, DEFAULT_SETTINGS.qualityStrictMode),
  qualityMinCoverageSources: parsePositiveInt(
    settings.qualityMinCoverageSources,
    DEFAULT_SETTINGS.qualityMinCoverageSources,
    12
  ),
  qualityPolicyVersion: normalizePolicyVersion(settings.qualityPolicyVersion),
  qualityCanaryPolicy: normalizeCanaryPolicy(settings.qualityCanaryPolicy),
  qualityTuningHistory: normalizeTuningHistory(settings.qualityTuningHistory),
  qualityLastRollback: settings.qualityLastRollback && typeof settings.qualityLastRollback === 'object'
    ? settings.qualityLastRollback
    : null
});

const readLegacyPersistedSettings = () => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    logger.warn('Failed to read legacy AI settings seed source:', err?.message || err);
  }

  return {};
};

const buildSeedSettings = () => {
  const legacy = readLegacyPersistedSettings();
  const envTemperature = toFiniteNumber(process.env.AI_TEMPERATURE);
  const envMaxTokens = toFiniteNumber(process.env.AI_MAX_TOKENS);

  return normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...legacy,
    ...(process.env.AI_BASE_URL ? { apiEndpoint: process.env.AI_BASE_URL } : {}),
    ...(process.env.AI_API_KEY ? { apiKey: process.env.AI_API_KEY } : {}),
    ...(process.env.AI_MODEL ? { model: process.env.AI_MODEL } : {}),
    ...(process.env.AI_PROTOCOL ? { protocol: process.env.AI_PROTOCOL } : {}),
    ...(process.env.AI_FALLBACK_MODEL ? { fallbackModel: process.env.AI_FALLBACK_MODEL } : {}),
    ...(process.env.AI_MODEL_FALLBACKS ? { modelFallbacks: process.env.AI_MODEL_FALLBACKS } : {}),
    ...(process.env.AI_SECONDARY_BASE_URL ? { secondaryApiEndpoint: process.env.AI_SECONDARY_BASE_URL } : {}),
    ...(process.env.AI_SECONDARY_PROTOCOL ? { secondaryProtocol: process.env.AI_SECONDARY_PROTOCOL } : {}),
    ...(process.env.AI_SECONDARY_API_KEY ? { secondaryApiKey: process.env.AI_SECONDARY_API_KEY } : {}),
    ...(process.env.AI_SECONDARY_MODEL ? { secondaryModel: process.env.AI_SECONDARY_MODEL } : {}),
    ...(process.env.AI_TERTIARY_BASE_URL ? { tertiaryApiEndpoint: process.env.AI_TERTIARY_BASE_URL } : {}),
    ...(process.env.AI_TERTIARY_PROTOCOL ? { tertiaryProtocol: process.env.AI_TERTIARY_PROTOCOL } : {}),
    ...(process.env.AI_TERTIARY_API_KEY ? { tertiaryApiKey: process.env.AI_TERTIARY_API_KEY } : {}),
    ...(process.env.AI_TERTIARY_MODEL ? { tertiaryModel: process.env.AI_TERTIARY_MODEL } : {}),
    ...(envTemperature !== null ? { temperature: envTemperature } : {}),
    ...(envMaxTokens !== null && envMaxTokens > 0 ? { maxTokens: envMaxTokens } : {}),
    ...(process.env.AI_QUALITY_CONTRACT_ENABLED !== undefined
      ? { qualityContractEnabled: toBoolean(process.env.AI_QUALITY_CONTRACT_ENABLED, DEFAULT_SETTINGS.qualityContractEnabled) }
      : {}),
    ...(process.env.AI_QUALITY_STRICT_MODE !== undefined
      ? { qualityStrictMode: toBoolean(process.env.AI_QUALITY_STRICT_MODE, DEFAULT_SETTINGS.qualityStrictMode) }
      : {}),
    ...(process.env.AI_QUALITY_MIN_COVERAGE_SOURCES !== undefined
      ? {
          qualityMinCoverageSources: parsePositiveInt(
            process.env.AI_QUALITY_MIN_COVERAGE_SOURCES,
            DEFAULT_SETTINGS.qualityMinCoverageSources,
            12
          )
        }
      : {})
  });
};

const findUserSettings = async (userId) => {
  const result = await pool.query(
    'SELECT settings_json FROM user_ai_settings WHERE user_id = $1 LIMIT 1',
    [userId]
  );

  if (result.rows[0] && result.rows[0].settings_json && typeof result.rows[0].settings_json === 'object') {
    return normalizeSettings(result.rows[0].settings_json);
  }

  return null;
};

const getOrCreateUserSettings = async (userId) => {
  const existing = await findUserSettings(userId);
  if (existing) {
    return existing;
  }

  const seeded = buildSeedSettings();
  const inserted = await pool.query(
    `INSERT INTO user_ai_settings (user_id, settings_json, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING
     RETURNING settings_json`,
    [userId, seeded]
  );

  if (inserted.rows[0] && inserted.rows[0].settings_json) {
    return normalizeSettings(inserted.rows[0].settings_json);
  }

  const afterInsert = await findUserSettings(userId);
  return afterInsert || seeded;
};

const updateUserSettings = async (userId, patch) => {
  const existing = await getOrCreateUserSettings(userId);
  const hasModelFallbacks = Object.prototype.hasOwnProperty.call(patch, 'modelFallbacks');
  const hasQualityContractEnabled = Object.prototype.hasOwnProperty.call(patch, 'qualityContractEnabled');
  const hasQualityStrictMode = Object.prototype.hasOwnProperty.call(patch, 'qualityStrictMode');
  const hasQualityMinCoverageSources = Object.prototype.hasOwnProperty.call(patch, 'qualityMinCoverageSources');
  const hasQualityPolicyVersion = Object.prototype.hasOwnProperty.call(patch, 'qualityPolicyVersion');
  const hasQualityCanaryPolicy = Object.prototype.hasOwnProperty.call(patch, 'qualityCanaryPolicy');
  const hasQualityTuningDecision = Object.prototype.hasOwnProperty.call(patch, 'qualityTuningDecision')
    && patch.qualityTuningDecision !== undefined;

  const updated = normalizeSettings({
    apiEndpoint: patch.apiEndpoint || existing.apiEndpoint,
    apiKey: (patch.apiKey && patch.apiKey !== '********') ? patch.apiKey : existing.apiKey,
    model: patch.model || existing.model,
    protocol: patch.protocol || existing.protocol,
    fallbackModel: patch.fallbackModel || existing.fallbackModel,
    modelFallbacks: hasModelFallbacks ? patch.modelFallbacks : existing.modelFallbacks,
    secondaryApiEndpoint: patch.secondaryApiEndpoint || existing.secondaryApiEndpoint,
    secondaryProtocol: patch.secondaryProtocol || existing.secondaryProtocol,
    secondaryApiKey: (patch.secondaryApiKey && patch.secondaryApiKey !== '********')
      ? patch.secondaryApiKey
      : existing.secondaryApiKey,
    secondaryModel: patch.secondaryModel || existing.secondaryModel,
    tertiaryApiEndpoint: patch.tertiaryApiEndpoint || existing.tertiaryApiEndpoint,
    tertiaryProtocol: patch.tertiaryProtocol || existing.tertiaryProtocol,
    tertiaryApiKey: (patch.tertiaryApiKey && patch.tertiaryApiKey !== '********')
      ? patch.tertiaryApiKey
      : existing.tertiaryApiKey,
    tertiaryModel: patch.tertiaryModel || existing.tertiaryModel,
    temperature: typeof patch.temperature === 'number' ? patch.temperature : existing.temperature,
    maxTokens: typeof patch.maxTokens === 'number' ? patch.maxTokens : existing.maxTokens,
    useMock: false,
    qualityContractEnabled: hasQualityContractEnabled
      ? toBoolean(patch.qualityContractEnabled, existing.qualityContractEnabled)
      : existing.qualityContractEnabled,
    qualityStrictMode: hasQualityStrictMode
      ? toBoolean(patch.qualityStrictMode, existing.qualityStrictMode)
      : existing.qualityStrictMode,
    qualityMinCoverageSources: hasQualityMinCoverageSources
      ? parsePositiveInt(patch.qualityMinCoverageSources, existing.qualityMinCoverageSources, 12)
      : existing.qualityMinCoverageSources,
    qualityPolicyVersion: hasQualityPolicyVersion
      ? normalizePolicyVersion(patch.qualityPolicyVersion, existing.qualityPolicyVersion)
      : existing.qualityPolicyVersion,
    qualityCanaryPolicy: hasQualityCanaryPolicy
      ? normalizeCanaryPolicy(patch.qualityCanaryPolicy, existing.qualityCanaryPolicy)
      : existing.qualityCanaryPolicy,
    qualityTuningHistory: normalizeTuningHistory(existing.qualityTuningHistory),
    qualityLastRollback: existing.qualityLastRollback && typeof existing.qualityLastRollback === 'object'
      ? existing.qualityLastRollback
      : null
  });

  if (hasQualityTuningDecision) {
    const decisionInput = patch.qualityTuningDecision;
    const inputSource = decisionInput && typeof decisionInput === 'object' && !Array.isArray(decisionInput)
      ? decisionInput
      : {};
    const inputFields = inputSource.inputs && typeof inputSource.inputs === 'object' && !Array.isArray(inputSource.inputs)
      ? inputSource.inputs
      : inputSource;

    if (!hasKpiEvidence(inputFields)) {
      const validationErr = new Error('Tuning update rejected: baseline/candidate KPI delta evidence is required');
      validationErr.status = 400;
      validationErr.code = 'missing_kpi_evidence';
      throw validationErr;
    }

    const decisionRecord = buildTuningDecisionRecord(
      decisionInput,
      updated.qualityPolicyVersion,
      updated.qualityCanaryPolicy
    );

    updated.qualityTuningHistory = [
      ...normalizeTuningHistory(existing.qualityTuningHistory),
      decisionRecord
    ].slice(-QUALITY_TUNING_HISTORY_MAX);

    if (decisionRecord.rollback && decisionRecord.rollback.triggered) {
      updated.qualityContractEnabled = false;
      updated.qualityLastRollback = decisionRecord.rollback;
    }
  }

  const result = await pool.query(
    `INSERT INTO user_ai_settings (user_id, settings_json, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET settings_json = EXCLUDED.settings_json,
         updated_at = NOW()
     RETURNING settings_json`,
    [userId, updated]
  );

  const persisted = result.rows[0] && result.rows[0].settings_json;
  return normalizeSettings(persisted || updated);
};

module.exports = {
  DEFAULT_SETTINGS,
  resolveUserId,
  getOrCreateUserSettings,
  updateUserSettings
};
