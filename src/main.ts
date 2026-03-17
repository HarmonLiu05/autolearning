import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "./config.js";
import { extractProblem } from "./extractor.js";
import { navigateToProblem } from "./flows/recorded.js";

async function ensureArtifactsDir(): Promise<string> {
  const dir = path.resolve(config.artifactsDir);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function main(): Promise<void> {
  console.log("Starting AutoLearning extractor...");
  const artifactsDir = await ensureArtifactsDir();
  console.log(`Artifacts directory: ${artifactsDir}`);

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const entryPage = await context.newPage();

  try {
    console.log("Navigating to Educoder problem page...");
    const problemPage = await navigateToProblem(entryPage);

    console.log(`Landed on: ${problemPage.url()}`);
    console.log("Extracting problem statement and editor code...");
    const problem = await extractProblem(problemPage);

    await writeFile(
      path.join(artifactsDir, "problem.json"),
      JSON.stringify(problem, null, 2),
      "utf8",
    );
    await writeFile(path.join(artifactsDir, "current-code.c"), problem.currentCode, "utf8");
    await problemPage.screenshot({
      path: path.join(artifactsDir, "problem-page.png"),
      fullPage: true,
    });

    console.log("\n=== Problem Summary ===");
    console.log(`Title: ${problem.title}`);
    console.log(`URL: ${problem.url}`);
    console.log(`Statement length: ${problem.statementText.length}`);
    console.log(`Code length: ${problem.currentCode.length}`);
    console.log(`Code lines: ${problem.currentCodeLineCount}`);
    console.log(`Samples extracted: ${problem.samples.length}`);
    console.log("\n=== Statement Preview ===");
    console.log(problem.statementText.slice(0, 800) || "[empty]");
    console.log("\n=== Code Preview ===");
    console.log(problem.currentCode.slice(0, 800) || "[empty]");
    console.log(`\nSaved artifacts to: ${artifactsDir}`);

    if (config.keepOpen && !config.headless) {
      console.log("\nKEEP_OPEN=true, browser will stay open. Press Ctrl+C in the terminal when you are done.");
      await new Promise(() => {
        // Keep the browser open for manual inspection.
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\nRun failed:");
  console.error(error instanceof Error ? error.message : error);
  console.error("\nCheck these first:");
  console.error("1. .env exists and contains EDUCODER_USERNAME / EDUCODER_PASSWORD");
  console.error("2. Playwright Chromium is installed");
  console.error("3. artifacts/problem.json was created");
  process.exitCode = 1;
});
