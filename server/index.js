const http = require("node:http");
const { URL } = require("node:url");
const { readDb, updateDb } = require("./lib/db");
const {
  createBatchContributionIssue,
  createContributionIssue,
  exchangeCodeForAccessToken,
  fetchGitHubUser,
  getGitHubConfig,
  hasGitHubOAuthConfig,
  hasGitHubRepoConfig,
  syncCategoryFileToGitHub,
} = require("./lib/github");
const { solveWithPlatform } = require("./lib/solver");
const {
  QUESTION_BANK_CATEGORIES,
  assertCategory,
  buildFingerprint,
  normalizeAnswer,
  normalizeText,
  nowIso,
  parseBearerToken,
  randomId,
  readRequestBody,
  safeJsonParse,
  sendHtml,
  sendJson,
  sumLedger,
} = require("./lib/utils");

const HOST = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
const CREDIT_COST_PER_SOLVE = Number(process.env.CREDIT_COST_PER_SOLVE || 1);
const REWARD_THRESHOLD = Number(process.env.REWARD_THRESHOLD || 10);
const REWARD_CREDITS = Number(process.env.REWARD_CREDITS || 100);
const ADMIN_GITHUB_LOGINS = String(process.env.ADMIN_GITHUB_LOGINS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      const githubConfig = getGitHubConfig();
      sendJson(res, 200, {
        ok: true,
        githubOAuthConfigured: hasGitHubOAuthConfig(),
        repoConfigPresent: hasGitHubRepoConfig(),
        repoOwner: githubConfig.repoOwner || "",
        repoName: githubConfig.repoName || "",
        repoTokenPresent: Boolean(githubConfig.repoToken),
        publicBaseUrl: PUBLIC_BASE_URL || "",
        host: HOST,
        port: PORT,
        categories: QUESTION_BANK_CATEGORIES,
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/auth/github/start") {
      await handleAuthStart(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/auth/github/callback") {
      await handleAuthCallback(req, res, requestUrl);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/auth/flow/")) {
      await handleAuthFlowStatus(req, res, requestUrl.pathname.split("/").pop());
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/auth/logout") {
      await handleLogout(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/me") {
      const session = await requireSession(req);
      sendJson(res, 200, { ok: true, user: session.user });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/credits/balance") {
      const session = await requireSession(req);
      sendJson(res, 200, { ok: true, ...buildCreditSummary(session.db, session.user.id) });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/question-bank/index") {
      const db = await readDb();
      const categories = QUESTION_BANK_CATEGORIES.map((category) => {
        const count = db.questionBankEntries.filter((entry) => entry.category === category).length;
        return {
          category,
          name: category,
          path: `/question-bank/${category}`,
          count,
        };
      });
      sendJson(res, 200, { ok: true, version: 1, categories });
      return;
    }

    if (req.method === "GET" && /^\/question-bank\/[^/]+$/.test(requestUrl.pathname)) {
      const category = assertCategory(requestUrl.pathname.split("/").pop());
      const db = await readDb();
      sendJson(res, 200, {
        ok: true,
        version: 1,
        name: category,
        category,
        questions: db.questionBankEntries
          .filter((entry) => entry.category === category)
          .map((entry) => ({
            stem: entry.stem,
            answer: entry.answer,
            source: entry.source,
            fingerprint: entry.fingerprint,
          })),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/contributions") {
      const session = await requireSession(req);
      await handleContributions(req, res, session);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/question-bank/contributions/issue") {
      await handleBatchContributionIssue(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/contributions/mine") {
      const session = await requireSession(req);
      const mine = session.db.contributions.filter((entry) => entry.userId === session.user.id);
      sendJson(res, 200, { ok: true, contributions: mine });
      return;
    }

    if (req.method === "POST" && /^\/admin\/contributions\/[^/]+\/approve$/.test(requestUrl.pathname)) {
      const session = await requireAdminSession(req);
      const contributionId = requestUrl.pathname.split("/")[3];
      await handleApproveContribution(req, res, session, contributionId);
      return;
    }

    if (req.method === "POST" && /^\/admin\/contributions\/[^/]+\/reject$/.test(requestUrl.pathname)) {
      const session = await requireAdminSession(req);
      const contributionId = requestUrl.pathname.split("/")[3];
      await handleRejectContribution(req, res, session, contributionId);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/ai/solve") {
      const session = await requireSession(req);
      await handleAiSolve(req, res, session);
      return;
    }

    sendJson(res, 404, { ok: false, error: "未找到接口。" });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  const listenUrl = `http://${HOST}:${PORT}`;
  console.log(`Autolearning server running at ${listenUrl}`);
  if (PUBLIC_BASE_URL) {
    console.log(`Public base URL: ${PUBLIC_BASE_URL}`);
  }
});

async function handleAuthStart(req, res) {
  if (!hasGitHubOAuthConfig()) {
    throw new Error("请先配置 GITHUB_OAUTH_CLIENT_ID 和 GITHUB_OAUTH_CLIENT_SECRET。");
  }
  const body = safeJsonParse(await readRequestBody(req), {}) || {};
  const origin = resolvePublicOrigin(body.origin);
  const flowId = randomId("flow");
  const state = randomId("state");
  const callbackUrl = `${origin.replace(/\/+$/, "")}/auth/github/callback`;
  const githubConfig = getGitHubConfig();
  const authUrl =
    `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(githubConfig.oauthClientId)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&scope=${encodeURIComponent("read:user")}` +
    `&state=${encodeURIComponent(state)}`;

  await updateDb((db) => {
    db.authFlows.push({
      id: flowId,
      state,
      status: "pending",
      callbackUrl,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return db;
  });

  sendJson(res, 200, {
    ok: true,
    flowId,
    authUrl,
    pollUrl: `/auth/flow/${flowId}`,
  });
}

async function handleAuthCallback(_req, res, requestUrl) {
  const code = String(requestUrl.searchParams.get("code") || "").trim();
  const state = String(requestUrl.searchParams.get("state") || "").trim();
  if (!code || !state) {
    throw new Error("GitHub 回调缺少 code 或 state。");
  }

  const accessToken = await exchangeCodeForAccessToken(code);
  const githubUser = await fetchGitHubUser(accessToken);
  const sessionToken = randomId("sess");

  await updateDb((db) => {
    const flow = db.authFlows.find((item) => item.state === state);
    if (!flow) {
      throw new Error("未找到对应的登录流程。");
    }

    let user = db.users.find((item) => item.githubId === githubUser.githubId);
    if (!user) {
      user = {
        id: randomId("user"),
        githubId: githubUser.githubId,
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatarUrl,
        profileUrl: githubUser.profileUrl,
        isAdmin: ADMIN_GITHUB_LOGINS.includes(githubUser.login.toLowerCase()),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.users.push(user);
    } else {
      Object.assign(user, {
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatarUrl,
        profileUrl: githubUser.profileUrl,
        isAdmin: ADMIN_GITHUB_LOGINS.includes(githubUser.login.toLowerCase()),
        updatedAt: nowIso(),
      });
    }

    db.sessions = db.sessions.filter((item) => item.userId !== user.id);
    db.sessions.push({
      token: sessionToken,
      userId: user.id,
      createdAt: nowIso(),
    });

    flow.status = "completed";
    flow.sessionToken = sessionToken;
    flow.userId = user.id;
    flow.updatedAt = nowIso();
    return db;
  });

  sendHtml(
    res,
    200,
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8" /><title>登录完成</title><body style="font-family:sans-serif;padding:32px;color:#102432;"><h1>GitHub 登录成功</h1><p>你可以回到插件里继续使用了，这个页面现在可以关闭。</p></body></html>`,
  );
}

async function handleAuthFlowStatus(_req, res, flowId) {
  const db = await readDb();
  const flow = db.authFlows.find((item) => item.id === flowId);
  if (!flow) {
    throw new Error("登录流程不存在。");
  }
  if (flow.status !== "completed") {
    sendJson(res, 200, { ok: true, status: flow.status || "pending" });
    return;
  }
  const session = db.sessions.find((item) => item.token === flow.sessionToken);
  const user = db.users.find((item) => item.id === flow.userId);
  sendJson(res, 200, {
    ok: true,
    status: "completed",
    authSession: {
      sessionToken: session?.token || "",
      user: serializeUser(user),
    },
  });
}

async function handleLogout(req, res) {
  const token = parseBearerToken(req);
  if (token) {
    await updateDb((db) => {
      db.sessions = db.sessions.filter((item) => item.token !== token);
      return db;
    });
  }
  sendJson(res, 200, { ok: true });
}

async function handleContributions(req, res, session) {
  const body = safeJsonParse(await readRequestBody(req), {}) || {};
  const category = assertCategory(String(body.category || "").trim());
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) {
    throw new Error("没有收到可提交的题目。");
  }

  const results = [];
  const db = await readDb();
  for (const rawEntry of entries) {
    const clientEntryId = String(rawEntry?.clientEntryId || "").trim() || randomId("client");
    const stem = normalizeText(rawEntry?.stem || "");
    const answer = normalizeAnswer(rawEntry?.answer || "");
    const sourceMeta = rawEntry?.sourceMeta && typeof rawEntry.sourceMeta === "object" ? rawEntry.sourceMeta : {};
    const submittedAt = nowIso();

    if (!stem || !answer) {
      db.contributions.push({
        id: randomId("contrib"),
        clientEntryId,
        userId: session.user.id,
        category,
        stem,
        answer,
        fingerprint: "",
        sourceMeta,
        status: "invalid",
        issueNumber: 0,
        issueUrl: "",
        issueTitle: "",
        submittedAt,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });
      results.push({ clientEntryId, status: "invalid" });
      continue;
    }

    const fingerprint = buildFingerprint(stem);
    const existingApproved = db.questionBankEntries.find((item) => item.fingerprint === fingerprint);
    const existingContribution = db.contributions.find((item) => item.fingerprint === fingerprint);
    if (existingApproved || existingContribution) {
      const duplicateRecord = {
        id: randomId("contrib"),
        clientEntryId,
        userId: session.user.id,
        category,
        stem,
        answer,
        fingerprint,
        sourceMeta,
        status: "duplicate",
        issueNumber: Number(existingContribution?.issueNumber || 0),
        issueUrl: String(existingContribution?.issueUrl || ""),
        issueTitle: String(existingContribution?.issueTitle || ""),
        duplicateOfContributionId: String(existingContribution?.id || ""),
        submittedAt,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      };
      db.contributions.push(duplicateRecord);
      results.push({
        clientEntryId,
        status: "duplicate",
        fingerprint,
        issueNumber: duplicateRecord.issueNumber || undefined,
        issueUrl: duplicateRecord.issueUrl || undefined,
      });
      continue;
    }

    const issue = await createContributionIssue({
      category,
      stem,
      answer,
      fingerprint,
      sourceMeta,
      submittedAt,
      user: session.user,
    });

    const contribution = {
      id: randomId("contrib"),
      clientEntryId,
      userId: session.user.id,
      category,
      stem,
      answer,
      fingerprint,
      sourceMeta,
      status: "issue_created",
      issueNumber: issue.issueNumber,
      issueUrl: issue.issueUrl,
      issueTitle: issue.issueTitle,
      submittedAt,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    };
    db.contributions.push(contribution);
    results.push({
      clientEntryId,
      status: "issue_created",
      contributionId: contribution.id,
      fingerprint,
      issueNumber: issue.issueNumber,
      issueUrl: issue.issueUrl,
      issueTitle: issue.issueTitle,
    });
  }

  await updateDb(() => db);

  sendJson(res, 200, {
    ok: true,
    createdCount: results.filter((item) => item.status === "issue_created").length,
    duplicateCount: results.filter((item) => item.status === "duplicate").length,
    results,
  });
}

async function handleBatchContributionIssue(req, res) {
  const body = safeJsonParse(await readRequestBody(req), {}) || {};
  const category = assertCategory(String(body.category || "").trim());
  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  const entries = rawEntries.map((entry) => normalizeBatchContributionEntry(entry)).filter(Boolean);
  if (entries.length === 0) {
    throw new Error("No valid contribution entries were provided.");
  }

  const submittedAt = String(body.submittedAt || "").trim() || nowIso();
  const source = String(body.source || "").trim() || "autolearning-extension";
  const sourceMeta = buildBatchSourceMeta(entries, body.sourceMeta);
  const payload = {
    version: 1,
    category,
    exportedAt: submittedAt,
    source,
    questions: entries.map((entry) => ({
      clientEntryId: entry.clientEntryId,
      stem: entry.stem,
      answer: entry.answer,
      sourceMeta: entry.sourceMeta,
    })),
  };
  const issueTitle = `[题库贡献][${category}] ${entries.length} 题`;
  const issue = await createBatchContributionIssue({
    title: issueTitle,
    category,
    entryCount: entries.length,
    exportedAt: submittedAt,
    source,
    sourceMeta,
    payload,
  });

  sendJson(res, 200, {
    ok: true,
    issueUrl: issue.issueUrl,
    issueNumber: issue.issueNumber,
    issueTitle: issue.issueTitle,
    entryCount: entries.length,
  });
}

function normalizeBatchContributionEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const stem = normalizeText(entry.stem || "");
  const answer = normalizeAnswer(entry.answer || "");
  if (!stem || !answer) {
    return null;
  }

  const rawSourceMeta = entry.sourceMeta && typeof entry.sourceMeta === "object" ? entry.sourceMeta : {};
  return {
    clientEntryId: String(entry.clientEntryId || "").trim() || randomId("client"),
    stem,
    answer,
    fingerprint: String(entry.fingerprint || buildFingerprint(stem, answer)).trim(),
    questionType: String(entry.questionType || "choice").trim() || "choice",
    statementFingerprint: String(entry.statementFingerprint || "").trim(),
    answerText: normalizeText(entry.answerText || ""),
    optionMapSnapshot: Array.isArray(entry.optionMapSnapshot)
      ? entry.optionMapSnapshot
          .map((item) =>
            item && typeof item === "object"
              ? {
                  label: String(item.label || "").trim(),
                  text: normalizeText(item.text || ""),
                }
              : null,
          )
          .filter((item) => item && item.label && item.text)
      : [],
    formatStrength: String(entry.formatStrength || "").trim(),
    contributorEmail: String(entry.contributorEmail || "").trim(),
    sourceMeta: {
      title: String(rawSourceMeta.title || "").trim(),
      category: String(rawSourceMeta.category || "").trim(),
      source: String(rawSourceMeta.source || "").trim(),
      site: String(rawSourceMeta.site || "").trim(),
      pageUrl: String(rawSourceMeta.pageUrl || "").trim(),
    },
  };
}

function buildBatchSourceMeta(entries, providedMeta) {
  const normalizedProvided =
    providedMeta && typeof providedMeta === "object"
      ? {
          title: String(providedMeta.title || "").trim(),
          category: String(providedMeta.category || "").trim(),
          source: String(providedMeta.source || "").trim(),
          site: String(providedMeta.site || "").trim(),
          pageUrl: String(providedMeta.pageUrl || "").trim(),
        }
      : {};
  const firstEntryMeta = entries[0]?.sourceMeta && typeof entries[0].sourceMeta === "object" ? entries[0].sourceMeta : {};
  return {
    title: normalizedProvided.title || String(firstEntryMeta.title || "").trim(),
    category: normalizedProvided.category || String(firstEntryMeta.category || "").trim(),
    source: normalizedProvided.source || String(firstEntryMeta.source || "").trim(),
    site: normalizedProvided.site || String(firstEntryMeta.site || "").trim(),
    pageUrl: normalizedProvided.pageUrl || String(firstEntryMeta.pageUrl || "").trim(),
  };
}

async function handleBatchContributionIssue(req, res) {
  const body = safeJsonParse(await readRequestBody(req), {}) || {};
  const category = assertCategory(String(body.category || "").trim());
  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  const entries = rawEntries.map((entry) => normalizeBatchContributionEntry(entry)).filter(Boolean);
  if (entries.length === 0) {
    throw new Error("No valid contribution entries were provided.");
  }

  const submittedAt = String(body.submittedAt || "").trim() || nowIso();
  const source = String(body.source || "").trim() || "autolearning-extension";
  const contributorEmail =
    String(body.contributorEmail || "").trim() ||
    String(entries.find((entry) => entry.contributorEmail)?.contributorEmail || "").trim();
  const sourceMeta = buildBatchSourceMeta(entries, body.sourceMeta);
  const payload = {
    version: 1,
    category,
    exportedAt: submittedAt,
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

  const issueTitle = `[题库贡献][${category}] ${entries.length} 题`;
  let issue;
  try {
    issue = await createBatchContributionIssue({
      title: issueTitle,
      category,
      entryCount: entries.length,
      exportedAt: submittedAt,
      source,
      sourceMeta,
      payload,
      contributorEmail,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[question-bank/contributions/issue] ${errorMessage}`);
    throw error;
  }

  sendJson(res, 200, {
    ok: true,
    issueUrl: issue.issueUrl,
    issueNumber: issue.issueNumber,
    issueTitle: issue.issueTitle,
    entryCount: entries.length,
  });
}

async function handleApproveContribution(req, res, session, contributionId) {
  const body = safeJsonParse(await readRequestBody(req), {}) || {};
  const overrideCategory = body.category ? assertCategory(String(body.category || "").trim()) : "";
  let updatedContribution = null;
  let githubSync = null;

  const nextDb = await updateDb((db) => {
    const contribution = db.contributions.find((item) => item.id === contributionId);
    if (!contribution) {
      throw new Error("贡献记录不存在。");
    }
    if (contribution.status === "approved") {
      updatedContribution = contribution;
      return db;
    }

    const category = overrideCategory || contribution.category;
    const alreadyExists = db.questionBankEntries.some((item) => item.fingerprint === contribution.fingerprint);
    contribution.status = "approved";
    contribution.isUnique = !alreadyExists;
    contribution.category = category;
    contribution.updatedAt = nowIso();
    updatedContribution = contribution;

    db.reviewActions.push({
      id: randomId("review"),
      contributionId,
      reviewerId: session.user.id,
      action: "approve",
      createdAt: nowIso(),
    });

    if (!alreadyExists) {
      db.questionBankEntries.push({
        id: randomId("qbe"),
        contributionId,
        userId: contribution.userId,
        category,
        stem: contribution.stem,
        answer: contribution.answer,
        source: contribution.sourceMeta?.site || contribution.sourceMeta?.source || "community",
        fingerprint: contribution.fingerprint,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    applyRewardLedger(db, contribution.userId);
    return db;
  });

  if (updatedContribution?.isUnique) {
    const categoryQuestions = nextDb.questionBankEntries
      .filter((entry) => entry.category === updatedContribution.category)
      .map((entry) => ({
        stem: entry.stem,
        answer: entry.answer,
        source: entry.source,
        fingerprint: entry.fingerprint,
      }));
    githubSync = await syncCategoryFileToGitHub(updatedContribution.category, categoryQuestions);
  }

  sendJson(res, 200, {
    ok: true,
    contribution: updatedContribution,
    githubSync,
  });
}

async function handleRejectContribution(req, res, session, contributionId) {
  const body = safeJsonParse(await readRequestBody(req), {}) || {};
  const reason = normalizeText(body.reason || "不符合当前题库要求。");
  const nextDb = await updateDb((db) => {
    const contribution = db.contributions.find((item) => item.id === contributionId);
    if (!contribution) {
      throw new Error("贡献记录不存在。");
    }
    contribution.status = "rejected";
    contribution.isUnique = false;
    contribution.rejectReason = reason;
    contribution.updatedAt = nowIso();
    db.reviewActions.push({
      id: randomId("review"),
      contributionId,
      reviewerId: session.user.id,
      action: "reject",
      reason,
      createdAt: nowIso(),
    });
    return db;
  });

  const contribution = nextDb.contributions.find((item) => item.id === contributionId);
  sendJson(res, 200, { ok: true, contribution });
}

async function handleAiSolve(req, res, session) {
  const body = safeJsonParse(await readRequestBody(req), {}) || {};
  const problem = body?.problem;
  if (!problem || typeof problem !== "object") {
    throw new Error("没有收到有效题目。");
  }

  const balanceSummary = buildCreditSummary(session.db, session.user.id);
  if (balanceSummary.balance < CREDIT_COST_PER_SOLVE) {
    throw new Error("额度不足，请先贡献题目获取额度。");
  }

  const result = await solveWithPlatform(problem, {
    promptMode: body?.promptMode,
    extraInstructions: body?.extraInstructions,
    includeScreenshotInSolver: body?.includeScreenshotInSolver !== false,
  });

  const nextDb = await updateDb((db) => {
    db.creditLedger.push({
      id: randomId("ledger"),
      userId: session.user.id,
      delta: -CREDIT_COST_PER_SOLVE,
      reason: "solve",
      createdAt: nowIso(),
    });
    db.solveUsage.push({
      id: randomId("solve"),
      userId: session.user.id,
      creditCost: CREDIT_COST_PER_SOLVE,
      model: result.model,
      promptMode: body?.promptMode === "choice" ? "choice" : "code",
      createdAt: nowIso(),
    });
    return db;
  });

  const summary = buildCreditSummary(nextDb, session.user.id);
  sendJson(res, 200, {
    ok: true,
    result,
    creditCost: CREDIT_COST_PER_SOLVE,
    balanceAfter: summary.balance,
    source: "ai",
  });
}

function serializeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    profileUrl: user.profileUrl,
    isAdmin: Boolean(user.isAdmin),
  };
}

function resolvePublicOrigin(originValue) {
  const origin = String(originValue || "").trim().replace(/\/+$/, "");
  if (origin) {
    return origin;
  }
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL;
  }
  return `http://${HOST}:${PORT}`;
}

async function requireSession(req) {
  const token = parseBearerToken(req);
  if (!token) {
    throw new Error("请先登录 GitHub。");
  }
  const db = await readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session) {
    throw new Error("登录态已失效，请重新登录 GitHub。");
  }
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    throw new Error("当前登录用户不存在。");
  }
  return {
    db,
    token,
    session,
    user,
  };
}

async function requireAdminSession(req) {
  const session = await requireSession(req);
  if (!session.user.isAdmin) {
    throw new Error("当前账号没有审核权限。");
  }
  return session;
}

function buildCreditSummary(db, userId) {
  const balance = sumLedger(db.creditLedger, userId);
  const earnedTotal = db.creditLedger
    .filter((entry) => entry.userId === userId && Number(entry.delta) > 0)
    .reduce((sum, entry) => sum + Number(entry.delta || 0), 0);
  const spentTotal = db.creditLedger
    .filter((entry) => entry.userId === userId && Number(entry.delta) < 0)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.delta || 0)), 0);
  const approvedUniqueCount = db.contributions.filter(
    (entry) => entry.userId === userId && entry.status === "approved" && entry.isUnique === true,
  ).length;
  return {
    balance,
    earnedTotal,
    spentTotal,
    pendingQualifiedCount: approvedUniqueCount % REWARD_THRESHOLD,
    nextRewardAt: REWARD_THRESHOLD,
  };
}

function applyRewardLedger(db, userId) {
  const approvedUniqueCount = db.contributions.filter(
    (entry) => entry.userId === userId && entry.status === "approved" && entry.isUnique === true,
  ).length;
  const expectedRewards = Math.floor(approvedUniqueCount / REWARD_THRESHOLD);
  const actualRewards = db.creditLedger.filter(
    (entry) => entry.userId === userId && entry.reason === "reward-cycle",
  ).length;

  for (let index = actualRewards; index < expectedRewards; index += 1) {
    db.creditLedger.push({
      id: randomId("ledger"),
      userId,
      delta: REWARD_CREDITS,
      reason: "reward-cycle",
      createdAt: nowIso(),
    });
  }
}
