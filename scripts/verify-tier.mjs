// Mechanical, best-effort verification of a repository against the solarssk
// playbook's tier checklist (docs/tiers.md). This checks what can genuinely
// be checked by a file/pattern scan or a low-privilege API read. It cannot,
// and does not try to, replace the judgment calls tiers.md itself calls out
// (choosing a tier, deciding whether a deliberate gap is acceptable). See
// docs/ci-cookbook.md #12 for why the settings-level checks below need an
// admin-scoped token and are skipped, not failed, without one.
//
// Runs against the CALLING repository's checked-out working tree (this
// script itself lives in playbook and is checked out alongside it; the repo
// under test is the current working directory when this runs).

import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { detectDeclaredTier as tierFromMarkdown, encodeBranchName, escapeTableCell, findFloatingActionRefs, isNewer, isReusableOnly, parseRepoSlug, parseTier, parseVersion, rulesetStatusCheckContexts, stripYamlComments, unmatchedRequiredContexts, untrustedText } from "./verify-lib.mjs";

const repoRoot = process.cwd();
/** @typedef {"pass" | "fail" | "warn" | "skip"} CheckStatus */
/** @type {{tier: number, id: string, label: string, status: CheckStatus, detail: string, logDetail: string}[]} */
const results = [];

// `detail` is written to the step-summary file, so it never contains text that came from the
// network. `logDetail` may, and goes to the job log only. It defaults to `detail`.
/** @param {CheckStatus} status */
function record(tier, id, label, status, detail = "", logDetail = detail) {
  // The detail argument is documentation of *why a check would fail or warn*;
  // showing it next to a passing result reads as a contradiction ("pass: X is
  // missing"). Only surface it when the check didn't cleanly pass.
  const clean = status === "pass";
  results.push({ tier, id, label, status, detail: clean ? "" : detail, logDetail: clean ? "" : logDetail });
}

function fileExists(...candidates) {
  return candidates.some((path) => existsSync(resolve(repoRoot, path)));
}

