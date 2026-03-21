const DEFAULT_CHOICE_PROMPT =
  "当前页面大概率是选择题、判断题、概念题或简答型理论题。请优先输出最终答案，而不是写完整程序。若题目是单选题，code 字段只放最终选项，例如 A、B、C、D；若是多选题，code 字段只放选项组合，例如 AC；若是判断题，code 字段只放“对”或“错”；若是简短填空或概念问答，code 字段只放最终可直接填写的简短答案。不要输出 main 函数，不要伪造代码。approach 用 3 到 5 句简洁说明你的判断依据，重点使用关键词匹配、概念定义和排除法。";
const DEFAULT_CODE_PROMPT =
  "当前页面大概率是编程题、代码填空题或需要补全模板的题。只要当前编辑器里已经有非空代码模板，你就必须基于这份模板补全，不能擅自重写整体结构。不要改函数签名、类名、输入输出格式、主流程结构、已有辅助函数名和注释约定；只补全 TODO、空函数、占位返回值、核心逻辑以及必要 import。若题面与模板冲突，优先遵循题面和样例，但仍尽量在原模板内修正，不要另起一份独立实现。若当前编辑器为空，再正常生成完整答案。code 字段只放最终可提交或可复制的完整代码，不要在 code 里混入解释。尽量给出最稳妥、最容易通过样例和评测的做法。";

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("服务端尚未配置平台模型 Base URL。");
  }
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function getPlatformConfig(promptMode, hasImage) {
  const legacyBaseUrl = String(process.env.PLATFORM_BASE_URL || "").trim();
  const legacyApiKey = String(process.env.PLATFORM_API_KEY || "").trim();
  const legacyModel = String(process.env.PLATFORM_MODEL || "").trim();

  const textBaseUrl = String(process.env.PLATFORM_TEXT_BASE_URL || legacyBaseUrl || "").trim();
  const textApiKey = String(process.env.PLATFORM_TEXT_API_KEY || legacyApiKey || "").trim();
  const textModel = String(process.env.PLATFORM_TEXT_MODEL || legacyModel || "").trim();
  const imageBaseUrl = String(process.env.PLATFORM_IMAGE_BASE_URL || textBaseUrl || legacyBaseUrl || "").trim();
  const imageApiKey = String(process.env.PLATFORM_IMAGE_API_KEY || textApiKey || legacyApiKey || "").trim();
  const imageModel = String(process.env.PLATFORM_IMAGE_MODEL || textModel || legacyModel || "").trim();

  const selected = hasImage
    ? { baseUrl: imageBaseUrl, apiKey: imageApiKey, model: imageModel }
    : { baseUrl: textBaseUrl, apiKey: textApiKey, model: textModel };

  if (!selected.baseUrl || !selected.apiKey || !selected.model) {
    throw new Error(
      promptMode === "choice"
        ? "服务端平台选择题模型配置不完整。"
        : "服务端平台模型配置不完整。",
    );
  }

  return selected;
}

