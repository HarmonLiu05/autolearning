const fs = require("node:fs/promises");
const path = require("node:path");
const { nowIso } = require("./utils");

const DB_PATH = path.resolve(process.cwd(), "server/data/db.json");

function createEmptyDb() {
  return {
    users: [],
    sessions: [],
    authFlows: [],
    contributions: [],
    questionBankEntries: [],
    creditLedger: [],
    solveUsage: [],
    reviewActions: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

async function ensureDbFile() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(createEmptyDb(), null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDbFile();
  const text = await fs.readFile(DB_PATH, "utf8");
  const parsed = JSON.parse(text);
  return {
    ...createEmptyDb(),
    ...parsed,
  };
}

async function writeDb(db) {
  await ensureDbFile();
  const nextDb = {
    ...createEmptyDb(),
    ...db,
    updatedAt: nowIso(),
  };
  await fs.writeFile(DB_PATH, JSON.stringify(nextDb, null, 2), "utf8");
  return nextDb;
}

async function updateDb(updater) {
  const current = await readDb();
  const next = await updater(current);
  return writeDb(next);
}

module.exports = {
  DB_PATH,
  createEmptyDb,
  readDb,
  updateDb,
  writeDb,
};
