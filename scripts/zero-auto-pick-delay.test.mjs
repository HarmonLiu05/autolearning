import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const optionsHtml = await readFile(new URL("../extension/options.html", import.meta.url), "utf8");
const optionsJs = await readFile(new URL("../extension/options.js", import.meta.url), "utf8");
const contentJs = await readFile(new URL("../extension/content.js", import.meta.url), "utf8");

const fullAutoInputTag =
  optionsHtml.match(/<input[\s\S]*?id="fullAutoNextDelayMs"[\s\S]*?>/)?.[0] || "";
assert.match(fullAutoInputTag, /min="0"/, "full-auto next-question delay input should allow zero");

const inputTag = optionsHtml.match(/<input[\s\S]*?id="autoPickNextDelayMs"[\s\S]*?>/)?.[0] || "";
assert.match(inputTag, /min="0"/, "auto-pick delay input should allow zero");

assert.match(
  optionsJs,
  /function normalizeDelayInput\(value\)[\s\S]*?Math\.min\(15000,\s*Math\.max\(0,\s*Math\.round\(parsed\)\)\)/,
  "full-auto settings normalization should allow zero",
);

assert.match(
  optionsJs,
  /function normalizeAutoPickDelayInput\(value\)[\s\S]*?Math\.min\(5000,\s*Math\.max\(0,\s*Math\.round\(parsed\)\)\)/,
  "settings normalization should allow zero",
);

assert.match(
  contentJs,
  /function normalizeFullAutoDelay\(value\)[\s\S]*?Math\.min\(15000,\s*Math\.max\(0,\s*Math\.round\(parsed\)\)\)/,
  "full-auto runtime normalization should allow zero",
);

assert.match(
  contentJs,
  /function normalizeAutoPickDelay\(value\)[\s\S]*?Math\.min\(5000,\s*Math\.max\(0,\s*Math\.round\(parsed\)\)\)/,
  "runtime normalization should allow zero",
);

console.log("zero-auto-pick-delay.test.mjs: PASS");
