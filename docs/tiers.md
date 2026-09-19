# The tier system

Every repository gets more maintenance ceremony as it grows: more CI checks, more governance
files, more process. The mistake most "engineering standards" documents make is picking one
target, usually whatever the most mature project in the org already does, and treating it as the
bar for everything. Applying a flagship SaaS product's checklist to a two-file configuration repo
is cargo-culting, not rigor. Nobody reads a DAST scan report for a repo with no running service,
and a CycloneDX SBOM for a repo with zero dependencies is theater.

This document defines four tiers. Each tier is **strictly additive** on the one before it. Tier 2
requires everything in Tier 1 plus its own list, not a different list. A repository's tier is a
property of what it *is* (its blast radius, its audience, what it ships), not of how long it's
existed or how much anyone likes it.

- [How to pick a tier](#how-to-pick-a-tier)
- [At a glance](#at-a-glance)
- [Tier 0: every repository](#tier-0-every-repository)
- [Tier 1: small, single-purpose tools](#tier-1-small-single-purpose-tools)
- [Tier 2: public tools with real dependents](#tier-2-public-tools-with-real-dependents)
- [Tier 3: flagship](#tier-3-flagship)
- [Moving between tiers](#moving-between-tiers)

## How to pick a tier

Ask these questions in order. Stop at the first "yes."

1. **Does it run as a service, ship a container image, or handle another party's credentials,
   PII, or money?** Then at least Tier 2.
2. **Does more than one person depend on it working correctly, or does breaking it have a blast
   radius beyond the repository owner?** Then at least Tier 2. A reusable workflow, action, or
   script that other repositories run in their own CI counts: it executes with their tokens, so
   size and age do not lower its tier.
3. **Is it a single script, a configuration file, or a narrow personal-infrastructure bridge with
   one maintainer and few or no other users?** Then Tier 1.
4. **Is it empty, a placeholder, or pre-code?** Then Tier 0 only, until there's something to tier.

Tier 3 isn't something you pick. A repository earns it by actually operating at flagship scale:
multiple services, an install base beyond the maintainer, compliance or audit obligations. Don't
promote a repository to Tier 3 to feel thorough. Promote it when Tier 2 is visibly insufficient
for what the repository has become.

When unsure between two tiers, undershoot. It's cheap to add a control later when a project's
scope grows. It's expensive to maintain SAST/SBOM/DAST machinery nobody looks at for a project
that never grew into needing it. A pile of unread security-scan artifacts is not a security
posture.

## At a glance

Every requirement, by tier. `✓` means required at that tier and every tier above it (the tiers are
additive). `if ...` means required only when the condition holds. `opt` means optional, never
required. The last column names the `verify-tier` check that covers it; `manual` means no automatic
check exists and a reviewer has to look. A unit test keeps this table and
`scripts/verify-tier.mjs` in agreement, so a check cannot be added, moved, or dropped in one
without the other.

| Requirement | 0 | 1 | 2 | 3 | verify-tier |
|---|---|---|---|---|---|
| `LICENSE` file that matches the README | ✓ | ✓ | ✓ | ✓ | `license` |
| `.github/CODEOWNERS` | ✓ | ✓ | ✓ | ✓ | `codeowners` |
| README opens with what and why | ✓ | ✓ | ✓ | ✓ | `readme-opens-well` (warns, needs a human) |
| Dependabot security updates on (setting) | ✓ | ✓ | ✓ | ✓ | `dependabot-security-updates` (admin token) |
| Delete head branches on merge (setting) | ✓ | ✓ | ✓ | ✓ | `delete-branch-on-merge` (admin token) |
| Branch protection on the default branch | ✓ | ✓ | ✓ | ✓ | `branch-protection` (admin token) |
| Required status checks match the names jobs report | ✓ | ✓ | ✓ | ✓ | `required-check-names` (admin token) |
| Pinned to the latest playbook release | if calling `verify-tier` | if calling `verify-tier` | if calling `verify-tier` | if calling `verify-tier` | `playbook-version` |
| Minimal CI (lint plus build or syntax check) | | ✓ | ✓ | ✓ | `ci-exists` |
| Actions pinned to a commit SHA | | ✓ | ✓ | ✓ | `sha-pinned` |
| Least-privilege `permissions:` | | ✓ | ✓ | ✓ | `permissions-block` |
| Workflow hygiene: untrusted values reach the shell through `env:`, downloads are checksum-verified | | ✓ | ✓ | ✓ | manual (`zizmor` at Tier 2) |
| Dependency vulnerability audit in CI | | ✓ | ✓ | ✓ | `dependency-audit` |
| Dependencies pinned in the manifest | | ✓ | ✓ | ✓ | manual |
| Secret scan in CI | | ✓ | ✓ | ✓ | `secret-scan` |
| `SECURITY.md` with private reporting | | ✓ | ✓ | ✓ | `security-md` |
| One structured issue template | | ✓ | ✓ | ✓ | `issue-template` |
| Tests and type checks in CI | | | ✓ | ✓ | manual |
| SAST (CodeQL and/or Semgrep) | | | ✓ | ✓ | `sast` |
| Workflows linted (actionlint and zizmor) | | | ✓ | ✓ | `workflow-lint` |
| Dependabot on every ecosystem in use, with a cooldown | | | ✓ | ✓ | manual |
| Container image scanned before it is pushed | | | if it publishes an image | if it publishes an image | manual |
| SBOM for a published image | | | if it publishes an image | if it publishes an image | manual |
| `concurrency:` on every workflow | | | ✓ | ✓ | `concurrency` |
| `CONTRIBUTING.md` | | | ✓ | ✓ | `contributing` |
| Pull request template | | | ✓ | ✓ | `pr-template` |
| Documentation impact section, checked in CI | | | ✓ | ✓ | `docs-impact-section` |
| README badge row | | | ✓ | ✓ | `readme-badges` |
| OpenSSF Scorecard workflow, report-only | | | if public | if public | `scorecard` |
| A GitHub Release per version, with an "Adopter action" list | | | if others consume it | if others consume it | manual |
| `type:` labels, and a milestone per release | | | ✓ | ✓ | manual |
| DAST against a running instance | | | | ✓ | `dast` |
| Coverage gate and code-quality gate | | | | ✓ | `coverage-or-quality-gate` |
| User-facing wiki synced from the repository | | | | ✓ | manual |
| Auditor-facing security documentation | | | | ✓ | manual |
| Per-version release notes | | | | ✓ | `per-version-changelog` |
| OpenSSF Best Practices badge, passing level | | | | ✓ | `best-practices-badge` |
| DeepWiki index of a public repository | | | opt | opt | manual, never required |

The sections below say why each item exists and how to meet it. Nothing is required at a tier that
this table does not list, and nothing is listed here that the sections below do not explain.

## Tier 0: every repository

Applies to all repositories without exception, including empty or placeholder ones. These are
repo-settings toggles and file hygiene: near-zero effort, no CI required.

- [ ] `LICENSE` file present, and it says what the README claims. A README that says "MIT" with
      no `LICENSE` file is a real legal gap, not a formality: without the file, default
      all-rights-reserved copyright applies regardless of what any prose says.
- [ ] `.github/CODEOWNERS` present. A single line is enough (`* @<handle>`). See
      [governance.md](governance.md) for when path-specific ownership is worth the complexity.
- [ ] Dependabot security updates enabled in repository settings. This is a settings toggle, not
      a file, and costs nothing even before a `dependabot.yml` exists or the repo has any
      dependencies yet.
- [ ] "Automatically delete head branches" enabled in repository settings, unless the repository
      deliberately uses a workflow that needs branches to survive past merge (a native
      stacked-PR workflow, for example). If so, that reason is written down somewhere a future
      maintainer will find it, not left as tribal knowledge.
- [ ] Branch protection on the default branch once *any* CI exists, requiring at least the CI's
      own status checks to pass before merge. Required PR review count can reasonably stay at 0
      for a solo-maintained repository (there's no one to require review from), but that should
      be a deliberate choice, revisited the moment a second person gets write access, not a
      permanent default. Each required check is the name a job actually reports, copied from the
      Checks tab of a real pull request: a name that no job reports never arrives, and every pull
      request then stays blocked with no error. See [governance.md](governance.md#branch-protection).
- [ ] The README opens with what the project is and why it exists, before any setup instructions.
      See [readme-standard.md](readme-standard.md).

## Tier 1: small, single-purpose tools

A CLI, a configuration file, a narrow bridge between two systems. One maintainer, few or no
external users. Everything in Tier 0, plus:

- [ ] Minimal CI: lint plus a build or syntax check, on push and pull request. It doesn't need to
      be elaborate. For a single-file tool, "does it still parse and compile" is a legitimate
      whole CI pipeline.
- [ ] GitHub Actions pinned to a commit SHA, not a floating tag, with the version as a trailing
      comment. See [ci-cookbook.md](ci-cookbook.md#1-pin-github-actions-to-a-commit-sha). While
      you're touching workflow triggers, never combine `pull_request_target` with checking out a
      fork's PR head unless there's an explicit approval gate in between: that combination hands
      an external contributor's PR the target workflow's secrets. Use `pull_request` instead when
      in doubt.
- [ ] Explicit least-privilege `permissions:` block (`contents: read` unless a job genuinely needs
      more).
- [ ] Workflow hygiene. Context values an outsider can influence (a branch name, a PR title) reach
      the shell through `env:`, never through `${{ }}` inside a `run:` block, where they become
      code. A binary downloaded in CI is verified against a checksum before it runs, over HTTPS
      only. See [ci-cookbook.md](ci-cookbook.md#7-gitleaks-ci-secret-scanning-not-a-replacement-for-platform-scanning)
      for both in a working recipe. Tier 2's workflow linter checks the first automatically.
- [ ] A dependency vulnerability audit (`pip-audit`, `npm audit`, `osv-scanner`, or the
      equivalent) as a CI step, not just the passive Dependabot alert from Tier 0. See
      [ci-cookbook.md](ci-cookbook.md#3-dependency-vulnerability-audit-pip-audit-npm-audit-osv-scanner).
      This is the single cheapest, most legible control on this list: seconds of CI time against
      an already-pinned dependency set, and it's the one check a stranger can reproduce
      unassisted against bare source. Start report-only if the tool's unfixable-transitive-CVE
      false-positive rate is a concern; gate on it once that's been confirmed quiet.
- [ ] Dependencies version-pinned in the manifest, not left to float on every install. A plain
      pinned or upper-bounded version specifier satisfies this. A hash-pinned lockfile is a
      stronger, optional technique, worth adopting once a repo ships an artifact where the exact
      resolved dependency set matters (usually Tier 2). See
      [ci-cookbook.md](ci-cookbook.md#14-hash-pinned-dependency-lockfile-python-pip-compile) for
      the Python recipe.
- [ ] A minimal CI secret-scan step (gitleaks or equivalent), scoped to the pull request's own
      commit range, not a full-history scan. See
      [ci-cookbook.md](ci-cookbook.md#7-gitleaks-ci-secret-scanning-not-a-replacement-for-platform-scanning).
      This complements, not replaces, the platform-level secret scanning and push protection
      settings from Tier 0.
- [ ] A short `SECURITY.md` pointing at private vulnerability reporting. See
      [security-docs.md](security-docs.md#tier-1-minimum). This is the one Tier 0-to-1 item
      that's a real file, not just a toggle, because "how do I report a security issue" has no
      sane settings-only answer.
- [ ] One structured issue template. A single combined bug/feature form is enough; a full type
      taxonomy isn't needed yet.

## Tier 2: public tools with real dependents

Ships a container image or package others install, has actual users beyond the maintainer, or
handles credentials or PII. Everything in Tier 1, plus:

- [ ] Full CI: tests and type-checking on top of Tier 1's lint, dependency audit, and secret-scan
      steps. See [ci-cookbook.md](ci-cookbook.md).
- [ ] SAST (CodeQL and/or Semgrep) on pull request and on a weekly schedule.
- [ ] Workflows linted in CI with both actionlint (correctness) and zizmor (safety: template
      injection, unpinned actions, excessive permissions). Workflow files run with a token and
      almost nothing reviews them like code. See
      [ci-cookbook.md](ci-cookbook.md#15-linting-workflows-actionlint-and-zizmor).
- [ ] Dependabot covering *every* ecosystem actually in use: application dependencies,
      `github-actions`, and any Docker base image(s), including a deploy/compose stack's images
      when those are separate from the application's own `Dockerfile`. Every entry carries a
      `cooldown`, so a version published minutes ago is not proposed before it has had time to be
      pulled if compromised. See [ci-cookbook.md](ci-cookbook.md#4-dependabot-one-file-every-ecosystem). This is the single most
      common gap this scheme's originating audit found: a repo watching its own `Dockerfile` but
      not the Postgres, Redis, or nginx images its compose stack actually runs.
- [ ] If a container image is published, a vulnerability scan (Trivy or equivalent) of the
      **actual artifact that gets pushed**, before it's pushed, blocking on HIGH/CRITICAL
      findings. Not a separate, throwaway CI-only build that never reaches users. Scanning the
      wrong artifact is a common, easy-to-miss gap.
- [ ] If a container image is published, a Software Bill of Materials (SBOM, CycloneDX or SPDX)
      generated for it on release. Once the Trivy scan above exists, this is a marginal addition,
      the same scan step produces both, not a second toolchain. A repo with a real downstream
      install base has an actual audience for this document; a repo with no built artifact
      doesn't, which is why this stays gated on "publishes a container image" rather than
      applying to every Tier 2 repo unconditionally.
- [ ] `concurrency:` groups on every workflow, with the release/publish distinction from
      [ci-cookbook.md](ci-cookbook.md#2-concurrency-groups-cancel-on-supersede-vs-never-cancel-a-release):
      a release-publishing workflow must never be configured to cancel an in-progress run, only to
      queue behind it.
- [ ] `CONTRIBUTING.md`, a pull request template, and CODEOWNERS.
- [ ] If other repositories consume it (a reusable workflow, an action, a template set): a
      GitHub Release per version, not just a tag, with notes that say what a repository already
      following it must change (an "Adopter action" list), a source archive with a checksums file,
      and a signed build provenance attestation. The Release is what adopters and Dependabot are
      notified by; a bare tag notifies no one. See
      [ci-cookbook.md](ci-cookbook.md#13-verifying-a-repo-against-this-standard-automatically).
- [ ] A "Documentation impact" section in the PR template, checked in CI against the actual diff
      rather than trusted on its word. See
      [ci-cookbook.md](ci-cookbook.md#12-docs-as-source-of-truth-and-catching-stale-docs-at-pr-time).
      Cheap, doesn't need a Wiki, and catches the specific, recurring failure mode of a PR
      changing something a doc describes without anyone remembering to update the doc.
- [ ] Branch protection actually enforced: required status checks that are genuinely required,
      not merely present as unenforced workflow files, and the list is kept current as jobs are
      added or renamed.
- [ ] Issues and pull requests carry the standard `type:` labels, and a milestone groups the work
      for each release once the repository cuts versions. Start lean; see
      [governance.md](governance.md#labels-and-milestones).
- [ ] A README badge row: CI status, license, latest release, and container platforms if
      applicable.
- [ ] On public repositories, an OpenSSF Scorecard workflow, report-only, plus its badge once the
      first run has published a result. Most of what Scorecard scores is already on this list, so
      it is an independent check of existing items, not a new burden. See
      [openssf.md](openssf.md).

Optional at this tier, not a checklist item: a DeepWiki index of a public repository. See
[deepwiki.md](deepwiki.md) for why it is a navigation aid and never documentation.

## Tier 3: flagship

Multiple coordinated services, a real install base beyond the maintainer, or compliance or audit
obligations (handling regulated data, a customer-facing security review process). Everything in
Tier 2, plus:

- [ ] DAST (dynamic scanning against a running instance). Report-only is a reasonable starting
      point; making it a merge gate is a deliberate later decision, not a default.
- [ ] A coverage gate (Codecov, for example) and a code-quality gate (SonarCloud, for example).
      See [ci-cookbook.md](ci-cookbook.md#9-codecov-a-real-signal-not-yet-a-gate) and
      [ci-cookbook.md](ci-cookbook.md#10-sonarcloud-automatic-analysis-vs-ci-based-analysis) for
      the setup detail, including the SonarCloud coverage gotcha that trips up most first
      attempts.
- [ ] A formal user-facing wiki or docs site, kept separate from the developer-facing README and
      AGENTS.md. Different audience, different depth. If it's a GitHub Wiki, its content lives in
      the repository itself (for example `docs/wiki/`) and is synced to the Wiki by CI, never
      edited directly in the Wiki's own web UI. See
      [ci-cookbook.md](ci-cookbook.md#12-docs-as-source-of-truth-and-catching-stale-docs-at-pr-time)
      for the sync workflow and the structural checks that keep it from silently drifting.
- [ ] Auditor-facing security documentation: an architecture overview written for someone doing
      due diligence, a documented incident-response procedure, a data-protection or subprocessor
      summary if the product touches personal data. Any specific, checkable claim in these docs
      (a required-checks list, a control mapped to a named workflow) is exactly the kind of thing
      that goes stale unnoticed; a scheduled drift-detector against the live setting is worth the
      admin-scoped token it needs, at this tier. See
      [ci-cookbook.md](ci-cookbook.md#12-docs-as-source-of-truth-and-catching-stale-docs-at-pr-time)
      for why this can't be a PR-time check and what to do instead.
- [ ] Per-version release notes, not just an aggregate CHANGELOG.
- [ ] The OpenSSF Best Practices badge at the **passing** level, with every answer verifiable
      from the repository. Not silver or gold, and not an in-progress badge. See
      [openssf.md](openssf.md#best-practices-badge).

Nothing above this tier is defined here on purpose. If a repository's needs genuinely exceed Tier
3, that's a specific decision about that specific repository, not a fifth tier to template in
advance.

## Moving between tiers

Promoting a repository to a higher tier is a deliberate act, prompted by the repository's own
growth: it started shipping a container image, a second person now depends on it, it started
handling another party's data. It is never done reflexively to "be thorough," and never done by
copying a higher-tier repository's file list wholesale without asking whether each item earns its
keep here. A Tier 1 tool with a Trivy scan and no container image is a checkbox nobody benefits
from, not diligence.

Demoting a tier is rarer but legitimate: a project that lost its user base, or was always
over-scoped for what it turned out to become, doesn't owe its former tier's maintenance burden
forever.
