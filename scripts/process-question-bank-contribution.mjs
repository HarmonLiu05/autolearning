import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const ALLOWED_CATEGORIES = new Set(["educoder", "zhihuishu", "leetcode", "general"]);
const ISSUE_NUMBER = Number(process.env.ISSUE_NUMBER || 0);
const ISSUE_TITLE = String(process.env.ISSUE_TITLE || "").trim();
const ISSUE_BODY = String(process.env.ISSUE_BODY || "");
const ISSUE_URL = String(process.env.ISSUE_URL || "").trim();
const ISSUE_AUTHOR = String(process.env.ISSUE_AUTHOR || "").trim();
const CURRENT_REPO = String(process.env.GITHUB_REPOSITORY || "").trim();
const CURRENT_REPO_TOKEN = String(process.env.GITHUB_TOKEN || "").trim();
const TARGET_REPO_OWNER = String(process.env.TARGET_REPO_OWNER || "HarmonLiu05").trim();
const TARGET_REPO_NAME = String(process.env.TARGET_REPO_NAME || "question-bank").trim();
const TARGET_REPO_BRANCH = String(process.env.TARGET_REPO_BRANCH || "main").trim() || "main";
const TARGET_REPO_TOKEN = String(process.env.TARGET_REPO_TOKEN || "").trim();

async function main() {
  if (!ISSUE_NUMBER || !ISSUE_TITLE.startsWith("[题库贡献]")) {
    return;
  }
  if (!CURRENT_REPO || !CURRENT_REPO_TOKEN) {
    throw new Error("Missing current repository metadata or GITHUB_TOKEN.");
  }
  if (!TARGET_REPO_OWNER || !TARGET_REPO_NAME || !TARGET_REPO_TOKEN) {
    throw new Error("Missing target repository configuration.");
  }

  const payload = extractContributionPayload(ISSUE_BODY);
  const normalized = normalizeContributionPayload(payload);
  const branchName = `codex/question-bank-issue-${ISSUE_NUMBER}`;
  const workdir = await cloneTargetRepository(branchName);
  const mergeResult = await mergeContributionIntoRepo(workdir, normalized, branchName);

  if (mergeResult.addedCount === 0 && mergeResult.updatedCount === 0) {
    await postIssueComment(
      [
        "题库贡献已检查完成。",
        "",
        `- 分类：${normalized.category}`,
        `- 贡献邮箱：${normalized.contributorEmail || "未提供"}`,
        `- 解析题目：${normalized.questions.length} 条`,
        `- 重复题目：${mergeResult.duplicateCount} 条`,
        "- 结果：没有新增或升级题目，本次未生成新的 PR。",
      ].join("\n"),
    );
    setActionOutput("status", "duplicate");
    setActionOutput("duplicate_count", mergeResult.duplicateCount);
    return;
  }

  const pr = await ensurePullRequest({
    branchName,
    category: normalized.category,
    addedCount: mergeResult.addedCount,
    updatedCount: mergeResult.updatedCount,
    contributorEmail: normalized.contributorEmail,
    issueNumber: ISSUE_NUMBER,
  });

  await postIssueComment(
    [
      "题库贡献已处理完成，已生成待审核更新。",
      "",
      `- 分类：${normalized.category}`,
      `- 贡献邮箱：${normalized.contributorEmail || "未提供"}`,
      `- 解析题目：${normalized.questions.length} 条`,
      `- 新增题目：${mergeResult.addedCount} 条`,
      `- 升级题目：${mergeResult.updatedCount} 条`,
      `- 重复题目：${mergeResult.duplicateCount} 条`,
      `- 题库 PR：${pr.html_url}`,
    ].join("\n"),
  );

  setActionOutput("status", "pr_opened");
  setActionOutput("pr_url", pr.html_url);
  setActionOutput("added_count", mergeResult.addedCount);
  setActionOutput("updated_count", mergeResult.updatedCount);
  setActionOutput("duplicate_count", mergeResult.duplicateCount);
}

function extractContributionPayload(issueBody) {
  const body = String(issueBody || "");
  const fencedMatch = body.match(/```json\s*([\s\S]*?)```/i) || body.match(/```\s*([\s\S]*?)```/i);
  const jsonText = (fencedMatch?.[1] || "").trim();
  if (!jsonText) {
    throw new Error("Issue body does not contain a JSON code block.");
  }
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Failed to parse contribution JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeContributionPayload(payload) {
  const category = String(payload?.category || "").trim().toLowerCase();
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new Error(`Unsupported category: ${category || "(empty)"}`);
  }

  const questions = Array.isArray(payload?.questions)
    ? payload.questions
        .map((item) => normalizeContributionQuestion(item))
        .filter(Boolean)
    : [];
  if (questions.length === 0) {
    throw new Error("Contribution JSON does not contain any valid questions.");
  }

  return {
    version: Number(payload?.version || 1),
    category,
    contributorEmail: String(payload?.contributorEmail || "").trim(),
    questions,
  };
}

