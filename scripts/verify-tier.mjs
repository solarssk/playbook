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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { detectDeclaredTier as tierFromMarkdown, escapeTableCell, findFloatingActionRefs, isNewer, isReusableOnly, parseVersion, unmatchedRequiredContexts, untrustedText } from "./verify-lib.mjs";

const repoRoot = process.cwd();
const results = []; // { tier, id, label, status: "pass"|"fail"|"warn"|"skip", detail }

function record(tier, id, label, status, detail = "") {
  // The detail argument is documentation of *why a check would fail or warn*;
  // showing it next to a passing result reads as a contradiction ("pass: X is
  // missing"). Only surface it when the check didn't cleanly pass.
  results.push({ tier, id, label, status, detail: status === "pass" ? "" : detail });
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
  return listWorkflowFiles().map((path) => readFileSync(path, "utf8")).join("\n---\n");
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
  record(1, "ci-exists", "At least one CI workflow exists", hasCi ? "pass" : "fail",
    "No .github/workflows/*.yml found. See docs/tiers.md, Tier 1.");

  const pin = checkShaPinning();
  record(1, "sha-pinned", "GitHub Actions pinned to a commit SHA", pin.status, pin.detail);

  const wf = workflowText();
  record(1, "permissions-block", "At least one workflow declares a `permissions:` block", /^permissions:/m.test(wf) ? "pass" : "warn",
    "No top-level `permissions:` block found in any workflow. A repo with none at all is worth a second look; this check cannot tell whether it's declared per-job instead.");

  record(1, "security-md", "SECURITY.md present", fileExists("SECURITY.md", ".github/SECURITY.md") ? "pass" : "fail",
    "Add a SECURITY.md. See docs/security-docs.md, Tier 1 minimum.");

  const hasIssueTemplate = fileExists(".github/ISSUE_TEMPLATE") &&
    readdirSync(resolve(repoRoot, ".github/ISSUE_TEMPLATE")).some((f) => f.endsWith(".yml") || f.endsWith(".md"));
  record(1, "issue-template", "At least one structured issue template", hasIssueTemplate ? "pass" : "fail",
    "Add .github/ISSUE_TEMPLATE/*.yml. See templates/ISSUE_TEMPLATE/.");

  record(1, "secret-scan", "A secret-scan step (gitleaks or equivalent) appears in CI", /gitleaks|trufflehog|detect-secrets/i.test(wf) ? "pass" : "warn",
    "No gitleaks/trufflehog/detect-secrets reference found in any workflow. Confirm a secret-scan step actually runs; this is a keyword heuristic, not a guarantee.");

  record(1, "dependency-audit", "A dependency vulnerability audit step appears in CI", /pip-audit|npm audit|osv-scanner|npm_audit/i.test(wf) ? "pass" : "warn",
    "No pip-audit/npm audit/osv-scanner reference found. See docs/ci-cookbook.md #3.");
}

// ---------- playbook version drift ----------

