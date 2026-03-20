import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { chromium } from "playwright";

const extensionPath = path.resolve("extension");
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "autolearning-extension-"));

let server;

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

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.locator("#baseUrl").fill(`${baseUrl}/v1`);
    await optionsPage.locator("#apiKey").fill("local-test-key");
    await optionsPage.locator("#model").fill("mock-model");
    await optionsPage.locator("#extraInstructions").fill("保持 C 语言，优先修复现有代码。");
    await optionsPage.getByRole("button", { name: "保存设置" }).click();
    await optionsPage.getByText("设置已保存。").waitFor({ timeout: 5000 });
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
      await page.getByRole("button", { name: "设置" }).click();
      const reopenedOptionsPage = await settingsPagePromise;
      await reopenedOptionsPage.waitForLoadState("domcontentloaded");
      if (!reopenedOptionsPage.url().includes("/options.html")) {
        throw new Error(`设置按钮没有打开选项页：${reopenedOptionsPage.url()}`);
      }
      await reopenedOptionsPage.close();
      await page.bringToFront();

      await page.getByRole("button", { name: "识别题面" }).click();
      await page.getByText("题面已提取，可以直接生成答案。").waitFor({ timeout: 10000 });

      const detailsText = await page.locator("[data-role='details']").textContent();
      if (!detailsText?.includes('"title": "双向链表基本操作"')) {
        throw new Error(`提取详情没有包含完整 JSON：${detailsText}`);
      }

      await page.locator(".al-details").evaluate((node) => {
        node.open = true;
      });
      const downloadPromise = page.waitForEvent("download");
      await page.locator("[data-role='export-problem']").evaluate((node) => {
        node.click();
      });
      await page.getByText("提取结果已导出为 JSON。").waitFor({ timeout: 5000 });
      const download = await downloadPromise;
      const artifactsDir = path.resolve("artifacts");
      await mkdir(artifactsDir, { recursive: true });
      const exportPath = path.join(artifactsDir, "extension-extract-test.json");
      await download.saveAs(exportPath);
      const exportedPayload = JSON.parse(await readFile(exportPath, "utf8"));
      if (exportedPayload?.problem?.title !== "双向链表基本操作") {
        throw new Error(`导出的 JSON 内容不正确：${JSON.stringify(exportedPayload)}`);
      }

      await page.getByRole("button", { name: "生成答案" }).click();
      await page.getByText("已生成答案，模型：mock-model").waitFor({ timeout: 15000 });

      const codeOutput = page.locator("[data-role='code']");
      await codeOutput.waitFor({ timeout: 5000 });
      const generatedCode = await codeOutput.inputValue();
      if (!generatedCode.includes("return 0;")) {
        throw new Error(`生成代码不符合预期：${generatedCode}`);
      }

      await page.getByRole("button", { name: "填充代码" }).click();
      await page.getByText("代码已经填入编辑器。").waitFor({ timeout: 10000 });

      const editorValue = await page.locator("#task-right-panel textarea").inputValue();
      if (!editorValue.includes("return 0;")) {
        throw new Error("回填后的编辑器内容不正确。");
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
    <title>测试题目页</title>
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
        <div class="task-header"><h3>双向链表基本操作</h3></div>
        <div class="markdown-body">
任务描述

请完成双向链表的插入和删除。

输入描述
输入若干整数。

输出描述
输出处理后的链表。

示例
输入：1 2 3
输出：1 3
        </div>
      </section>
      <section id="task-right-panel">
        <p>代码编辑器</p>
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

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await readBody(request);
      console.log(`Mock API received payload length: ${body.length}`);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "给出一个可运行的 C 语言答案。",
                  approach: "保留 main 函数并修正返回值，作为最小可运行示例。",
                  code: "#include <stdio.h>\\n\\nint main(void) {\\n  return 0;\\n}",
                }),
              },
            },
          ],
        }),
      );
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
    throw new Error("无法获取测试服务器端口。");
  }

  return address.port;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