function normalizeContributionQuestion(question) {
  if (!question || typeof question !== "object") {
    return null;
  }
  const stem = String(question.stem || "").trim();
  const answer = String(question.answer || "").trim();
  const questionType = String(question.questionType || "").trim();
  if (!stem || !answer) {
    return null;
  }
  if (questionType && questionType !== "choice") {
    return null;
  }
  const parsedOptionMapSnapshot = extractChoiceOptionSnapshotFromStem(stem);
  const rawOptionMapSnapshot =
    Array.isArray(question.optionMapSnapshot) && question.optionMapSnapshot.length > 0
      ? question.optionMapSnapshot
      : Array.isArray(question.choiceOptions) && question.choiceOptions.length > 0
        ? question.choiceOptions
        : parsedOptionMapSnapshot;
  const optionMapSnapshot = normalizeChoiceOptionSnapshot(rawOptionMapSnapshot);
  const answerText = normalizeText(question.answerText || resolveChoiceAnswerTextFromSnapshot(answer, optionMapSnapshot));
  const statementFingerprint =
    String(question.statementFingerprint || "").trim() || buildStatementFingerprintFromText(stem);
  const inferredFormatStrength = inferFormatStrength(answerText, optionMapSnapshot);

  return {
    stem,
    answer,
    fingerprint: String(question.fingerprint || "").trim() || buildFingerprint(stem, answer),
    questionType: "choice",
    statementFingerprint,
    answerText,
    optionMapSnapshot,
    formatStrength: inferredFormatStrength === "strong" ? "strong" : String(question.formatStrength || "").trim() || inferredFormatStrength,
  };
}

function buildFingerprint(stem, answer) {
  return createHash("sha256").update(`${stem}\n${answer}`).digest("hex");
}

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function normalizeQuestionStem(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[()[\]{}<>]/g, " ")
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStatementFingerprintFromText(text) {
  const normalized = normalizeQuestionStem(text || "");
  return normalized ? `stem:${hashText(normalized)}` : "";
}

function normalizeChoiceOptionSnapshot(options) {
  return Array.isArray(options)
    ? options
        .map((option) => ({
          label: String(option?.label || "").trim(),
          text: normalizeText(option?.text || ""),
        }))
        .filter((option) => option.label || option.text)
    : [];
}

function extractChoiceOptionSnapshotFromStem(stem) {
  const text = String(stem || "").replace(/\r\n/g, "\n");
  if (!text) {
    return [];
  }

  const inlineMatches = Array.from(
    text.matchAll(/(?:^|\n)\s*([A-F])(?:[.、:：]|[)）])?\s+([^\n]+?)(?=\n\s*[A-F](?:[.、:：]|[)）]|\s)|$)/g),
  );
  const inlineOptions = dedupeChoiceOptions(
    inlineMatches.map((match) => ({
      label: String(match[1] || "").trim().toUpperCase(),
      text: normalizeText(match[2] || ""),
    })),
  );
  if (inlineOptions.length >= 2) {
    return inlineOptions;
  }

  const lines = text
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const collected = [];
  for (let index = 0; index < lines.length; index += 1) {
    const labelOnlyMatch = lines[index].match(/^([A-F])(?:[.、:：]|[)）])?$/);
    if (!labelOnlyMatch) {
      continue;
    }
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !lines[nextIndex]) {
      nextIndex += 1;
    }
    const nextLine = lines[nextIndex] || "";
    if (!nextLine || /^([A-F])(?:[.、:：]|[)）])?$/.test(nextLine)) {
      continue;
    }
    collected.push({
      label: labelOnlyMatch[1].toUpperCase(),
      text: nextLine,
    });
  }
  return dedupeChoiceOptions(collected);
}

