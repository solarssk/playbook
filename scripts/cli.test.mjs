import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

// Runs command-line scripts as real child processes, the way CI does, against fixture
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

// File-backed routes avoid per-variable environment limits on large pagination fixtures.
// A URL that matches nothing throws, like a network failure.
const MOCK_FETCH = `data:text/javascript,${encodeURIComponent(`
import { readFileSync } from "node:fs";
const routes = JSON.parse(readFileSync(process.env.MOCK_FETCH_FILE, "utf8"));
globalThis.fetch = async (url) => {
  const key = Object.keys(routes).find((suffix) => String(url).endsWith(suffix));
  if (key === undefined) throw new Error("unmocked request");
  const { status = 200, body = {} } = routes[key];
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};`)}`;

const CLEARED = ["GITHUB_EVENT_PATH", "GITHUB_STEP_SUMMARY", "GITHUB_OUTPUT", "GITHUB_REPOSITORY", "INPUT_TIER", "ADMIN_TOKEN", "GH_TOKEN", "PLAYBOOK_RELEASE", "RELEASE_TAG", "NOTES_OUT", "MOCK_FETCH", "MOCK_FETCH_FILE", "CI_NEEDS"];

function run(script, { cwd = REPO, env = {}, mock = false } = {}) {
  const base = { ...process.env };
  for (const key of CLEARED) delete base[key];
  const childEnv = { ...base, ...env };
  if (mock) {
    const routes = join(fixture(), "fetch-routes.json");
    writeFileSync(routes, childEnv.MOCK_FETCH ?? "{}");
    delete childEnv.MOCK_FETCH;
    childEnv.MOCK_FETCH_FILE = routes;
  }
  const args = mock ? ["--import", MOCK_FETCH] : [];
  const result = spawnSync(process.execPath, [...args, join(SCRIPTS, script)], { cwd, env: childEnv, encoding: "utf8" });
  if (result.error) throw result.error;
  return { code: result.status, out: result.stdout, err: result.stderr };
}

// ---------- release-check ----------