// Tells an adopting repo when the playbook has published a newer release than
// the one it is pinned to. The version this script runs at IS the version the
// caller pinned (see PLAYBOOK_RELEASE in verify-tier.yml). This warns and never
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
      record(0, "playbook-version", label, "warn", detail);
      console.log(`::warning title=Newer playbook release available::${detail}`);
    } else {
      record(0, "playbook-version", label, "pass");
    }
  } catch (error) {
    record(0, "playbook-version", label, "skip", `Could not check for a newer release: ${untrustedText(error.message)}`);
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
  record(2, "concurrency", "`concurrency:` groups present on workflows", workflowCount === 0 ? "skip" : concurrencyBlocks >= workflowCount ? "pass" : "warn",
    `${concurrencyBlocks}/${workflowCount} workflow files declare a top-level concurrency: block. See docs/ci-cookbook.md #2.`);

  record(2, "sast", "CodeQL or Semgrep configured", /codeql-action|semgrep/i.test(wf) ? "pass" : "warn",
    "No CodeQL or Semgrep reference found in any workflow.");

  // Both are required: actionlint checks correctness, zizmor checks safety, and
  // neither covers the other's half.
  const missingLinters = ["actionlint", "zizmor"].filter((name) => !new RegExp(name, "i").test(wf));
  record(2, "workflow-lint", "Workflows linted with both actionlint and zizmor", missingLinters.length === 0 ? "pass" : "warn",
    `No ${missingLinters.join(" or ")} reference found in any workflow. actionlint checks correctness and zizmor checks safety (template injection, excessive permissions, unpinned actions); neither covers the other. See docs/ci-cookbook.md #15.`);

  record(2, "scorecard", "OpenSSF Scorecard workflow configured", /ossf\/scorecard-action/.test(wf) ? "pass" : "warn",
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
  record(3, "dast", "A DAST-style scan is configured", /zap|dast|nuclei/i.test(wf) ? "pass" : "warn",
    "No ZAP/DAST/nuclei reference found in any workflow.");

  record(3, "coverage-or-quality-gate", "Codecov or SonarCloud configured", fileExists("codecov.yml", ".codecov.yml") || /sonarqube-scan-action|sonarcloud/i.test(wf) ? "pass" : "warn",
    "No codecov.yml and no SonarCloud/sonarqube-scan-action reference found.");

  const changelog = readIfExists("CHANGELOG.md") ?? "";
  const versionHeadings = (changelog.match(/^##\s*\[\d+\.\d+\.\d+\]/gm) ?? []).length;
  const readme = readIfExists("README.md") ?? "";
  record(3, "best-practices-badge", "OpenSSF Best Practices badge linked from the README", /bestpractices\.dev\/projects\/\d+/.test(readme) ? "pass" : "warn",
    "No bestpractices.dev project badge found in README.md. Tier 3 asks for the passing level; see docs/openssf.md. This only checks that a badge is linked, not which level it shows.");

  record(3, "per-version-changelog", "CHANGELOG has per-version entries", versionHeadings >= 1 ? "pass" : "warn",
    `Found ${versionHeadings} version heading(s) in CHANGELOG.md.`);
}

// ---------- settings-level checks (need an admin-scoped token) ----------

async function checkSettings(token) {
  const repoSlug = process.env.GITHUB_REPOSITORY;
  if (!token) {
    record(0, "settings", "Repo-settings checks (delete-branch-on-merge, Dependabot, branch protection)", "skip",
      "No admin_token secret provided to this workflow call, so repo-settings checks were skipped, not failed. See docs/ci-cookbook.md #12 for why this needs an admin-scoped token rather than the default GITHUB_TOKEN.");
    return;
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  try {
    const repoResponse = await fetch(`https://api.github.com/repos/${repoSlug}`, { headers });
    if (!repoResponse.ok) throw new Error(`GET /repos/${repoSlug}: ${repoResponse.status}`);
    const repo = await repoResponse.json();

    record(0, "delete-branch-on-merge", "Automatically delete head branches enabled",
      repo.delete_branch_on_merge ? "pass" : "warn",
      repo.delete_branch_on_merge ? "" : "delete_branch_on_merge is false. This can be a deliberate choice (see docs/tiers.md, Tier 0); confirm it's documented if so.");

    const dependabotStatus = repo.security_and_analysis?.dependabot_security_updates?.status;
    record(0, "dependabot-security-updates", "Dependabot security updates enabled",
      dependabotStatus === "enabled" ? "pass" : "warn",
      dependabotStatus ? `Status: ${untrustedText(dependabotStatus)}.` : "security_and_analysis not present in the response (needs org owner/security-manager access, not just repo admin, in some org configurations).");

    const protectionResponse = await fetch(
      `https://api.github.com/repos/${repoSlug}/branches/${repo.default_branch}/protection`,
      { headers },
    );
    if (protectionResponse.status === 404) {
      record(0, "branch-protection", "Branch protection enabled on the default branch", "warn",
        "No branch protection configured on the default branch.");
    } else if (protectionResponse.ok) {
      const protection = await protectionResponse.json();
      const contexts = protection.required_status_checks?.contexts ?? [];
      record(0, "branch-protection", "Branch protection enabled on the default branch", "pass",
        `Required status checks: ${contexts.length ? contexts.map((context) => untrustedText(context)).join(", ") : "(none declared)"}.`);

      const unmatched = unmatchedRequiredContexts(contexts, listWorkflowFiles().map((file) => readFileSync(file, "utf8")));
      record(0, "required-check-names", "Every required status check matches a workflow job's reported name",
        unmatched.length === 0 ? "pass" : "warn",
        `No workflow job reports as: ${unmatched.map((context) => untrustedText(context)).join(", ")}. A required check that never reports blocks every pull request with no error. ` +
          "A context posted by an external app (SonarCloud, for example) is expected here; a mistyped job name is not. See docs/governance.md, branch protection.");
    } else {
      throw new Error(`GET branch protection: ${protectionResponse.status}`);
    }
  } catch (error) {
    record(0, "settings", "Repo-settings checks", "warn", `Could not complete: ${untrustedText(error.message)}`);
  }
}

// ---------- run, report, exit ----------

const tierInput = process.env.INPUT_TIER ?? "auto";
const declaredTier = tierInput === "auto" ? detectDeclaredTier() : Number(tierInput);

if (declaredTier === null) {
  console.error(
    "Could not determine a tier: no `tier:` input was given and no `Tier: N` line was found in " +
      "AGENTS.md or CLAUDE.md. Add the playbook pointer block (see AGENTS.md, \"If you were sent " +
      "here from another repository\") or pass an explicit tier input.",
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

const lines = [`# Playbook tier verification (declared: Tier ${declaredTier})`, ""];
lines.push("| Status | Check | Detail |", "|---|---|---|");
for (const r of relevant) {
  lines.push(`| ${icon[r.status]} ${r.status} | ${escapeTableCell(r.label)} | ${escapeTableCell(r.detail)} |`);
}
const summary = lines.join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import("node:fs");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}

const failures = relevant.filter((r) => r.status === "fail");
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed for Tier ${declaredTier}.`);
  process.exit(1);
}
console.log(`\nAll hard checks passed for Tier ${declaredTier}. Warnings, if any, are worth a look but don't fail the build.`);
