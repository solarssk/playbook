# Changelog

This changelog tracks changes to the playbook itself: what the standard recommends, tier
definitions, CI wiring, governance rules, and templates. It does not track any one adopting
repository's use of the standard. A repository that adopted an earlier version can read this
file to see what changed since then and decide whether to pick up the difference.

All notable changes are documented here. Entries are grouped under `### Added`, `### Changed`,
`### Fixed`, and `### Removed` as needed, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- `docs/ci-cookbook.md` sections 9 and 10 recommend `codecov/codecov-action` v7.1.1 and
  `SonarSource/sonarqube-scan-action` v8.2.2 (v7.0.0 and v8.2.1 before), and section 10 shows how to
  keep the SonarCloud organization key out of the repository by passing it from a repository
  variable.

### Added

- `docs/openssf.md`: OpenSSF Scorecard and Best Practices badge. Tier 2 gains a report-only
  Scorecard workflow (public repositories) and its badge; Tier 3 gains the Best Practices badge
  at the passing level (with a `verify-tier` warning when no badge is linked). Includes a copy-paste workflow, how to read the score (which checks
  map to existing standard items versus which measure team size, such as Code-Review), and an
  explicit rule that neither is a merge gate and no control is added only to move a score.
  Derived from a Tier 3 repository already running both.
