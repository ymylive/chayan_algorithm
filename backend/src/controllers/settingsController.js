const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

const SETTINGS_FILE = path.join(__dirname, '../../data/ai-settings.json');

const ensureDataDir = async () => {
  const dir = path.dirname(SETTINGS_FILE);
  await fs.promises.mkdir(dir, { recursive: true });
};

const fileExists = async (filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://openrouter.ai/api/v1',
  model: 'tngtech/deepseek-r1t2-chimera:free',
  temperature: 0.35,
  maxTokens: 1400,
  useMock: false
};

const DEFAULT_ALLOWED_API_HOSTS = ['openrouter.ai'];

const getAllowedApiHosts = () => {
  const envHosts = (process.env.AI_ALLOWED_ENDPOINT_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_API_HOSTS, ...envHosts]);
};

const normalizeAndValidateApiEndpoint = (apiEndpoint) => {
  if (typeof apiEndpoint !== 'string' || !apiEndpoint.trim()) {
    return { valid: false, reason: 'API endpoint is required' };
  }

  let parsed;
  try {
    parsed = new URL(apiEndpoint.trim());
  } catch {
    return { valid: false, reason: 'Invalid API endpoint URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'API endpoint must use HTTPS' };
  }

  const allowedHosts = getAllowedApiHosts();
  const hostname = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) {
    return { valid: false, reason: 'API endpoint host is not allowed' };
  }

  return { valid: true, value: parsed.toString() };
};

const getSettings = async (req, res) => {
  try {
    await ensureDataDir();
    if (!(await fileExists(SETTINGS_FILE))) {
      return res.json({ success: true, data: DEFAULT_SETTINGS });
    }
    const raw = await fs.promises.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(raw);
    // Never expose API key to frontend
    return res.json({
      success: true,
      data: { ...settings, apiKey: settings.apiKey ? '********' : '' }
    });
  } catch (err) {
    logger.error('Get settings error:', err);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

const updateSettings = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await ensureDataDir();
    const { apiEndpoint, apiKey, model, temperature, maxTokens, useMock } = req.body;

    let nextApiEndpoint;
    if (typeof apiEndpoint === 'string' && apiEndpoint.trim()) {
      const endpointCheck = normalizeAndValidateApiEndpoint(apiEndpoint);
      if (!endpointCheck.valid) {
        return res.status(400).json({ success: false, message: endpointCheck.reason });
      }
      nextApiEndpoint = endpointCheck.value;
    }

    let existing = { ...DEFAULT_SETTINGS };
    if (await fileExists(SETTINGS_FILE)) {
      try {
        existing = JSON.parse(await fs.promises.readFile(SETTINGS_FILE, 'utf8'));
      } catch { /* use defaults */ }
    }

    const updated = {
      apiEndpoint: nextApiEndpoint || existing.apiEndpoint || '',
      apiKey: (apiKey && apiKey !== '********') ? apiKey : existing.apiKey || '',
      model: model || existing.model || DEFAULT_SETTINGS.model,
      temperature: typeof temperature === 'number' ? temperature : existing.temperature,
      maxTokens: typeof maxTokens === 'number' ? maxTokens : existing.maxTokens,
      useMock: typeof useMock === 'boolean' ? useMock : existing.useMock
    };

    await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');

    // Sync to process.env so AIService picks up changes immediately
    if (updated.apiEndpoint) process.env.AI_BASE_URL = updated.apiEndpoint;
    if (updated.apiKey) process.env.AI_API_KEY = updated.apiKey;
    if (updated.model) process.env.AI_MODEL = updated.model;
    if (typeof updated.temperature === 'number') process.env.AI_TEMPERATURE = String(updated.temperature);
    if (typeof updated.maxTokens === 'number') process.env.AI_MAX_TOKENS = String(updated.maxTokens);

    logger.info('AI settings updated');
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    logger.error('Update settings error:', err);
    res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
};

module.exports = { getSettings, updateSettings };
