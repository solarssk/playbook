# Repository governance

Configure ownership, merge gates, labels, and repository settings for the
[tier checklist](tiers.md). If the tier is unknown, start with [how to pick a tier](tiers.md#how-to-pick-a-tier).

- [CODEOWNERS](#codeowners)
- [Branch protection](#branch-protection)
- [Branch cleanup, conversation resolution, and signing](#delete_branch_on_merge-conversation-resolution-commit-signing)
- [Labels and milestones](#labels-and-milestones)
- [Tier 0 security toggles](#tier-0-security-toggles-in-full)

## CODEOWNERS

CODEOWNERS auto-requests review from the listed owner(s) on any pull request
that touches a matching path. It is a routing mechanism, not an enforcement
mechanism, unless paired with the branch-protection setting described below.

**Tier 0 baseline, every repo:** a single catch-all line, already listed in
[tiers.md's Tier 0 checklist](tiers.md#tier-0-every-repository):

```text
* @<maintainer-handle>
```

Choose ownership scope by maintainer count, not tier:

| Maintainers | Ownership |
|---|---|
| One, at any tier | Catch-all only; path entries cannot route to anyone else |
| Multiple people with write access, covering different areas | Path-specific entries for the areas each owner knows |

For multiple maintainers:

```text
* @<default-owner>

/infra/            @<infra-owner>
/docs/             @<docs-owner>
*.sql               @<db-owner>
```

More specific patterns win over less specific ones (last match in the file
also wins on a tie), so put the catch-all first and overrides after it.

Enable **Require review from Code Owners** only when a second collaborator with write access
can review. Authors cannot approve their own PRs; requiring it on a solo-maintainer repo blocks
merges until an override. Keep CODEOWNERS for routing and ownership documentation without that toggle.

## Branch protection

Protect the default branch once any CI exists. At Tier 0, require at least CI's own checks;
at Tier 2, enforce every applicable PR gate. A solo-maintainer review count of 0 must be
documented and revisited when a second person gets write access.

| Setting | Tier 0-1 baseline | Tier 2: actually enforced | Tier 3: flagship |
|---|---|---|---|
| Require a pull request before merging | Once CI exists | Yes | Yes |
| Required approving reviews | 0 is fine for a solo maintainer, if written down | 0-1, depending on whether a second maintainer has write access | 1+, once a second maintainer has write access |
| Require status checks to pass | Named CI job(s), by exact context string | Every applicable PR gate, directly or through a fail-closed aggregate, kept current as jobs change | Same, plus coverage/quality gates from [tiers.md's Tier 3 list](tiers.md#tier-3-flagship) |
| Require branches to be up to date before merging | Optional | Recommended if checks are fast | Recommended |
| Require Code Owner reviews | Off | Off unless a second maintainer has write access | On, once there's someone to route to |
| Require conversation resolution before merging | Optional | Recommended | Recommended |
| Require signed commits | Optional | Optional | Recommended for compliance-sensitive repos |

For a solo maintainer, keep required reviewers at 0 rather than routinely bypassing an impossible
approval. Record the decision, for example in `CONTRIBUTING.md`: "Single-maintainer project:
the maintainer reviews and merges their own PRs once CI is green."

Required contexts must exactly match names from a real PR's Checks tab. A job reports its `name:`,
or its key when no name exists: `secret-scan:` with `name: Secret scan (gitleaks)` reports
`Secret scan (gitleaks)`, not `secret-scan`. A nonexistent required context leaves PRs blocked
even when all actual checks are green. Update protection when renaming jobs and confirm a PR can merge.

With an admin token, `verify-tier` compares required contexts against workflow job names across
classic protection and active Rulesets, including inherited rules. Its warnings cannot distinguish
external-app contexts, such as SonarCloud, from typos. It neither establishes bypass policy nor
proves that every necessary gate is included. See [verification limits](compatibility.md#verification-results).

Do not require scheduled-only, report-only, or conditionally absent external checks on every
PR. Separate those from merge gates. An aggregate gate is valid only if it always runs,
depends on every intended gate, and fails when any dependency fails, is cancelled, or is
skipped. A test should keep its dependency list in sync as CI jobs are added.

This repository's `Required CI` aggregates `ci.yml`; YAML alone does not make it required.
Roll out a replacement gate in this order:

1. Obtain a successful real PR run.
2. Have an administrator copy its reported context into protection or a Ruleset.
3. Confirm a failed dependency blocks merging.
4. Only then remove superseded required contexts.

Other workflows providing PR gates still need their own required contexts.

## delete_branch_on_merge, conversation resolution, commit signing

[tiers.md's Tier 0 checklist](tiers.md#tier-0-every-repository) already
covers `delete_branch_on_merge`, on by default with the stacked-PR exception.
The detail worth adding:

- **`delete_branch_on_merge`**: the one legitimate reason to turn this off
  is a **stacked-PR workflow**, where a later branch's base is an earlier,
  still-open PR's branch. Merging the earlier PR must not delete a branch a
  later PR still depends on. If a repo turns this off for that reason, write
  it down (in `CONTRIBUTING.md` or a repo note) so it doesn't read as an
  oversight to the next person who notices stale branches piling up.
- **Required conversation resolution**: cheap to enable and catches the case
  where a reviewer's comment gets silently ignored. Worth turning on once a
  repo has more than one active reviewer, and of low value on a solo-maintainer
  repo where the only "conversation" is the maintainer talking to themselves.
- **Commit signing**: worth requiring (GPG or SSH signing, plus a
  branch-protection rule requiring signed commits) on Tier 3 repos where
  provenance matters for compliance, or where release artifacts need to trace
  back to a verified author. For Tier 0-2, encourage it without requiring it.
  Mandating a signing setup for a small tool is friction disproportionate
  to the risk it addresses.

## Labels and milestones

Start lean, independent of tier. A large label taxonomy earns its
complexity only once there's enough issue volume, and enough people
triaging, that filtering by category actually saves time over reading the
issue list directly.

**Starter taxonomy, prefix-based so it sorts and filters cleanly:**

| Prefix | Values | Purpose |
|---|---|---|
| `type:` | `bug`, `feature`, `chore`, `docs` | What kind of change |
| `prio:` | `low`, `medium`, `high` | Rough urgency, not a formal SLA |
| `area:` | project-specific (e.g. `area: api`, `area: ui`, `area: infra`) | Where in the codebase, only if the repo has clearly separable areas |

Skip `area:` entirely for a repo small enough that "where" is obvious from
the title. Skip `prio:` if there's one maintainer triaging their own backlog:
priority is already implicit in what they work on next.

Expand labels when regular filtering, triage, a project board, or independent maintainers need
them, usually around Tier 2-3. Options include severity distinct from priority, `status:`,
`good-first-issue`, and finer component labels. Add a label for a missing filter, not speculatively.

**Milestones:** use them for actual release planning (grouping issues/PRs
targeted at a specific version) once a repo cuts versioned releases with any
regularity. A repo without a release cadence doesn't need milestones, a
label or a project board covers the same need with less upkeep.

## Tier 0 security toggles, in full

[tiers.md's Tier 0 checklist](tiers.md#tier-0-every-repository) already lists
Dependabot security updates as a zero-cost settings toggle that applies to
every repository. The full set of pure repo-settings security toggles worth
flipping at Tier 0, no code, no workflow file, no ongoing maintenance beyond
the one-time change:

- **Secret scanning**: scans pushed content for known credential patterns
  (cloud provider keys, tokens, etc.) and flags matches.
- **Secret scanning push protection**: blocks a push containing a detected
  secret *before* it lands in history, rather than flagging it after the
  fact. Strictly stronger than detection-only scanning for the same cost (one
  toggle), so enable both together.
- **Dependabot alerts**: flags dependencies with known vulnerabilities;
  Dependabot security updates (already in tiers.md's Tier 0 list) turns those
  alerts into an automatic PR.
- **Private vulnerability reporting**: enables the repo's Security tab
  "Report a vulnerability" flow (GitHub Security Advisories) so reporters
  have a private channel even before a `SECURITY.md` exists to point them at
  it. See [security-docs.md](security-docs.md) for how this pairs with the
  written policy, which is itself a Tier 1 item once a repo is more than
  "empty or pre-code."

There is no tier at which these are optional. A one-file, no-CI Tier 1 repo
still benefits from push protection and Dependabot alerts, and turning them
on costs nothing. Treat flipping these toggles as the first line item for any
new repo, ahead of deciding which higher tier it belongs in.
