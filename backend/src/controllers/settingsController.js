const logger = require('../config/logger');
const {
  resolveUserId,
  getOrCreateUserSettings,
  updateUserSettings
} = require('../services/aiSettingsService');

const DEFAULT_ALLOWED_API_HOSTS = ['openrouter.ai', 'gmn.chuangzuoli.com', 'api-inference.modelscope.cn'];

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
    const userId = resolveUserId(req.user);
    if (!userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const settings = await getOrCreateUserSettings(userId);
    // Never expose API key to frontend
    return res.json({
      success: true,
      data: {
        ...settings,
        apiKey: settings.apiKey ? '********' : '',
        secondaryApiKey: settings.secondaryApiKey ? '********' : '',
        tertiaryApiKey: settings.tertiaryApiKey ? '********' : ''
      }
    });
  } catch (err) {
    logger.error('Get settings error:', err);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

const updateSettings = async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    if (!userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const {
      apiEndpoint,
      apiKey,
      model,
      protocol,
      fallbackModel,
      modelFallbacks,
      secondaryApiEndpoint,
      secondaryProtocol,
      secondaryApiKey,
      secondaryModel,
      tertiaryApiEndpoint,
      tertiaryProtocol,
      tertiaryApiKey,
      tertiaryModel,
      temperature,
      maxTokens,
      useMock
    } = req.body;

    let nextApiEndpoint;
    if (typeof apiEndpoint === 'string' && apiEndpoint.trim()) {
      const endpointCheck = normalizeAndValidateApiEndpoint(apiEndpoint);
      if (!endpointCheck.valid) {
        return res.status(400).json({ success: false, message: endpointCheck.reason });
      }
      nextApiEndpoint = endpointCheck.value;
    }

    await updateUserSettings(userId, {
      apiEndpoint: nextApiEndpoint,
      apiKey,
      model,
      protocol,
      fallbackModel,
      modelFallbacks,
      secondaryApiEndpoint,
      secondaryProtocol,
      secondaryApiKey,
      secondaryModel,
      tertiaryApiEndpoint,
      tertiaryProtocol,
      tertiaryApiKey,
      tertiaryModel,
      temperature,
      maxTokens,
      useMock
    });

    logger.info('AI settings updated');
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    logger.error('Update settings error:', err);
    res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
};

module.exports = { getSettings, updateSettings };