function readIfExists(path) {
  const full = resolve(repoRoot, path);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

function listWorkflowFiles() {
  const dir = resolve(repoRoot, ".github/workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => resolve(dir, name));
}

function workflowText() {
  return listWorkflowFiles().map((path) => stripYamlComments(readFileSync(path, "utf8"))).join("\n---\n");
}

function recordHeuristic(tier, id, label, found, missing) {
  record(tier, id, label, "warn", found
    ? "A possible configuration was found. Review triggers, conditions, execution and enforcement; a text match is not proof that this requirement is met."
    : missing);
}

function errorDetail(error) {
  return untrustedText(error instanceof Error ? error.message : error);
}

// ---------- tier detection ----------

function detectDeclaredTier() {
  return tierFromMarkdown(readIfExists("AGENTS.md") ?? readIfExists("CLAUDE.md") ?? "");
}

// ---------- Tier 0 ----------

function checkTier0() {
  record(0, "license", "LICENSE file present", fileExists("LICENSE", "LICENSE.md", "LICENSE.txt") ? "pass" : "fail",
    "A LICENSE file is missing. See docs/tiers.md, Tier 0.");

  record(0, "codeowners", ".github/CODEOWNERS present", fileExists(".github/CODEOWNERS") ? "pass" : "fail",
    "Add a one-line .github/CODEOWNERS (`* @<handle>`).");

  record(0, "readme-opens-well", "README opens with what/why before setup", "warn",
    "Not mechanically checkable with confidence; verify by reading README.md's first paragraph. See docs/readme-standard.md.");
}

// ---------- Tier 1 ----------

/** @returns {{status: CheckStatus, detail: string}} */
function checkShaPinning() {
  const files = listWorkflowFiles();
  if (files.length === 0) return { status: "skip", detail: "No workflow files to check." };
  const floating = [];
  for (const file of files) {
    for (const ref of findFloatingActionRefs(readFileSync(file, "utf8"))) {
      floating.push(`${ref} (${file.split("/").pop()})`);
    }
  }
  if (floating.length === 0) return { status: "pass", detail: "" };
  return {
    status: "fail",
    detail: `Floating (non-SHA) action refs found: ${floating.slice(0, 8).join(", ")}${floating.length > 8 ? ", ..." : ""}. See docs/ci-cookbook.md #1.`,
  };
}

function checkTier1() {
  const hasCi = listWorkflowFiles().length > 0;
  record(1, "ci-exists", "Minimal CI configured", hasCi ? "warn" : "fail",
    hasCi ? "Workflow files exist. Confirm lint and build or syntax checks run on push and pull request."
      : "No .github/workflows/*.yml found. See docs/tiers.md, Tier 1.");

  const pin = checkShaPinning();
  record(1, "sha-pinned", "GitHub Actions pinned to a commit SHA", pin.status, pin.detail);

  const wf = workflowText();
  recordHeuristic(1, "permissions-block", "Least-privilege workflow permissions", /^permissions:/m.test(wf),
    "No top-level `permissions:` block found in any workflow. A repo with none at all is worth a second look; this check cannot tell whether it's declared per-job instead.");

  record(1, "security-md", "SECURITY.md present", fileExists("SECURITY.md", ".github/SECURITY.md") ? "pass" : "fail",
    "Add a SECURITY.md. See docs/security-docs.md, Tier 1 minimum.");

  const hasIssueTemplate = fileExists(".github/ISSUE_TEMPLATE") &&
    readdirSync(resolve(repoRoot, ".github/ISSUE_TEMPLATE")).some((f) => f.endsWith(".yml") || f.endsWith(".md"));
  record(1, "issue-template", "At least one structured issue template", hasIssueTemplate ? "pass" : "fail",
    "Add .github/ISSUE_TEMPLATE/*.yml. See templates/ISSUE_TEMPLATE/.");

  recordHeuristic(1, "secret-scan", "Secret scanning in CI", /gitleaks|trufflehog|detect-secrets/i.test(wf),
    "No gitleaks/trufflehog/detect-secrets reference found in any workflow. Confirm a secret-scan step actually runs; this is a keyword heuristic, not a guarantee.");

  recordHeuristic(1, "dependency-audit", "Dependency vulnerability audit in CI", /pip-audit|npm audit|osv-scanner|npm_audit/i.test(wf),
    "No pip-audit/npm audit/osv-scanner reference found. See docs/ci-cookbook.md #3.");
}

// ---------- playbook version drift ----------

// Tells an adopting repo when the playbook has published a newer release than
// the release baseline recorded in the workflow. The checkout SHA, not this
// version metadata, identifies the executed source. This warns and never
// fails: a new release must not turn every adopter's CI red at once. It is a
// prompt to read the release notes and bump the pin, not a compliance verdict.
async function checkPlaybookVersion() {
  const label = "Pinned to the latest playbook release";
  const current = process.env.PLAYBOOK_RELEASE;
  const currentParts = parseVersion(current);
  if (!currentParts) {
    record(0, "playbook-version", label, "skip",
      "PLAYBOOK_RELEASE is not set to a vX.Y.Z tag (running outside the reusable workflow?), so version drift was not checked.");
    return;
  }
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const response = await fetch("https://api.github.com/repos/solarssk/playbook/releases/latest", {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`GET releases/latest: ${response.status}`);
    const latest = await response.json();
    const latestParts = parseVersion(latest.tag_name);
    if (!latestParts) throw new Error("latest release tag is not in vX.Y.Z form");

    if (isNewer(latestParts, currentParts)) {
      // Built only from parsed numbers and a fixed URL prefix, never from raw
      // API text: this string reaches stdout, where GitHub interprets `::`
      // lines as workflow commands, so nothing from the response may be echoed.
      const pinnedTag = `v${currentParts.join(".")}`;
      const latestTag = `v${latestParts.join(".")}`;
      const detail = `This repo is pinned to playbook ${pinnedTag}; ${latestTag} is available. ` +
        `Read the release notes (https://github.com/solarssk/playbook/releases/tag/${latestTag}), apply any "Adopter action" items, then bump the pin in the verify-standard workflow.`;
      record(0, "playbook-version", label, "warn",
        "A newer playbook release exists than the one this repository is pinned to. The job log names it and links its release notes.", detail);
      console.log(`::warning title=Newer playbook release available::${detail}`);
    } else {
      record(0, "playbook-version", label, "pass");
    }
  } catch (error) {
    record(0, "playbook-version", label, "skip", "Could not check for a newer release. The job log has the reason.",
      `Could not check for a newer release: ${errorDetail(error)}`);
  }
}

// ---------- Tier 2 ----------

function checkTier2() {
  record(2, "contributing", "CONTRIBUTING.md present", fileExists("CONTRIBUTING.md", ".github/CONTRIBUTING.md") ? "pass" : "fail",
    "Add a CONTRIBUTING.md. See templates/CONTRIBUTING.template.md.");

  record(2, "pr-template", "Pull request template present", fileExists(".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md") ? "pass" : "fail",
    "Add .github/pull_request_template.md. See templates/pull_request_template.md.");

  const prTemplate = readIfExists(".github/pull_request_template.md") ?? readIfExists(".github/PULL_REQUEST_TEMPLATE.md") ?? "";
  record(2, "docs-impact-section", "PR template has a Documentation impact section", /documentation impact/i.test(prTemplate) ? "pass" : "warn",
    "No 'Documentation impact' section found in the PR template. See docs/ci-cookbook.md #12.");

  const wf = workflowText();
  // A reusable-only workflow takes its concurrency from the calling workflow.
  const triggerable = listWorkflowFiles().filter((file) => !isReusableOnly(readFileSync(file, "utf8")));
  const concurrencyBlocks = triggerable.filter((file) => /^concurrency:/m.test(readFileSync(file, "utf8"))).length;
  const workflowCount = triggerable.length;
  /** @type {CheckStatus} */
  let concurrencyStatus = "skip";
  if (workflowCount > 0) concurrencyStatus = concurrencyBlocks >= workflowCount ? "pass" : "warn";
  record(2, "concurrency", "`concurrency:` groups present on workflows", concurrencyStatus,
    `${concurrencyBlocks}/${workflowCount} workflow files declare a top-level concurrency: block. See docs/ci-cookbook.md #2.`);

  recordHeuristic(2, "sast", "CodeQL or Semgrep configured", /codeql-action|semgrep/i.test(wf),
    "No CodeQL or Semgrep reference found in any workflow.");

  // Both are required: actionlint checks correctness, zizmor checks safety, and
  // neither covers the other's half.
  const missingLinters = ["actionlint", "zizmor"].filter((name) => !new RegExp(name, "i").test(wf));
  recordHeuristic(2, "workflow-lint", "Workflows linted with both actionlint and zizmor", missingLinters.length === 0,
    `No ${missingLinters.join(" or ")} reference found in any workflow. actionlint checks correctness and zizmor checks safety (template injection, excessive permissions, unpinned actions); neither covers the other. See docs/ci-cookbook.md #15.`);

  recordHeuristic(2, "scorecard", "OpenSSF Scorecard workflow configured", /ossf\/scorecard-action/.test(wf),
    "No ossf/scorecard-action reference found. Expected on public repositories only; a private repository can ignore this. See docs/openssf.md.");

  // Matches both Markdown image syntax (![alt](url)) and an HTML <img> tag
  // (a common pattern for a centered badge row), as long as the URL looks
  // like a badge (contains "badge" or "shields.io").
  const readme = readIfExists("README.md") ?? "";
  const badgePattern = /(!\[[^\]]*\]\([^)]*(?:badge|shields\.io)[^)]*\)|<img[^>]*(?:badge|shields\.io)[^>]*>)/gi;
  const badgeCount = (readme.match(badgePattern) ?? []).length;
  record(2, "readme-badges", "README has a badge row", badgeCount >= 2 ? "pass" : "warn",
    `Found ${badgeCount} badge-shaped image(s) in README.md. See docs/readme-standard.md.`);
}

