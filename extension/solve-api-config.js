(function (global) {
  const modelConfig = global.AUTOLEARNING_SOLVE_MODELS || {};
  const providers = modelConfig.PROVIDERS || {};
  const defaultProvider = String(modelConfig.DEFAULT_PROVIDER || "platform");

  function sanitizeProvider(value) {
    if (typeof modelConfig.sanitizeProvider === "function") {
      return modelConfig.sanitizeProvider(value);
    }
    const normalized = String(value || "").trim().toLowerCase();
    return Object.hasOwn(providers, normalized) ? normalized : defaultProvider;
  }

  function inferProvider(settings = {}) {
    const explicit = String(settings.textProvider || "").trim();
    if (explicit) {
      return sanitizeProvider(explicit);
    }
    const baseUrl = String(settings.textBaseUrl || settings.baseUrl || "").trim();
    return /^https?:\/\/api\.deepseek\.com(?:[/:]|$)/i.test(baseUrl)
      ? "deepseek"
      : defaultProvider;
  }

  function normalizeConfiguredBaseUrl(value, fallback = "") {
    return String(value || fallback || "").trim().replace(/\/+$/, "");
  }

  function normalizeTextProviderSettings(settings = {}) {
    const textProvider = inferProvider(settings);
    const providerConfig = providers[textProvider] || providers[defaultProvider] || {};
    const legacyBaseUrl = String(settings.baseUrl || "").trim();
    const legacyApiKey = String(settings.apiKey || "").trim();
    const legacyModel = String(settings.model || "").trim();
    const textBaseUrl = normalizeConfiguredBaseUrl(
      settings.textBaseUrl || legacyBaseUrl,
      providerConfig.baseUrl,
    );
    const textApiKey = String(settings.textApiKey || legacyApiKey || "").trim();
    const requestedModel = String(settings.textModel || settings.activeSolveModel || legacyModel || "").trim();
    const textModel =
      typeof modelConfig.sanitizeProviderModel === "function"
        ? modelConfig.sanitizeProviderModel(textProvider, requestedModel)
        : requestedModel || String(providerConfig.defaultModel || "");

    return {
      textProvider,
      textBaseUrl,
      textApiKey,
      textModel,
      activeSolveModel: textModel,
      baseUrl: textBaseUrl,
      apiKey: textApiKey,
      model: textModel,
    };
  }

  function normalizeChatCompletionsUrl(baseUrl) {
    const trimmed = normalizeConfiguredBaseUrl(baseUrl);
    if (!trimmed) {
      throw new Error("请先在设置页填写 Base URL。");
    }
    return trimmed.endsWith("/chat/completions")
      ? trimmed
      : `${trimmed}/chat/completions`;
  }

  function buildChatCompletionBody(settings, messages, promptMode, options = {}) {
    const body = {
      model: String(settings?.textModel || settings?.model || "").trim(),
      temperature: Number(settings?.temperature ?? 0.2),
      messages,
    };
    if (settings?.textProvider === "deepseek" && promptMode === "choice") {
      body.thinking = { type: "disabled" };
      if (!options.retryWithoutJsonMode) {
        body.response_format = { type: "json_object" };
      }
      body.max_tokens = 1200;
    }
    return body;
  }

  function inspectChatCompletionPayload(payload) {
    const choice = payload?.choices?.[0] || {};
    const message = choice?.message || {};
    const content = typeof message.content === "string" ? message.content : "";
    const reasoning =
      typeof message.reasoning_content === "string" ? message.reasoning_content : "";
    const completionTokens = Number(payload?.usage?.completion_tokens);

    return {
      finishReason: String(choice?.finish_reason || "unknown"),
      contentLength: content.length,
      reasoningLength: reasoning.length,
      completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    };
  }

  function formatEmptyChoiceResponseError(diagnostics = {}) {
    return [
      "模型返回里没有识别到最终答案",
      `（finish_reason=${diagnostics.finishReason || "unknown"}`,
      `，正文=${Number(diagnostics.contentLength) || 0}字`,
      `，思考=${Number(diagnostics.reasoningLength) || 0}字`,
      `，输出令牌=${Number(diagnostics.completionTokens) || 0}）。`,
    ].join("");
  }

  function shouldRetryEmptyChoiceResponse({
    provider,
    promptMode,
    attempt,
    finalAnswer,
  } = {}) {
    return (
      provider === "deepseek" &&
      promptMode === "choice" &&
      Number(attempt) === 0 &&
      !String(finalAnswer || "").trim()
    );
  }

  function formatProviderHttpError(provider, status, fallbackMessage) {
    if (provider === "deepseek") {
      if (status === 401) {
        return "DeepSeek API Key 无效。";
      }
      if (status === 402) {
        return "DeepSeek 账户余额不足。";
      }
      if (status === 429) {
        return "DeepSeek 请求频率过高，请稍后重试。";
      }
    }
    return String(fallbackMessage || `请求失败，状态码 ${status}`);
  }

  function resolveOcrApiKey(settings = {}) {
    const ocrApiKey = String(settings.ocrApiKey || "").trim();
    if (ocrApiKey || settings.textProvider === "deepseek") {
      return ocrApiKey;
    }
    return String(settings.textApiKey || settings.apiKey || "").trim();
  }

  global.AUTOLEARNING_API_CONFIG = {
    inferProvider,
    normalizeConfiguredBaseUrl,
    normalizeTextProviderSettings,
    normalizeChatCompletionsUrl,
    buildChatCompletionBody,
    inspectChatCompletionPayload,
    formatEmptyChoiceResponseError,
    shouldRetryEmptyChoiceResponse,
    formatProviderHttpError,
    resolveOcrApiKey,
  };
})(globalThis);