function releaseFixture({ pin = "v1.2.3", ref = "${{ job.workflow_sha }}", changelog = "## [Unreleased]\n\n## [1.2.3] - 2026-01-01\n\n- a change\n" } = {}) {
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

test("release-check rejects tags, fixed commits and caller-context checkout refs", () => {
  for (const ref of ["v1.2.3", SHA, "${{ github.sha }}", "${{ github.workflow_sha }}"]) {
    const result = run("release-check.mjs", { cwd: releaseFixture({ ref }) });
    assert.equal(result.code, 1, ref);
    assert.match(result.err, /checkout's ref must be job.workflow_sha/);
  }
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

test("verify-tier accepts every supported explicit tier", () => {
  for (const tier of ["0", "1", "2", "3"]) {
    const result = run("verify-tier.mjs", { env: { INPUT_TIER: tier } });
    assert.equal(result.code, 0, `tier ${tier}`);
    assert.match(result.out, new RegExp(`declared: Tier ${tier}\\)`));
  }
});

test("verify-tier rejects invalid explicit tiers before running any checks", () => {
  for (const tier of [
    "abc", "-1", "4", "NaN", "", "2.5", "-0", "02", " 2", "2 ", "0x2", "3e0",
    "2\n::error::untrusted",
  ]) {
    const result = run("verify-tier.mjs", { env: { INPUT_TIER: tier } });
    assert.equal(result.code, 1, `tier ${JSON.stringify(tier)}`);
    assert.equal(result.out, "", `tier ${JSON.stringify(tier)} must not run checks`);
    assert.match(result.err, /Invalid tier input/);
    assert.doesNotMatch(result.err, /::error::untrusted/);
  }
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
  assert.match(run("verify-tier.mjs", { cwd: declared, env: { INPUT_TIER: "auto" } }).out, /declared: Tier 1/);
  const claude = fixture();
  write(claude, "CLAUDE.md", "Tier: 2\n");
  assert.match(run("verify-tier.mjs", { cwd: claude }).out, /declared: Tier 2/);
  const none = run("verify-tier.mjs", { cwd: fixture() });
  assert.equal(none.code, 1);
  assert.match(none.err, /Could not determine a tier/);
});

test("verify-tier rejects malformed tier declarations in auto mode", () => {
  for (const declaration of ["Tier: 4", "Tier: -1", "Tier: NaN", "Tier:", "Tier:\n2", "Tier: 2.5"]) {
    const dir = fixture();
    write(dir, "AGENTS.md", `# Agents\n\n${declaration}\n`);
    const result = run("verify-tier.mjs", { cwd: dir });
    assert.equal(result.code, 1, declaration);
    assert.equal(result.out, "", declaration);
    assert.match(result.err, /Could not determine a tier/);
  }
});

test("verify-tier does not fall back to CLAUDE.md when AGENTS.md has an invalid tier", () => {
  const dir = fixture();
  write(dir, "AGENTS.md", "Tier: 4\n");
  write(dir, "CLAUDE.md", "Tier: 2\n");
  const result = run("verify-tier.mjs", { cwd: dir });
  assert.equal(result.code, 1);
  assert.equal(result.out, "");
  assert.match(result.err, /Could not determine a tier/);
});

test("verify-tier uses an explicit tier instead of a malformed declaration", () => {
  const dir = fixture();
  write(dir, "AGENTS.md", "Tier: 4\n");
  write(dir, "LICENSE", "license\n");
  write(dir, ".github/CODEOWNERS", "* @<maintainer-handle>\n");
  const result = run("verify-tier.mjs", { cwd: dir, env: { INPUT_TIER: "0" } });
  assert.equal(result.code, 0);
  assert.match(result.out, /declared: Tier 0/);
});

const REPO_OK = { default_branch: "main", delete_branch_on_merge: true, security_and_analysis: { dependabot_security_updates: { status: "enabled" } } };

// The GraphQL reply for the default branch: a protection rule with these required checks, or none.
const protectionReply = (contexts, name = "main") => ({ body: { data: { repository: { defaultBranchRef: { name, branchProtectionRule: contexts === null ? null : { requiredStatusCheckContexts: contexts } } } } } });
const RULES = "rules/branches/main?per_page=100&page=1";
const statusRule = (...contexts) => ({ type: "required_status_checks", parameters: { required_status_checks: contexts.map((context) => ({ context })) } });

function settings(routes, extraEnv = {}, cwd = REPO) {
  return run("verify-tier.mjs", { cwd, env: { INPUT_TIER: "0", ADMIN_TOKEN: "token", GITHUB_REPOSITORY: "o/r", MOCK_FETCH: JSON.stringify({ [RULES]: { body: [] }, ...routes }), ...extraEnv }, mock: true });
}

test("verify-tier reports required checks, and sanitizes a hostile name from the API", () => {
  const result = settings({ "repos/o/r": { body: REPO_OK }, "graphql": protectionReply(["lint-markdown", "<b>evil|x"]) });
  assert.equal(result.code, 0);
  // Only the hostile name matches no job; lint-markdown does, and a passing check prints no detail.
  assert.match(result.out, /No workflow job reports as: \?b\?evil\?x\. A required check/);
  assert.doesNotMatch(result.out, /<b>|evil\|x/);
});

test("verify-tier handles no protection, API errors, and a missing analysis section", () => {
  assert.match(settings({ "repos/o/r": { body: REPO_OK }, graphql: protectionReply(null) }).out, /No required status checks found/);
  assert.match(settings({ "repos/o/r": { status: 500 } }).out, /Could not complete: GET \/repos\/o\/r: 500/);
  assert.match(settings({ "repos/o/r": { body: REPO_OK }, graphql: { status: 500 } }).out, /Could not complete: POST graphql: 500/);
  assert.match(settings({ "repos/o/r": { body: REPO_OK }, graphql: { body: { errors: [{ message: "x" }] } } }).out, /the branch protection query returned errors/);
  assert.match(settings({ "repos/o/r": { body: { delete_branch_on_merge: true } }, graphql: protectionReply(null) }).out, /security_and_analysis not present/);
});

test("verify-tier accepts Rulesets-only protection and combines it with classic checks", () => {
  for (const classic of [null, ["lint-markdown"]]) {
    const result = settings({
      "repos/o/r": { body: REPO_OK }, graphql: protectionReply(classic),
      [RULES]: { body: [statusRule("test")] },
    });
    assert.match(result.out, /\| ✅ pass \| Required CI checks protected/);
    assert.match(result.out, /\| ✅ pass \| Every required status check/);
  }
});

test("verify-tier never passes empty protection or unknown Rulesets", () => {
  const empty = settings({ "repos/o/r": { body: REPO_OK }, graphql: protectionReply([]) });
  assert.match(empty.out, /No required status checks found/);
  assert.doesNotMatch(empty.out, /\| ✅ pass \| Every required status check/);
  for (const response of [{ status: 403 }, { status: 404 }, { status: 429 }, { body: {} }, { body: [statusRule(null)] }]) {
    const result = settings({ "repos/o/r": { body: REPO_OK }, graphql: protectionReply(["test"]), [RULES]: response });
    assert.match(result.out, /Protection could not be fully assessed/);
    assert.doesNotMatch(result.out, /\| ✅ pass \| (Required CI checks protected|Every required status check)/);
    assert.equal(result.code, 0);
  }
});

test("verify-tier paginates inherited branch rules and checks their names", () => {
  const firstPage = Array.from({ length: 100 }, () => ({ type: "pull_request" }));
  const result = settings({
    "repos/o/r": { body: REPO_OK }, graphql: protectionReply(null),
    [RULES]: { body: firstPage },
    "rules/branches/main?per_page=100&page=2": { body: [{ ...statusRule("misspelled-job"), ruleset_source_type: "Organization" }] },
  });
  assert.match(result.out, /No workflow job reports as: misspelled-job/);
  assert.match(result.out, /\| ✅ pass \| Required CI checks protected/);
});

test("verify-tier leaves unbounded pagination explicitly incomplete", () => {
  const pages = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
    `rules/branches/main?per_page=100&page=${index + 1}`,
    { body: Array.from({ length: 100 }, () => ({ type: "pull_request" })) },
  ]));
  const result = settings({ "repos/o/r": { body: REPO_OK }, graphql: protectionReply(["test"]), ...pages });
  assert.match(result.out, /pagination exceeded the safety limit/);
  assert.match(result.out, /Protection could not be fully assessed/);
});

test("verify-tier encodes branch names and rejects path-changing API values", () => {
  const encoded = settings({
    "repos/o/r": { body: REPO_OK }, graphql: protectionReply(null, "release/current"),
    "rules/branches/release%2Fcurrent?per_page=100&page=1": { body: [statusRule("test")] },
  });
  assert.match(encoded.out, /\| ✅ pass \| Required CI checks protected/);
  const invalid = settings({ "repos/o/r": { body: REPO_OK }, graphql: protectionReply([], "../other") });
  assert.match(invalid.out, /Invalid default branch name/);
  assert.match(invalid.out, /Protection could not be fully assessed/);
});

test("verify-tier reports unknown classic data even when Rulesets are readable", () => {
  const result = settings({
    "repos/o/r": { body: REPO_OK }, graphql: { status: 403 },
    [RULES]: { body: [statusRule("test")] },
  });
  assert.match(result.out, /POST graphql: 403/);
  assert.match(result.out, /Known check names match, but protection data is incomplete/);
});

test("verify-tier does not pass malformed repository metadata", () => {
  const result = settings({
    "repos/o/r": { body: { ...REPO_OK, delete_branch_on_merge: "false" } },
    graphql: protectionReply(["test"]),
  });
  assert.match(result.out, /Invalid repository settings response/);
  assert.doesNotMatch(result.out, /\| ✅ pass \| Automatically delete head branches/);
  assert.match(result.out, /\| ✅ pass \| Required CI checks protected/);
});

test("verify-tier does not require protection before CI exists", () => {
  const result = settings({ "repos/o/r": { body: REPO_OK }, graphql: protectionReply(null) }, {}, fixture());
  assert.match(result.out, /Tier 0 requires CI protection once CI exists/);
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

test("verify-tier writes nothing that came from the network into the step-summary file", () => {
  const summary = join(fixture(), "summary.md");
  const routes = {
    "repos/o/r": { body: { ...REPO_OK, security_and_analysis: { dependabot_security_updates: { status: "<i>weird</i>" } } } },
    "graphql": protectionReply(["<b>evil|x"]),
    "releases/latest": { body: { tag_name: "v9.0.0" } },
  };
  const result = settings(routes, { PLAYBOOK_RELEASE: "v0.1.0", GITHUB_STEP_SUMMARY: summary });
  const file = readFileSync(summary, "utf8");
  assert.doesNotMatch(file, /evil|weird|v9\.0\.0/);
  assert.match(file, /The job log lists them/);
  assert.match(file, /The job log names it/);
  // The job log still gets the detail, sanitized.
  assert.match(result.out, /No workflow job reports as: \?b\?evil\?x/);
  assert.match(result.out, /Status: \?i\?weird\?\/i\?/);
});

test("verify-tier rejects a repository name that could change the request path", () => {
  assert.match(settings({}, { GITHUB_REPOSITORY: "o/../x" }).out, /GITHUB_REPOSITORY is not an owner\/repository name/);
  assert.match(settings({}, { GITHUB_REPOSITORY: "o/r?x=1" }).out, /GITHUB_REPOSITORY is not an owner\/repository name/);
});

test("verify-tier exposes partial and failed assessments without changing exit semantics", () => {
  const output = join(fixture(), "outputs");
  const passed = run("verify-tier.mjs", { env: { INPUT_TIER: "2", GITHUB_OUTPUT: output } });
  assert.equal(passed.code, 0);
  assert.equal(readFileSync(output, "utf8"), "automated_checks=passed\nassessment=partial\n");
  assert.match(passed.out, /does not certify full Tier compliance/);
  const failed = run("verify-tier.mjs", { cwd: fixture(), env: { INPUT_TIER: "0", GITHUB_OUTPUT: output } });
  assert.equal(failed.code, 1);
  assert.match(readFileSync(output, "utf8"), /automated_checks=failed\nassessment=failed\n$/);
});

test("verify-tier never certifies scanner execution, disabled steps or quality gates from text", () => {
  for (const workflow of [
    "# gitleaks osv-scanner semgrep actionlint zizmor ossf/scorecard-action zap sonarcloud\n",
    "on: push\njobs:\n  scan:\n    if: false\n    steps:\n      - run: echo gitleaks osv-scanner semgrep actionlint zizmor ossf/scorecard-action zap sonarcloud\n",
  ]) {
    const dir = fixture();
    write(dir, ".github/workflows/ci.yml", workflow);
    write(dir, "codecov.yml", "coverage: {}\n");
    const result = run("verify-tier.mjs", { cwd: dir, env: { INPUT_TIER: "3" } });
    for (const id of ["secret-scan", "dependency-audit", "sast", "workflow-lint", "scorecard", "dast", "coverage-or-quality-gate"]) {
      const row = result.out.split("\n").find((line) => line.endsWith(`| ${id} |`));
      assert.match(row, /^\| ⚠️ warn /, id);
    }
  }
});

test("required-ci fails for empty, failed, cancelled, skipped and malformed results", () => {
  assert.equal(run("check-required-ci.mjs", { env: { CI_NEEDS: '{"test":{"result":"success"}}' } }).code, 0);
  for (const input of ["", "not-json", "null", "[]", "{}", '{"test":{}}',
    '{"test":{"result":"failure"}}', '{"test":{"result":"cancelled"}}', '{"test":{"result":"skipped"}}',
    '{"test":{"result":"success"},"lint":{"result":"failure"}}']) {
    assert.equal(run("check-required-ci.mjs", { env: { CI_NEEDS: input } }).code, 1, input);
  }
});
