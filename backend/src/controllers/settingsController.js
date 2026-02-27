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

const normalizeAndValidateTuningDecision = (payload) => {
  if (payload === undefined) {
    return { valid: true, value: undefined };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, reason: 'Tuning update rejected: tuning decision payload must be an object' };
  }

  const inputs = payload.inputs && typeof payload.inputs === 'object' && !Array.isArray(payload.inputs)
    ? payload.inputs
    : payload;

  const baseline = inputs.offlineKpiDelta?.baseline;
  const candidate = inputs.offlineKpiDelta?.candidate;
  const hasBaseline = baseline && typeof baseline === 'object' && !Array.isArray(baseline) && Object.keys(baseline).length > 0;
  const hasCandidate = candidate && typeof candidate === 'object' && !Array.isArray(candidate) && Object.keys(candidate).length > 0;

  if (!hasBaseline || !hasCandidate) {
    return { valid: false, reason: 'Tuning update rejected: baseline/candidate KPI delta evidence is required' };
  }

  return { valid: true, value: payload };
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
      qualityContractEnabled,
      qualityStrictMode,
      qualityMinCoverageSources,
      qualityPolicyVersion,
      qualityCanaryPolicy,
      qualityTuningDecision
    } = req.body;

    let nextApiEndpoint;
    if (typeof apiEndpoint === 'string' && apiEndpoint.trim()) {
      const endpointCheck = normalizeAndValidateApiEndpoint(apiEndpoint);
      if (!endpointCheck.valid) {
        return res.status(400).json({ success: false, message: endpointCheck.reason });
      }
      nextApiEndpoint = endpointCheck.value;
    }

    const tuningDecisionCheck = normalizeAndValidateTuningDecision(qualityTuningDecision);
    if (!tuningDecisionCheck.valid) {
      return res.status(400).json({ success: false, message: tuningDecisionCheck.reason });
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
      qualityContractEnabled,
      qualityStrictMode,
      qualityMinCoverageSources,
      qualityPolicyVersion,
      qualityCanaryPolicy,
      qualityTuningDecision: tuningDecisionCheck.value
    });

    logger.info('AI settings updated');
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    logger.error('Update settings error:', err);
    res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
};

module.exports = { getSettings, updateSettings };
