const DEFAULT_CHOICE_PROMPT =
  "当前页面大概率是选择题、判断题、概念题或简答型理论题。请优先输出最终答案，而不是写完整程序。若题目是单选题，code 字段只放最终选项，例如 A、B、C、D；若是多选题，code 字段只放选项组合，例如 AC；若是判断题，code 字段只放“对”或“错”；若是简短填空或概念问答，code 字段只放最终可直接填写的简短答案。不要输出 main 函数，不要伪造代码。approach 用 3 到 5 句简洁说明你的判断依据，重点使用关键词匹配、概念定义和排除法。";
const DEFAULT_CODE_PROMPT =
  "当前页面大概率是编程题、代码填空题或需要补全模板的题。请优先保留题目指定语言、函数签名、输入输出格式和已有代码骨架，只补上真正缺失的部分。若页面自带代码与题面冲突，优先相信题面和样例。code 字段只放最终可提交或可复制的内容，不要在 code 里混入解释。尽量给出最稳妥、最容易通过样例和评测的做法。";
const API_KEY_PORTAL_URL = "http://03hhhx.dpdns.org:13030/login";
const SUPPORTED_SOLVE_MODELS = [
  "gemini-3-flash",
  "claude-haiku-4-5-20251001",
  "gpt-5.4-mini",
];
const DEFAULT_ACTIVE_SOLVE_MODEL = "gpt-5.4-mini";
const DEFAULT_SETTINGS = {
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  textBaseUrl: "https://api.deepseek.com/v1",
  textApiKey: "",
  model: "deepseek-chat",
  textModel: DEFAULT_ACTIVE_SOLVE_MODEL,
  imageBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
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
  fullAutoShortcut: "Alt+Shift+A",
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
  serverOrigin: "http://03hhhx.dpdns.org",
  cloudRepoOwner: "HarmonLiu05",
  cloudRepoName: "question-bank",
  cloudRepoBranch: "main",
  cloudAutoSync: false,
};

const form = document.getElementById("settings-form");
const statusNode = document.getElementById("status");
const resetButton = document.getElementById("reset");
const restoreChoicePromptButton = document.getElementById("restoreChoicePrompt");
const restoreCodePromptButton = document.getElementById("restoreCodePrompt");
const authSessionSummaryNode = document.getElementById("authSessionSummary");
const cloudRepoSummaryNode = document.getElementById("cloudRepoSummary");
const textApiKeyPortalLinkNode = document.getElementById("textApiKeyPortalLink");
const textApiKeyHelpNode = document.getElementById("textApiKeyHelp");

void hydrateForm();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (changes.cloudRepoOwner || changes.cloudRepoName || changes.cloudRepoBranch) {
    void hydrateForm();
    return;
  }
  if (
    changes.textApiKey ||
    changes.apiKey ||
    changes.extraInstructionsChoice ||
    changes.extraInstructionsCode ||
    changes.extraInstructions ||
    changes.fullAutoShortcut ||
    changes.fullAutoNextDelayMs ||
    changes.autoPickNextDelayMs ||
    changes.cloudAutoSync
  ) {
    void hydrateForm();
  }
});
textApiKeyPortalLinkNode?.addEventListener("click", (event) => {
  if (API_KEY_PORTAL_URL) {
    return;
  }
  event.preventDefault();
  setStatus("认证页暂未开放。");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = {
    textApiKey: document.getElementById("textApiKey").value.trim(),
    extraInstructionsChoice: document.getElementById("extraInstructionsChoice").value.trim(),
    extraInstructionsCode: document.getElementById("extraInstructionsCode").value.trim(),
    fullAutoShortcut:
      normalizeShortcut(document.getElementById("fullAutoShortcut").value) ||
      DEFAULT_SETTINGS.fullAutoShortcut,
    fullAutoNextDelayMs: normalizeDelayInput(document.getElementById("fullAutoNextDelayMs").value),
    autoPickNextDelayMs: normalizeAutoPickDelayInput(document.getElementById("autoPickNextDelayMs").value),
    cloudAutoSync: document.getElementById("cloudAutoSync").checked,
  };

  await storageSet(values);
  setStatus("设置已保存。");
});

resetButton.addEventListener("click", async () => {
  await storageSet(DEFAULT_SETTINGS);
  await hydrateForm();
  setStatus("已恢复默认值。");
});

restoreChoicePromptButton.addEventListener("click", async () => {
  document.getElementById("extraInstructionsChoice").value = DEFAULT_CHOICE_PROMPT;
  await storageSet({
    extraInstructionsChoice: DEFAULT_CHOICE_PROMPT,
  });
  setStatus("已恢复选择题默认提示词。");
});

restoreCodePromptButton.addEventListener("click", async () => {
  document.getElementById("extraInstructionsCode").value = DEFAULT_CODE_PROMPT;
  await storageSet({
    extraInstructionsCode: DEFAULT_CODE_PROMPT,
    extraInstructions: DEFAULT_CODE_PROMPT,
  });
  setStatus("已恢复代码题默认提示词。");
});

