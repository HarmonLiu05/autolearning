import type { ProblemData } from "./types.js";

export function buildSolverPrompt(problem: ProblemData): string {
  const sampleText =
    problem.samples.length === 0
      ? "No samples were extracted."
      : problem.samples
          .map(
            (sample, index) =>
              `Sample ${index + 1}\nInput:\n${sample.input}\nOutput:\n${sample.output}`,
          )
          .join("\n\n");

  return [
    "Solve the programming problem below.",
    "Return code only, with no markdown fences and no explanation.",
    "Prefer a correct and reasonably efficient solution.",
    "",
    `Title: ${problem.title}`,
    `URL: ${problem.url}`,
    `Time limit: ${problem.limits.time ?? "unknown"}`,
    `Memory limit: ${problem.limits.memory ?? "unknown"}`,
    `Language shown in page: ${problem.limits.language ?? "unknown"}`,
    "",
    "Problem statement:",
    problem.statementText,
    "",
    "Samples:",
    sampleText,
  ].join("\n");
}
