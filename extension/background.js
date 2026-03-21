const DEFAULT_CHOICE_PROMPT =
  "当前页面大概率是选择题、判断题、概念题或简答型理论题。请优先输出最终答案，而不是写完整程序。若题目是单选题，code 字段只放最终选项，例如 A、B、C、D；若是多选题，code 字段只放选项组合，例如 AC；若是判断题，code 字段只放“对”或“错”；若是简短填空或概念问答，code 字段只放最终可直接填写的简短答案。不要输出 main 函数，不要伪造代码。approach 用 3 到 5 句简洁说明你的判断依据，重点使用关键词匹配、概念定义和排除法。";
const DEFAULT_CODE_PROMPT =
  "当前页面大概率是编程题、代码填空题或需要补全模板的题。只要当前编辑器里已经有非空代码模板，你就必须基于这份模板补全，不能擅自重写整体结构。不要改函数签名、类名、输入输出格式、主流程结构、已有辅助函数名和注释约定；只补全 TODO、空函数、占位返回值、核心逻辑以及必要 import。若题面与模板冲突，优先遵循题面和样例，但仍尽量在原模板内修正，不要另起一份独立实现。若当前编辑器为空，再正常生成完整答案。code 字段只放最终可提交或可复制的完整代码，不要在 code 里混入解释。尽量给出最稳妥、最容易通过样例和评测的做法。";
const QUESTION_BANK_CATEGORIES = ["educoder", "zhihuishu", "leetcode", "general"];
const FIXED_SERVER_ORIGIN = "http://03hhhx.dpdns.org";
const FIXED_API_BASE_URL = "http://03hhhx.dpdns.org:18317/v1";
const FIXED_CONTRIBUTION_REPO_OWNER = "HarmonLiu05";
const FIXED_CONTRIBUTION_REPO_NAME = "autolearning";
const FIXED_CLOUD_REPO_OWNER = "HarmonLiu05";
const FIXED_CLOUD_REPO_NAME = "question-bank";
const FIXED_CLOUD_REPO_BRANCH = "main";
const DEFAULT_SERVER_ORIGIN = FIXED_SERVER_ORIGIN;
const GITHUB_AUTH_STORAGE_KEY = "autolearningGithubAuthSession";
const MAX_GITHUB_ISSUE_URL_LENGTH = 7000;
const SUPPORTED_SOLVE_MODELS = ["gpt-5.4-mini"];
const DEFAULT_ACTIVE_SOLVE_MODEL = "gpt-5.4-mini";

