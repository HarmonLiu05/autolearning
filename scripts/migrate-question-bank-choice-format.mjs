import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const inputPath = path.resolve(process.argv[2] || "");
  const outputPathArg = process.argv[3] ? path.resolve(process.argv[3]) : "";

  if (!inputPath) {
    throw new Error("Usage: node scripts/migrate-question-bank-choice-format.mjs <input-path> [output-path]");
  }

  const stat = await fs.stat(inputPath);
  if (stat.isDirectory()) {
    const outputDir = outputPathArg || inputPath;
    await fs.mkdir(outputDir, { recursive: true });
    const entries = await fs.readdir(inputPath, { withFileTypes: true });
    let totalAdded = 0;
    let totalMerged = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }
      const sourceFile = path.join(inputPath, entry.name);
      const targetFile = path.join(outputDir, entry.name);
      const result = await migrateJsonFile(sourceFile, targetFile);
      totalAdded += result.addedCount;
      totalMerged += result.mergedCount;
    }
    console.log(JSON.stringify({ mode: "directory", inputPath, outputDir, addedCount: totalAdded, mergedCount: totalMerged }, null, 2));
    return;
  }

  const targetFile = outputPathArg || inputPath;
  const result = await migrateJsonFile(inputPath, targetFile);
  console.log(JSON.stringify({ mode: "file", inputPath, outputPath: targetFile, ...result }, null, 2));
}