function dedupeChoiceOptions(options) {
  const seen = new Set();
  const deduped = [];
  for (const option of normalizeChoiceOptionSnapshot(options)) {
    if (!option.label || !option.text) {
      continue;
    }
    const key = `${option.label}:${normalizeQuestionStem(option.text)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function extractChoiceLabels(answerText) {
  return Array.from(String(answerText || "").toUpperCase().matchAll(/[A-F]/g), (match) => match[0]);
}

function resolveChoiceAnswerTextFromSnapshot(answerLetter, optionMapSnapshot) {
  const labels = extractChoiceLabels(answerLetter);
  if (labels.length === 0) {
    return "";
  }
  const snapshot = normalizeChoiceOptionSnapshot(optionMapSnapshot);
  const matchedTexts = labels
    .map((label) => snapshot.find((option) => option.label === label)?.text || "")
    .filter(Boolean);
  return matchedTexts.join(" | ");
}

function inferFormatStrength(answerText, optionMapSnapshot) {
  return normalizeText(answerText) && normalizeChoiceOptionSnapshot(optionMapSnapshot).length > 0 ? "strong" : "weak";
}

async function cloneTargetRepository(branchName) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "question-bank-"));
  const remote = `https://x-access-token:${TARGET_REPO_TOKEN}@github.com/${TARGET_REPO_OWNER}/${TARGET_REPO_NAME}.git`;
  runGit(["clone", "--depth", "20", "--branch", TARGET_REPO_BRANCH, remote, tempRoot], process.cwd());
  runGit(["checkout", "-B", branchName], tempRoot);
  return tempRoot;
}

async function mergeContributionIntoRepo(workdir, payload, branchName) {
  const filePath = path.join(workdir, `${payload.category}.json`);
  const current = await readQuestionBankFile(filePath, payload.category);

  let addedCount = 0;
  let updatedCount = 0;
  let duplicateCount = 0;

  for (const question of payload.questions) {
    const matchIndex = findMatchingQuestionIndex(current.questions, question);
    if (matchIndex >= 0) {
      const existing = normalizeStoredQuestion(current.questions[matchIndex]);
      const merged = mergeQuestionRecords(existing, question);
      if (haveQuestionRecordsChanged(existing, merged)) {
        current.questions[matchIndex] = merged;
        updatedCount += 1;
      } else {
        duplicateCount += 1;
      }
      continue;
    }

    current.questions.push({
      stem: question.stem,
      answer: question.answer,
      fingerprint: question.fingerprint,
      questionType: "choice",
      statementFingerprint: question.statementFingerprint || buildStatementFingerprintFromText(question.stem),
      answerText: question.answerText || "",
      optionMapSnapshot: normalizeChoiceOptionSnapshot(question.optionMapSnapshot || []),
      formatStrength: question.formatStrength || inferFormatStrength(question.answerText, question.optionMapSnapshot),
      source: "github-issue-contribution",
    });
    addedCount += 1;
  }

  if (addedCount === 0 && updatedCount === 0) {
    return { addedCount: 0, updatedCount: 0, duplicateCount };
  }

  current.questions = current.questions
    .map((item) => normalizeStoredQuestion(item))
    .sort((left, right) => String(left.stem || "").localeCompare(String(right.stem || ""), "zh-Hans-CN"));

  await fs.writeFile(filePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");

  runGit(["add", `${payload.category}.json`], workdir);
  runGit(
    [
      "-c",
      "user.name=autolearning-bot",
      "-c",
      "user.email=autolearning-bot@users.noreply.github.com",
      "commit",
      "-m",
      `sync ${payload.category} question bank from issue #${ISSUE_NUMBER}`,
    ],
    workdir,
  );
  runGit(["push", "--force-with-lease", "origin", branchName], workdir);

  return { addedCount, updatedCount, duplicateCount };
}

function normalizeStoredQuestion(question) {
  if (!question || typeof question !== "object") {
    return {
      stem: "",
      answer: "",
      fingerprint: "",
      questionType: "choice",
      statementFingerprint: "",
      answerText: "",
      optionMapSnapshot: [],
      formatStrength: "weak",
      source: "github-issue-contribution",
    };
  }
  const stem = String(question.stem || "").trim();
  const answer = String(question.answer || "").trim();
  const optionMapSnapshot = normalizeChoiceOptionSnapshot(question.optionMapSnapshot || question.choiceOptions || []);
  const answerText = normalizeText(question.answerText || resolveChoiceAnswerTextFromSnapshot(answer, optionMapSnapshot));
  const statementFingerprint = String(question.statementFingerprint || "").trim() || buildStatementFingerprintFromText(stem);
  const inferredFormatStrength = inferFormatStrength(answerText, optionMapSnapshot);
  return {
    stem,
    answer,
    fingerprint: String(question.fingerprint || "").trim() || buildFingerprint(stem, answer),
    questionType: "choice",
    statementFingerprint,
    answerText,
    optionMapSnapshot,
    formatStrength: inferredFormatStrength === "strong" ? "strong" : String(question.formatStrength || "").trim() || inferredFormatStrength,
    source: String(question.source || "github-issue-contribution").trim() || "github-issue-contribution",
  };
}

function findMatchingQuestionIndex(questions, incoming) {
  const normalizedIncoming = normalizeStoredQuestion(incoming);
  const incomingLegacyFingerprint = buildFingerprint(normalizedIncoming.stem, normalizedIncoming.answer);

  for (let index = 0; index < questions.length; index += 1) {
    const existing = normalizeStoredQuestion(questions[index]);
    if (normalizedIncoming.fingerprint && existing.fingerprint && normalizedIncoming.fingerprint === existing.fingerprint) {
      return index;
    }
    if (
      normalizedIncoming.statementFingerprint &&
      existing.statementFingerprint &&
      normalizedIncoming.statementFingerprint === existing.statementFingerprint
    ) {
      return index;
    }
    if (buildFingerprint(existing.stem, existing.answer) === incomingLegacyFingerprint) {
      return index;
    }
  }

  return -1;
}

function mergeQuestionRecords(existing, incoming) {
  const normalizedExisting = normalizeStoredQuestion(existing);
  const normalizedIncoming = normalizeStoredQuestion(incoming);
  const mergedOptionMapSnapshot =
    normalizedIncoming.optionMapSnapshot.length > normalizedExisting.optionMapSnapshot.length
      ? normalizedIncoming.optionMapSnapshot
      : normalizedExisting.optionMapSnapshot;
  const mergedAnswerText = normalizedExisting.answerText || normalizedIncoming.answerText;
  const mergedStem = normalizedExisting.stem || normalizedIncoming.stem;
  const mergedAnswer = normalizedExisting.answer || normalizedIncoming.answer;

  return {
    stem: mergedStem,
    answer: mergedAnswer,
    fingerprint: normalizedExisting.fingerprint || normalizedIncoming.fingerprint || buildFingerprint(mergedStem, mergedAnswer),
    questionType: "choice",
    statementFingerprint:
      normalizedExisting.statementFingerprint ||
      normalizedIncoming.statementFingerprint ||
      buildStatementFingerprintFromText(mergedStem),
    answerText: mergedAnswerText,
    optionMapSnapshot: mergedOptionMapSnapshot,
    formatStrength: inferFormatStrength(mergedAnswerText, mergedOptionMapSnapshot),
    source: normalizedExisting.source || normalizedIncoming.source || "github-issue-contribution",
  };
}

function haveQuestionRecordsChanged(left, right) {
  return JSON.stringify(normalizeStoredQuestion(left)) !== JSON.stringify(normalizeStoredQuestion(right));
}

async function readQuestionBankFile(filePath, category) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    return {
      version: Number(parsed?.version || 1),
      name: String(parsed?.name || category),
      questions: Array.isArray(parsed?.questions) ? parsed.questions : [],
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        version: 1,
        name: category,
        questions: [],
      };
    }
    throw error;
  }
}