const DEFAULT_SETTINGS = {
  baseUrl: FIXED_API_BASE_URL,
  apiKey: "",
  textBaseUrl: FIXED_API_BASE_URL,
  textApiKey: "",
  model: DEFAULT_ACTIVE_SOLVE_MODEL,
  textModel: DEFAULT_ACTIVE_SOLVE_MODEL,
  imageBaseUrl: FIXED_API_BASE_URL,
  imageApiKey: "",
  imageModel: DEFAULT_ACTIVE_SOLVE_MODEL,
  activeSolveModel: DEFAULT_ACTIVE_SOLVE_MODEL,
  promptMode: "choice",
  extraInstructions: DEFAULT_CHOICE_PROMPT,
  extraInstructionsChoice: DEFAULT_CHOICE_PROMPT,
  extraInstructionsCode: DEFAULT_CODE_PROMPT,
  temperature: 0.2,
  includeScreenshotInSolver: true,
  autoSolveAfterCapture: true,
  screenshotShortcut: "Alt+Shift+S",
  fullPageScreenshotShortcut: "Alt+Shift+F",
  autoSubmitAfterFullCapture: false,
  fullAutoNextDelayMs: 1500,
  autoPickNextDelayMs: 600,
  fullAutoMode: "extract",
  ocrBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  ocrApiKey: "",
  ocrModel: "gemini-3-preview",
  ocrPrompt:
    "请只做 OCR，尽量完整提取图片中的中文、英文、公式、选项和输入输出要求。不要解释，不要总结，只返回纯文本。",
  historyLimit: 50,
  serverOrigin: FIXED_SERVER_ORIGIN,
  cloudRepoOwner: FIXED_CLOUD_REPO_OWNER,
  cloudRepoName: FIXED_CLOUD_REPO_NAME,
  cloudRepoBranch: FIXED_CLOUD_REPO_BRANCH,
  cloudAutoSync: false,
  contributionEmail: "",
};
const HISTORY_STORAGE_KEY = "autolearningSolveHistory";
const MIN_HISTORY_ITEMS = 10;
const MAX_HISTORY_ITEMS = 500;
const ACTIVE_SOLVE_CONTROLLERS = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await storageGet(DEFAULT_SETTINGS);
  await storageSet(normalizeSettingsShape({ ...DEFAULT_SETTINGS, ...current }));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "autolearning:get-settings") {
    storageGet(DEFAULT_SETTINGS)
      .then((settings) => sendResponse({ ok: true, settings: normalizeSettingsShape(settings) }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:solve-problem") {
    const requestId =
      typeof message.requestId === "string" && message.requestId.trim()
        ? message.requestId.trim()
        : `solve-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const controller = new AbortController();
    ACTIVE_SOLVE_CONTROLLERS.set(requestId, controller);

    solveProblem(message.problem, message.extraInstructions, controller)
      .then((result) => sendResponse({ ok: true, result, requestId }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error), requestId }))
      .finally(() => {
        ACTIVE_SOLVE_CONTROLLERS.delete(requestId);
      });
    return true;
  }

  if (message?.type === "autolearning:cancel-solve") {
    const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
    const controller = requestId ? ACTIVE_SOLVE_CONTROLLERS.get(requestId) : null;
    if (!controller) {
      sendResponse({ ok: false, error: "当前没有可取消的请求。" });
      return false;
    }

    controller.abort(new Error("请求已取消"));
    sendResponse({ ok: true, requestId });
    return true;
  }

  if (message?.type === "autolearning:get-history") {
    getSolveHistory()
      .then((history) => sendResponse({ ok: true, history }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:cloud-sync") {
    syncCloudQuestionBank()
      .then((cloudBank) => sendResponse({ ok: true, cloudBank }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:submit-contribution") {
    submitContributionWithServerFallback(message.category, message.entries)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:github-auth-start") {
    startGitHubAuth()
      .then((authSession) => sendResponse({ ok: true, authSession }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:github-auth-status") {
    getGitHubAuthStatus({ forceRefresh: Boolean(message.forceRefresh) })
      .then((authSession) => sendResponse({ ok: true, authSession }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:github-auth-logout") {
    logoutGitHubAuth()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:clear-history") {
    clearSolveHistory()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:preview-prompt") {
    buildPromptPreview(message.problem, message.extraInstructions)
      .then((preview) => sendResponse({ ok: true, preview }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:capture-visible-tab") {
    captureVisibleTab(_sender)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:run-ocr") {
    runExternalOcr(message.imageDataUrl)
      .then((ocr) => sendResponse({ ok: true, ocr }))
      .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
    return true;
  }

  if (message?.type === "autolearning:open-options") {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

function storageGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(defaults, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items);
    });
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function sanitizeActiveSolveModel(value) {
  const normalized = String(value || "").trim();
  return SUPPORTED_SOLVE_MODELS.includes(normalized) ? normalized : DEFAULT_ACTIVE_SOLVE_MODEL;
}

function normalizeSettingsShape(settings = {}) {
  const activeSolveModel = sanitizeActiveSolveModel(
    settings?.activeSolveModel || settings?.textModel || settings?.imageModel || settings?.model,
  );
  const sharedApiKey = String(settings?.textApiKey || settings?.apiKey || "").trim();
  return {
    ...settings,
    baseUrl: FIXED_API_BASE_URL,
    textBaseUrl: FIXED_API_BASE_URL,
    imageBaseUrl: FIXED_API_BASE_URL,
    apiKey: sharedApiKey,
    textApiKey: sharedApiKey,
    activeSolveModel,
    model: activeSolveModel,
    textModel: activeSolveModel,
    imageModel: activeSolveModel,
    contributionEmail: String(settings?.contributionEmail || "").trim(),
  };
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("请先在设置页填写 Base URL。");
  }

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}

function buildSolverPrompt(problem, extraInstructions, promptMode = "code") {
  const sampleText =
    Array.isArray(problem?.samples) && problem.samples.length > 0
      ? problem.samples
          .map((sample, index) => {
            return [
              `样例 ${index + 1}`,
              "输入：",
              sample.input || "[空]",
              "输出：",
              sample.output || "[空]",
            ].join("\n");
          })
          .join("\n\n")
      : "页面里没有明确提取到样例。";

  const currentCode = String(problem?.currentCode || "").trim();
  const currentCodeBlock = currentCode ? currentCode : "[当前编辑器为空]";
  const hasCurrentCode = Boolean(currentCode);
  const mode = getPromptMode({ promptMode });
  const choiceOptionText =
    Array.isArray(problem?.choiceOptions) && problem.choiceOptions.length > 0
      ? problem.choiceOptions
          .map((option) => {
            const label = String(option?.label || "").trim();
            const text = String(option?.text || "").trim();
            return [label, text].filter(Boolean).join(" ");
          })
          .filter(Boolean)
          .join("\n")
      : "";

  if (mode === "choice") {
    return [
      "请根据题面直接判断最终答案，并返回 JSON。",
      'JSON 格式：{"answer":"A/B/C/D/AC/对/错","summary":"一句话总结","approach":"简短依据"}',
      "只返回合法 JSON，不要使用 markdown 代码块。",
      "answer 必填，只放最终答案；summary 和 approach 尽量简短。",
      extraInstructions ? `额外要求：${extraInstructions}` : "",
      "",
      `标题：${problem?.title || "未识别标题"}`,
      problem?.questionType ? `题型：${problem.questionType}` : "",
      "",
      "题面：",
      problem?.statementText || "[未提取到题面]",
      "",
      choiceOptionText ? ["结构化选项：", choiceOptionText, ""].join("\n") : "",
      problem?.ocrText
        ? ["题面 OCR：", problem.ocrText, ""].join("\n")
        : "",
      sampleText && sampleText !== "页面里没有明确提取到样例。"
        ? ["样例：", sampleText, ""].join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "你是一个帮助学生学习算法题的编程助手。",
    "请严格返回 JSON，不要使用 markdown 代码块。",
    'JSON 格式：{"summary":"一句话总结","approach":"分步思路","answer":"选择题最终答案","code":"代码题最终可复制内容"}',
    "summary 请简洁说明你最终依据了什么题意；approach 请简洁说明关键思路；answer 只在选择题、判断题、填空题这类非代码题里填写最终答案，例如 A、B、C、D、AC、对、错；code 只在代码题里放最终可复制代码，非代码题时留空字符串。",
    hasCurrentCode
      ? "当前代码不是空的。你必须把下面的“当前代码”视为必须保留的提交模板，在这份模板上补全并返回完整代码，不得改成另一套结构。不要改函数签名、类名、输入输出框架、主流程结构或已有注释约定；除非某些 import 明显缺失，否则优先保留现有框架。"
      : "当前代码为空。此时可以按题面、样例和语言要求直接生成一份完整可提交代码。",
    extraInstructions ? `额外要求：${extraInstructions}` : "",
    "",
    `标题：${problem?.title || "未识别标题"}`,
    `页面地址：${problem?.url || ""}`,
    `语言：${problem?.limits?.language || "未知"}`,
    `时间限制：${problem?.limits?.time || "未知"}`,
    `内存限制：${problem?.limits?.memory || "未知"}`,
    `题面截图：${
      problem?.screenshotDataUrl
        ? problem?.ocrText
          ? "已截图，并已转写为 OCR 文本"
          : "已截图，但还没有 OCR 文本"
        : "未截图"
    }`,
    `题面 OCR：${problem?.ocrText ? "已附带 OCR 识别文本" : "未附带 OCR 识别文本"}`,
    "",
    "题面：",
    problem?.statementText || "[未提取到题面]",
    "",
    "题面 OCR：",
    problem?.ocrText || "[没有 OCR 文本]",
    "",
    "样例：",
    sampleText,
    "",
    hasCurrentCode ? "模板约束：请严格基于下面这份当前代码补全，不要整体重写。" : "模板约束：当前没有可保留模板，可直接生成完整代码。",
    "",
    "当前代码：",
    currentCodeBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

async function solveProblem(problem, extraInstructionsOverride, externalController = null) {
  if (!problem || typeof problem !== "object") {
    throw new Error("没有收到有效题目信息。");
  }

  const settings = normalizeSettingsShape(await storageGet(DEFAULT_SETTINGS));
  const extraInstructions = normalizeExtraInstructions(extraInstructionsOverride, settings);
  const promptMode = getPromptMode(settings);

  const messages = buildSolverMessages(
    problem,
    extraInstructions,
    Boolean(settings.includeScreenshotInSolver),
    promptMode,
  );
  const solverConfig = resolveSolverConfig(settings, messages[1]?.content);
  const url = normalizeBaseUrl(solverConfig.baseUrl);
  const controller = externalController instanceof AbortController ? externalController : new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("请求超时")), 90000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${solverConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: solverConfig.model,
        temperature: Number(settings.temperature ?? 0.2),
        messages,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let payload = {};

    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const apiMessage =
        payload?.error?.message ||
        payload?.message ||
        rawText ||
        `请求失败，状态码 ${response.status}`;
      throw new Error(apiMessage);
    }

    const assistantText = readAssistantText(payload);
    const parsed = parseSolverResponse(assistantText);
    const fallbackAnswer = extractChoiceAnswer(parsed.answer || parsed.code || assistantText);
    const finalAnswer = parsed.answer || fallbackAnswer;
    const finalCode =
      promptMode === "choice" && finalAnswer ? parsed.code || finalAnswer : parsed.code;

    if (promptMode === "choice" && !finalAnswer) {
      throw new Error("模型返回里没有识别到最终答案。");
    }

    if (promptMode !== "choice" && !finalCode) {
      throw new Error("模型返回里没有可填充的代码。");
    }

    const result = {
      model: solverConfig.model,
      promptPreview: extractTextContent(messages[1]?.content).slice(0, 1200),
      generatedTitle: parsed.generatedTitle,
      summary: parsed.summary,
      problemType: parsed.problemType,
      problemDefinition: parsed.problemDefinition,
      approach: parsed.approach,
      answer: finalAnswer,
      code: finalCode,
      raw: assistantText,
    };

    await appendSolveHistory(problem, result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncCloudQuestionBank() {
  const owner = FIXED_CLOUD_REPO_OWNER;
  const repo = FIXED_CLOUD_REPO_NAME;
  const branch = FIXED_CLOUD_REPO_BRANCH;
  if (!owner || !repo) {
    throw new Error("请先在设置页填写云端仓库所有者和仓库名。");
  }

  const cloudBank = [];

  for (const category of QUESTION_BANK_CATEGORIES) {
    const categoryPayload = await fetchGitHubCategory(owner, repo, branch, category);
    cloudBank.push({
      category,
      questions: Array.isArray(categoryPayload?.questions) ? categoryPayload.questions : [],
    });
  }

  return cloudBank;
}

async function submitContributionWithServerFallback(category, entries) {
  const normalizedCategory = String(category || "").trim();
  const normalizedEntries = Array.isArray(entries)
    ? entries
        .map((entry) => normalizeContributionEntry(entry))
        .filter((entry) => entry && entry.stem && entry.answer)
    : [];
  const contributorEmail = Array.isArray(entries)
    ? String(entries.find((entry) => entry && typeof entry === "object" && entry.contributorEmail)?.contributorEmail || "").trim()
    : "";
  if (!normalizedCategory) {
    throw new Error("请选择题库分类。");
  }
  if (normalizedEntries.length === 0) {
    throw new Error("请先选择可用于贡献的题目。");
  }

  const settings = normalizeSettingsShape(await storageGet(DEFAULT_SETTINGS));
  const owner = String(FIXED_CONTRIBUTION_REPO_OWNER || settings.cloudRepoOwner || "").trim();
  const repo = String(FIXED_CONTRIBUTION_REPO_NAME || settings.cloudRepoName || "").trim();
  if (!owner || !repo) {
    throw new Error("当前没有配置 GitHub 题库仓库。");
  }

  const payload = {
    version: 1,
    category: normalizedCategory,
    exportedAt: new Date().toISOString(),
    source: "autolearning-extension",
    contributorEmail,
    questions: normalizedEntries.map((entry) => ({
      clientEntryId: entry.clientEntryId,
      stem: entry.stem,
      answer: entry.answer,
      fingerprint: entry.fingerprint,
      questionType: entry.questionType,
      statementFingerprint: entry.statementFingerprint,
      answerText: entry.answerText,
      optionMapSnapshot: entry.optionMapSnapshot,
      formatStrength: entry.formatStrength,
      contributorEmail: entry.contributorEmail,
      sourceMeta: entry.sourceMeta,
    })),
  };

  try {
    const serverIssue = await createContributionIssueViaServer(
      settings,
      normalizedCategory,
      normalizedEntries,
      payload,
    );
    await openUrlInNewTab(serverIssue.issueUrl);
    return {
      createdCount: 1,
      duplicateCount: 0,
      issueUrl: serverIssue.issueUrl,
      issueNumber: serverIssue.issueNumber,
      issueTitle: serverIssue.issueTitle,
      entryCount: serverIssue.entryCount,
      viaServer: true,
      fallbackUsed: false,
      needsPaste: false,
      payloadText: "",
      results: normalizedEntries.map((entry) => ({
        clientEntryId: entry.clientEntryId,
        status: "issue_created",
        fingerprint: entry.fingerprint || "",
        issueNumber: serverIssue.issueNumber,
        issueUrl: serverIssue.issueUrl,
        issueTitle: serverIssue.issueTitle,
      })),
    };
  } catch (error) {
    throw new Error(formatErrorMessage(error) || "Failed to create GitHub issue via server.");
  }
}

async function createContributionIssueViaServer(settings, category, entries, payload) {
  const contributorEmail =
    String(payload?.contributorEmail || "").trim() ||
    (Array.isArray(entries)
      ? String(entries.find((entry) => entry && typeof entry === "object" && entry.contributorEmail)?.contributorEmail || "").trim()
      : "");
  const response = await fetch(buildLocalServerUrl("/api/question-bank/contributions/issue", settings), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category,
      entries,
      contributorEmail,
      sourceMeta: collectContributionSourceMeta(entries),
      submittedAt: payload.exportedAt,
      source: payload.source,
    }),
  });
  const result = await parseJsonResponse(response);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || result?.message || `Server returned ${response.status}`);
  }
  if (!result.issueUrl) {
    throw new Error("Server did not return an issue URL.");
  }
  return {
    issueUrl: String(result.issueUrl || ""),
    issueNumber: Number(result.issueNumber || 0),
    issueTitle: String(result.issueTitle || ""),
    entryCount: Number(result.entryCount || entries.length || 0),
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON response (${response.status}).`);
  }
}

