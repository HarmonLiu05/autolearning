import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { globalThis: {} };
for (const relativePath of [
  "../extension/solve-models.js",
  "../extension/solve-api-config.js",
]) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  vm.runInNewContext(source, context, { filename: relativePath });
}

const apiConfig = context.globalThis.AUTOLEARNING_API_CONFIG;
assert.ok(apiConfig, "API configuration helpers should be exported");

const normalized = apiConfig.normalizeTextProviderSettings({
  textProvider: "deepseek",
  textBaseUrl: "https://api.deepseek.com/",
  textApiKey: "  sk-test  ",
  textModel: "deepseek-v4-pro",
});
assert.equal(normalized.textProvider, "deepseek");
assert.equal(normalized.textBaseUrl, "https://api.deepseek.com");
assert.equal(normalized.textApiKey, "sk-test");
assert.equal(normalized.textModel, "deepseek-v4-pro");

const migrated = apiConfig.normalizeTextProviderSettings({
  textBaseUrl: "https://api.deepseek.com/v1",
  textApiKey: "legacy-key",
  textModel: "deepseek-chat",
});
assert.equal(migrated.textProvider, "deepseek");
assert.equal(migrated.textModel, "deepseek-v4-flash");

assert.equal(
  apiConfig.normalizeChatCompletionsUrl("https://api.deepseek.com"),
  "https://api.deepseek.com/chat/completions",
);
assert.equal(
  apiConfig.normalizeChatCompletionsUrl("https://api.deepseek.com/v1/"),
  "https://api.deepseek.com/v1/chat/completions",
);

const requestBody = apiConfig.buildChatCompletionBody(
  {
    textProvider: "deepseek",
    textModel: "deepseek-v4-flash",
    temperature: 0.2,
  },
  [{ role: "user", content: "Return JSON" }],
  "choice",
);
assert.equal(requestBody.model, "deepseek-v4-flash");
assert.equal(requestBody.response_format.type, "json_object");
assert.equal(requestBody.max_tokens, 1200);
assert.equal(requestBody.thinking.type, "disabled");

const retryRequestBody = apiConfig.buildChatCompletionBody(
  {
    textProvider: "deepseek",
    textModel: "deepseek-v4-flash",
    temperature: 0.2,
  },
  [{ role: "user", content: "Return JSON" }],
  "choice",
  { retryWithoutJsonMode: true },
);
assert.equal(retryRequestBody.thinking.type, "disabled");
assert.equal(retryRequestBody.response_format, undefined);
assert.equal(retryRequestBody.max_tokens, 1200);

const codeRequestBody = apiConfig.buildChatCompletionBody(
  {
    textProvider: "deepseek",
    textModel: "deepseek-v4-pro",
    temperature: 0.2,
  },
  [{ role: "user", content: "Write code" }],
  "code",
);
assert.equal(codeRequestBody.response_format, undefined);
assert.equal(codeRequestBody.thinking, undefined);

const emptyChoiceDiagnostics = apiConfig.inspectChatCompletionPayload({
  choices: [
    {
      finish_reason: "length",
      message: {
        content: "",
        reasoning_content: "long internal reasoning",
      },
    },
  ],
  usage: { completion_tokens: 1200 },
});
assert.deepEqual(
  JSON.parse(JSON.stringify(emptyChoiceDiagnostics)),
  {
    finishReason: "length",
    contentLength: 0,
    reasoningLength: 23,
    completionTokens: 1200,
  },
);
assert.equal(
  apiConfig.formatEmptyChoiceResponseError(emptyChoiceDiagnostics),
  "模型返回里没有识别到最终答案（finish_reason=length，正文=0字，思考=23字，输出令牌=1200）。",
);
assert.equal(
  apiConfig.shouldRetryEmptyChoiceResponse({
    provider: "deepseek",
    promptMode: "choice",
    attempt: 0,
    finalAnswer: "",
  }),
  true,
);
assert.equal(
  apiConfig.shouldRetryEmptyChoiceResponse({
    provider: "deepseek",
    promptMode: "choice",
    attempt: 1,
    finalAnswer: "",
  }),
  false,
);
assert.equal(
  apiConfig.shouldRetryEmptyChoiceResponse({
    provider: "deepseek",
    promptMode: "choice",
    attempt: 0,
    finalAnswer: "B",
  }),
  false,
);

assert.equal(apiConfig.formatProviderHttpError("deepseek", 401, ""), "DeepSeek API Key 无效。");
assert.equal(apiConfig.formatProviderHttpError("deepseek", 402, ""), "DeepSeek 账户余额不足。");
assert.equal(
  apiConfig.formatProviderHttpError("deepseek", 429, ""),
  "DeepSeek 请求频率过高，请稍后重试。",
);
assert.equal(
  apiConfig.resolveOcrApiKey({
    textProvider: "deepseek",
    textApiKey: "deepseek-secret",
    ocrApiKey: "",
  }),
  "",
);
assert.equal(
  apiConfig.resolveOcrApiKey({
    textProvider: "deepseek",
    textApiKey: "deepseek-secret",
    ocrApiKey: "ocr-secret",
  }),
  "ocr-secret",
);

console.log("deepseek-api-config.test.mjs: PASS");
