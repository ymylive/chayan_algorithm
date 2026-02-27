const winston = require('winston');

const QUALITY_EVENT_VERSION = '1.0';
const QUALITY_EVENT_BUFFER_MAX = 1000;
const DEFAULT_TELEMETRY_WINDOW_MS = 60 * 60 * 1000;
const SENSITIVE_KEY_PATTERN = /(api[-_]?key|authorization|token|cookie|set-cookie|password|secret|prompt|messages?|jwt|session)/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._\-]+|sk-[a-z0-9\-_]{10,}|x-api-key|api[_-]?key|cookie=|set-cookie:)/i;

const qualityEventBuffer = [];

const toSafeString = (value, maxLength = 240) => String(value || '').trim().slice(0, maxLength);

const toSafeNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sanitizeTelemetryValue = (value, key = '', depth = 0) => {
  if (depth > 5) return '[TRUNCATED]';

  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(String(key)) || SENSITIVE_VALUE_PATTERN.test(value)) {
      return '[REDACTED]';
    }
    return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeTelemetryValue(item, key, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.keys(value).reduce((acc, currentKey) => {
      if (SENSITIVE_KEY_PATTERN.test(currentKey)) {
        acc[currentKey] = '[REDACTED]';
        return acc;
      }
      acc[currentKey] = sanitizeTelemetryValue(value[currentKey], currentKey, depth + 1);
      return acc;
    }, {});
  }

  return String(value);
};

const buildQualityEvent = (eventName, payload = {}) => {
  const event = {
    eventName: toSafeString(eventName || 'quality.unknown', 120),
    eventVersion: QUALITY_EVENT_VERSION,
    timestamp: new Date().toISOString(),
    analysisRequestId: toSafeString(payload.analysisRequestId || 'unknown', 120),
    stage: toSafeString(payload.stage || 'unknown', 80),
    status: toSafeString(payload.status || 'ok', 40),
    quality: sanitizeTelemetryValue(payload.quality || {}, 'quality'),
    perf: sanitizeTelemetryValue(payload.perf || {}, 'perf'),
    error: sanitizeTelemetryValue(payload.error || null, 'error'),
    tags: sanitizeTelemetryValue(payload.tags || {}, 'tags')
  };

  return sanitizeTelemetryValue(event);
};

const pushQualityEvent = (event) => {
  qualityEventBuffer.push(event);
  if (qualityEventBuffer.length > QUALITY_EVENT_BUFFER_MAX) {
    qualityEventBuffer.splice(0, qualityEventBuffer.length - QUALITY_EVENT_BUFFER_MAX);
  }
};

const getQualityTelemetryReport = ({ windowMs = DEFAULT_TELEMETRY_WINDOW_MS, now = Date.now() } = {}) => {
  const parsedWindowMs = Math.max(1000, Number.parseInt(String(windowMs), 10) || DEFAULT_TELEMETRY_WINDOW_MS);
  const cutoff = now - parsedWindowMs;
  const windowEvents = qualityEventBuffer.filter((event) => {
    const ts = Date.parse(event.timestamp || '');
    return Number.isFinite(ts) && ts >= cutoff;
  });

  const totalEvents = windowEvents.length;
  const degradedEvents = windowEvents.filter((event) => event.status === 'degraded').length;
  const failedEvents = windowEvents.filter((event) => event.status === 'error').length;
  const successEvents = windowEvents.filter((event) => event.status === 'ok').length;

  const stageCounts = windowEvents.reduce((acc, event) => {
    const stage = toSafeString(event.stage || 'unknown', 80);
    acc[stage] = Number(acc[stage] || 0) + 1;
    return acc;
  }, {});

  const eventNameCounts = windowEvents.reduce((acc, event) => {
    const name = toSafeString(event.eventName || 'quality.unknown', 120);
    acc[name] = Number(acc[name] || 0) + 1;
    return acc;
  }, {});

  const durationSamples = windowEvents
    .map((event) => toSafeNumber(event?.perf?.durationMs, null))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const p95Index = durationSamples.length > 0 ? Math.min(durationSamples.length - 1, Math.floor(durationSamples.length * 0.95)) : -1;

  return {
    windowMs: parsedWindowMs,
    generatedAt: new Date(now).toISOString(),
    totalEvents,
    successEvents,
    degradedEvents,
    failedEvents,
    degradedRate: totalEvents > 0 ? Number((degradedEvents / totalEvents).toFixed(4)) : 0,
    failureRate: totalEvents > 0 ? Number((failedEvents / totalEvents).toFixed(4)) : 0,
    p95DurationMs: p95Index >= 0 ? durationSamples[p95Index] : 0,
    stageCounts,
    eventNameCounts
  };
};

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

logger.emitQualityEvent = (eventName, payload = {}) => {
  const event = buildQualityEvent(eventName, payload);
  pushQualityEvent(event);
  logger.info('quality_event', event);
  return event;
};

logger.getQualityTelemetryReport = getQualityTelemetryReport;
logger.resetQualityTelemetryForTests = () => {
  qualityEventBuffer.splice(0, qualityEventBuffer.length);
};

module.exports = logger;