function collectContributionSourceMeta(entries) {
  const firstEntry = Array.isArray(entries) ? entries.find((entry) => entry?.sourceMeta) : null;
  const sourceMeta = firstEntry?.sourceMeta && typeof firstEntry.sourceMeta === "object" ? firstEntry.sourceMeta : {};
  return {
    title: String(sourceMeta.title || "").trim(),
    category: String(sourceMeta.category || "").trim(),
    source: String(sourceMeta.source || "").trim(),
    site: String(sourceMeta.site || "").trim(),
    pageUrl: String(sourceMeta.pageUrl || "").trim(),
  };
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || "");
}

async function submitContribution(category, entries) {
  const normalizedCategory = String(category || "").trim();
  const normalizedEntries = Array.isArray(entries)
    ? entries
        .map((entry) => normalizeContributionEntry(entry))
        .filter((entry) => entry && entry.stem && entry.answer)
    : [];
  const contributorEmail = Array.isArray(entries)
    ? String(entries.find((entry) => entry && typeof entry === "object" && entry.contributorEmail)?.contributorEmail || "").trim()
    : "";
  if (!normalizedCategory) {
    throw new Error("请选择贡献分类。");
  }
  if (normalizedEntries.length === 0) {
    throw new Error("请先选择要贡献的题目。");
  }
  const settings = normalizeSettingsShape(await storageGet(DEFAULT_SETTINGS));
  const owner = String(FIXED_CONTRIBUTION_REPO_OWNER || settings.cloudRepoOwner || "").trim();
  const repo = String(FIXED_CONTRIBUTION_REPO_NAME || settings.cloudRepoName || "").trim();
  if (!owner || !repo) {
    throw new Error("当前没有配置 GitHub 贡献仓库。");
  }

  const payload = {
    version: 1,
    category: normalizedCategory,
    exportedAt: new Date().toISOString(),
    source: "autolearning-extension",
    contributorEmail,
    questions: normalizedEntries.map((entry) => ({
      clientEntryId: entry.clientEntryId,
      stem: entry.stem,
      answer: entry.answer,
      fingerprint: entry.fingerprint,
      questionType: entry.questionType,
      statementFingerprint: entry.statementFingerprint,
      answerText: entry.answerText,
      optionMapSnapshot: entry.optionMapSnapshot,
      formatStrength: entry.formatStrength,
      contributorEmail: entry.contributorEmail,
      sourceMeta: entry.sourceMeta,
    })),
  };
  const issueTitle = `[题库贡献][${normalizedCategory}] ${normalizedEntries.length} 题`;
  const issueBody = [
    "## 题库贡献",
    "",
    `- 分类: ${normalizedCategory}`,
    `- 题目数量: ${normalizedEntries.length}`,
    `- 提交时间: ${payload.exportedAt}`,
    `- 来源: ${payload.source}`,
    `- 贡献邮箱: ${contributorEmail || "未提供"}`,
    "",
    "## JSON",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
  const compactIssueBody = [
    "## 题库贡献",
    "",
    `- 分类: ${normalizedCategory}`,
    `- 题目数量: ${normalizedEntries.length}`,
    `- 贡献邮箱: ${contributorEmail || "未提供"}`,
    "",
    "预填 JSON 过长，插件已经把完整内容复制到剪贴板。",
    "请把 JSON 粘贴到下方代码块后再提交 issue。",
    "",
    "## JSON",
    "",
    "```json",
    "请把剪贴板中的 JSON 粘贴到这里",
    "```",
  ].join("\n");
  let issueUrl = buildGitHubIssueUrl(owner, repo, issueTitle, issueBody);
  const needsPaste = issueUrl.length > MAX_GITHUB_ISSUE_URL_LENGTH;
  if (needsPaste) {
    issueUrl = buildGitHubIssueUrl(owner, repo, issueTitle, compactIssueBody);
  }
  await openUrlInNewTab(issueUrl);

  return {
    createdCount: 1,
    duplicateCount: 0,
    issueUrl,
    needsPaste,
    payloadText: needsPaste ? JSON.stringify(payload, null, 2) : "",
    results: normalizedEntries.map((entry) => ({
      clientEntryId: entry.clientEntryId,
      status: "issue_opened",
      fingerprint: entry.fingerprint || "",
    })),
  };
}

function normalizeContributionEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const optionMapSnapshot = Array.isArray(entry.optionMapSnapshot)
    ? entry.optionMapSnapshot
        .map((option) => ({
          label: String(option?.label || "").trim(),
          text: String(option?.text || "").trim(),
        }))
        .filter((option) => option.label || option.text)
    : [];
  const sourceMeta =
    entry.sourceMeta && typeof entry.sourceMeta === "object"
      ? {
          title: String(entry.sourceMeta.title || "").trim(),
          category: String(entry.sourceMeta.category || "").trim(),
          source: String(entry.sourceMeta.source || "").trim(),
          site: String(entry.sourceMeta.site || "").trim(),
          pageUrl: String(entry.sourceMeta.pageUrl || "").trim(),
        }
      : {};
  return {
    clientEntryId: String(entry.clientEntryId || "").trim(),
    stem: String(entry.stem || "").trim(),
    answer: String(entry.answer || "").trim(),
    fingerprint: String(entry.fingerprint || "").trim(),
    questionType: String(entry.questionType || "").trim(),
    statementFingerprint: String(entry.statementFingerprint || "").trim(),
    answerText: String(entry.answerText || "").trim(),
    optionMapSnapshot,
    formatStrength: String(entry.formatStrength || "").trim(),
    contributorEmail: String(entry.contributorEmail || "").trim(),
    sourceMeta,
  };
}

