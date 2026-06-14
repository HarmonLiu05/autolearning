import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const content = await readFile(new URL("../extension/content.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const github = await readFile(new URL("../server/lib/github.js", import.meta.url), "utf8");

assert.match(server, /splitContributionEntriesByIssueBodySize/);
assert.match(server, /issues:\s*createdIssues/);
assert.match(server, /results:\s*contributionResults/);
assert.match(background, /Array\.isArray\(result\.issues\)/);
assert.match(background, /issueCount/);
assert.match(content, /issueCount/);
assert.match(content, /partialFailure/);
assert.match(github, /payload\?\.errors/);

console.log("multi-issue-contribution-protocol.test.mjs: PASS");
