const crypto = require("node:crypto");

const QUESTION_BANK_CATEGORIES = ["educoder", "zhihuishu", "leetcode", "general"];

function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripQuestionOrderPrefix(value) {
  let text = normalizeText(value);
  text = text.replace(/^\s*[\[(（【]?\s*\d+\s*[\])）】]?\s*[\.、。．:：-]\s*/g, "");
  text = text.replace(/^\s*\d+\s+/g, "");
  text = text.replace(/^\s*(\d+\s*[\.、。．:：-]\s*)+/g, "");
  return normalizeText(text);
}

function normalizeQuestionStem(value) {
  return stripQuestionOrderPrefix(value)
    .replace(/[“”"']/g, "")
    .replace(/[（()）【】\[\]《》<>]/g, " ")
    .replace(/[，,。！？!?:：;；、]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeAnswer(value) {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }
  if (/^(对|正确|true|yes|√)$/i.test(raw)) {
    return "对";
  }
  if (/^(错|错误|false|no|×)$/i.test(raw)) {
    return "错";
  }
  const letters = raw.toUpperCase().match(/[A-F]/g) || [];
  if (letters.length > 0) {
    return Array.from(new Set(letters)).join("");
  }
  return raw.slice(0, 48);
}

function buildFingerprint(stem) {
  return crypto.createHash("sha256").update(normalizeQuestionStem(stem)).digest("hex");
}

function safeJsonParse(text, fallback = null) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(html);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function parseBearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ? match[1].trim() : "";
}

function assertCategory(category) {
  if (!QUESTION_BANK_CATEGORIES.includes(category)) {
    throw new Error(`不支持的题库分类：${category}`);
  }
  return category;
}

function sumLedger(entries, userId) {
  return entries
    .filter((entry) => entry.userId === userId)
    .reduce((total, entry) => total + Number(entry.delta || 0), 0);
}

module.exports = {
  QUESTION_BANK_CATEGORIES,
  assertCategory,
  buildFingerprint,
  normalizeAnswer,
  normalizeQuestionStem,
  normalizeText,
  nowIso,
  parseBearerToken,
  randomId,
  readRequestBody,
  safeJsonParse,
  sendHtml,
  sendJson,
  stripQuestionOrderPrefix,
  sumLedger,
};
