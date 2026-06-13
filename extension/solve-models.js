(function (global) {
  const PROVIDERS = {
    platform: {
      label: "现有平台",
      baseUrl: "http://03hhhx.dpdns.org:18317/v1",
      models: ["gemini-3-flash", "gpt-5.4-mini", "gemini-3.1-flash-image"],
      defaultModel: "gpt-5.4-mini",
    },
    deepseek: {
      label: "DeepSeek 官方 API",
      baseUrl: "https://api.deepseek.com",
      models: ["deepseek-v4-flash", "deepseek-v4-pro"],
      defaultModel: "deepseek-v4-flash",
    },
  };
  const SOLVE_MODELS = [
    {
      value: "gemini-3-flash",
      icon: "assets/gemini.png",
    },
    {
      value: "gpt-5.4-mini",
      icon: "assets/gpt.png",
    },
    {
      value: "gemini-3.1-flash-image",
      icon: "assets/gemini.png",
    },
    {
      value: "deepseek-v4-flash",
      icon: "assets/gpt.png",
    },
    {
      value: "deepseek-v4-pro",
      icon: "assets/gpt.png",
    },
  ];

  const DEFAULT_PROVIDER = "platform";
  const DEFAULT_ACTIVE_SOLVE_MODEL = PROVIDERS[DEFAULT_PROVIDER].defaultModel;
  const SUPPORTED_SOLVE_MODELS = SOLVE_MODELS.map((item) => item.value);
  const MODEL_ICON_PATHS = Object.fromEntries(SOLVE_MODELS.map((item) => [item.value, item.icon]));

  function sanitizeProvider(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return Object.hasOwn(PROVIDERS, normalized) ? normalized : DEFAULT_PROVIDER;
  }

  function migrateLegacyModel(provider, value) {
    const normalizedProvider = sanitizeProvider(provider);
    const normalizedModel = String(value || "").trim();
    if (
      normalizedProvider === "deepseek" &&
      (normalizedModel === "deepseek-chat" || normalizedModel === "deepseek-reasoner")
    ) {
      return PROVIDERS.deepseek.defaultModel;
    }
    return normalizedModel;
  }

  function sanitizeProviderModel(provider, value) {
    const normalizedProvider = sanitizeProvider(provider);
    const normalizedModel = migrateLegacyModel(normalizedProvider, value);
    const providerConfig = PROVIDERS[normalizedProvider];
    return providerConfig.models.includes(normalizedModel)
      ? normalizedModel
      : providerConfig.defaultModel;
  }

  function sanitizeActiveSolveModel(value, provider = DEFAULT_PROVIDER) {
    const normalized = String(value || "").trim();
    if (SUPPORTED_SOLVE_MODELS.includes(normalized)) {
      return normalized;
    }
    return sanitizeProviderModel(provider, normalized);
  }

  global.AUTOLEARNING_SOLVE_MODELS = {
    PROVIDERS,
    DEFAULT_PROVIDER,
    SOLVE_MODELS,
    SUPPORTED_SOLVE_MODELS,
    DEFAULT_ACTIVE_SOLVE_MODEL,
    MODEL_ICON_PATHS,
    sanitizeProvider,
    sanitizeProviderModel,
    migrateLegacyModel,
    sanitizeActiveSolveModel,
  };
})(globalThis);
