import os from "node:os";
import path from "node:path";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const targetUrl = "https://www.educoder.net/tasks/XH39RUNO/3610643/2n9zoqryj7uw";
const extensionPath = path.resolve("extension");
const chromeRoot = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "autolearning-real-"));
const artifactsDir = path.resolve("artifacts");

let context;

try {
  await cp(path.join(chromeRoot, "Local State"), path.join(tempRoot, "Local State"));
  await cp(path.join(chromeRoot, "Default"), path.join(tempRoot, "Default"), {
    recursive: true,
    filter(source) {
      const blocked = [
        "LOCK",
        "SingletonLock",
        "SingletonCookie",
        "SingletonSocket",
        "Code Cache",
        "Cache",
        "GPUCache",
      ];
      return !blocked.some((name) => source.endsWith(name));
    },
  });

  context = await chromium.launchPersistentContext(tempRoot, {
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
  const consoleLines = [];

  page.on("console", (message) => {
    const line = `[console:${message.type()}] ${message.text()}`;
    consoleLines.push(line);
    console.log(line);
  });

  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    consoleLines.push(line);
    console.log(line);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(12000);

  const launcher = page.locator("#autolearning-launcher");
  const launcherVisible = await launcher.isVisible().catch(() => false);
  if (launcherVisible) {
    await launcher.click();
    await page.getByRole("button", { name: "识别题面" }).click();
    await page.waitForTimeout(8000);
  }

  const taskLeftCount = await page.locator("#task-left-panel").count().catch(() => 0);
  const summary = await page.locator("[data-role='summary']").textContent().catch(() => "");
  const details = await page.locator("[data-role='details']").textContent().catch(() => "");
  const status = await page.locator("[data-role='status']").textContent().catch(() => "");
  const bodyText = (await page.textContent("body").catch(() => "")).slice(0, 2000);

  const report = {
    targetUrl,
    finalUrl: page.url(),
    title: await page.title(),
    launcherVisible,
    taskLeftCount,
    status,
    summary,
    details,
    bodyText,
    consoleLines,
  };

  await writeFile(
    path.join(artifactsDir, "real-educoder-check.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  await page.screenshot({
    path: path.join(artifactsDir, "real-educoder-check.png"),
    fullPage: true,
  });

  console.log(JSON.stringify(report, null, 2));
} finally {
  if (context) {
    await context.close().catch(() => {});
  }
  await rm(tempRoot, { recursive: true, force: true });
}
