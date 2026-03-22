(function (global) {
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
  ];

  const DEFAULT_ACTIVE_SOLVE_MODEL = "gpt-5.4-mini";
  const SUPPORTED_SOLVE_MODELS = SOLVE_MODELS.map((item) => item.value);
  const MODEL_ICON_PATHS = Object.fromEntries(SOLVE_MODELS.map((item) => [item.value, item.icon]));

  function sanitizeActiveSolveModel(value) {
    const normalized = String(value || "").trim();
    return SUPPORTED_SOLVE_MODELS.includes(normalized) ? normalized : DEFAULT_ACTIVE_SOLVE_MODEL;
  }

  global.AUTOLEARNING_SOLVE_MODELS = {
    SOLVE_MODELS,
    SUPPORTED_SOLVE_MODELS,
    DEFAULT_ACTIVE_SOLVE_MODEL,
    MODEL_ICON_PATHS,
    sanitizeActiveSolveModel,
  };
})(globalThis);
