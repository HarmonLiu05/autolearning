const { buildBatchContributionIssueBody } = require("./github");

const DEFAULT_MAX_ISSUE_BODY_LENGTH = 55000;

function buildContributionPayload({
  entries,
  category,
  exportedAt,
  source,
  contributorEmail,
}) {
  return {
    version: 1,
    category,
    exportedAt,
    source,
    contributorEmail,
    questions: entries.map((entry) => ({
      clientEntryId: entry.clientEntryId,
      stem: entry.stem,
      answer: entry.answer,
      fingerprint: entry.fingerprint,
      questionType: entry.questionType,
      statementFingerprint: entry.statementFingerprint,
      answerText: entry.answerText,
      optionMapSnapshot: entry.optionMapSnapshot,
      formatStrength: entry.formatStrength,
      contributorEmail: entry.contributorEmail || contributorEmail,
      sourceMeta: entry.sourceMeta,
    })),
  };
}

function buildIssueBodyForEntries(entries, options) {
  const payload = buildContributionPayload({ ...options, entries });
  const body = buildBatchContributionIssueBody({
    category: options.category,
    entryCount: entries.length,
    exportedAt: options.exportedAt,
    source: options.source,
    sourceMeta: options.sourceMeta,
    payload,
    contributorEmail: options.contributorEmail,
  });
  return { payload, body };
}

function splitContributionEntriesByIssueBodySize(options = {}) {
  const entries = Array.isArray(options.entries) ? options.entries : [];
  const maxBodyLength =
    Number.isFinite(Number(options.maxBodyLength)) && Number(options.maxBodyLength) > 0
      ? Number(options.maxBodyLength)
      : DEFAULT_MAX_ISSUE_BODY_LENGTH;
  const batches = [];
  let currentEntries = [];

  for (const entry of entries) {
    const candidateEntries = [...currentEntries, entry];
    const candidate = buildIssueBodyForEntries(candidateEntries, options);
    if (candidate.body.length <= maxBodyLength) {
      currentEntries = candidateEntries;
      continue;
    }

    if (currentEntries.length === 0) {
      throw new Error(
        `Single contribution entry exceeds the GitHub Issue body limit (${candidate.body.length} > ${maxBodyLength}).`,
      );
    }

    const completed = buildIssueBodyForEntries(currentEntries, options);
    batches.push({ entries: currentEntries, payload: completed.payload, bodyLength: completed.body.length });
    currentEntries = [entry];

    const single = buildIssueBodyForEntries(currentEntries, options);
    if (single.body.length > maxBodyLength) {
      throw new Error(
        `Single contribution entry exceeds the GitHub Issue body limit (${single.body.length} > ${maxBodyLength}).`,
      );
    }
  }

  if (currentEntries.length > 0) {
    const completed = buildIssueBodyForEntries(currentEntries, options);
    batches.push({ entries: currentEntries, payload: completed.payload, bodyLength: completed.body.length });
  }

  return batches;
}

module.exports = {
  DEFAULT_MAX_ISSUE_BODY_LENGTH,
  buildContributionPayload,
  splitContributionEntriesByIssueBodySize,
};