async function hydrateForm() {
  const values = await storageGet(DEFAULT_SETTINGS);
  document.getElementById("textApiKey").value = values.textApiKey || values.apiKey || "";
  document.getElementById("extraInstructionsChoice").value =
    values.extraInstructionsChoice || DEFAULT_CHOICE_PROMPT;
  document.getElementById("extraInstructionsCode").value =
    values.extraInstructionsCode || values.extraInstructions || DEFAULT_CODE_PROMPT;
  document.getElementById("fullAutoShortcut").value =
    normalizeShortcut(values.fullAutoShortcut) || DEFAULT_SETTINGS.fullAutoShortcut;
  document.getElementById("fullAutoNextDelayMs").value = String(
    normalizeDelayInput(values.fullAutoNextDelayMs),
  );
  document.getElementById("autoPickNextDelayMs").value = String(
    normalizeAutoPickDelayInput(values.autoPickNextDelayMs),
  );
  document.getElementById("cloudAutoSync").checked = Boolean(values.cloudAutoSync);
  renderCloudRepoSummary(values);
  renderAuthSessionSummary();
  renderApiKeyPortalState();
}

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

function setStatus(text) {
  statusNode.textContent = text;
}

function renderCloudRepoSummary(values) {
  if (!cloudRepoSummaryNode) {
    return;
  }
  const owner = String(values?.cloudRepoOwner || DEFAULT_SETTINGS.cloudRepoOwner).trim();
  const repo = String(values?.cloudRepoName || DEFAULT_SETTINGS.cloudRepoName).trim();
  const branch = String(values?.cloudRepoBranch || DEFAULT_SETTINGS.cloudRepoBranch).trim();
  cloudRepoSummaryNode.textContent = `${owner}/${repo}${branch ? `@${branch}` : ""}`;
}

function renderAuthSessionSummary() {
  if (!authSessionSummaryNode) {
    return;
  }
  authSessionSummaryNode.textContent =
    "无需登录 GitHub；下载云端题库走 GitHub 公开地址，贡献题目时会打开预填好的 Issue 页面，并由仓库 Actions 自动处理。";
}

function renderApiKeyPortalState() {
  if (textApiKeyPortalLinkNode instanceof HTMLAnchorElement) {
    const enabled = Boolean(API_KEY_PORTAL_URL);
    textApiKeyPortalLinkNode.href = enabled ? API_KEY_PORTAL_URL : "#";
    textApiKeyPortalLinkNode.setAttribute("aria-disabled", enabled ? "false" : "true");
    textApiKeyPortalLinkNode.classList.toggle("is-disabled", !enabled);
  }
  if (textApiKeyHelpNode) {
    textApiKeyHelpNode.textContent = API_KEY_PORTAL_URL
      ? "保存在当前浏览器本地，不会写进这个仓库。也可以通过右侧链接前往认证页获取新的 API Key。"
      : "保存在当前浏览器本地，不会写进这个仓库。认证页暂未开放。";
  }
}

function normalizeHistoryLimitInput(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.historyLimit;
  }
  return Math.min(500, Math.max(10, Math.round(parsed)));
}

function normalizeServerOrigin(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  return normalized || DEFAULT_SETTINGS.serverOrigin;
}

function normalizeDelayInput(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.fullAutoNextDelayMs;
  }
  return Math.min(15000, Math.max(500, Math.round(parsed)));
}

function normalizeAutoPickDelayInput(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.autoPickNextDelayMs;
  }
  return Math.min(5000, Math.max(100, Math.round(parsed)));
}

function normalizeShortcut(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (!raw) {
    return "";
  }

  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  const modifiers = [];
  let key = "";

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "cmd" || lower === "command" || lower === "meta") {
      if (!modifiers.includes("Meta")) {
        modifiers.push("Meta");
      }
      continue;
    }
    if (lower === "ctrl" || lower === "control") {
      if (!modifiers.includes("Ctrl")) {
        modifiers.push("Ctrl");
      }
      continue;
    }
    if (lower === "alt" || lower === "option") {
      if (!modifiers.includes("Alt")) {
        modifiers.push("Alt");
      }
      continue;
    }
    if (lower === "shift") {
      if (!modifiers.includes("Shift")) {
        modifiers.push("Shift");
      }
      continue;
    }
    key = formatShortcutKey(part);
  }

  if (!key) {
    return "";
  }

  return [...modifiers, key].join("+");
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function formatShortcutKey(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length === 1) {
    return raw.toUpperCase();
  }
  const specialKeys = {
    space: "Space",
    enter: "Enter",
    escape: "Escape",
    esc: "Escape",
    tab: "Tab",
  };
  return specialKeys[raw.toLowerCase()] || `${raw.slice(0, 1).toUpperCase()}${raw.slice(1).toLowerCase()}`;
}
