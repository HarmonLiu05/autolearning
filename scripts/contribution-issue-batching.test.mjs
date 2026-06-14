import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildContributionPayload,
  splitContributionEntriesByIssueBodySize,
} = require("../server/lib/contribution-batching");
const { buildBatchContributionIssueBody } = require("../server/lib/github");

const entries = Array.from({ length: 12 }, (_, index) => ({
  clientEntryId: `entry-${index + 1}`,
  stem: `Question ${index + 1}\n${"x".repeat(8000)}`,
  answer: "A",
  fingerprint: `fingerprint-${index + 1}`,
  questionType: "choice",
  statementFingerprint: `statement-${index + 1}`,
  answerText: "Option A",
  optionMapSnapshot: [{ label: "A", text: "Option A" }],
  formatStrength: "strong",
  contributorEmail: "test@example.com",
  sourceMeta: { title: `Question ${index + 1}`, site: "example.com" },
}));

const common = {
  category: "zhihuishu",
  exportedAt: "2026-06-14T00:00:00.000Z",
  source: "autolearning-extension",
  contributorEmail: "test@example.com",
  sourceMeta: { title: "Batch test", site: "example.com" },
};

const batches = splitContributionEntriesByIssueBodySize({
  entries,
  ...common,
  maxBodyLength: 55000,
});

assert.ok(batches.length > 1, "large contributions should be split into multiple issues");
assert.deepEqual(
  batches.flatMap((batch) => batch.entries.map((entry) => entry.clientEntryId)),
  entries.map((entry) => entry.clientEntryId),
  "splitting should preserve every entry exactly once and keep order",
);

for (const batch of batches) {
  const body = buildBatchContributionIssueBody({
    ...common,
    entryCount: batch.entries.length,
    payload: batch.payload,
  });
  assert.ok(body.length <= 55000, `issue body should stay below the limit, got ${body.length}`);
  assert.deepEqual(
    batch.payload.questions.map((question) => question.clientEntryId),
    batch.entries.map((entry) => entry.clientEntryId),
  );
}

const payload = buildContributionPayload({
  entries: entries.slice(0, 2),
  ...common,
});
assert.equal(payload.questions.length, 2);
assert.equal(payload.questions[0].answerText, "Option A");
assert.equal(payload.contributorEmail, "test@example.com");

assert.throws(
  () =>
    splitContributionEntriesByIssueBodySize({
      entries: [{ ...entries[0], stem: "x".repeat(60000) }],
      ...common,
      maxBodyLength: 55000,
    }),
  /single contribution entry exceeds/i,
);

console.log("contribution-issue-batching.test.mjs: PASS");
