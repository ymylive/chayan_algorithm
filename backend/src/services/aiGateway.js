/**
 * AI HTTP communication layer (extracted from AIService, W9).
 */
const logger = require('../config/logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getAIConfig() {
  const baseURL = String(process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const apiKey = process.env.AI_API_KEY || '';
  const model = process.env.AI_MODEL || 'tngtech/deepseek-r1t2-chimera:free';
  const fallbackModel = process.env.AI_FALLBACK_MODEL || model;
  const httpReferer = process.env.AI_HTTP_REFERER || '';
  const title = process.env.AI_X_TITLE || '';
  const temperature = Number(process.env.AI_TEMPERATURE || 0.35);
  const maxTokens = Number(process.env.AI_MAX_TOKENS || 1400);

  return {
    baseURL,
    apiKey,
    model,
    fallbackModel,
    httpReferer,
    title,
    temperature: Number.isFinite(temperature) ? temperature : 0.35,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 1400
  };
}

async function callChatCompletion({ model, messages, temperature, maxTokens }) {
  const config = getAIConfig();

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.httpReferer ? { 'HTTP-Referer': config.httpReferer } : {}),
      ...(config.title ? { 'X-Title': config.title } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  const rawText = await response.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (parseErr) {
    data = { raw: rawText };
  }

  if (!response.ok) {
    const err = new Error(`AI gateway error: HTTP ${response.status}`);
    err.status = response.status;
    err.payload = data;
    throw err;
  }

  const choice = data?.choices?.[0] || {};
  const content = String(choice?.message?.content || '').trim();

  return {
    content,
    finishReason: choice?.finish_reason,
    modelUsed: model
  };
}

async function generateNarrative(payload, buildMessages, buildFallback, promptVersion) {
  const config = getAIConfig();
  if (!config.apiKey || !config.baseURL) {
    return {
      text: buildFallback(payload),
      modelUsed: 'fallback-template',
      degraded: true
    };
  }

  const run = async () => {
    const messages = buildMessages(payload);
    const modelQueue = [config.model, config.fallbackModel].filter(Boolean);
    let lastError = null;

    for (const model of modelQueue) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const result = await callChatCompletion({
              model,
              messages,
              temperature: config.temperature,
              maxTokens: config.maxTokens
            });

          if (result.content) {
            return {
              text: result.content,
              modelUsed: result.modelUsed,
              degraded: false,
              promptVersion
            };
          }

          const emptyErr = new Error('AI response content is empty');
          emptyErr.status = result.finishReason === 'length' ? 206 : 204;
          throw emptyErr;
        } catch (err) {
          lastError = err;
          logger.warn(
            `AI narrative failed model=${model} attempt=${attempt}: ${err?.message || 'unknown error'}`
          );
          if (Number(err?.status) === 429) {
            await sleep(700 * attempt);
            continue;
          }
          if (attempt < 2) {
            await sleep(300 * attempt);
          }
        }
      }
    }

    logger.error('AI narrative degraded to template fallback:', lastError?.message || lastError);
    return {
      text: buildFallback(payload),
      modelUsed: 'fallback-template',
      degraded: true,
      promptVersion
      };
  };

  return run();
}

module.exports = {
  getAIConfig,
  callChatCompletion,
  generateNarrative,
  sleep
};
