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

function buildGitHubIssueCreationError(response, payload, config) {
  const status = Number(response?.status || 0);
  const message = String(payload?.message || "").trim();
  const repoOwner = String(config?.repoOwner || "").trim();
  const repoName = String(config?.repoName || "").trim();
  const repoLabel = repoOwner && repoName ? `${repoOwner}/${repoName}` : "(unknown repo)";

  if (!config?.repoToken) {
    return "Missing GITHUB_REPO_TOKEN.";
  }
  if (!repoOwner || !repoName) {
    return "Missing GITHUB_REPO_OWNER or GITHUB_REPO_NAME.";
  }
  if (status === 401) {
    return `GitHub issue creation failed: invalid or expired token for ${repoLabel}.`;
  }
  if (status === 403) {
    return `GitHub issue creation failed: token does not have permission for ${repoLabel}. ${message}`.trim();
  }
  if (status === 404) {
    return `GitHub issue creation failed: repository ${repoLabel} was not found or is not accessible.`;
  }
  if (status === 422) {
    return `GitHub issue creation failed: validation error from ${repoLabel}. ${message}`.trim();
  }
  return `GitHub issue creation failed (${status || "unknown"}): ${message || "Unknown GitHub API error."}`;
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
  const contributor = String(user?.login || "").trim() || "unknown";

  return [
    "## 题库贡献",
    "",
    `- 提交者: @${contributor}`,
    `- 分类: ${String(category || "").trim() || "general"}`,
    `- 指纹: ${String(fingerprint || "").trim() || "(empty)"}`,
    `- 提交时间: ${String(submittedAt || "").trim() || "(empty)"}`,
    `- 来源站点: ${String(source.site || "").trim() || "(empty)"}`,
    `- 来源页面: ${String(source.pageUrl || "").trim() || "(empty)"}`,
    `- 来源标签: ${String(source.source || "").trim() || "(empty)"}`,
    `- 页面标题: ${String(source.title || "").trim() || "(empty)"}`,
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

function buildBatchContributionIssueBody({ category, entryCount, exportedAt, source, sourceMeta, payload }) {
  const meta = sourceMeta && typeof sourceMeta === "object" ? sourceMeta : {};
  return [
    "## 题库贡献",
    "",
    `- 分类: ${String(category || "").trim() || "general"}`,
    `- 题目数量: ${Number(entryCount) || 0}`,
    `- 提交时间: ${String(exportedAt || "").trim() || "(empty)"}`,
    `- 来源: ${String(source || "").trim() || "autolearning-extension"}`,
    `- 来源站点: ${String(meta.site || "").trim() || "(empty)"}`,
    `- 来源页面: ${String(meta.pageUrl || "").trim() || "(empty)"}`,
    `- 页面标题: ${String(meta.title || "").trim() || "(empty)"}`,
    "",
    "## JSON",
    "",
    "```json",
    JSON.stringify(payload || {}, null, 2),
    "```",
  ].join("\n");
}

async function exchangeCodeForAccessToken(code) {
  const config = getGitHubConfig();
  if (!config.oauthClientId || !config.oauthClientSecret) {
    throw new Error("Missing GitHub OAuth client configuration.");
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
    throw new Error(payload?.error_description || payload?.error || "GitHub OAuth token exchange failed.");
  }
  return String(payload.access_token);
}

async function fetchGitHubUser(accessToken) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "autolearning-server",
    },
  });
  const payload = safeJsonParse(await response.text(), {});
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.message || "Failed to fetch GitHub user.");
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
    throw new Error("Missing GitHub repository configuration.");
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
      "User-Agent": "autolearning-server",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
    }),
  });

  const payload = safeJsonParse(await response.text(), {});
  if (!response.ok || !payload?.number) {
    throw new Error(buildGitHubIssueCreationError(response, payload, config));
  }

  return {
    issueNumber: Number(payload.number),
    issueUrl: String(payload.html_url || ""),
    issueTitle: String(payload.title || title),
  };
}

async function createBatchContributionIssue(input) {
  const config = getGitHubConfig();
  if (!hasGitHubRepoConfig()) {
    throw new Error("Missing GitHub repository configuration.");
  }

  const title = String(input?.title || "").trim();
  const body = buildBatchContributionIssueBody({
    category: input?.category,
    entryCount: input?.entryCount,
    exportedAt: input?.exportedAt,
    source: input?.source,
    sourceMeta: input?.sourceMeta,
    payload: input?.payload,
  });

  const response = await fetch(`https://api.github.com/repos/${config.repoOwner}/${config.repoName}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.repoToken}`,
      "User-Agent": "autolearning-server",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
      labels: ["question-bank-contribution"],
    }),
  });

  const payload = safeJsonParse(await response.text(), {});
  if (!response.ok || !payload?.number) {
    throw new Error(buildGitHubIssueCreationError(response, payload, config));
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
    category,
    questions,
  };

  let currentSha = "";
  const currentResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(config.repoBranch)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.repoToken}`,
      "User-Agent": "autolearning-server",
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
      "User-Agent": "autolearning-server",
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
    throw new Error(putPayload?.message || "Failed to sync GitHub question bank file.");
  }

  return {
    synced: true,
    commitSha: String(putPayload?.commit?.sha || ""),
  };
}

module.exports = {
  createBatchContributionIssue,
  createContributionIssue,
  exchangeCodeForAccessToken,
  fetchGitHubUser,
  getGitHubConfig,
  hasGitHubOAuthConfig,
  hasGitHubRepoConfig,
  syncCategoryFileToGitHub,
};
