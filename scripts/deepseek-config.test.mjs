import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../extension/solve-models.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context, { filename: "extension/solve-models.js" });

const config = context.globalThis.AUTOLEARNING_SOLVE_MODELS;

assert.ok(config, "solve model configuration should be exported");
assert.equal(config.PROVIDERS.deepseek.baseUrl, "https://api.deepseek.com");
assert.deepEqual(
  Array.from(config.PROVIDERS.deepseek.models),
  ["deepseek-v4-flash", "deepseek-v4-pro"],
);
assert.equal(config.sanitizeProvider("deepseek"), "deepseek");
assert.equal(config.sanitizeProvider("unknown"), "platform");
assert.equal(
  config.sanitizeProviderModel("deepseek", "deepseek-v4-pro"),
  "deepseek-v4-pro",
);
assert.equal(
  config.sanitizeProviderModel("deepseek", "gpt-5.4-mini"),
  "deepseek-v4-flash",
);
assert.equal(
  config.migrateLegacyModel("deepseek", "deepseek-chat"),
  "deepseek-v4-flash",
);

console.log("deepseek-config.test.mjs: PASS");