function buildGitHubIssueUrl(owner, repo, title, body) {
  const params = new URLSearchParams({
    title: String(title || ""),
    body: String(body || ""),
    labels: "question-bank-contribution",
  });
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/new?${params.toString()}`;
}

function openUrlInNewTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

async function fetchGitHubCategory(owner, repo, branch, category) {
  const url =
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/` +
    `${encodeURIComponent(branch)}/${encodeURIComponent(category)}.json`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (response.status === 404) {
    return { version: 1, name: category, questions: [] };
  }
  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload?.message || rawText || `读取云端题库失败，状态码 ${response.status}`);
  }
  return payload;
}

async function buildPromptPreview(problem, extraInstructionsOverride) {
  if (!problem || typeof problem !== "object") {
    throw new Error("请先识别题面或读取当前代码。");
  }

  const settings = normalizeSettingsShape(await storageGet(DEFAULT_SETTINGS));
  const extraInstructions = normalizeExtraInstructions(extraInstructionsOverride, settings);
  const promptMode = getPromptMode(settings);
  const messages = buildSolverMessages(
    problem,
    extraInstructions,
    Boolean(settings.includeScreenshotInSolver),
    promptMode,
  );
  const solverConfig = resolveSolverConfig(settings, messages[1]?.content);

  return {
    model: solverConfig.model,
    promptMode,
    temperature: Number(settings.temperature ?? 0.2),
    extraInstructions,
    system: messages[0].content,
    user: extractTextContent(messages[1].content),
    hasImage: hasImageInMessage(messages[1].content),
    hasOcr: Boolean(problem?.ocrText),
  };
}