// ---------- Tier 3 ----------

function checkTier3() {
  const wf = workflowText();
  recordHeuristic(3, "dast", "A DAST-style scan is configured", /zap|dast|nuclei/i.test(wf),
    "No ZAP/DAST/nuclei reference found in any workflow.");

  record(3, "coverage-or-quality-gate", "Coverage and code-quality gates enforced", "warn",
    "Both gates need review, including their thresholds and merge enforcement. A Codecov or SonarCloud configuration alone does not establish either gate.");

  const changelog = readIfExists("CHANGELOG.md") ?? "";
  const versionHeadings = (changelog.match(/^##\s*\[\d+\.\d+\.\d+\]/gm) ?? []).length;
  const readme = readIfExists("README.md") ?? "";
  recordHeuristic(3, "best-practices-badge", "OpenSSF Best Practices badge at passing level", /bestpractices\.dev\/projects\/\d+/.test(readme),
    "No bestpractices.dev project badge found in README.md. Tier 3 asks for the passing level; see docs/openssf.md. This only checks that a badge is linked, not which level it shows.");

  record(3, "per-version-changelog", "CHANGELOG has per-version entries", versionHeadings >= 1 ? "pass" : "warn",
    `Found ${versionHeadings} version heading(s) in CHANGELOG.md.`);
}

// ---------- settings-level checks (need an admin-scoped token) ----------

function checkRepository(repo) {
  if (!repo || typeof repo !== "object" || Array.isArray(repo) || typeof repo.delete_branch_on_merge !== "boolean") {
    throw new Error("Invalid repository settings response");
  }
  record(0, "delete-branch-on-merge", "Automatically delete head branches enabled",
    repo.delete_branch_on_merge ? "pass" : "warn",
    repo.delete_branch_on_merge ? "" : "delete_branch_on_merge is false. This can be a deliberate choice (see docs/tiers.md, Tier 0); confirm it's documented if so.");

  const status = repo.security_and_analysis?.dependabot_security_updates?.status;
  if (!status) {
    record(0, "dependabot-security-updates", "Dependabot security updates enabled", "warn",
      "security_and_analysis not present in the response (needs org owner/security-manager access, not just repo admin, in some org configurations).");
    return;
  }
  record(0, "dependabot-security-updates", "Dependabot security updates enabled", status === "enabled" ? "pass" : "warn",
    "Dependabot security updates are not enabled. The job log has the reported status.", `Status: ${untrustedText(status)}.`);
}

/** @param {RequestInit & {searchParams?: Record<string, string>}} options */
async function apiJson(path, headers, label, options = {}) {
  const { searchParams, ...requestOptions } = options;
  // Path and query setters cannot change the fixed API origin.
  const url = new URL("https://api.github.com");
  url.pathname = path;
  url.search = new URLSearchParams(searchParams).toString();
  const response = await fetch(url, { ...requestOptions, headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${label}: ${response.status}`);
  return response.json();
}

async function requiredStatusChecks(slug, headers) {
  const query = "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){defaultBranchRef{name branchProtectionRule{requiredStatusCheckContexts}}}}";
  const payload = await apiJson("/graphql", { ...headers, "Content-Type": "application/json" }, "POST graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables: { owner: slug.owner, name: slug.repo } }),
  });
  if (payload.errors) throw new Error("the branch protection query returned errors");
  const repository = payload.data?.repository;
  if (!repository || !Object.hasOwn(repository, "defaultBranchRef")) throw new Error("Missing default branch response");
  const branch = repository.defaultBranchRef;
  if (branch === null) return { branch: null, contexts: [] };
  encodeBranchName(branch.name);
  const rule = branch.branchProtectionRule;
  const contexts = rule === null ? [] : rule?.requiredStatusCheckContexts;
  if (!Array.isArray(contexts) || contexts.some((context) => typeof context !== "string" || context.length === 0)) {
    throw new Error("Invalid classic required status checks response");
  }
  return { branch: branch.name, contexts };
}

async function rulesetStatusChecks(slug, branch, headers) {
  const encoded = encodeBranchName(branch);
  const contexts = [];
  for (let page = 1; page <= 100; page += 1) {
    const rules = await apiJson(
      `/repos/${slug.owner}/${slug.repo}/rules/branches/${encoded}`,
      headers, "GET branch rules", { searchParams: { per_page: "100", page: String(page) } },
    );
    contexts.push(...rulesetStatusCheckContexts(rules));
    if (rules.length < 100) return contexts;
  }
  throw new Error("Branch rules pagination exceeded the safety limit");
}

function checkProtection(contexts, complete) {
  if (!complete) {
    record(0, "branch-protection", "Required CI checks protected on the default branch", "warn",
      "Protection could not be fully assessed. The job log has the API error; unavailable data is not evidence that protection is absent.");
  } else if (listWorkflowFiles().length === 0) {
    record(0, "branch-protection", "Required CI checks protected on the default branch", "skip",
      "No workflow files exist. Tier 0 requires CI protection once CI exists.");
  } else if (contexts.length === 0) {
    record(0, "branch-protection", "Branch protection enabled on the default branch", "warn",
      "No required status checks found in classic protection or active Rulesets. A protection rule without required CI checks is not sufficient.");
  } else {
    record(0, "branch-protection", "Required CI checks protected on the default branch", "pass");
  }
  if (contexts.length === 0) {
    record(0, "required-check-names", "Required check names match workflow jobs", "skip",
      "No required check names were available to compare.");
    return;
  }

  const unmatched = unmatchedRequiredContexts(contexts, listWorkflowFiles().map((file) => readFileSync(file, "utf8")));
  const why = "A required check that never reports blocks every pull request with no error. " +
    "External apps can legitimately post unmatched contexts. This comparison does not establish that all applicable CI jobs are required or that bypass is disabled. See docs/governance.md.";
  record(0, "required-check-names", "Every required status check matches a workflow job's reported name",
    unmatched.length === 0 && complete ? "pass" : "warn",
    unmatched.length === 0 ? "Known check names match, but protection data is incomplete." :
    `Some required status checks match no workflow job's reported name. The job log lists them. ${why}`,
    unmatched.length === 0 ? "Known check names match, but protection data is incomplete." :
    `No workflow job reports as: ${unmatched.map((context) => untrustedText(context)).join(", ")}. ${why}`);
}

async function checkSettings(token) {
  if (!token) {
    record(0, "settings", "Repo-settings checks (delete-branch-on-merge, Dependabot, branch protection)", "skip",
      "No admin_token secret provided to this workflow call, so repo-settings checks were skipped, not failed. See docs/ci-cookbook.md #12 for why this needs an admin-scoped token rather than the default GITHUB_TOKEN.");
    return;
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const slug = parseRepoSlug(process.env.GITHUB_REPOSITORY);
  if (slug === null) {
    record(0, "settings", "Repo-settings checks", "warn",
      "GITHUB_REPOSITORY is not an owner/repository name.");
    return;
  }
  let repo;
  try {
    repo = await apiJson(`/repos/${slug.owner}/${slug.repo}`, headers, `GET /repos/${slug.owner}/${slug.repo}`);
    checkRepository(repo);
  } catch (error) {
    record(0, "settings", "Repo-settings checks", "warn", "Could not complete the repo-settings checks. The job log has the reason.",
      `Could not complete: ${errorDetail(error)}`);
  }
  let branch = repo?.default_branch;
  const contexts = [];
  let complete = true;
  try {
    const classic = await requiredStatusChecks(slug, headers);
    branch = classic.branch;
    contexts.push(...classic.contexts);
  } catch (error) {
    complete = false;
    record(0, "settings", "Classic branch protection", "warn", "Could not read classic protection. The job log has the reason.",
      `Could not complete: ${errorDetail(error)}`);
  }
  if (branch !== null) {
    try {
      contexts.push(...await rulesetStatusChecks(slug, branch, headers));
    } catch (error) {
      complete = false;
      record(0, "settings", "Active branch Rulesets", "warn", "Could not read active branch rules. The job log has the reason.",
        `Could not complete: ${errorDetail(error)}`);
    }
  }
  checkProtection([...new Set(contexts)], complete);
}

// ---------- run, report, exit ----------

const tierInput = process.env.INPUT_TIER ?? "auto";
const declaredTier = tierInput === "auto" ? detectDeclaredTier() : parseTier(tierInput);
if (tierInput !== "auto" && declaredTier === null) {
  console.error("Invalid tier input. Expected `auto`, `0`, `1`, `2`, or `3`.");
  process.exit(1);
}

if (declaredTier === null) {
  console.error(
    "Could not determine a tier: no explicit tier was given and no valid `Tier: N` line " +
      "(N = 0, 1, 2, or 3) was found in AGENTS.md or CLAUDE.md. Add the playbook pointer block " +
      "(see AGENTS.md, \"If you were sent here from another repository\") or pass an explicit tier input.",
  );
  process.exit(1);
}

await checkSettings(process.env.ADMIN_TOKEN);
await checkPlaybookVersion();
checkTier0();
if (declaredTier >= 1) checkTier1();
if (declaredTier >= 2) checkTier2();
if (declaredTier >= 3) checkTier3();

const relevant = results.filter((r) => r.tier <= declaredTier);
const icon = { pass: "✅", fail: "❌", warn: "⚠️", skip: "➖" };
const failures = relevant.filter((r) => r.status === "fail");
const automatedChecks = failures.length > 0 ? "failed" : "passed";
const assessment = failures.length > 0 ? "failed" : "partial";

function renderTable(field) {
  const lines = [
    `# Playbook tier verification (declared: Tier ${declaredTier})`, "",
    `Automated checks: **${automatedChecks}**. Assessment: **${assessment}**.`, "",
    "This run does not certify full Tier compliance. Manual requirements, heuristic findings, applicability and effective enforcement need review.", "",
    "| Status | Check | Detail | ID |", "|---|---|---|---|",
  ];
  for (const r of relevant) {
    lines.push(`| ${icon[r.status]} ${r.status} | ${escapeTableCell(r.label)} | ${escapeTableCell(r[field])} | ${r.id} |`);
  }
  return lines.join("\n");
}

// The job log gets the full detail. The step-summary file gets only text this script wrote
// itself, so nothing that came from the network is ever written to a file.
console.log(renderTable("logDetail"));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderTable("detail") + "\n");
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `automated_checks=${automatedChecks}\nassessment=${assessment}\n`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed for Tier ${declaredTier}.`);
  process.exit(1);
}
console.log(`\nAll hard checks passed for Tier ${declaredTier}. Warnings, if any, are worth a look but don't fail the build.`);
