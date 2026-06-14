import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../extension/content.js", import.meta.url), "utf8");

const applySingleUpdateBlock =
  source.match(/const applySingleUpdate = \(editorItem, normalizedAnswer\) => \{([\s\S]*?)\n\s*\};/)?.[1] ||
  "";
assert.match(
  applySingleUpdateBlock,
  /\.\.\.existing,/,
  "editing an answer should preserve the existing fingerprint and other entry metadata",
);
assert.match(
  applySingleUpdateBlock,
  /if \(!existing\) \{\s*continue;\s*\}/,
  "editing an answer should not create records for non-storage fingerprint aliases",
);

const editorPrimaryKeyBlock =
  source.match(/const resolveQuestionBankEditorPrimaryKey = \(payload\) => \{([\s\S]*?)\n\s*\};/)?.[1] ||
  "";
assert.match(
  editorPrimaryKeyBlock,
  /buildStatementFingerprintFromText\(/,
  "the editor should rebuild a canonical fingerprint for legacy entries that lost metadata",
);
assert.match(
  editorPrimaryKeyBlock,
  /extractQuestionCoreText\(/,
  "the rebuilt editor fingerprint should ignore question order and option text",
);
assert.match(
  editorPrimaryKeyBlock,
  /canonicalText \|\| normalizeText\(/,
  "legacy entries should still dedupe when core-text extraction is unavailable",
);

console.log("question-bank-edit-dedupe.test.mjs: PASS");
