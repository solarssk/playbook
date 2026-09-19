# OpenSSF: Scorecard and Best Practices badge

The [Open Source Security Foundation](https://openssf.org) publishes two things a repository can
be measured against without asking anyone's permission: **Scorecard**, an automated check of the
repository's own supply-chain posture, and the **Best Practices badge**, a self-attested
questionnaire. They answer different questions and belong at different tiers.

- [What each one is](#what-each-one-is)
- [Tier placement](#tier-placement)
- [Scorecard workflow](#scorecard-workflow)
- [How to read the score](#how-to-read-the-score)
- [Best Practices badge](#best-practices-badge)
- [What not to do](#what-not-to-do)

## What each one is

| | Scorecard | Best Practices badge |
|---|---|---|
| Who evaluates | A tool, against the repository's real files and settings | The maintainer, by answering a questionnaire |
| What it needs | A workflow file | An account on bestpractices.dev and an hour of honest answers |
| Goes stale by | Changing the repo (score updates on the next run) | Changing the repo without revisiting the answers |
| Trust signal | Reproducible by a stranger | Only as good as the answers |

Most of Scorecard's checks measure things this standard already asks for: pinned actions,
least-privilege `permissions:`, SAST, a security policy, a dependency-update tool, branch
protection. Scorecard is therefore not a new set of requirements. It is an independent,
public second opinion on requirements the tiers already contain, which is why it is cheap to
add once a repository is at Tier 2.

## Tier placement

| Tier | OpenSSF expectation |
|---|---|
| 0 and 1 | None. A Scorecard run on a two-file config repo mostly reports on things that do not exist. |
| 2 | Scorecard workflow, **report-only**, on public repositories. |
| 3 | Everything in Tier 2, plus the Best Practices badge at the **passing** level. |

Neither is ever a merge gate. A score that blocks merges gets gamed or switched off; a score
that is only reported gets read.

Private repositories skip Scorecard's public publishing entirely (see the workflow notes
below). The checks are still a useful local checklist, but there is no badge to show.

## Scorecard workflow

Run it on push to the default branch, on branch-protection changes (one of the things it
scores), and weekly, because a few checks depend on repository activity over time rather than
the current diff. Keep it off the pull request path.

```yaml
name: OpenSSF Scorecard

on:
  branch_protection_rule:
  schedule:
    - cron: "0 4 * * 3"
  push:
    branches: [<default-branch>] # replace with this repository's default branch

# Deny-all at the top; the job below grants only what it needs. Scorecard's
# Token-Permissions check requires a top-level `permissions:` key to exist.
permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analysis:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    permissions:
      contents: read
      actions: read # Scorecard reads workflow files for its own checks
      id-token: write # sign and publish results to the public Scorecard API
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: ossf/scorecard-action@2d1146689b8cda280b9bc96326124645441f03bc # v2.4.4
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true
```

Notes on the wiring:

- **`publish_results: true` only works on public repositories.** On a private repo, set it to
  `false` or drop the workflow. Publishing is what makes the badge and the public viewer work.
- **`id-token: write` is required for publishing**, and it is the one permission here that is
  not read-only. It is scoped to this job only, never the top level.
- **The `permissions: {}` top level is deliberate.** Per-job permissions are the least-privilege
  shape, and an empty top level satisfies Scorecard's own Token-Permissions check.
- **Pin the actions to SHAs like everything else** (see
  [ci-cookbook.md #1](ci-cookbook.md#1-pin-github-actions-to-a-commit-sha)), and keep the exact
  version in the trailing comment so Dependabot can keep it current. Verify the SHAs above
  against the current releases of both actions before copying them into a new repository.
- **Optional: upload the SARIF to the Security tab** with `github/codeql-action/upload-sarif`,
  which needs `security-events: write` on the job. Worth it only if someone actually triages
  findings there. Without it, the public viewer and the badge are still fully populated.

The README badge, at Tier 2 and above:

```markdown
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/<owner>/<repo>/badge)](https://securityscorecards.dev/viewer/?uri=github.com/<owner>/<repo>)
```

Add the badge only after the first workflow run has published a result. Before that it renders
as an error image, which is worse than no badge (see
[readme-standard.md, Badges](readme-standard.md#badges)).

## How to read the score

Scorecard grades each check from 0 to 10 and averages them. The average is the least useful
number on the page. Read the individual checks.

**Checks that map directly to this standard.** A low score here is a real gap:

| Scorecard check | Standard item |
|---|---|
| Pinned-Dependencies | SHA-pinned actions, pinned dependency manifests, hash-pinned lockfile |
| Token-Permissions | Explicit least-privilege `permissions:` |
| Dangerous-Workflow | No `pull_request_target` plus untrusted checkout |
| Branch-Protection | Branch protection actually enforced |
| SAST | CodeQL and/or Semgrep |
| Vulnerabilities | Dependency audit (see [security-docs.md](security-docs.md) on OSV) |
| Security-Policy | `SECURITY.md` |
| Dependency-Update-Tool | `dependabot.yml` |
| License | `LICENSE` |
| CI-Tests | Tier 2's "tests in CI" item: tests run on pull requests |

**Checks that measure project shape, not hygiene.** A solo-maintained repository will score low
on these no matter how careful it is, and that is not a defect to fix:

- **Code-Review** counts changes approved by someone other than the author. With one
  maintainer there is no one to approve. Do not add a second account to move it.
- **Contributors** counts distinct contributing organizations.
- **Maintained** reflects commit activity and is fine on any live repository.
- **Signed-Releases**, **Fuzzing**, and **CII-Best-Practices** are opt-in investments. Adopt
  one when it does real work for the repository, not to raise the average.

## Best Practices badge

The [OpenSSF Best Practices badge](https://www.bestpractices.dev) is a questionnaire about
project practice: how vulnerabilities are reported, how releases are built, what testing exists,
whether a static analyzer runs. It has three levels (passing, silver, gold). This standard asks
for **passing** at Tier 3 and nothing beyond it.

Rules for filling it in:

1. **Answer from the repository, not from intent.** Every "met" answer must be true today and
   point at a file or workflow a stranger can open. If the answer is "we plan to," it is unmet.
2. **Most answers should be justified by links into this standard's own artifacts:** `SECURITY.md`,
   the CI workflows, `CONTRIBUTING.md`, the release process. If an answer needs a paragraph of
   explanation, the repository is probably not doing the thing.
3. **Revisit the answers when a control changes.** The questionnaire is exactly the kind of
   specific, checkable claim that drifts. Treat a change to CI, releases, or security policy as
   a prompt to reread the relevant answers, the same way
   [ci-cookbook.md #12](ci-cookbook.md#12-docs-as-source-of-truth-and-catching-stale-docs-at-pr-time)
   treats documentation impact.
4. **Add the badge only once the passing level is reached.** An in-progress percentage badge
   advertises an unfinished checklist.

```markdown
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/<project-id>/badge)](https://www.bestpractices.dev/projects/<project-id>)
```

`<project-id>` is the numeric ID assigned when the project is registered on bestpractices.dev.

## What not to do

- **Do not gate merges on the Scorecard score.** It is a report.
- **Do not add controls only to move a check.** A fuzzing harness that exists to satisfy the
  Fuzzing check, with no real parsing or input-handling code worth fuzzing, is theater in the
  same sense as an SBOM for a repository with no dependencies. Fuzzing earns its place when the
  repository has pure functions or parsers that take untrusted input.
- **Do not chase 10/10.** The checks in the second table above have a ceiling set by team size,
  not by diligence.
- **Do not put Scorecard or Best Practices at Tier 1.** There is nothing yet for them to measure.
