import { execFileSync } from "node:child_process";
import type { Locator, Page } from "playwright";
import type { ProblemData } from "./types.js";

const CLEAN_TEXT_LIMIT = 20000;

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function firstVisibleLocator(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }
  return null;
}

async function safeInnerText(locator: Locator | null): Promise<string> {
  if (!locator) {
    return "";
  }
  try {
    return normalizeText(await locator.innerText());
  } catch {
    return "";
  }
}

async function safeInnerHtml(locator: Locator | null): Promise<string> {
  if (!locator) {
    return "";
  }
  try {
    return await locator.innerHTML();
  } catch {
    return "";
  }
}

async function safeAllInnerTexts(locator: Locator): Promise<string[]> {
  try {
    return (await locator.allInnerTexts()).map((text) => text.replace(/\u00a0/g, " "));
  } catch {
    return [];
  }
}

function tryReadClipboardText(): string {
  if (process.platform !== "win32") {
    return "";
  }

  try {
    return execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "Get-Clipboard"],
      { encoding: "utf8" },
    ).replace(/\r\n/g, "\n");
  } catch {
    return "";
  }
}

async function extractCodeViaClipboard(page: Page): Promise<string> {
  const editorLocator = page.locator("#task-right-panel .monaco-editor").first();
  const textareaLocator = page.locator("#task-right-panel .inputarea").first();

  if ((await editorLocator.count()) === 0 || (await textareaLocator.count()) === 0) {
    return "";
  }

  await editorLocator.click({ position: { x: 140, y: 120 }, timeout: 5000 }).catch(() => {});
  await textareaLocator.focus().catch(() => {});
  await page.waitForTimeout(150);

  await page.keyboard.press("Control+A").catch(() => {});
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+C").catch(() => {});
  await page.waitForTimeout(300);

  const clipboardText = normalizeText(tryReadClipboardText());
  if (!clipboardText) {
    return "";
  }

  // Reject cases where the whole page was copied instead of editor content.
  if (clipboardText.includes("学习内容") && clipboardText.includes("任务描述")) {
    return "";
  }

  return clipboardText;
}

async function extractCodeViaVisibleDom(page: Page): Promise<string> {
  const codeLinesLocator = page.locator("#task-right-panel .monaco-editor .view-line");
  const codeLineTexts = await safeAllInnerTexts(codeLinesLocator);
  return normalizeText(codeLineTexts.join("\n"));
}

export async function extractProblem(page: Page): Promise<ProblemData> {
  await page.waitForSelector("#task-left-panel", { timeout: 15000 });

  const titleLocator = await firstVisibleLocator(page, [
    "#task-left-panel .task-header h3",
    "#task-left-panel h3",
    "h1",
  ]);

  const statementLocator = await firstVisibleLocator(page, [
    "#task-left-panel .tab-panel-body___iueV_.markdown-body.mdBody___raKXb",
    "#task-left-panel .markdown-body",
    "#task-left-panel .tab-panel-body___iueV_",
    "#task-left-panel .content-wrapper___kKoFC",
    "#task-left-panel",
  ]);

  if (statementLocator) {
    await statementLocator.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  }

  let currentCode = await extractCodeViaClipboard(page);
  if (!currentCode || currentCode.length < 80) {
    currentCode = await extractCodeViaVisibleDom(page);
  }

  const title = (await safeInnerText(titleLocator)) || (await page.title());
  const statementText = (await safeInnerText(statementLocator)).slice(0, CLEAN_TEXT_LIMIT);
  const statementHtml = await safeInnerHtml(statementLocator);

  const sampleItems = page.locator(".test-case-item___E3CU9");
  const sampleCount = await sampleItems.count();
  const samples: Array<{ input: string; output: string }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const item = sampleItems.nth(index);
    const input = normalizeText(
      (
        await item
          .locator(".ant-row .ant-col + .ant-col .diff-panel-container___IpXsK")
          .first()
          .innerText()
          .catch(() => "")
      ) || "",
    );
    const output = normalizeText(
      (
        await item
          .locator(".diff-panel-container___IpXsK")
          .nth(1)
          .innerText()
          .catch(() => "")
      ) || "",
    );

    if (input || output) {
      samples.push({ input, output });
    }
  }

  const timeText =
    (
      await page
        .locator(".eval-desc___bIcYm")
        .first()
        .innerText()
        .catch(() => "")
    ) || "";
  const language =
    (
      await page
        .locator("#env_1215668_1 span, .item___MSfbI.active___Rkf93 span")
        .first()
        .innerText()
        .catch(() => "")
    ) || "";

  return {
    url: page.url(),
    title: normalizeText(title),
    statementText,
    statementHtml,
    currentCode,
    currentCodeLineCount: currentCode ? currentCode.split("\n").length : 0,
    samples,
    limits: {
      time: normalizeText(timeText),
      memory: undefined,
      language: normalizeText(language),
    },
  };
}
