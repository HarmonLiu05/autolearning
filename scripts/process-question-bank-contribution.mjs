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
    throw new Error("缺少当前仓库信息或 GITHUB_TOKEN。");
  }
  if (!TARGET_REPO_OWNER || !TARGET_REPO_NAME || !TARGET_REPO_TOKEN) {
    throw new Error("缺少题库目标仓库配置，请设置 TARGET_REPO_OWNER、TARGET_REPO_NAME 和 TARGET_REPO_TOKEN。");
  }

  const payload = extractContributionPayload(ISSUE_BODY);
  const normalized = normalizeContributionPayload(payload);
  const branchName = `codex/question-bank-issue-${ISSUE_NUMBER}`;
  const workdir = await cloneTargetRepository(branchName);
  const mergeResult = await mergeContributionIntoRepo(workdir, normalized, branchName);

  if (mergeResult.addedCount === 0) {
    await postIssueComment(
      [
        "题库贡献已检查完成。",
        "",
        `- 分类：${normalized.category}`,
        `- 解析题目：${normalized.questions.length} 条`,
        "- 结果：所有题目都已存在于云端题库，没有生成新的 PR。",
      ].join("\n"),
    );
    setActionOutput("status", "duplicate");
    return;
  }

  const pr = await ensurePullRequest({
    branchName,
    category: normalized.category,
    addedCount: mergeResult.addedCount,
    issueNumber: ISSUE_NUMBER,
  });

  await postIssueComment(
    [
      "题库贡献已处理完成，已生成待审核更新。",
      "",
      `- 分类：${normalized.category}`,
      `- 解析题目：${normalized.questions.length} 条`,
      `- 新增题目：${mergeResult.addedCount} 条`,
      `- 题库 PR：${pr.html_url}`,
    ].join("\n"),
  );

  setActionOutput("status", "pr_opened");
  setActionOutput("pr_url", pr.html_url);
}

function extractContributionPayload(issueBody) {
  const body = String(issueBody || "");
  const fencedMatch = body.match(/```json\s*([\s\S]*?)```/i) || body.match(/```\s*([\s\S]*?)```/i);
  const jsonText = (fencedMatch?.[1] || "").trim();
  if (!jsonText) {
    throw new Error("没有在 issue 正文里找到 JSON 代码块，请重新提交。");
  }
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeContributionPayload(payload) {
  const category = String(payload?.category || "").trim().toLowerCase();
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new Error(`不支持的题库分类：${category || "(empty)"}`);
  }

  const questions = Array.isArray(payload?.questions)
    ? payload.questions
        .map((item) => normalizeContributionQuestion(item))
        .filter(Boolean)
    : [];
  if (questions.length === 0) {
    throw new Error("贡献 JSON 里没有可导入的题目。");
  }

  return {
    version: Number(payload?.version || 1),
    category,
    questions,
  };
}

function normalizeContributionQuestion(question) {
  if (!question || typeof question !== "object") {
    return null;
  }
  const stem = String(question.stem || "").trim();
  const answer = String(question.answer || "").trim();
  if (!stem || !answer) {
    return null;
  }
  return {
    stem,
    answer,
    fingerprint: String(question.fingerprint || "").trim() || buildFingerprint(stem, answer),
  };
}

function buildFingerprint(stem, answer) {
  return createHash("sha256").update(`${stem}\n${answer}`).digest("hex");
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
  const knownFingerprints = new Set(
    current.questions.map((item) => String(item?.fingerprint || "").trim() || buildFingerprint(item?.stem || "", item?.answer || "")),
  );

  let addedCount = 0;
  for (const question of payload.questions) {
    if (knownFingerprints.has(question.fingerprint)) {
      continue;
    }
    knownFingerprints.add(question.fingerprint);
    current.questions.push({
      stem: question.stem,
      answer: question.answer,
      fingerprint: question.fingerprint,
      source: "github-issue-contribution",
    });
    addedCount += 1;
  }

  if (addedCount === 0) {
    return { addedCount: 0 };
  }

  current.questions.sort((left, right) => String(left.stem || "").localeCompare(String(right.stem || ""), "zh-Hans-CN"));
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

  return { addedCount };
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

async function ensurePullRequest({ branchName, category, addedCount, issueNumber }) {
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
        `- 新增题目：${addedCount} 条`,
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
    throw new Error(payload?.message || `GitHub API 请求失败：${response.status}`);
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
