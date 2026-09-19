# Changelog

This changelog tracks changes to the playbook itself: what the standard recommends, tier
definitions, CI wiring, governance rules, and templates. It does not track any one adopting
repository's use of the standard. A repository that adopted an earlier version can read this
file to see what changed since then and decide whether to pick up the difference.

All notable changes are documented here. Entries are grouped under `### Added`, `### Changed`,
`### Fixed`, and `### Removed` as needed, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `docs/openssf.md`: OpenSSF Scorecard and Best Practices badge. Tier 2 gains a report-only
  Scorecard workflow (public repositories) and its badge; Tier 3 gains the Best Practices badge
  at the passing level. Includes a copy-paste workflow, how to read the score (which checks
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
- `verify-tier` Tier 2 check for an OpenSSF Scorecard workflow (warning only; private
  repositories can ignore it).
- Convention: a CHANGELOG entry that adds or tightens a requirement carries an
  `### Adopter action` list, by tier. See AGENTS.md.

### Adopter action

- **All tiers, repositories calling `verify-tier.yml`:** keep the `github-actions` ecosystem in
  `dependabot.yml`, so a new release arrives as a pull request. Bump the pinned SHA when it does.
- **Tier 2 and above, public repositories:** add the OpenSSF Scorecard workflow from
  `docs/openssf.md` and, once it has run, its README badge. `verify-tier` warns until it exists.
- **Tier 3:** reach the OpenSSF Best Practices badge at the passing level. Not checked
  automatically.
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
