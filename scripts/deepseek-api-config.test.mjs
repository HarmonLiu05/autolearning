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
