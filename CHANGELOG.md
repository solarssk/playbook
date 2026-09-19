# Changelog

This changelog tracks changes to the playbook itself: what the standard recommends, tier
definitions, CI wiring, governance rules, and templates. It does not track any one adopting
repository's use of the standard. A repository that adopted an earlier version can read this
file to see what changed since then and decide whether to pick up the difference.

All notable changes are documented here. Entries are grouped under `### Added`, `### Changed`,
`### Fixed`, and `### Removed` as needed, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-09-19

Version 0.1.2 was never tagged, so the changes listed under it in CHANGELOG.md ship in this release
too.

### Adopter action

Security fixes first, then the new requirements by tier.

**If you copied a recipe from this playbook, check it against these fixes:**

- **Section 7 (gitleaks) had a template injection.** Replace every `${{ ... }}` expression inside its
  `run:` blocks with an environment variable set under `env:`, and verify the downloaded binary's
  checksum before it runs.
- **Section 12b (documentation-impact check):** match the PR author (`dependabot[bot]`), not the
  branch name; reject the untouched `<state the reason>` placeholder; and run the check on `edited`
  too, as its own workflow, so fixing the checkbox reruns it.
- **Section 3 (osv-scanner):** pin the two `uses:` lines to a commit SHA, and give each job
  `actions: read`, `contents: read`, and `security-events: write` instead of granting
  `security-events: write` to the whole workflow.
- **Issue template:** remove `labels: ["triage"]` unless you created that label.

**All tiers:**

- Copy each required status check from the Checks tab of a real pull request, not from the workflow
  file. A job's reported name is its `name:` when set, otherwise its key, and a mismatch blocks every
  PR silently.
- Untrusted context values reach the shell through `env:`, and downloaded binaries are
  checksum-verified over HTTPS.
- If you call `verify-tier.yml`: keep the `github-actions` ecosystem in `dependabot.yml`, and bump
  the pinned SHA when the release arrives. This release fixes security findings in the script it
  runs (see Fixed), so do not leave the bump waiting. `verify-tier` now warns when a newer release exists and
  when a required check matches no job.

**Tier 2 and above:**

- Lint workflows with both `actionlint` and `zizmor` (section 15), and add a `cooldown` to each
  `dependabot.yml` entry.
- Use the standard `type:` labels (`docs/governance.md`) and a milestone per release.
- On a public repository, add the OpenSSF Scorecard workflow from `docs/openssf.md`, and its README
  badge once the first run has published.
- If other repositories consume yours: publish a GitHub Release per version, with an "Adopter
  action" list like this one.

**Tier 3:** link an OpenSSF Best Practices badge (passing level) from the README. `verify-tier`
warns until one is linked; it cannot check the level.

**DeepWiki:** nothing required. Optional, see `docs/deepwiki.md`.

### Added

- `docs/tiers.md` opens with an "At a glance" table: every requirement by tier and the `verify-tier`
  check that covers it (or `manual`). A unit test keeps the table and the script in agreement.
- `docs/openssf.md`: the OpenSSF Scorecard workflow (report-only, Tier 2, public repositories) with
  how to read the score; the Best Practices badge (Tier 3, passing level); and a mapping of the
  Security Baseline's levels onto the tiers.
- `docs/deepwiki.md`: DeepWiki as an optional navigation aid for public repositories. Never a source
  of truth or a security citation, and its freshness is not guaranteed.
- `docs/ci-cookbook.md` section 15: linting workflows with `actionlint` and `zizmor`.
- Release notification for adopters. `release.yml` publishes a GitHub Release from the CHANGELOG
  section when a `vX.Y.Z` tag is pushed, with a source archive, `SHA256SUMS`, and a signed build
  provenance attestation, and refuses to if the tag, `PLAYBOOK_RELEASE`, the playbook checkout's `ref:`, and the CHANGELOG
  disagree.
  `verify-tier` warns when a newer Release exists than the one a caller is pinned to. The
  "Adopter action" list is the convention that makes the notes useful.
- New `verify-tier` checks, all warnings: `playbook-version`, `required-check-names` (with an admin
  token), `workflow-lint`, `scorecard`, and `best-practices-badge`.
- The playbook now holds itself to its own standard at Tier 2, enforced by a `self-verify` CI job,
  with unit and end-to-end tests of its scripts, coverage in Codecov and SonarCloud,
  `actionlint`, `zizmor`, CodeQL, dependency review, OSV-Scanner, a Scorecard workflow,
  `CONTRIBUTING.md`, and a pull request template.

### Changed

- `docs/tiers.md`, question 2: a reusable workflow, action, or script that other repositories run
  counts as blast radius beyond the owner, whatever its size.
- The required-check-name rule is Tier 0, and `docs/governance.md` now describes the failure where a
  required check never reports and every PR stays blocked with no error.
- `docs/ci-cookbook.md` sections 9 and 10 recommend `codecov/codecov-action` v7.1.1 and
  `SonarSource/sonarqube-scan-action` v8.2.2 (v7.0.0 and v8.2.1 before), and section 10 shows how to
  keep the SonarCloud organization key out of the repository by passing it from a repository
  variable.
- Dependabot examples carry a `cooldown`. README badge guidance covers Scorecard, Best Practices,
  and DeepWiki. The PR template option reads "No doc update needed: <state the reason>", which is
  what the documentation-impact check accepts.

### Fixed

- Recipe defects listed under "Adopter action": the section 7 injection, the section 3 pinning and
  permissions, the three section 12b gaps, and the issue template's `triage` label.
- **`verify-tier` security fixes, found by CodeQL.** Its summary table escaped `|` but not `\`, so a
  trailing backslash could break out of a cell. Text returned by the GitHub API (required check
  names, a status) was written into the step summary unfiltered; it now passes an allowlist that
  drops every character Markdown or HTML acts on. And the playbook checkout's `ref:` in
  `verify-tier.yml` is a literal, not an expression, which `release-check` keeps equal to
  `PLAYBOOK_RELEASE`. These run in every repository that calls `verify-tier.yml`, so callers should
  bump to this release.
- `verify-tier` read `uses:` lines inside YAML comments as real steps, read a `Tier: N` line quoted
  in a fenced code block as the repository's own declaration, and expected a `concurrency:` block on
  a reusable-only workflow. Fenced blocks are read as CommonMark defines them.

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
