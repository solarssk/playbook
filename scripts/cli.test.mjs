import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

// Runs the three command-line scripts as real child processes, the way CI does, against fixture
// directories. The fixtures live under coverage/ (git-ignored), not in the system temp directory.

const REPO = resolve(import.meta.dirname, "..");
const SCRIPTS = join(REPO, "scripts");
const SHA = "0123456789012345678901234567890123456789";
const FIXTURES = join(REPO, "coverage");
mkdirSync(FIXTURES, { recursive: true });
const made = [];

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(FIXTURES, "fixture-"));
  made.push(dir);
  return dir;
}

function write(dir, path, text) {
  const full = join(dir, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

// Answers fetch() from the MOCK_FETCH environment variable: a map from a URL suffix to
// { status, body }. A URL that matches nothing throws, like a network failure.
const MOCK_FETCH = `data:text/javascript,${encodeURIComponent(`
const routes = JSON.parse(process.env.MOCK_FETCH ?? "{}");
globalThis.fetch = async (url) => {
  const key = Object.keys(routes).find((suffix) => String(url).endsWith(suffix));
  if (key === undefined) throw new Error("unmocked request");
  const { status = 200, body = {} } = routes[key];
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};`)}`;

const CLEARED = ["GITHUB_EVENT_PATH", "GITHUB_STEP_SUMMARY", "GITHUB_REPOSITORY", "INPUT_TIER", "ADMIN_TOKEN", "GH_TOKEN", "PLAYBOOK_RELEASE", "RELEASE_TAG", "NOTES_OUT", "MOCK_FETCH"];

function run(script, { cwd = REPO, env = {}, mock = false } = {}) {
  const base = { ...process.env };
  for (const key of CLEARED) delete base[key];
  const args = mock ? ["--import", MOCK_FETCH] : [];
  const result = spawnSync(process.execPath, [...args, join(SCRIPTS, script)], { cwd, env: { ...base, ...env }, encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

// ---------- release-check ----------

function releaseFixture({ pin = "v1.2.3", ref = "v1.2.3", changelog = "## [Unreleased]\n\n## [1.2.3] - 2026-01-01\n\n- a change\n" } = {}) {
  const dir = fixture();
  write(dir, ".github/workflows/verify-tier.yml", [
    "env:", `  PLAYBOOK_RELEASE: ${pin}`, "jobs:", "  verify:", "    steps:",
    `      - uses: actions/checkout@${SHA}`, "        with:", "          repository: solarssk/playbook", `          ref: ${ref}`,
  ].join("\n"));
  write(dir, "CHANGELOG.md", changelog);
  return dir;
}

test("release-check passes when the pin, the checkout ref, and the CHANGELOG agree", () => {
  const result = run("release-check.mjs", { cwd: releaseFixture() });
  assert.equal(result.code, 0);
  assert.match(result.out, /v1\.2\.3 is consistent/);
});

test("release-check writes the CHANGELOG section as the release notes", () => {
  const dir = releaseFixture();
  const notes = join(dir, "notes.md");
  const result = run("release-check.mjs", { cwd: dir, env: { RELEASE_TAG: "v1.2.3", NOTES_OUT: notes } });
  assert.equal(result.code, 0);
  assert.equal(readFileSync(notes, "utf8"), "- a change\n");
});

test("release-check rejects a tag that differs from the pin", () => {
  const result = run("release-check.mjs", { cwd: releaseFixture(), env: { RELEASE_TAG: "v9.9.9" } });
  assert.equal(result.code, 1);
  assert.match(result.err, /does not match PLAYBOOK_RELEASE/);
});

test("release-check rejects a tag that is not vX.Y.Z, without echoing it", () => {
  const result = run("release-check.mjs", { cwd: releaseFixture(), env: { RELEASE_TAG: "v1.2.3\n::error::injected" } });
  assert.equal(result.code, 1);
  assert.match(result.err, /RELEASE_TAG is not a vX\.Y\.Z tag/);
  assert.doesNotMatch(result.err, /injected/);
});

test("release-check rejects a checkout ref that differs from the pin", () => {
  const result = run("release-check.mjs", { cwd: releaseFixture({ ref: "v1.2.2" }) });
  assert.equal(result.code, 1);
  assert.match(result.err, /checkout's ref/);
});

test("release-check rejects a missing or invalid pin", () => {
  const result = run("release-check.mjs", { cwd: releaseFixture({ pin: "main" }) });
  assert.equal(result.code, 1);
  assert.match(result.err, /missing or not a vX\.Y\.Z tag/);
});

test("release-check rejects a version with no CHANGELOG section", () => {
  const result = run("release-check.mjs", { cwd: releaseFixture({ changelog: "## [Unreleased]\n\n- not released\n" }) });
  assert.equal(result.code, 1);
  assert.match(result.err, /no non-empty section/);
});

// ---------- check-pr-docs-impact ----------

const DECLARE_DOCS = "- [x] Docs updated\n- [ ] No doc update needed: <state the reason>";
const DECLARE_NONE = "- [ ] Docs updated\n- [x] No doc update needed: CI only";

// A git repository whose head commit changes one file; returns the event file for it.
function prFixture({ changed, body, login = "someone" }) {
  const dir = fixture();
  // The absolute path is deliberate, as in check-pr-docs-impact.mjs: resolving an executable through
  // PATH is what static analysis flags.
  const git = (...args) => execFileSync("/usr/bin/git", ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  write(dir, "README.md", "base\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  write(dir, changed, "changed\n");
  git("add", "-A");
  git("commit", "-q", "-m", "head");
  const head = git("rev-parse", "HEAD").trim();
  const event = join(dir, "event.json");
  writeFileSync(event, JSON.stringify({ pull_request: { user: { login }, base: { sha: base }, head: { sha: head }, body } }));
  return { dir, event };
}

function docsImpact(options) {
  const { dir, event } = prFixture(options);
  return run("check-pr-docs-impact.mjs", { cwd: dir, env: { GITHUB_EVENT_PATH: event } });
}

test("docs-impact exits cleanly outside a pull request", () => {
  assert.equal(run("check-pr-docs-impact.mjs").code, 0);
  const dir = fixture();
  write(dir, "event.json", "{}");
  assert.equal(run("check-pr-docs-impact.mjs", { cwd: dir, env: { GITHUB_EVENT_PATH: join(dir, "event.json") } }).code, 0);
});

test("docs-impact exempts Dependabot by author, not by branch name", () => {
  assert.equal(docsImpact({ changed: "package.txt", body: "", login: "dependabot[bot]" }).code, 0);
  assert.equal(docsImpact({ changed: "package.txt", body: "", login: "someone" }).code, 1);
});

test("docs-impact requires exactly one declaration", () => {
  assert.equal(docsImpact({ changed: "docs/a.md", body: "nothing selected" }).code, 1);
  assert.equal(docsImpact({ changed: "docs/a.md", body: "- [x] Docs updated\n- [x] No doc update needed: a reason" }).code, 1);
  assert.equal(docsImpact({ changed: "docs/a.md", body: "- [ ] Docs updated\n- [x] No doc update needed: <state the reason>" }).code, 1);
});

test("docs-impact checks the declaration against the diff", () => {
  assert.equal(docsImpact({ changed: "docs/a.md", body: DECLARE_DOCS }).code, 0);
  assert.equal(docsImpact({ changed: "scripts/a.mjs", body: DECLARE_NONE }).code, 0);
  const claimedButUnchanged = docsImpact({ changed: "scripts/a.mjs", body: DECLARE_DOCS });
  assert.equal(claimedButUnchanged.code, 1);
  assert.match(claimedButUnchanged.err, /none of the declared doc paths/);
  const deniedButChanged = docsImpact({ changed: "docs/a.md", body: DECLARE_NONE });
  assert.equal(deniedButChanged.code, 1);
  assert.match(deniedButChanged.err, /select 'Docs updated' instead/);
});

// ---------- verify-tier ----------

test("verify-tier passes this repository at its own declared tier and writes the step summary", () => {
  const dir = fixture();
  const summary = join(dir, "summary.md");
  const result = run("verify-tier.mjs", { env: { INPUT_TIER: "2", GITHUB_STEP_SUMMARY: summary } });
  assert.equal(result.code, 0);
  assert.match(result.out, /All hard checks passed for Tier 2/);
  assert.match(readFileSync(summary, "utf8"), /# Playbook tier verification \(declared: Tier 2\)/);
});

test("verify-tier at Tier 3 adds its own checks and does not fail on warnings", () => {
  const result = run("verify-tier.mjs", { env: { INPUT_TIER: "3" } });
  assert.equal(result.code, 0);
  assert.match(result.out, /Best Practices badge/);
});

test("verify-tier fails an empty repository at every tier and names what is missing", () => {
  for (const tier of ["0", "1", "2", "3"]) {
    const result = run("verify-tier.mjs", { cwd: fixture(), env: { INPUT_TIER: tier } });
    assert.equal(result.code, 1, `tier ${tier}`);
    assert.match(result.out, /❌ fail \| LICENSE file present/);
  }
});

test("verify-tier reads the tier from AGENTS.md, and refuses to guess without one", () => {
  const declared = fixture();
  write(declared, "AGENTS.md", "# Agents\n\nTier: 1\n");
  assert.match(run("verify-tier.mjs", { cwd: declared }).out, /declared: Tier 1/);
  const none = run("verify-tier.mjs", { cwd: fixture() });
  assert.equal(none.code, 1);
  assert.match(none.err, /Could not determine a tier/);
});

const REPO_OK = { default_branch: "main", delete_branch_on_merge: true, security_and_analysis: { dependabot_security_updates: { status: "enabled" } } };

function settings(routes) {
  return run("verify-tier.mjs", { env: { INPUT_TIER: "0", ADMIN_TOKEN: "token", GITHUB_REPOSITORY: "o/r", MOCK_FETCH: JSON.stringify(routes) }, mock: true });
}

test("verify-tier reports required checks, and sanitizes a hostile name from the API", () => {
  const result = settings({ "repos/o/r": { body: REPO_OK }, "branches/main/protection": { body: { required_status_checks: { contexts: ["lint-markdown", "<b>evil|x"] } } } });
  assert.equal(result.code, 0);
  // Only the hostile name matches no job; lint-markdown does, and a passing check prints no detail.
  assert.match(result.out, /No workflow job reports as: \?b\?evil\?x\. A required check/);
  assert.doesNotMatch(result.out, /<b>|evil\|x/);
});

test("verify-tier handles no protection, an API error, and a missing analysis section", () => {
  assert.match(settings({ "repos/o/r": { body: REPO_OK }, "branches/main/protection": { status: 404 } }).out, /No branch protection configured/);
  assert.match(settings({ "repos/o/r": { status: 500 } }).out, /Could not complete: GET \/repos\/o\/r: 500/);
  assert.match(settings({ "repos/o/r": { body: REPO_OK }, "branches/main/protection": { status: 500 } }).out, /Could not complete/);
  assert.match(settings({ "repos/o/r": { body: { default_branch: "main" } }, "branches/main/protection": { status: 404 } }).out, /security_and_analysis not present/);
});

test("verify-tier skips the settings checks without an admin token", () => {
  assert.match(run("verify-tier.mjs", { env: { INPUT_TIER: "0" } }).out, /No admin_token secret provided/);
});

function versionCheck(pinned, routes) {
  return run("verify-tier.mjs", { env: { INPUT_TIER: "0", PLAYBOOK_RELEASE: pinned, MOCK_FETCH: JSON.stringify(routes) }, mock: true });
}

test("verify-tier warns, without failing, when a newer playbook release exists", () => {
  const result = versionCheck("v0.1.0", { "releases/latest": { body: { tag_name: "v9.0.0" } } });
  assert.equal(result.code, 0);
  assert.match(result.out, /::warning title=Newer playbook release available::.*v9\.0\.0/);
});

test("verify-tier stays quiet when the pin is current, and skips when it cannot tell", () => {
  assert.doesNotMatch(versionCheck("v1.0.0", { "releases/latest": { body: { tag_name: "v1.0.0" } } }).out, /::warning/);
  assert.match(versionCheck("v1.0.0", { "releases/latest": { body: { tag_name: "nightly" } } }).out, /Could not check for a newer release/);
  assert.match(versionCheck("v1.0.0", { "releases/latest": { status: 404 } }).out, /Could not check for a newer release/);
  assert.match(versionCheck("v1.0.0", {}).out, /Could not check for a newer release/);
  assert.match(versionCheck("main", {}).out, /PLAYBOOK_RELEASE is not set to a vX\.Y\.Z tag/);
});
