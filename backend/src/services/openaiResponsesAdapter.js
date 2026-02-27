const normalizeText = (value) => String(value || '').trim().toLowerCase();
const OFFICIAL_RESPONSES_HOSTS = new Set(['api.openai.com']);

const normalizeProtocol = (value) => {
  const normalized = normalizeText(value).replace(/[\s-]+/g, '_');
  if (['responses', 'response', 'openai_responses', 'openairesponses'].includes(normalized)) {
    return 'responses';
  }
  return 'chat_completions';
};

const toInputTextChunk = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return { type: 'input_text', text };
};

const normalizeMessageContent = (content) => {
  if (typeof content === 'string') {
    const chunk = toInputTextChunk(content);
    return chunk ? [chunk] : [];
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return toInputTextChunk(item);
        if (!item || typeof item !== 'object') return null;
        if (typeof item.text === 'string') return toInputTextChunk(item.text);
        if (typeof item.content === 'string') return toInputTextChunk(item.content);
        return null;
      })
      .filter(Boolean);
  }

  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') {
      const chunk = toInputTextChunk(content.text);
      return chunk ? [chunk] : [];
    }
    if (typeof content.content === 'string') {
      const chunk = toInputTextChunk(content.content);
      return chunk ? [chunk] : [];
    }
  }

  return [];
};

const normalizeRole = (value) => {
  const role = normalizeText(value);
  if (['system', 'assistant', 'developer', 'user'].includes(role)) {
    return role;
  }
  return 'user';
};

const buildResponsesInput = (messages) => {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => {
      const role = normalizeRole(message?.role);
      const content = normalizeMessageContent(message?.content);
      if (content.length === 0) return null;
      return { role, content };
    })
    .filter(Boolean);
};

const normalizeResponseFormat = (responseFormat) => {
  if (!responseFormat || typeof responseFormat !== 'object') return null;

  if (responseFormat.type === 'json_schema' && responseFormat.schema && typeof responseFormat.schema === 'object') {
    return {
      type: 'json_schema',
      name: String(responseFormat.name || 'response_schema').trim() || 'response_schema',
      schema: responseFormat.schema,
      strict: responseFormat.strict !== false
    };
  }

  if (responseFormat.type === 'json_object') {
    return { type: 'json_object' };
  }

  if (responseFormat.type === 'text') {
    return { type: 'text' };
  }

  return null;
};