async function migrateJsonFile(sourceFile, targetFile) {
  const raw = JSON.parse(await fs.readFile(sourceFile, "utf8"));
  if (Array.isArray(raw)) {
    let addedCount = 0;
    let mergedCount = 0;
    const migrated = raw.map((categoryData) => {
      const result = migrateCategoryPayload(categoryData);
      addedCount += result.addedCount;
      mergedCount += result.mergedCount;
      return result.payload;
    });
    await fs.writeFile(targetFile, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
    return { addedCount, mergedCount };
  }

  const result = migrateCategoryPayload(raw);
  await fs.writeFile(targetFile, `${JSON.stringify(result.payload, null, 2)}\n`, "utf8");
  return { addedCount: result.addedCount, mergedCount: result.mergedCount };
}

function migrateCategoryPayload(raw) {
  const category = String(raw?.category || raw?.name || "").trim();
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  const mergedQuestions = [];
  let addedCount = 0;
  let mergedCount = 0;

  for (const question of questions) {
    const normalized = normalizeStoredQuestion(question);
    if (!normalized.stem || !normalized.answer) {
      continue;
    }
    const matchIndex = findMatchingQuestionIndex(mergedQuestions, normalized);
    if (matchIndex >= 0) {
      const next = mergeQuestionRecords(mergedQuestions[matchIndex], normalized);
      if (haveQuestionRecordsChanged(mergedQuestions[matchIndex], next)) {
        mergedQuestions[matchIndex] = next;
        mergedCount += 1;
      }
      continue;
    }
    mergedQuestions.push(normalized);
    addedCount += 1;
  }

  mergedQuestions.sort((left, right) => String(left.stem || "").localeCompare(String(right.stem || ""), "zh-Hans-CN"));

  return {
    payload: {
      version: Number(raw?.version || 2),
      category: category || undefined,
      name: String(raw?.name || category || "question-bank"),
      questions: mergedQuestions,
    },
    addedCount,
    mergedCount,
  };
}

function normalizeStoredQuestion(question) {
  if (!question || typeof question !== "object") {
    return {
      stem: "",
      answer: "",
      fingerprint: "",
      questionType: "choice",
      statementFingerprint: "",
      answerText: "",
      optionMapSnapshot: [],
      formatStrength: "weak",
      source: "migration",
    };
  }
  const stem = String(question.stem || "").trim();
  const answer = String(question.answer || "").trim();
  const parsedOptionMapSnapshot = extractChoiceOptionSnapshotFromStem(stem);
  const rawOptionMapSnapshot =
    Array.isArray(question.optionMapSnapshot) && question.optionMapSnapshot.length > 0
      ? question.optionMapSnapshot
      : Array.isArray(question.choiceOptions) && question.choiceOptions.length > 0
        ? question.choiceOptions
        : parsedOptionMapSnapshot;
  const optionMapSnapshot = normalizeChoiceOptionSnapshot(rawOptionMapSnapshot);
  const answerText = normalizeText(
    question.answerText || resolveChoiceAnswerTextFromSnapshot(answer, optionMapSnapshot),
  );
  const statementFingerprint = String(question.statementFingerprint || "").trim() || buildStatementFingerprintFromText(stem);
  const inferredFormatStrength = inferFormatStrength(answerText, optionMapSnapshot);
  return {
    stem,
    answer,
    fingerprint: String(question.fingerprint || "").trim() || buildFingerprint(stem, answer),
    questionType: "choice",
    statementFingerprint,
    answerText,
    optionMapSnapshot,
    formatStrength: inferredFormatStrength === "strong" ? "strong" : String(question.formatStrength || "").trim() || inferredFormatStrength,
    source: String(question.source || "migration").trim() || "migration",
  };
}

function findMatchingQuestionIndex(questions, incoming) {
  const normalizedIncoming = normalizeStoredQuestion(incoming);
  const incomingLegacyFingerprint = buildFingerprint(normalizedIncoming.stem, normalizedIncoming.answer);
  for (let index = 0; index < questions.length; index += 1) {
    const existing = normalizeStoredQuestion(questions[index]);
    if (normalizedIncoming.fingerprint && existing.fingerprint && normalizedIncoming.fingerprint === existing.fingerprint) {
      return index;
    }
    if (
      normalizedIncoming.statementFingerprint &&
      existing.statementFingerprint &&
      normalizedIncoming.statementFingerprint === existing.statementFingerprint
    ) {
      return index;
    }
    if (buildFingerprint(existing.stem, existing.answer) === incomingLegacyFingerprint) {
      return index;
    }
  }
  return -1;
}

function mergeQuestionRecords(existing, incoming) {
  const normalizedExisting = normalizeStoredQuestion(existing);
  const normalizedIncoming = normalizeStoredQuestion(incoming);
  const mergedOptionMapSnapshot =
    normalizedIncoming.optionMapSnapshot.length > normalizedExisting.optionMapSnapshot.length
      ? normalizedIncoming.optionMapSnapshot
      : normalizedExisting.optionMapSnapshot;
  const mergedAnswerText = normalizedExisting.answerText || normalizedIncoming.answerText;
  const mergedStem = normalizedExisting.stem || normalizedIncoming.stem;
  const mergedAnswer = normalizedExisting.answer || normalizedIncoming.answer;
  return {
    stem: mergedStem,
    answer: mergedAnswer,
    fingerprint: normalizedExisting.fingerprint || normalizedIncoming.fingerprint || buildFingerprint(mergedStem, mergedAnswer),
    questionType: "choice",
    statementFingerprint:
      normalizedExisting.statementFingerprint ||
      normalizedIncoming.statementFingerprint ||
      buildStatementFingerprintFromText(mergedStem),
    answerText: mergedAnswerText,
    optionMapSnapshot: mergedOptionMapSnapshot,
    formatStrength: inferFormatStrength(mergedAnswerText, mergedOptionMapSnapshot),
    source: normalizedExisting.source || normalizedIncoming.source || "migration",
  };
}

function haveQuestionRecordsChanged(left, right) {
  return JSON.stringify(normalizeStoredQuestion(left)) !== JSON.stringify(normalizeStoredQuestion(right));
}

function buildFingerprint(stem, answer) {
  return createHash("sha256").update(`${stem}\n${answer}`).digest("hex");
}

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function normalizeQuestionStem(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[()[\]{}<>]/g, " ")
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStatementFingerprintFromText(text) {
  const normalized = normalizeQuestionStem(text || "");
  return normalized ? `stem:${hashText(normalized)}` : "";
}

function normalizeChoiceOptionSnapshot(options) {
  return Array.isArray(options)
    ? options
        .map((option) => ({
          label: String(option?.label || "").trim(),
          text: normalizeText(option?.text || ""),
        }))
        .filter((option) => option.label || option.text)
    : [];
}

function extractChoiceOptionSnapshotFromStem(stem) {
  const text = String(stem || "").replace(/\r\n/g, "\n");
  if (!text) {
    return [];
  }

  const inlineMatches = Array.from(
    text.matchAll(/(?:^|\n)\s*([A-F])(?:[.、:：]|[)）])?\s+([^\n]+?)(?=\n\s*[A-F](?:[.、:：]|[)）]|\s)|$)/g),
  );
  const inlineOptions = dedupeChoiceOptions(
    inlineMatches.map((match) => ({
      label: String(match[1] || "").trim().toUpperCase(),
      text: normalizeText(match[2] || ""),
    })),
  );
  if (inlineOptions.length >= 2) {
    return inlineOptions;
  }

  const lines = text
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const collected = [];
  for (let index = 0; index < lines.length; index += 1) {
    const labelOnlyMatch = lines[index].match(/^([A-F])(?:[.、:：]|[)）])?$/);
    if (!labelOnlyMatch) {
      continue;
    }
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !lines[nextIndex]) {
      nextIndex += 1;
    }
    const nextLine = lines[nextIndex] || "";
    if (!nextLine || /^([A-F])(?:[.、:：]|[)）])?$/.test(nextLine)) {
      continue;
    }
    collected.push({
      label: labelOnlyMatch[1].toUpperCase(),
      text: nextLine,
    });
  }
  return dedupeChoiceOptions(collected);
}

function dedupeChoiceOptions(options) {
  const seen = new Set();
  const deduped = [];
  for (const option of normalizeChoiceOptionSnapshot(options)) {
    if (!option.label || !option.text) {
      continue;
    }
    const key = `${option.label}:${normalizeQuestionStem(option.text)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function extractChoiceLabels(answerText) {
  return Array.from(String(answerText || "").toUpperCase().matchAll(/[A-F]/g), (match) => match[0]);
}

function resolveChoiceAnswerTextFromSnapshot(answerLetter, optionMapSnapshot) {
  const labels = extractChoiceLabels(answerLetter);
  if (labels.length === 0) {
    return "";
  }
  const snapshot = normalizeChoiceOptionSnapshot(optionMapSnapshot);
  const matchedTexts = labels
    .map((label) => snapshot.find((option) => option.label === label)?.text || "")
    .filter(Boolean);
  return matchedTexts.join(" | ");
}

function inferFormatStrength(answerText, optionMapSnapshot) {
  return normalizeText(answerText) && normalizeChoiceOptionSnapshot(optionMapSnapshot).length > 0 ? "strong" : "weak";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
