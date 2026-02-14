const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const logger = require('../config/logger');
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
  useMock: false
};

const toBoolean = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return defaultValue;
};

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

const resolveUserId = (user) => {
  const userId = Number(user && user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }
  return userId;
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
  useMock: typeof settings.useMock === 'boolean' ? settings.useMock : DEFAULT_SETTINGS.useMock
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
    ...(process.env.AI_USE_MOCK !== undefined
      ? { useMock: toBoolean(process.env.AI_USE_MOCK, DEFAULT_SETTINGS.useMock) }
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
    useMock: typeof patch.useMock === 'boolean' ? patch.useMock : existing.useMock
  });

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