const parseJsonSafe = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parseHost = (baseURL) => {
  try {
    const parsed = new URL(String(baseURL || '').trim());
    return String(parsed.hostname || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const isOfficialResponsesHost = (baseURL) => OFFICIAL_RESPONSES_HOSTS.has(parseHost(baseURL));

const shouldForceResponsesStream = (baseURL, protocol = 'responses') => {
  return normalizeProtocol(protocol) === 'responses' && !isOfficialResponsesHost(baseURL);
};

const resolveResponsesEndpoint = (baseURL) => {
  const trimmed = String(baseURL || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.endsWith('/responses')) {
    return trimmed;
  }
  if (lower.endsWith('/chat/completions')) {
    return `${trimmed.slice(0, -('/chat/completions'.length))}/responses`;
  }
  if (lower.includes('/responses') || lower.includes('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/responses`;
};

const responsesTokenKey = (baseURL) => {
  const host = parseHost(baseURL);
  if (host === 'api.openai.com' || host === 'gmn.chuangzuoli.com') {
    return 'max_output_tokens';
  }
  return 'max_tokens';
};

const normalizeTokenKey = (value) => {
  if (value === 'max_output_tokens' || value === 'max_tokens' || value === '') {
    return value;
  }
  return null;
};

const resolveResponsesTokenKeyOverride = (bodyText) => {
  const normalized = String(bodyText || '').toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes('unsupported parameter: max_output_tokens')
    || normalized.includes('unknown parameter: max_output_tokens')
    || normalized.includes('unknown field "max_output_tokens"')
  ) {
    return 'max_tokens';
  }

  if (
    normalized.includes('unsupported parameter: max_tokens')
    || normalized.includes('unknown parameter: max_tokens')
    || normalized.includes('unknown field "max_tokens"')
  ) {
    return '';
  }

  return null;
};

const overrideResponsesTokenKey = (payload, tokenKey, fallback = 0) => {
  const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {};
  let resolvedValue = fallback;
  ['max_output_tokens', 'max_tokens'].forEach((key) => {
    if (Number.isFinite(Number(nextPayload[key])) && Number(nextPayload[key]) > 0) {
      resolvedValue = Number(nextPayload[key]);
    }
    delete nextPayload[key];
  });
  const normalizedKey = normalizeTokenKey(tokenKey);
  if (normalizedKey) {
    nextPayload[normalizedKey] = resolvedValue;
  }
  return nextPayload;
};

const extractTextFromUnknownContent = (value) => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => extractTextFromUnknownContent(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim();
    if (typeof value.content === 'string') return value.content.trim();
    if (Array.isArray(value.content)) return extractTextFromUnknownContent(value.content);
    if (Array.isArray(value.parts)) return extractTextFromUnknownContent(value.parts);
  }
  return '';
};

const buildResponsesRequestPayload = ({
  model,
  messages,
  temperature,
  maxTokens,
  responseFormat,
  stream,
  baseURL,
  tokenKeyOverride
}) => {
  const tokenKey = normalizeTokenKey(tokenKeyOverride) ?? responsesTokenKey(baseURL);
  const payload = {
    model,
    input: buildResponsesInput(messages),
    temperature
  };

  if (tokenKey && Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0) {
    payload[tokenKey] = Number(maxTokens);
  }

  if (stream) {
    payload.stream = true;
  }

  const format = normalizeResponseFormat(responseFormat);
  if (format) {
    payload.text = { format };
  }

  return payload;
};

const extractResponsesFunctionCalls = (data) => {
  const outputItems = Array.isArray(data?.output) ? data.output : [];

  return outputItems
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const type = normalizeText(item.type);
      if (type !== 'function_call') return null;

      const name = String(item.name || item?.function?.name || '').trim();
      if (!name) return null;

      return {
        id: String(item.call_id || item.id || `call_${index + 1}`),
        name,
        arguments: item.arguments ?? item?.function?.arguments ?? '{}'
      };
    })
    .filter(Boolean);
};

const parseSseFrame = (frame) => {
  if (!frame || !frame.trim()) return null;

  const lines = frame.split('\n');
  let eventName = '';
  const dataLines = [];

  lines.forEach((line) => {
    if (!line || line.startsWith(':')) return;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      return;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  const rawData = dataLines.join('\n').trim();
  if (!eventName && !rawData) return null;

  if (rawData === '[DONE]') {
    return {
      type: eventName || 'done',
      event: eventName || 'done',
      data: '[DONE]',
      done: true
    };
  }

  const parsedData = parseJsonSafe(rawData);
  const eventType = String(parsedData?.type || eventName || 'message').trim() || 'message';

  return {
    type: eventType,
    event: eventName || eventType,
    data: parsedData !== null ? parsedData : rawData,
    done: false
  };
};

const createResponsesSseParser = () => {
  let buffer = '';

  const drainFrames = () => {
    const events = [];
    let boundaryIndex = buffer.indexOf('\n\n');

    while (boundaryIndex >= 0) {
      const frame = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) {
        events.push(parsed);
      }
      boundaryIndex = buffer.indexOf('\n\n');
    }

    return events;
  };

  return {
    push(chunk) {
      if (chunk !== null && chunk !== undefined) {
        buffer += String(chunk).replace(/\r/g, '');
      }
      return drainFrames();
    },
    flush() {
      const events = [];
      if (buffer.trim()) {
        const parsed = parseSseFrame(buffer);
        if (parsed) events.push(parsed);
      }
      buffer = '';
      return events;
    }
  };
};

const extractResponsesText = (data) => {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.output_text)) {
    const outputText = data.output_text
      .filter((item) => typeof item === 'string')
      .join('\n')
      .trim();
    if (outputText) return outputText;
  }

  const choiceText = extractTextFromUnknownContent(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text);
  if (choiceText) {
    return choiceText;
  }

  const candidateText = extractTextFromUnknownContent(
    data?.candidates?.[0]?.content || data?.candidates?.[0]?.message || data?.candidates?.[0]?.output
  );
  if (candidateText) {
    return candidateText;
  }

  const chunks = [];
  const outputItems = Array.isArray(data?.output) ? data.output : [];

  outputItems.forEach((item) => {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      item.content.forEach((part) => {
        if (typeof part === 'string' && part.trim()) {
          chunks.push(part.trim());
          return;
        }

        if (part && typeof part === 'object') {
          if (typeof part.text === 'string' && part.text.trim()) {
            chunks.push(part.text.trim());
          } else if (typeof part.content === 'string' && part.content.trim()) {
            chunks.push(part.content.trim());
          }
        }
      });
      return;
    }

    if (item?.type === 'output_text' && typeof item.text === 'string' && item.text.trim()) {
      chunks.push(item.text.trim());
    }
  });

  return chunks.join('\n').trim();
};

const normalizeResponsesFinishReason = (data) => {
  const raw = normalizeText(
    data?.incomplete_details?.reason
      || data?.output?.[0]?.finish_reason
      || data?.finish_reason
      || ''
  );

  if (raw === 'max_output_tokens' || raw === 'max_tokens' || raw === 'length') {
    return 'length';
  }

  if (!raw && normalizeText(data?.status) === 'completed') {
    return 'stop';
  }

  return raw || undefined;
};

module.exports = {
  normalizeProtocol,
  resolveResponsesEndpoint,
  shouldForceResponsesStream,
  responsesTokenKey,
  resolveResponsesTokenKeyOverride,
  overrideResponsesTokenKey,
  buildResponsesRequestPayload,
  extractResponsesText,
  normalizeResponsesFinishReason,
  extractResponsesFunctionCalls,
  createResponsesSseParser
};