async function startGitHubAuth() {
  const existing = await getGitHubAuthStatus({ forceRefresh: true });
  if (existing?.sessionToken && existing?.user) {
    return existing;
  }

  const settings = await storageGet(DEFAULT_SETTINGS);
  const serverOrigin = getConfiguredServerOrigin(settings);

  const payload = await fetchLocalServerJson("/auth/github/start", {
    method: "POST",
    body: {
      origin: serverOrigin,
    },
  });
  const authUrl = String(payload?.authUrl || "").trim();
  const pollUrl = String(payload?.pollUrl || "").trim();
  if (!authUrl || !pollUrl) {
    throw new Error("登录流程创建失败。");
  }

  const authTab = await createTab(authUrl);
  try {
    const authSession = await pollGitHubAuthFlow(pollUrl);
    await setGitHubAuthSession(authSession);
    return authSession;
  } finally {
    if (authTab?.id) {
      chrome.tabs.remove(authTab.id, () => {
        void chrome.runtime.lastError;
      });
    }
  }
}

async function getGitHubAuthStatus(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const stored = await getGitHubAuthSession();
  if (!stored?.sessionToken) {
    return null;
  }
  if (!forceRefresh) {
    return stored;
  }

  try {
    const payload = await fetchLocalServerJson("/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stored.sessionToken}`,
      },
    });
    const nextSession = {
      sessionToken: stored.sessionToken,
      user: payload?.user || stored.user || null,
    };
    await setGitHubAuthSession(nextSession);
    return nextSession;
  } catch (error) {
    if (isAuthExpiredError(error)) {
      await clearGitHubAuthSession();
      return null;
    }
    throw error;
  }
}