async function ensurePullRequest({ branchName, category, addedCount, updatedCount, contributorEmail, issueNumber }) {
  const existing = await githubRequest({
    token: TARGET_REPO_TOKEN,
    repo: `${TARGET_REPO_OWNER}/${TARGET_REPO_NAME}`,
    path: `/pulls?state=open&head=${encodeURIComponent(`${TARGET_REPO_OWNER}:${branchName}`)}`,
  });
  if (Array.isArray(existing) && existing[0]?.html_url) {
    return existing[0];
  }

  return githubRequest({
    token: TARGET_REPO_TOKEN,
    repo: `${TARGET_REPO_OWNER}/${TARGET_REPO_NAME}`,
    path: "/pulls",
    method: "POST",
    body: {
      title: `[题库贡献][${category}] issue #${issueNumber}`,
      head: branchName,
      base: TARGET_REPO_BRANCH,
      body: [
        "自动生成的题库更新。",
        "",
        `- 来源 issue：${ISSUE_URL || `#${issueNumber}`}`,
        `- 提交者：${ISSUE_AUTHOR || "unknown"}`,
        `- 贡献邮箱：${contributorEmail || "未提供"}`,
        `- 新增题目：${addedCount} 条`,
        `- 升级题目：${updatedCount} 条`,
      ].join("\n"),
    },
  });
}

async function postIssueComment(body) {
  await githubRequest({
    token: CURRENT_REPO_TOKEN,
    repo: CURRENT_REPO,
    path: `/issues/${ISSUE_NUMBER}/comments`,
    method: "POST",
    body: { body },
  });
}

async function githubRequest({ token, repo, path: apiPath, method = "GET", body }) {
  const response = await fetch(`https://api.github.com/repos/${repo}${apiPath}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "autolearning-question-bank-bot",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.message || `GitHub API request failed: ${response.status}`);
  }
  return payload;
}

function runGit(args, cwd) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
  });
}

function setActionOutput(name, value) {
  const outputPath = String(process.env.GITHUB_OUTPUT || "").trim();
  if (!outputPath) {
    return;
  }
  appendFileSync(outputPath, `${name}=${String(value)}\n`, "utf8");
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    if (ISSUE_NUMBER && CURRENT_REPO && CURRENT_REPO_TOKEN) {
      await postIssueComment(`题库贡献自动处理失败：${message}`);
    }
  } catch {}
  console.error(message);
  process.exit(1);
});
