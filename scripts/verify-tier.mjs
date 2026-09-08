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
  const agents = readIfExists("AGENTS.md") ?? readIfExists("CLAUDE.md") ?? "";
  const match = agents.match(/^Tier:\s*(\d)\b/m);
  return match ? Number(match[1]) : null;
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

const SHA_PIN_PATTERN = /uses:\s*[^\s@]+@([0-9a-f]{40}|[0-9a-f]{7,39}\s*#)/;
const FLOATING_USES_PATTERN = /uses:\s*([^\s@]+)@([^\s#]+)/g;

function checkShaPinning() {
  const files = listWorkflowFiles();
  if (files.length === 0) return { status: "skip", detail: "No workflow files to check." };
  const floating = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    let match;
    FLOATING_USES_PATTERN.lastIndex = 0;
    while ((match = FLOATING_USES_PATTERN.exec(text))) {
      const [, action, ref] = match;
      if (!/^[0-9a-f]{40}$/.test(ref)) floating.push(`${action}@${ref} (${file.split("/").pop()})`);
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
  const concurrencyBlocks = (wf.match(/^concurrency:/gm) ?? []).length;
  const workflowCount = listWorkflowFiles().length;
  record(2, "concurrency", "`concurrency:` groups present on workflows", workflowCount === 0 ? "skip" : concurrencyBlocks >= workflowCount ? "pass" : "warn",
    `${concurrencyBlocks}/${workflowCount} workflow files declare a top-level concurrency: block. See docs/ci-cookbook.md #2.`);

  record(2, "sast", "CodeQL or Semgrep configured", /codeql-action|semgrep/i.test(wf) ? "pass" : "warn",
    "No CodeQL or Semgrep reference found in any workflow.");

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
      dependabotStatus ? `Status: ${dependabotStatus}.` : "security_and_analysis not present in the response (needs org owner/security-manager access, not just repo admin, in some org configurations).");

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
        `Required status checks: ${contexts.length ? contexts.join(", ") : "(none declared)"}.`);
    } else {
      throw new Error(`GET branch protection: ${protectionResponse.status}`);
    }
  } catch (error) {
    record(0, "settings", "Repo-settings checks", "warn", `Could not complete: ${error.message}`);
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
checkTier0();
if (declaredTier >= 1) checkTier1();
if (declaredTier >= 2) checkTier2();
if (declaredTier >= 3) checkTier3();

const relevant = results.filter((r) => r.tier <= declaredTier);
const icon = { pass: "✅", fail: "❌", warn: "⚠️", skip: "➖" };

const lines = [`# Playbook tier verification (declared: Tier ${declaredTier})`, ""];
lines.push("| Status | Check | Detail |", "|---|---|---|");
for (const r of relevant) {
  lines.push(`| ${icon[r.status]} ${r.status} | ${r.label} | ${r.detail.replace(/\|/g, "\\|")} |`);
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
