import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../extension/content.js", import.meta.url), "utf8");

const aiSaveBlock = source.match(
  /if \(!usedQuestionBank && mode === "choice"\) \{([\s\S]*?)\n\s*\}/,
)?.[1] || "";

assert.match(
  aiSaveBlock,
  /status:\s*"verified"/,
  "AI-generated choice answers should be saved as verified",
);
assert.doesNotMatch(
  source,
  /queueQuestionBankReviewItem\(state\.problem,\s*mode,\s*choiceAnswerText\)/,
  "AI-generated choice answers should not enter the review queue",
);
assert.match(
  source,
  /nextResult\.needsVerification\s*=\s*false/,
  "AI-generated choice results should not require confirmation",
);

console.log("auto-verify-choice.test.mjs: PASS");
