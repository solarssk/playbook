# Writing SECURITY.md and Structuring Vulnerability Disclosure

This document is the deep-dive companion to the `SECURITY.md` and
vulnerability-disclosure items in [docs/tiers.md](tiers.md)'s per-tier
checklists, the same relationship [governance.md](governance.md) has to the
repo-settings items there. It uses the same tiers: **Tier 0** (every
repository), **Tier 1** (small, single-purpose tools), **Tier 2** (public
tools with real dependents), **Tier 3** (flagship). Every repo beyond "empty
or pre-code" needs a private way for someone to tell you about a
vulnerability before it's public; how much document sits around that channel
grows with the tier.

## Why a private reporting channel, not a public issue

A public issue tracker is the wrong place for an unpatched vulnerability
report for one structural reason: everyone who can see the repo can see the
report, including anyone who might exploit it before a fix ships. A reporter
needs a channel that reaches the maintainer without simultaneously
broadcasting the exploit. GitHub provides this natively:

- **GitHub Security Advisories / private vulnerability reporting**
  (preferred): a repo with private vulnerability reporting enabled shows a
  **"Report a vulnerability"** button under the Security tab. This opens a
  private draft advisory visible only to the maintainer and the reporter,
  with its own discussion thread, and can be converted into a published
  advisory (with CVE request, if warranted) once a fix is ready. This is the
  Tier 0 settings toggle described in
  [governance.md](governance.md#tier-0-security-toggles-in-full): it works
  the moment it's enabled, independent of whether `SECURITY.md` exists yet.
- **Direct contact** as a fallback: a maintainer's email or GitHub handle,
  for reporters who don't want to use the advisory flow or for repos where it
  isn't enabled yet.

`SECURITY.md` itself doesn't create the private channel. It **documents**
one that repo settings already provide, and tells reporters explicitly not to
use the public issue tracker instead. Both matter: the settings toggle
without the documentation leaves reporters guessing where to go, and the
documentation without the toggle points at a form that doesn't exist. Per
[tiers.md's Tier 1 checklist](tiers.md#tier-1-small-single-purpose-tools),
the written policy itself is the one Tier 0-to-1 item that's a real file, not
just a toggle: "how do I report a security issue" has no sane
settings-only answer.

## State a response-time SLA, even an informal one

"We aim to acknowledge reports within 48 hours" costs one sentence and
changes the reporter's experience substantially: it tells them silence for
the first two days is normal, not a sign the report went nowhere, and gives
them a concrete point at which a follow-up nudge is reasonable. This holds
even for a Tier 1 repo with one maintainer and no formal support process:
an informal, best-effort SLA is still better than no stated expectation,
because the alternative isn't "no promise," it's "the reporter doesn't know
if this is being looked at." Pick numbers that can actually be hit; a missed
informal SLA is a minor trust ding, a pattern of missed SLAs is worse than
never stating one.

## Structuring SECURITY.md by tier

### Tier 1 minimum

The whole document can be the reporting instructions and nothing else. Don't
fabricate a controls table for a repo whose only CI, per
[tiers.md's Tier 1 checklist](tiers.md#tier-1-small-single-purpose-tools), is
a lint-and-build check with nothing security-relevant in it: an empty or
invented table is worse than no table, because it implies coverage that
doesn't exist.

```markdown
# Security Policy

## Reporting a Vulnerability

Please do NOT open a public issue for security vulnerabilities.

Report privately via [GitHub Security Advisories](../../security/advisories/new)
or by contacting @<maintainer-handle> directly.

We aim to acknowledge reports within 48 hours.
```

That's a complete, honest Tier 1 policy. Add sections only as they become
true of the repo: a supported-versions table once there's more than one
version in the wild, a controls table once there's actually CI enforcing
something security-relevant.

### Tier 2 and up: the "active automated checks" table

[tiers.md's Tier 2 checklist](tiers.md#tier-2-public-tools-with-real-dependents)
adds tests, type-checking, and SAST on top of Tier 1's own dependency audit
and secret-scan steps. Once those exist, the highest-value addition to
`SECURITY.md` is a
table mapping each security-relevant control to **where it actually runs**,
the specific workflow file (and job, if the workflow has several). This is
falsifiable in a way a prose paragraph isn't: a reader can open the named
file and confirm the claim directly.

Falsifiable is not the same as self-maintaining, though. "The maintainer
will notice when a control quietly stopped running" is exactly the
assumption that doesn't hold: a real audit of a repo following this pattern
found this table undercounting its own required checks by two, for weeks,
with nothing surfacing it. Pair this table with the PR-time documentation
declaration in
[ci-cookbook.md §12](ci-cookbook.md#12-docs-as-source-of-truth-and-catching-stale-docs-at-pr-time)
so a PR that changes a workflow this table describes is required to say
whether the table needs updating too, rather than relying on memory.

Structure: one row per control, with, at minimum, what it checks, when it
runs, and the workflow file. This is a pattern, not a fixed list; use
whatever controls the repo actually has (see
[ci-cookbook.md](ci-cookbook.md) for the exact wiring of each), and drop the
row the day the control is removed rather than leaving a stale entry.

```markdown
## Security controls / CI

| Control | Scope | When | Workflow |
|---|---|---|---|
| <secret scanner> | Secret scan (full history) | Every PR | `.github/workflows/<file>.yml` |
| <SAST tool> | Static analysis | Every PR | `.github/workflows/<file>.yml` |
| <dependency audit> | Known-vulnerability scan | Every PR | `.github/workflows/<file>.yml` |
| <container scan> | Image scan (OS + libraries) | Release tags | `.github/workflows/<file>.yml` |
| Dependabot | Dependency updates | Scheduled | `.github/dependabot.yml` |
```

Keep this table honest rather than complete. A three-row table that's
entirely accurate is more useful, and more credible to a reader doing due
diligence, than a ten-row table with two stale entries. Building this out
fully (SAST, dependency review, container scanning plus an SBOM once a
container image ships, and a documented remediation SLA per severity)
tracks [tiers.md's Tier 2 and Tier 3 additions](tiers.md#tier-2-public-tools-with-real-dependents):
container scanning and SBOM at Tier 2, DAST and auditor-facing security
documentation at Tier 3. Don't back-fill that onto a Tier 1 tool that has
no CI to describe.

A related gap worth naming explicitly: a container scan (Trivy or
equivalent) checks the packages baked into an image, but tools like
[OpenSSF Scorecard](https://github.com/ossf/scorecard) also run a broader
**Vulnerabilities** check that queries [OSV.dev](https://osv.dev) for known
vulnerabilities across *any* declared dependency ecosystem, not just what
ends up in a container. The two overlap but aren't the same coverage; a repo
relying on container scanning alone has a partial gap against
dependencies that never make it into an image (a library used only at build
time, for example). Adding a dependency-level OSV scan (the `osv-scanner`
GitHub Action, for instance) closes that gap for the cost of one more
workflow step, and belongs in the same controls table once it's running.

### What counts as a secret (any tier with credentials in scope)

For any repo that touches credentials, API keys, database passwords,
tokens, certificates, list them explicitly rather than relying on "don't
commit secrets" as a vague instruction. An explicit list is easier to check
against and easier for a scanner's allowlist/denylist to be reviewed against:

```markdown
## What counts as a secret

The following must never appear in this repository or its history:

- <API client secret>
- <database credentials or connection strings>
- <TLS certificates or private keys>
- Any token, password, or API key of any kind

**Rotation policy:** any exposed secret is considered burned immediately and
must be rotated before further use.
```

### Supported versions

Only needed once a repo has more than one version anyone might reasonably be
running, typically once it's cutting the tagged releases described in
[tiers.md's Tier 3 additions](tiers.md#tier-3-flagship) (per-version release
notes, not just an aggregate changelog). State the policy plainly rather than
implying it:

```markdown
## Supported versions

Only the latest minor release receives security fixes. Deploy from tagged
releases (`v<major>.<minor>.x`), not from `main`.
```

A single-version Tier 1 tool with no release process can skip this section
entirely. "Supported versions" doesn't apply when there's only ever one
version that matters, whatever's on `main`.

## THIRD-PARTY-NOTICES.md: documenting an accepted license risk

Occasionally, a dependency's license can't be conclusively verified: a
transitive dependency with no `LICENSE` file, an ambiguous or dual license, a
package whose metadata disagrees with its repository. The wrong move is
leaving this silently unresolved (a CI license check that's quietly
allowed to fail, with no record of why). The right move is a short, dated
note that turns "we didn't check" into "we checked, couldn't resolve it, and
made an explicit call":

```markdown
# Third-Party Notices

## Accepted risk: <package-name>

**Date:** <YYYY-MM-DD>
**Package:** `<package-name>` (transitive dependency via `<parent-package>`)
**Issue:** No discoverable license file in the package or its source
repository as of the date above.
**Decision:** Accepted as a known risk. <Brief rationale, e.g. small utility
function, no redistribution of the package's own source, or best-effort
identification suggests a permissive license despite the missing file.>
**Re-review:** Revisit if this package is upgraded, if it starts being
redistributed rather than only used internally, or at the next major license
audit.
```

This does two things: it makes the risk visible to anyone auditing the repo
(including a future maintainer, or an external security review) instead of
hiding it behind a CI flag nobody remembers the reason for, and it gives the
decision a timestamp so it can be revisited rather than treated as
permanent. A CI license-compliance job that intentionally doesn't block the
pipeline should point at this file in its own comment, so the two stay
linked. This file is worth creating the moment a repo has its first
unresolvable license. It isn't tier-gated the way the controls table is,
because the cost of writing one paragraph is the same at any repo size, and
an undocumented accepted risk is exactly the kind of silent gap the rest of
this playbook is trying to avoid.
