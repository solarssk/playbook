# Repository Governance

This document is the deep-dive companion to the ownership, review, and
repo-settings items in [docs/tiers.md](tiers.md)'s per-tier checklists, the
same relationship [readme-standard.md](readme-standard.md) has to that
checklist's README item. It uses the exact same tiers: **Tier 0** (every
repository), **Tier 1** (small, single-purpose tools), **Tier 2** (public
tools with real dependents), **Tier 3** (flagship). If a repo's tier hasn't
been picked yet, start at [tiers.md, "How to pick a tier"](tiers.md#how-to-pick-a-tier)
before reading further here.

## CODEOWNERS

CODEOWNERS auto-requests review from the listed owner(s) on any pull request
that touches a matching path. It is a routing mechanism, not an enforcement
mechanism, unless paired with the branch-protection setting described below.

**Tier 0 baseline, every repo:** a single catch-all line, already listed in
[tiers.md's Tier 0 checklist](tiers.md#tier-0-every-repository):

```text
* @<maintainer-handle>
```

This documents ownership (useful the moment a second person needs to know who
to ask) before there's any structure to route between. Do not create
path-scoped entries on top of this for a single-maintainer repo: there is no
one else to route reviews to, so extra lines are pure noise regardless of the
repo's tier.

**Path-specific ownership, once there are multiple maintainers:** worth the
added complexity once a repo has more than one person with write access, each
covering a different area. The trigger here is **headcount**, not tier by
itself. A Tier 3 flagship repo with a single maintainer still gets the plain
catch-all line, and a smaller repo that unusually picks up a second
maintainer can adopt path-specific ownership early. In practice the two
correlate (repos accumulate a second maintainer more often once they're
Tier 2+), but headcount is the real signal to watch. Once it applies, scope
entries to the paths each owner actually knows:

```text
* @<default-owner>

/infra/            @<infra-owner>
/docs/             @<docs-owner>
*.sql               @<db-owner>
```

More specific patterns win over less specific ones (last match in the file
also wins on a tie), so put the catch-all first and overrides after it.

**"Require review from Code Owners" (branch protection setting):** this
toggle is **inert** on a solo-maintainer repo. The sole owner would be both
the author and the required reviewer, and GitHub does not let an author
approve their own PR to satisfy the rule, so it just blocks merges until
someone manually overrides. Turn it on only once a second collaborator with
write access can actually provide that review. Until then, CODEOWNERS still
does its job (auto-requesting review as documentation of who's responsible)
without the enforcement toggle.

## Branch protection

[tiers.md's Tier 0 checklist](tiers.md#tier-0-every-repository) already
requires branch protection on the default branch once any CI exists, with at
least the CI's own status checks required, and explicitly allows the
required-review count to stay at 0 for a solo-maintained repo, as long as
that's a deliberate, written-down choice, revisited the moment a second
person gets write access. Tier 2 tightens this from "present" to "actually
enforced": required status checks that are genuinely required, not merely
present as unenforced workflow files. This section is what that looks like in
practice:

| Setting | Tier 0-1 baseline | Tier 2: actually enforced | Tier 3: flagship |
|---|---|---|---|
| Require a pull request before merging | Once CI exists | Yes | Yes |
| Required approving reviews | 0 is fine for a solo maintainer, if written down | 0-1, depending on whether a second maintainer has write access | 1+, once a second maintainer has write access |
| Require status checks to pass | Named CI job(s), by exact context string | Every check CI actually runs, list kept current as jobs are added/renamed | Same, plus any coverage/quality gates from [tiers.md's Tier 3 list](tiers.md#tier-3-flagship) |
| Require branches to be up to date before merging | Optional | Recommended if checks are fast | Recommended |
| Require Code Owner reviews | Off | Off unless a second maintainer has write access | On, once there's someone to route to |
| Require conversation resolution before merging | Optional | Recommended | Recommended |
| Require signed commits | Optional | Optional | Recommended for compliance-sensitive repos |

**On "required reviewers = 0":** for a solo-maintainer repo, requiring a
second approval that cannot exist is not a safeguard. It's a self-imposed
deadlock that gets bypassed via admin override every time, and that trains
everyone to ignore the setting. Leaving the count at 0 until a second
collaborator actually has write access is the correct default, but say so
explicitly (e.g. in `CONTRIBUTING.md`: *"single-maintainer project: the
maintainer reviews and merges their own PRs once CI is green"*) so it reads
as a decision, not an oversight a future reader has to guess about.

**Required status checks:** name the actual check contexts (job names as
they appear in the Checks tab), not just "CI". GitHub matches on the exact
context string, and a renamed job silently stops being enforced if the
required-checks list isn't updated alongside it.

The opposite mistake is quieter and worse. A job's reported name is its
`name:` when it has one and its key otherwise, so a job written as
`secret-scan:` with `name: Secret scan (gitleaks)` reports as
`Secret scan (gitleaks)`. Requiring the context `secret-scan` then waits for a
check that never arrives: every pull request stays "blocked" with all checks
green, and nothing reports an error. Copy each context from the Checks tab of
a real pull request rather than from the workflow file, and confirm one PR
can actually merge after changing the list. With an admin token,
`verify-tier` compares the required contexts against the job names in the
repository's workflows and warns about any it cannot match. It cannot tell a
context posted by an external app (SonarCloud, for example) from a mistyped
one, so read the warning rather than trusting it blindly.

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

**When a larger taxonomy earns its keep:** once there's enough issue volume
that someone is filtering views regularly, a project board, a weekly triage
pass, multiple maintainers picking up work independently, which in practice
tends to show up around Tier 2-3, add what's actually used: severity levels
distinct from priority, `status:` labels for triage state,
`good-first-issue` for external contributors, or component labels finer than
a single `area:` bucket. Add labels because a filter is missing, not
speculatively.

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
