import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { chromium } from "playwright";

const extensionPath = path.resolve("extension");
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "autolearning-educoder-"));

const username = process.env.EDUCODER_USERNAME || "";
const password = process.env.EDUCODER_PASSWORD || "";
const manualWaitMs = Number(process.env.MANUAL_WAIT_MS || 30000);

let context;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 20000 });
  }

  const page = await context.newPage();
  page.on("console", (message) => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
  });

  await page.goto("https://www.educoder.net/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  await page.getByText("登录 / 注册").click();

  if (!username || !password) {
    throw new Error(
      "请先设置环境变量 EDUCODER_USERNAME 和 EDUCODER_PASSWORD，例如：EDUCODER_USERNAME=xxx EDUCODER_PASSWORD=yyy npm run educoder:login",
    );
  }

  await page
    .getByRole("textbox", { name: "请输入有效的手机号/邮箱号/账号" })
    .click();
  await page
    .getByRole("textbox", { name: "请输入有效的手机号/邮箱号/账号" })
    .fill(username);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  console.log(`登录步骤已完成，接下来等待 ${manualWaitMs / 1000} 秒让你手动切到题目页面...`);
  await page.waitForTimeout(manualWaitMs);

  console.log("当前 URL：", page.url());
  console.log("插件应该已经加载，你可以在页面右侧看到 AL 按钮。");

  // 下面这些步骤先保留成注释，等你确认录制和插件加载没问题后，我们再继续接自动复制/等待答案/提交。
  //
  // const editor = page.getByRole("textbox", { name: /Editor content/i });
  // await editor.click();
  // await editor.press("ControlOrMeta+a");
  // await editor.press("ControlOrMeta+c");
  //
  // await page.getByText("代码已提交，正在后台生成答案。").waitFor({ timeout: 10000 });
  // await page.getByText("答案已经生成好了，点 AL 就能查看。").waitFor({ timeout: 90000 });
  //
  // await editor.press("ControlOrMeta+a");
  // await editor.press("ControlOrMeta+v");
  // await page.getByRole("button", { name: /评测并提交|提交/ }).click();

  await page.pause();
} finally {
  if (context) {
    await context.close().catch(() => {});
  }
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
