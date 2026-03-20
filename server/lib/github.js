const { safeJsonParse } = require("./utils");

function getGitHubConfig() {
  return {
    oauthClientId: String(process.env.GITHUB_OAUTH_CLIENT_ID || "").trim(),
    oauthClientSecret: String(process.env.GITHUB_OAUTH_CLIENT_SECRET || "").trim(),
    repoToken: String(process.env.GITHUB_REPO_TOKEN || "").trim(),
    repoOwner: String(process.env.GITHUB_REPO_OWNER || "").trim(),
    repoName: String(process.env.GITHUB_REPO_NAME || "").trim(),
    repoBranch: String(process.env.GITHUB_REPO_BRANCH || "main").trim(),
  };
}

function hasGitHubOAuthConfig() {
  const config = getGitHubConfig();
  return Boolean(config.oauthClientId && config.oauthClientSecret);
}

function hasGitHubRepoConfig() {
  const config = getGitHubConfig();
  return Boolean(config.repoToken && config.repoOwner && config.repoName);
}

function buildIssueTitle(category, stem) {
  const normalizedCategory = String(category || "").trim() || "general";
  const compactStem = String(stem || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  return `[题库贡献][${normalizedCategory}] ${compactStem || "未命名题目"}`;
}

function buildIssueBody({ category, stem, answer, fingerprint, sourceMeta, user, submittedAt }) {
  const source = sourceMeta && typeof sourceMeta === "object" ? sourceMeta : {};
  const metadata = {
    site: String(source.site || ""),
    pageUrl: String(source.pageUrl || ""),
    source: String(source.source || ""),
    title: String(source.title || ""),
  };

  return [
    "## 题库贡献",
    "",
    `- 提交人: @${String(user?.login || "").trim() || "unknown"}`,
    `- 分类: ${String(category || "").trim() || "general"}`,
    `- 指纹: ${String(fingerprint || "").trim()}`,
    `- 提交时间: ${String(submittedAt || "").trim()}`,
    `- 来源站点: ${metadata.site || "(empty)"}`,
    `- 页面地址: ${metadata.pageUrl || "(empty)"}`,
    `- 来源标识: ${metadata.source || "(empty)"}`,
    `- 页面标题: ${metadata.title || "(empty)"}`,
    "",
    "## 题目",
    "",
    "```text",
    String(stem || "").trim(),
    "```",
    "",
    "## 答案",
    "",
    "```text",
    String(answer || "").trim(),
    "```",
  ].join("\n");
}

async function exchangeCodeForAccessToken(code) {
  const config = getGitHubConfig();
  if (!config.oauthClientId || !config.oauthClientSecret) {
    throw new Error("GitHub OAuth 尚未配置。");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      code,
    }),
  });

  const payload = safeJsonParse(await response.text(), {});
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "GitHub OAuth token 交换失败。");
  }
  return String(payload.access_token);
}

async function fetchGitHubUser(accessToken) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "autolearing-server",
    },
  });
  const payload = safeJsonParse(await response.text(), {});
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.message || "获取 GitHub 用户信息失败。");
  }
  return {
    githubId: String(payload.id),
    login: String(payload.login || ""),
    name: String(payload.name || payload.login || ""),
    avatarUrl: String(payload.avatar_url || ""),
    profileUrl: String(payload.html_url || ""),
  };
}

async function createContributionIssue(input) {
  const config = getGitHubConfig();
  if (!hasGitHubRepoConfig()) {
    throw new Error("请先配置 GITHUB_REPO_TOKEN、GITHUB_REPO_OWNER 和 GITHUB_REPO_NAME。");
  }

  const title = buildIssueTitle(input?.category, input?.stem);
  const body = buildIssueBody({
    category: input?.category,
    stem: input?.stem,
    answer: input?.answer,
    fingerprint: input?.fingerprint,
    sourceMeta: input?.sourceMeta,
    user: input?.user,
    submittedAt: input?.submittedAt,
  });

  const response = await fetch(`https://api.github.com/repos/${config.repoOwner}/${config.repoName}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.repoToken}`,
      "User-Agent": "autolearing-server",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
    }),
  });

  const payload = safeJsonParse(await response.text(), {});
  if (!response.ok || !payload?.number) {
    throw new Error(payload?.message || "创建 GitHub issue 失败。");
  }

  return {
    issueNumber: Number(payload.number),
    issueUrl: String(payload.html_url || ""),
    issueTitle: String(payload.title || title),
  };
}

async function syncCategoryFileToGitHub(category, questions) {
  const config = getGitHubConfig();
  if (!hasGitHubRepoConfig()) {
    return { synced: false, reason: "missing_repo_config" };
  }

  const path = `${category}.json`;
  const apiUrl = `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${path}`;
  const payload = {
    version: 1,
    name: category,
    questions,
  };

  let currentSha = "";
  const currentResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(config.repoBranch)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.repoToken}`,
      "User-Agent": "autolearing-server",
    },
  });
  if (currentResponse.ok) {
    const currentPayload = safeJsonParse(await currentResponse.text(), {});
    currentSha = String(currentPayload?.sha || "");
  }

  const putResponse = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.repoToken}`,
      "User-Agent": "autolearing-server",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `sync ${category} question bank`,
      branch: config.repoBranch,
      sha: currentSha || undefined,
      content: Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64"),
    }),
  });

  const putPayload = safeJsonParse(await putResponse.text(), {});
  if (!putResponse.ok) {
    throw new Error(putPayload?.message || "同步 GitHub 题库失败。");
  }

  return {
    synced: true,
    commitSha: String(putPayload?.commit?.sha || ""),
  };
}

module.exports = {
  createContributionIssue,
  exchangeCodeForAccessToken,
  fetchGitHubUser,
  getGitHubConfig,
  hasGitHubOAuthConfig,
  hasGitHubRepoConfig,
  syncCategoryFileToGitHub,
};