- `docs/deepwiki.md`: DeepWiki as an optional navigation aid for public Tier 2+ repositories.
  It is not a checklist item and `verify-tier` does not check for it. Records why generated
  pages are never a source of truth or a security citation, that freshness is not guaranteed
  (the vendor's README claims a badge-triggered refresh its product docs do not), a valid
  `.devin/wiki.json`, and how agents should
  treat answers from its MCP server (a lead to verify, not a fact).
- README badge guidance (`docs/readme-standard.md`) covers the Scorecard, Best Practices, and
  DeepWiki badges.
- Release notification for adopters. `verify-tier` now warns (never fails) when the playbook has
  published a newer GitHub Release than the one the caller is pinned to, with an annotation
  linking to the release notes. New `.github/workflows/release.yml` publishes a GitHub Release
  from the CHANGELOG section when a `vX.Y.Z` tag is pushed, and refuses to if `PLAYBOOK_RELEASE`
  or the CHANGELOG heading disagree with the tag. Those Release notes are also what Dependabot
  usually puts in the PR that bumps a caller's pinned SHA. See `docs/ci-cookbook.md` #13.
- `verify-tier` (with `admin_token`) warns when a required status check matches no workflow job's
  reported name. Such a check never reports, so every pull request stays blocked with all checks
  green. `docs/governance.md` now describes this failure, which the earlier text only covered in
  the other direction (a renamed job).
- `verify-tier` Tier 2 check for an OpenSSF Scorecard workflow (warning only; private
  repositories can ignore it).
- Convention: a CHANGELOG entry that adds or tightens a requirement carries an
  `### Adopter action` list, by tier. See AGENTS.md.
- The playbook now holds itself to its own standard. It declares Tier 2 (a reusable workflow and
  script that other repositories run in their own CI put it there by `docs/tiers.md`, question 2),
  and a `self-verify` CI job runs `verify-tier` against it. Added to this repository's own CI:
  unit tests for the scripts, `actionlint` and `zizmor` on every workflow and on the workflow
  snippets quoted in the docs, CodeQL (JavaScript and Actions), dependency review, OSV-Scanner, an
  OpenSSF Scorecard workflow, a hash-pinned lockfile for its one Python dependency, a
  documentation-impact check on pull requests, `CONTRIBUTING.md`, and a pull request template.
  Releases now carry a source archive, `SHA256SUMS`, and a signed build provenance attestation.
- `docs/ci-cookbook.md` section 15: linting workflows with `actionlint` and `zizmor`. Tier 2 gains
  a checklist item for it, and a second one for repositories that others consume (a GitHub
  Release per version, with an "Adopter action" list). `verify-tier` gains a `workflow-lint`
  check.
- `docs/openssf.md` maps the OpenSSF Security Baseline's three levels onto the tiers and records
  where this standard deliberately differs.
- `docs/tiers.md`, question 2: a reusable workflow, action, or script that other repositories run
  counts as blast radius beyond the owner, whatever its size.
- `docs/tiers.md` gains an "At a glance" table: every requirement by tier, and the `verify-tier`
  check that covers it (or `manual`). A unit test keeps the table and `scripts/verify-tier.mjs` in
  agreement on both the set of checks and the tier each starts at. The per-tier sections gain the
  items that were only stated elsewhere: workflow hygiene (Tier 1), Dependabot `cooldown`, standard
  `type:` labels and a milestone per release, and a signed provenance attestation on a consumed
  repository's Releases (Tier 2), and the required-check-name rule moves to Tier 0, where the
  script already had it.

### Fixed

- **`docs/ci-cookbook.md` section 7 (gitleaks) had a template injection.** The recipe put
  `${{ github.base_ref }}` and other context values directly inside `run:` scripts, where they
  are substituted into the shell text before it parses. They now reach the shell through `env:`.
  The recipe also downloaded the gitleaks binary without verifying it; it now checks a SHA-256.
- Section 3 (osv-scanner) called reusable workflows at a floating tag, against this standard's
  own pinning rule, and granted `security-events: write` to the whole workflow. Both are fixed:
  pinned to a commit SHA, permission moved to the two jobs that need it.
- Section 4 and the Dependabot example in section 1 gained a `cooldown`, which `zizmor` reports as
  missing.
- `verify-tier` read `uses:` lines inside YAML comments as real steps and failed SHA-pinning on a
  workflow whose header quoted a usage example. It now ignores comments.
- `verify-tier` read a `Tier: N` line quoted inside a fenced code block as the repository's own
  declaration. Fenced blocks are now ignored.
- `verify-tier` no longer expects a `concurrency:` block on a reusable-only workflow, which takes
  it from its caller.
- The issue templates applied a `triage` label that the standard's taxonomy does not define and that
  did not exist in the repository, so GitHub dropped it silently. Removed from
  `templates/ISSUE_TEMPLATE/bug.yml`.
- **`docs/ci-cookbook.md` section 12b (documentation-impact check) had two gaps.** It exempted a PR
  whose head branch was named `dependabot/...`, which anyone can create, so it now matches the
  author only. And "No doc update needed: <state the reason>" passed with the template's own
  placeholder as the reason; a real reason is now required.
- **The section 12b workflow did not rerun when the pull request description was edited.** The
  recipe is now a workflow of its own that also runs on `edited`, and it is shown in full. This
  repository's copy moved out of `ci.yml` for the same reason.
- `verify-tier`'s `workflow-lint` check now requires both `actionlint` and `zizmor`, and names the
  missing one; either alone used to pass.
- `scripts/check_doc_snippets.py` and `verify-tier` now read Markdown fences as CommonMark defines
  them: backticks or tildes, three or more, indented under a list item or not, closed only by a run
  of the same character at least as long (and, in `verify-tier`, with at most three spaces of
  indentation and no backtick in a backtick fence's info string). Blocks written any way but three unindented backticks
  were silently skipped, and a four-backtick block quoting a `Tier: N` example could be read as the
  document's own declaration. The docs' own indented blocks are now validated.
- `verify-tier` now treats a workflow as reusable-only only when `workflow_call` is its sole
  trigger, instead of checking for a fixed list of other events, and requires a reusable-workflow
  job's required check to carry its `<caller> / <called job>` suffix. It also reads a quoted
  `PLAYBOOK_RELEASE` value.
- `templates/pull_request_template.md` offered "No doc update needed (explain why)", which the
  documentation-impact check in section 12 does not accept. It now reads
  "No doc update needed: <state the reason>".

### Adopter action

- **All tiers that copied the section 7 gitleaks recipe:** replace every `${{ ... }}` expression
  inside its `run:` blocks with an environment variable set under `env:`, and verify the
  downloaded binary's checksum. This is a real injection path, not a style point.
- **Tier 2 and above:** add `actionlint` and `zizmor` to CI (section 15), and a `cooldown` to each
  `dependabot.yml` entry. `verify-tier` warns until the linters exist.
- **Tier 2 and above:** use the standard `type:` labels (`docs/governance.md`) and a milestone per
  release. Neither is checked automatically.
- **All tiers:** untrusted context values reach the shell through `env:`, and downloaded binaries
  are checksum-verified (`docs/tiers.md`, Tier 1). `zizmor` at Tier 2 catches the first.
- **Anyone who copied the section 12b documentation-impact workflow:** add `edited` to the
  `pull_request` types (or move the job to its own workflow, as the recipe now does), so fixing the
  checkbox reruns the check.
- **Anyone who copied the section 12b documentation-impact script:** match the PR author
  (`dependabot[bot]`) instead of the branch name, and reject the untouched
  `<state the reason>` placeholder, as the recipe now does.
- **Anyone who copied the issue template:** remove `labels: ["triage"]` unless you created that
  label.
- **Anyone who copied the section 3 osv-scanner workflow:** pin the two `uses:` lines to a commit
  SHA and move `security-events: write` from the top of the file to those two jobs.
- **All tiers with branch protection:** confirm each required status check is copied from the
  Checks tab of a real pull request, not from the workflow file. A job's reported name is its
  `name:` when set, otherwise its key, and a mismatch blocks every PR silently.
- **All tiers, repositories calling `verify-tier.yml`:** keep the `github-actions` ecosystem in
  `dependabot.yml`, so a new release arrives as a pull request. Bump the pinned SHA when it does.
- **Tier 2 and above, public repositories:** add the OpenSSF Scorecard workflow from
  `docs/openssf.md` and, once it has run, its README badge. `verify-tier` warns until it exists.
- **Tier 3:** reach the OpenSSF Best Practices badge at the passing level and link it from the
  README. `verify-tier` warns until a bestpractices.dev badge is linked; it cannot check the level.
- **DeepWiki:** nothing required. Optional, see `docs/deepwiki.md`.

## [0.1.2] - 2026-09-08

### Added

- `templates/CODE_OF_CONDUCT.template.md`: a minimal Code of Conduct with a reporting section that
  solves a real gap (GitHub has no private messaging between users) by using a private security
  advisory as the reporting channel. Optional at any tier, not gated to Tier 3: verified in
  practice on a solo-maintained Tier 2 repo before being added here.
- `docs/ci-cookbook.md` section 14: a hash-pinned dependency lockfile recipe for Python
  (`pip-compile --generate-hashes`, `--require-hashes` install, dropping `pip` from the final
  image, and a CI job that regenerates the lockfile and diffs it to catch drift, including the
  gotcha that `pip-compile` must run under the same Python version as the image that actually
  ships). Previously a one-line, Tier-3-only aside buried in the Semgrep section; promoted to its
  own recipe and cross-referenced from Tier 1's dependency-pinning item, since it's a legitimate
  Tier 1/2 technique, not a Tier 3 requirement.

### Fixed

- `docs/ci-cookbook.md` section 1 overstated what Dependabot maintains automatically: a real
  Dependabot commit bumping `actions/setup-python` from v6.2.0 to v7.0.0 left a pre-existing bare
  `# v6` comment untouched, so it now names the wrong major version. Dependabot only keeps an
  already-exact `# vX.Y.Z` comment current; it does not rewrite a bare major alias on its own. The
  guidance now says to always write the exact version.
- `templates/CONTRIBUTING.template.md` referenced a Code of Conduct as a "Tier 3 flagship scope"
  item, but no tier's checklist in `docs/tiers.md` ever required one. Corrected to present it as
  optional at any tier.

## [0.1.1] - 2026-09-08

### Fixed

- `verify-tier.yml` checked out the playbook's own scripts at `${{ github.action_ref }}`, assuming
  it would resolve to the ref the calling repository used to invoke the reusable workflow. It
  doesn't: inside a `workflow_call` job it tracks the ref of the most recently executed action
  step instead, which in practice meant it resolved to `actions/checkout`'s own pinned SHA and the
  checkout failed outright on every real call. Replaced with a `PLAYBOOK_RELEASE` environment
  variable, bumped by hand alongside every tag, checked out explicitly.
- The reusable workflow's own header comment, and this doc's §13 usage example, recommended
  pinning the call to a tag (`@v0.1.0`). That's inconsistent with this repo's own SHA-pinning rule
  (§1) and with what `verify-tier.mjs` itself flags as a violation in an adopting repo. Both now
  show a commit-SHA example. The §13 example also gained an explicit `permissions:` block on the
  calling workflow, which a real adopting repo's own CI linter (zizmor) flagged as missing.

## [0.1.0] - 2026-09-05

### Added

- Initial version of the standard: the four-tier system (Tier 0 through Tier 3), the README
  standard, the CI cookbook (CodeQL, Semgrep, gitleaks, Dependabot, Trivy, Codecov, SonarCloud,
  concurrency groups, SHA-pinning, dependency vulnerability auditing), the governance guide
  (CODEOWNERS, branch protection, labels and milestones), the security-docs guide (SECURITY.md
  structure, vulnerability disclosure), and starter templates.
- Docs as source of truth: a Wiki-sync pattern (`docs/wiki/` synced to the GitHub Wiki by CI,
  never edited directly there) and a PR-time "Documentation impact" declaration, checked against
  the actual diff instead of trusted on its word. Tier 2's checklist gained the PR declaration
  item; Tier 3's wiki and security-docs items reference the sync and drift-detection patterns.
- `scripts/verify-tier.mjs` and a reusable workflow (`.github/workflows/verify-tier.yml`) that
  another repository can call to check itself against this standard's mechanically-checkable
  items automatically, without copying anything. See docs/ci-cookbook.md #13.
