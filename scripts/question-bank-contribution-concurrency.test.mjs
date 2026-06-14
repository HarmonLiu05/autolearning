import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/process-question-bank-contribution.yml", import.meta.url),
  "utf8",
);
const processor = await readFile(
  new URL("./process-question-bank-contribution.mjs", import.meta.url),
  "utf8",
);

assert.match(workflow, /concurrency:\s*\r?\n\s+group:\s*question-bank-contribution/);
assert.match(workflow, /cancel-in-progress:\s*false/);
assert.match(
  processor,
  /codex\/question-bank-\$\{normalized\.category\}-pending/,
  "all pending issues in one category should update the same branch",
);
assert.match(processor, /findOpenPullRequest\(/);
assert.match(processor, /checkoutContributionBranch\(/);
assert.match(processor, /existingPullRequest/);
assert.match(
  processor,
  /existingPullRequest\?\.head\?\.ref/,
  "an existing legacy contribution PR should be reused until it is merged",
);
assert.doesNotMatch(
  processor,
  /codex\/question-bank-issue-\$\{ISSUE_NUMBER\}/,
  "per-issue branches create conflicting PRs for split batches",
);

console.log("question-bank-contribution-concurrency.test.mjs: PASS");
