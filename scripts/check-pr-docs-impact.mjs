// Verifies a pull request's "Documentation impact" declaration against its own
// diff. See docs/ci-cookbook.md #12b for the reasoning. Runs only on
// pull_request events; on anything else it exits cleanly.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) process.exit(0);
const event = JSON.parse(readFileSync(eventPath, "utf8"));
const pullRequest = event.pull_request;
if (!pullRequest) process.exit(0);

// Automated dependency PRs can't fill in a hand-written template body.
const authorLogin = pullRequest.user?.login ?? "";
const headRef = pullRequest.head?.ref ?? "";
if (authorLogin === "dependabot[bot]" || headRef.startsWith("dependabot/")) process.exit(0);

const body = pullRequest.body ?? "";
const docsUpdated = /^- \[[xX]\] Docs updated\s*$/m.test(body);
const noDocsUpdate = /^- \[[xX]\] No doc update needed: \S.+$/m.test(body);

if (docsUpdated === noDocsUpdate) {
  console.error(
    "Select exactly one Documentation impact declaration, with a real reason if none is needed.",
  );
  process.exit(1);
}

// This repository is documentation and templates, so its "docs" are the
// standard itself. A change to CI, scripts, or workflow files alone is the case
// where "No doc update needed" is the honest answer.
const DOCS_PATHS = ["docs/", "templates/", "README.md", "AGENTS.md", "CLAUDE.md", "SECURITY.md", "CONTRIBUTING.md"];
const changedFiles = execFileSync(
  "/usr/bin/git",
  ["diff", "--name-only", `${pullRequest.base.sha}...${pullRequest.head.sha}`],
  { encoding: "utf8" },
).split("\n").filter(Boolean);
const docsChanged = changedFiles.some((file) => DOCS_PATHS.some((prefix) => file.startsWith(prefix)));

if (docsUpdated && !docsChanged) {
  console.error("'Docs updated' is selected but none of the declared doc paths actually changed.");
  process.exit(1);
}
if (noDocsUpdate && docsChanged) {
  console.error("A declared doc path changed; select 'Docs updated' instead.");
  process.exit(1);
}

console.log("Documentation impact declaration is consistent with the diff.");
