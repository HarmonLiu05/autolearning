import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { chromium } from "playwright";

const extensionPath = path.resolve("extension");
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "autolearning-extension-"));
const TARGET_SOLVE_MODEL = "gemini-3-flash";
const FIXED_API_URL = "http://03hhhx.dpdns.org:18317/v1/chat/completions";

let server;
let lastChatCompletionRequest = null;

try {
  const port = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Mock server running at ${baseUrl}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    }

    const extensionId = new URL(serviceWorker.url()).host;
    console.log(`Loaded extension id: ${extensionId}`);

    await context.route(FIXED_API_URL, async (route) => {
      const payload = route.request().postDataJSON();
      lastChatCompletionRequest = payload;
      console.log(`Intercepted solve request for model: ${payload?.model || "<empty>"}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Mock summary",
                  approach: "Mock approach",
                  code: "#include <stdio.h>\\n\\nint main(void) {\\n  return 0;\\n}",
                }),
              },
            },
          ],
        }),
      });
    });

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.locator("#textApiKey").fill("local-test-key");
    await optionsPage.getByRole("button", { name: /保存|ç’å‰§ç–†/ }).click();
    await optionsPage.close();

    const page = await context.newPage();
    page.on("console", (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    });
    await page.goto(`${baseUrl}/mock-problem`);

    try {
      await page.locator("#autolearning-launcher").waitFor({ timeout: 15000 });
      await page.locator("#autolearning-launcher").click();

      const settingsPagePromise = context.waitForEvent("page");
      await page.getByRole("button", { name: /设置|ç’å‰§ç–†/ }).click();
      const reopenedOptionsPage = await settingsPagePromise;
      await reopenedOptionsPage.waitForLoadState("domcontentloaded");
      if (!reopenedOptionsPage.url().includes("/options.html")) {
        throw new Error(`Expected options page, got ${reopenedOptionsPage.url()}`);
      }
      await reopenedOptionsPage.getByRole("button", { name: /保存|ç’å‰§ç–†/ }).click();
      await reopenedOptionsPage.close();
      await page.bringToFront();

      const modelSelect = page.locator("[data-role='active-solve-model']");
      await modelSelect.selectOption(TARGET_SOLVE_MODEL);
      await expectValue(modelSelect, TARGET_SOLVE_MODEL);

      await page.getByRole("button", { name: /识别题面|ç’‡å——åŸ†æ£°æ©€æ½°/ }).click();
      await page.locator("[data-role='details']").waitFor({ timeout: 10000 });

      const detailsText = await page.locator("[data-role='details']").textContent();
      if (!detailsText?.includes('"title": "åŒå‘é“¾è¡¨åŸºæœ¬æ“ä½œ"')) {
        throw new Error(`Unexpected extracted details: ${detailsText}`);
      }

      await page.locator(".al-details").evaluate((node) => {
        node.open = true;
      });
      const downloadPromise = page.waitForEvent("download");
      await page.locator("[data-role='export-problem']").evaluate((node) => {
        node.click();
      });
      const download = await downloadPromise;
      const artifactsDir = path.resolve("artifacts");
      await mkdir(artifactsDir, { recursive: true });
      const exportPath = path.join(artifactsDir, "extension-extract-test.json");
      await download.saveAs(exportPath);
      const exportedPayload = JSON.parse(await readFile(exportPath, "utf8"));
      if (exportedPayload?.problem?.title !== "åŒå‘é“¾è¡¨åŸºæœ¬æ“ä½œ") {
        throw new Error(`Unexpected exported payload: ${JSON.stringify(exportedPayload)}`);
      }

      await page.getByRole("button", { name: /生成答案|é¢ç†¸åžšç»›æ—€î”/ }).click();
      await page.getByText(new RegExp(TARGET_SOLVE_MODEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).waitFor({
        timeout: 15000,
      });

      if (lastChatCompletionRequest?.model !== TARGET_SOLVE_MODEL) {
        throw new Error(
          `Expected solve request model ${TARGET_SOLVE_MODEL}, got ${JSON.stringify(lastChatCompletionRequest)}`,
        );
      }

      const codeOutput = page.locator("[data-role='code']");
      await codeOutput.waitFor({ timeout: 5000 });
      const generatedCode = await codeOutput.inputValue();
      if (!generatedCode.includes("return 0;")) {
        throw new Error(`Unexpected generated code: ${generatedCode}`);
      }

      await page.getByRole("button", { name: /填充代码|æ¿‰î‚¢åŽ–æµ ï½‡çˆœ/ }).click();
      const editorValue = await page.locator("#task-right-panel textarea").inputValue();
      if (!editorValue.includes("return 0;")) {
        throw new Error("Editor was not updated with generated code.");
      }
    } catch (error) {
      const artifactsDir = path.resolve("artifacts");
      await mkdir(artifactsDir, { recursive: true });
      await page.screenshot({
        path: path.join(artifactsDir, "extension-smoke-failure.png"),
        fullPage: true,
      });
      const statusText = await page.locator("[data-role='status']").textContent().catch(() => "");
      const summaryText = await page.locator("[data-role='summary']").textContent().catch(() => "");
      console.log(`Status at failure: ${statusText}`);
      console.log(`Summary at failure: ${summaryText}`);
      throw error;
    }

    console.log("Smoke test passed.");
  } finally {
    await context.close();
  }
} finally {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
  await rm(userDataDir, { recursive: true, force: true });
}

async function startServer() {
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/mock-problem") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mock Problem</title>
    <style>
      body { margin: 0; font-family: sans-serif; background: #f3f6f8; color: #102432; }
      .shell { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }
      #task-left-panel, #task-right-panel { padding: 24px; }
      #task-left-panel { background: #ffffff; border-right: 1px solid #d8e0e5; }
      #task-right-panel { background: #0f1720; color: #e8edf2; }
      .task-header h3 { margin-top: 0; font-size: 28px; }
      .markdown-body { line-height: 1.8; white-space: pre-wrap; }
      textarea { width: 100%; min-height: 420px; padding: 16px; border-radius: 16px; font: 14px/1.6 monospace; }
    </style>
  </head>
  <body>
    <div class="shell">
      <section id="task-left-panel">
        <div class="task-header"><h3>åŒå‘é“¾è¡¨åŸºæœ¬æ“ä½œ</h3></div>
        <div class="markdown-body">
题目描述

给定一个双向链表，请完成指定的基础操作。
输入描述
输入若干整数。
输出描述
输出处理后的结果。
样例输入
2 3
样例输出
3
        </div>
      </section>
      <section id="task-right-panel">
        <p>代码模板</p>
        <textarea>#include &lt;stdio.h&gt;

int main(void) {
  return 1;
}
</textarea>
      </section>
    </div>
  </body>
</html>`);
      return;
    }

    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve mock server address.");
  }

  return address.port;
}

async function expectValue(locator, expected) {
  const value = await locator.inputValue();
  if (value !== expected) {
    throw new Error(`Expected value ${expected}, got ${value}`);
  }
}