function buildSolverPrompt(problem, extraInstructions, promptMode) {
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
  const choiceOptionText =
    Array.isArray(problem?.choiceOptions) && problem.choiceOptions.length > 0
      ? problem.choiceOptions
          .map((option) => [String(option?.label || "").trim(), String(option?.text || "").trim()].filter(Boolean).join(" "))
          .filter(Boolean)
          .join("\n")
      : "";

  if (promptMode === "choice") {
    return [
      "请根据题面直接判断最终答案，并返回 JSON。",
      '{"answer":"A/B/C/D/AC/对/错","summary":"一句话总结","approach":"简短依据"}',
      "只返回合法 JSON，不要使用 markdown 代码块。",
      extraInstructions ? `额外要求：${extraInstructions}` : "",
      "",
      `标题：${problem?.title || "未识别标题"}`,
      problem?.questionType ? `题型：${problem.questionType}` : "",
      "",
      "题面：",
      problem?.statementText || "[未提取到题面]",
      "",
      choiceOptionText ? ["结构化选项：", choiceOptionText, ""].join("\n") : "",
      problem?.ocrText ? ["题面 OCR：", problem.ocrText, ""].join("\n") : "",
      sampleText && sampleText !== "页面里没有明确提取到样例。" ? ["样例：", sampleText, ""].join("\n") : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "你是一个帮助学生学习算法题的编程助手。",
    "请严格返回 JSON，不要使用 markdown 代码块。",
    '{"summary":"一句话总结","approach":"分步思路","answer":"选择题最终答案","code":"代码题最终可复制内容"}',
    "summary 请简洁说明你最终依据了什么题意；approach 请简洁说明关键思路；answer 只在选择题、判断题、填空题这类非代码题里填写最终答案；code 只在代码题里放最终可复制代码，非代码题时留空字符串。",
    hasCurrentCode
      ? "当前代码不是空的。你必须把下面的“当前代码”视为必须保留的提交模板，在这份模板上补全并返回完整代码，不得改成另一套结构。不要改函数签名、类名、输入输出框架、主流程结构或已有注释约定；除非某些 import 明显缺失，否则优先保留现有框架。"
      : "当前代码为空。此时可以按题面、样例和语言要求直接生成一份完整可提交代码。",
    extraInstructions ? `额外要求：${extraInstructions}` : "",
    "",
    `标题：${problem?.title || "未识别标题"}`,
    `页面地址：${problem?.url || ""}`,
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
  ].join("\n");
}

function getScreenshotItems(problem) {
  if (Array.isArray(problem?.screenshotItems) && problem.screenshotItems.length > 0) {
    return problem.screenshotItems
      .map((item) => ({ dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "" }))
      .filter((item) => item.dataUrl.startsWith("data:image/"));
  }
  if (typeof problem?.screenshotDataUrl === "string" && problem.screenshotDataUrl.startsWith("data:image/")) {
    return [{ dataUrl: problem.screenshotDataUrl }];
  }
  return [];
}

function buildMessages(problem, promptMode, extraInstructions, includeScreenshotInSolver) {
  const userPrompt = buildSolverPrompt(problem, extraInstructions, promptMode);
  const screenshotItems = getScreenshotItems(problem);
  const shouldAttachScreenshot = Boolean(includeScreenshotInSolver) && screenshotItems.length > 0;
  return [
    {
      role: "system",
      content:
        promptMode === "choice"
          ? "你是一个只做题目判定的助手。输出必须是 JSON。"
          : "你是耐心、严谨的智拓算法助手。输出必须是 JSON。",
    },
    {
      role: "user",
      content: shouldAttachScreenshot
        ? [
            { type: "text", text: userPrompt },
            ...screenshotItems.map((item) => ({
              type: "image_url",
              image_url: { url: item.dataUrl },
            })),
          ]
        : userPrompt,
    },
  ];
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

function extractJsonCandidate(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw;
}

function stripCodeFence(text) {
  return String(text || "")
    .replace(/^```[\w-]*\n?/g, "")
    .replace(/\n?```$/g, "")
    .trim();
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
  const normalized = value.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  const answerMatch =
    normalized.match(/(?:答案|answer|final answer)\s*[:：]?\s*([A-D]{1,4}|对|错)/i) ||
    normalized.match(/\b([A-D]{1,4})\b/) ||
    normalized.match(/^(对|错)$/);
  return answerMatch?.[1] ? String(answerMatch[1]).toUpperCase() : "";
}

async function solveWithPlatform(problem, options = {}) {
  const promptMode = options.promptMode === "choice" ? "choice" : "code";
  const extraInstructions =
    String(options.extraInstructions || "").trim() ||
    (promptMode === "choice" ? DEFAULT_CHOICE_PROMPT : DEFAULT_CODE_PROMPT);
  const includeScreenshotInSolver = options.includeScreenshotInSolver !== false;
  const messages = buildMessages(problem, promptMode, extraInstructions, includeScreenshotInSolver);
  const hasImage = hasImageInMessage(messages[1]?.content);
  const platformConfig = getPlatformConfig(promptMode, hasImage);
  const response = await fetch(normalizeBaseUrl(platformConfig.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${platformConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: platformConfig.model,
      temperature: 0.2,
      messages,
    }),
  });

  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || rawText || `平台请求失败，状态码 ${response.status}`);
  }

  const assistantText = readAssistantText(payload);
  const parsed = parseSolverResponse(assistantText);
  const fallbackAnswer = extractChoiceAnswer(parsed.answer || parsed.code || assistantText);
  const finalAnswer = parsed.answer || fallbackAnswer;
  const finalCode = promptMode === "choice" && finalAnswer ? parsed.code || finalAnswer : parsed.code;

  if (promptMode === "choice" && !finalAnswer) {
    throw new Error("平台模型返回里没有识别到最终答案。");
  }
  if (promptMode !== "choice" && !finalCode) {
    throw new Error("平台模型返回里没有可用代码。");
  }

  return {
    model: platformConfig.model,
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
}

module.exports = {
  solveWithPlatform,
};