async function logoutGitHubAuth() {
  const stored = await getGitHubAuthSession();
  if (stored?.sessionToken) {
    try {
      await fetchLocalServerJson("/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stored.sessionToken}`,
        },
      });
    } catch (error) {
      if (!isLocalServerUnavailableError(error) && !isAuthExpiredError(error)) {
        throw error;
      }
    }
  }
  await clearGitHubAuthSession();
}

async function pollGitHubAuthFlow(pollUrl) {
  const maxAttempts = 240;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const payload = await fetchLocalServerJson(pollUrl, {
      method: "GET",
      allowPending: true,
    });
    if (payload?.status === "completed" && payload?.authSession?.sessionToken) {
      return payload.authSession;
    }
    await delay(1200);
  }
  throw new Error("GitHub 登录超时，请重试。");
}

async function fetchLocalServerJson(path, options = {}) {
  const settings = await storageGet(DEFAULT_SETTINGS);
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  const init = {
    method,
    headers,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(buildLocalServerUrl(path, settings), init);
  } catch (error) {
    throw new Error("后端服务不可用，请检查服务是否已启动且地址配置正确。");
  }

  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || rawText || `请求失败，状态码 ${response.status}`);
  }

  if (!options.allowPending && payload?.ok === false) {
    throw new Error(payload?.error || payload?.message || "请求失败。");
  }

  return payload;
}

function buildLocalServerUrl(path, settings = {}) {
  const normalizedPath = String(path || "").trim();
  const serverOrigin = getConfiguredServerOrigin(settings);
  if (!normalizedPath) {
    return serverOrigin;
  }
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }
  return `${serverOrigin}${normalizedPath.startsWith("/") ? "" : "/"}${normalizedPath}`;
}

function getConfiguredServerOrigin(settings = {}) {
  const serverOrigin = String(settings?.serverOrigin || "").trim().replace(/\/+$/, "");
  return serverOrigin && serverOrigin === FIXED_SERVER_ORIGIN ? serverOrigin : FIXED_SERVER_ORIGIN;
}

async function getGitHubAuthSession() {
  const items = await storageGet({ [GITHUB_AUTH_STORAGE_KEY]: null });
  return normalizeGitHubAuthSession(items[GITHUB_AUTH_STORAGE_KEY]);
}

async function setGitHubAuthSession(authSession) {
  const normalized = normalizeGitHubAuthSession(authSession);
  if (!normalized) {
    await clearGitHubAuthSession();
    return null;
  }
  await storageSet({
    [GITHUB_AUTH_STORAGE_KEY]: {
      ...normalized,
      updatedAt: new Date().toISOString(),
    },
  });
  return normalized;
}

async function clearGitHubAuthSession() {
  await storageSet({ [GITHUB_AUTH_STORAGE_KEY]: null });
}

function normalizeGitHubAuthSession(authSession) {
  if (!authSession || typeof authSession !== "object") {
    return null;
  }
  const sessionToken = String(authSession.sessionToken || "").trim();
  const user = authSession.user && typeof authSession.user === "object" ? authSession.user : null;
  if (!sessionToken || !user) {
    return null;
  }
  return {
    sessionToken,
    user: {
      id: String(user.id || "").trim(),
      login: String(user.login || "").trim(),
      name: String(user.name || "").trim(),
      avatarUrl: String(user.avatarUrl || "").trim(),
      profileUrl: String(user.profileUrl || "").trim(),
      isAdmin: Boolean(user.isAdmin),
    },
    updatedAt: String(authSession.updatedAt || "").trim(),
  };
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isLocalServerUnavailableError(error) {
  return error instanceof Error && /后端服务不可用|Failed to fetch|fetch/i.test(error.message || "");
}

function isAuthExpiredError(error) {
  return error instanceof Error && /登录|session|token|401|权限/i.test(error.message || "");
}

function buildSolverMessages(problem, extraInstructions, includeScreenshotInSolver, promptMode = "code") {
  const userPrompt = buildSolverPrompt(problem, extraInstructions, promptMode);
  const screenshotItems = getScreenshotItems(problem);
  const shouldAttachScreenshot = Boolean(includeScreenshotInSolver) && screenshotItems.length > 0;
  const mode = getPromptMode({ promptMode });

  return [
    {
      role: "system",
      content:
        mode === "choice"
          ? "你是一个只做题目判定的助手。输出必须是 JSON。"
          : "你是耐心、严谨的智拓算法助手。你要优先依据题面与样例理解任务，谨慎处理可能串题的标题、代码模板和页面杂质。输出必须是 JSON，并且 code 字段里只放最终可复制内容。",
    },
    {
      role: "user",
      content: shouldAttachScreenshot
        ? [
            {
              type: "text",
              text: userPrompt,
            },
            ...screenshotItems.map((item) => ({
              type: "image_url",
              image_url: {
                url: item.dataUrl,
              },
            })),
          ]
        : userPrompt,
    },
  ];
}

function getScreenshotItems(problem) {
  if (Array.isArray(problem?.screenshotItems) && problem.screenshotItems.length > 0) {
    return problem.screenshotItems
      .map((item) => ({
        dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
      }))
      .filter((item) => item.dataUrl.startsWith("data:image/"));
  }

  if (typeof problem?.screenshotDataUrl === "string" && problem.screenshotDataUrl.startsWith("data:image/")) {
    return [{ dataUrl: problem.screenshotDataUrl }];
  }

  return [];
}

function normalizeExtraInstructions(overrideValue, settings) {
  if (typeof overrideValue === "string" && overrideValue.trim()) {
    return overrideValue.trim();
  }
  const promptMode = getPromptMode(settings);
  const modeValue =
    promptMode === "choice"
      ? settings?.extraInstructionsChoice
      : settings?.extraInstructionsCode;
  return String(modeValue || settings?.extraInstructions || "").trim();
}

function getPromptMode(settings) {
  return settings?.promptMode === "choice" ? "choice" : "code";
}

function resolveSolverConfig(settings, userContent) {
  const activeSolveModel = sanitizeActiveSolveModel(
    settings?.activeSolveModel || settings?.textModel || settings?.imageModel || settings?.model,
  );
  const sharedApiKey = String(settings?.textApiKey || settings?.apiKey || "").trim();
  const textBaseUrl = FIXED_API_BASE_URL;
  const textApiKey = sharedApiKey;
  const textModel = String(activeSolveModel).trim();
  const imageBaseUrl = FIXED_API_BASE_URL;
  const imageApiKey = sharedApiKey;
  const imageModel = String(activeSolveModel).trim();
  const shouldUseImageModel = hasImageInMessage(userContent);
  const selectedConfig = shouldUseImageModel
    ? {
        baseUrl: imageBaseUrl,
        apiKey: imageApiKey,
        model: imageModel,
      }
    : {
        baseUrl: textBaseUrl,
        apiKey: textApiKey,
        model: textModel,
      };

  if (!selectedConfig.baseUrl) {
    throw new Error(
      shouldUseImageModel
        ? "请先在设置页填写图像 Base URL。"
        : "请先在设置页填写文本 Base URL。",
    );
  }

  if (!selectedConfig.apiKey) {
    throw new Error(
      shouldUseImageModel
        ? "请先在设置页填写图像 API Key。"
        : "请先在设置页填写文本 API Key。",
    );
  }

  if (!selectedConfig.model) {
    throw new Error(
      shouldUseImageModel
        ? "请先在设置页填写图像模型。"
        : "请先在设置页填写文本模型。",
    );
  }

  return selectedConfig;
}

async function captureVisibleTab(sender) {
  const windowId = sender?.tab?.windowId;
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!dataUrl) {
        reject(new Error("没有捕获到页面截图。"));
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function runExternalOcr(imageDataUrl) {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    throw new Error("没有收到有效的截图图片。");
  }

  const settings = await storageGet(DEFAULT_SETTINGS);
  const ocrApiKey = String(settings?.ocrApiKey || settings?.textApiKey || settings?.apiKey || "").trim();
  if (!settings.ocrBaseUrl || !ocrApiKey || !settings.ocrModel) {
    throw new Error("请先在设置页填写 API Key、OCR Base URL 和 OCR Model。");
  }

  const url = normalizeBaseUrl(settings.ocrBaseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  const ocrPrompt =
    String(settings.ocrPrompt || "").trim() ||
    "请只返回图片中的纯文本 OCR 结果。";
  const systemPrompt =
    "你是 OCR 助手。你的任务是尽量准确提取图片中的文字与公式，并只返回纯文本。";
  const imageBase64 = extractBase64Data(imageDataUrl);

  try {
    let result = await postOcrRequest(url, ocrApiKey, {
      model: String(settings.ocrModel).trim(),
      temperature: 0,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: ocrPrompt,
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
    }, controller.signal);

    if (!result.ok && shouldRetryOcrWithInlineImages(result.errorMessage)) {
      result = await postOcrRequest(url, ocrApiKey, {
        model: String(settings.ocrModel).trim(),
        stream: false,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: ocrPrompt,
            images: [imageBase64],
          },
        ],
      }, controller.signal);
    }

    if (!result.ok) {
      throw new Error(result.errorMessage);
    }

    const text = String(readAssistantText(result.payload) || "").trim();
    if (!text) {
      throw new Error("OCR 没有返回可用文本。");
    }

    return {
      model: String(settings.ocrModel).trim(),
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postOcrRequest(url, apiKey, body, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  const rawText = await response.text();
  let payload = {};

  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      payload,
      errorMessage:
        payload?.error?.message ||
        payload?.message ||
        rawText ||
        `OCR 请求失败，状态码 ${response.status}`,
    };
  }

  return { ok: true, payload, errorMessage: "" };
}

function shouldRetryOcrWithInlineImages(errorMessage) {
  const message = String(errorMessage || "");
  return /unknown variant [`'"]image_url/i.test(message) || /messages\[\d+\].*content/i.test(message);
}

function extractBase64Data(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!match?.[1]) {
    throw new Error("OCR 截图不是有效的 base64 图片。");
  }
  return match[1];
}

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item?.type === "text") {
          return item.text || "";
        }
        if (item?.type === "image_url") {
          return "[已附带题面截图]";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function hasImageInMessage(content) {
  return Array.isArray(content) && content.some((item) => item?.type === "image_url");
}

function readAssistantText(payload) {
  if (typeof payload?.message?.content === "string") {
    return payload.message.content;
  }

  if (typeof payload?.response === "string") {
    return payload.response;
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item?.type === "text") {
          return item.text || "";
        }
        return "";
      })
      .join("\n");
  }

  return "";
}

function parseSolverResponse(text) {
  const cleaned = String(text || "").trim();
  const jsonCandidate = extractJsonCandidate(cleaned);

  try {
    const parsed = JSON.parse(jsonCandidate);
    return {
      generatedTitle: "",
      summary: String(parsed.summary || parsed.result || "").trim(),
      problemType: "",
      problemDefinition: "",
      approach: String(parsed.approach || parsed.analysis || "").trim(),
      answer: String(parsed.answer || parsed.finalAnswer || "").trim(),
      code: stripCodeFence(String(parsed.code || "").trim()),
    };
  } catch {
    return {
      generatedTitle: "",
      summary: "",
      problemType: "",
      problemDefinition: "",
      approach: "",
      answer: "",
      code: stripCodeFence(cleaned),
    };
  }
}

function extractChoiceAnswer(text) {
  const value = String(text || "").trim();
  if (!value) {
    return "";
  }

  const normalized = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const answerMatch =
    normalized.match(/(?:答案|answer|final answer)\s*[:：]?\s*([A-D]{1,4}|对|错)/i) ||
    normalized.match(/\b([A-D]{1,4})\b/) ||
    normalized.match(/^(对|错)$/);

  return answerMatch?.[1] ? String(answerMatch[1]).toUpperCase() : "";
}

async function getSolveHistory() {
  const items = await storageGet({ [HISTORY_STORAGE_KEY]: [] });
  return Array.isArray(items[HISTORY_STORAGE_KEY]) ? items[HISTORY_STORAGE_KEY] : [];
}

async function clearSolveHistory() {
  await storageSet({ [HISTORY_STORAGE_KEY]: [] });
}

async function appendSolveHistory(problem, result) {
  const settings = await storageGet(DEFAULT_SETTINGS);
  const historyLimit = normalizeHistoryLimit(settings?.historyLimit);
  const history = await getSolveHistory();
  const nextItem = {
    id: `solve-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    title: String(result?.generatedTitle || problem?.title || "").trim(),
    sourceTitle: String(problem?.title || "").trim(),
    pageUrl: String(problem?.url || "").trim(),
    language: String(problem?.limits?.language || "").trim(),
    model: String(result?.model || "").trim(),
    generatedTitle: String(result?.generatedTitle || "").trim(),
    problemType: String(result?.problemType || "").trim(),
    problemDefinition: String(result?.problemDefinition || "").trim(),
    summary: String(result?.summary || "").trim(),
    approach: String(result?.approach || "").trim(),
    answer: String(result?.answer || "").trim(),
    code: String(result?.code || ""),
  };

  await storageSet({
    [HISTORY_STORAGE_KEY]: [nextItem, ...history].slice(0, historyLimit),
  });
}

function normalizeHistoryLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.historyLimit;
  }
  return Math.min(MAX_HISTORY_ITEMS, Math.max(MIN_HISTORY_ITEMS, Math.round(parsed)));
}

function extractJsonCandidate(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function stripCodeFence(text) {
  const fenced = String(text || "").trim().match(/```(?:[\w+-]+)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return String(text || "").trim();
}

function formatError(error) {
  if (isAbortLikeError(error)) {
    return "请求已取消";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "未知错误");
}

function isAbortLikeError(error) {
  return (
    error?.name === "AbortError" ||
    (error instanceof Error && /aborted|abort|取消/u.test(error.message || ""))
  );
}
