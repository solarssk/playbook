<!--
TIER GUIDANCE (delete this comment block before publishing):

See docs/tiers.md for the tier definitions and docs/security-docs.md for the
full explanation. Short version:

- Tier 1 (no CI, or CI with no security-relevant checks): keep only the
  "Reporting a Vulnerability" section. Delete everything else in this file:
  an empty or invented controls table is worse than no table.
- Tier 2 (real dependents, full CI): add "What counts as a secret" if the
  repo handles any credentials, and the "Security controls / CI" table, kept
  honest and updated whenever a check is added, renamed, or removed.
- Tier 3 (flagship: real install base and/or compliance exposure): add
  "Supported versions," a remediation SLA by severity, and link out to any
  THIRD-PARTY-NOTICES.md / data-handling docs that exist.

Replace every <placeholder> before publishing this file.
-->

# Security Policy

## Reporting a Vulnerability

**Please do NOT open a public issue for security vulnerabilities.**

Report vulnerabilities privately:

- **GitHub private vulnerability reporting** (preferred): use the
  [Report a vulnerability](../../security/advisories/new) button in the
  Security tab.
- **Direct contact**: reach @<maintainer-handle> on GitHub.

We aim to acknowledge reports within **48 hours** and to resolve confirmed
vulnerabilities within **<N> days**.

<!-- Tier 2+, only if the repo handles credentials of any kind. -->
## What counts as a secret

The following must **never** appear in this repository or its history:

- <API keys / client secrets>
- <database credentials or connection strings>
- <TLS certificates or private keys>
- Any token, password, or API key of any kind

**Rotation policy:** any exposed secret is considered burned immediately and
must be rotated before further use.

## Responsible disclosure

We follow coordinated disclosure. Please give us reasonable time to fix the
issue before making it public. We will credit researchers who follow this
policy, unless they prefer to remain anonymous.

<!-- Tier 2+, only once the repo has real CI. Delete this whole section for
Tier 1 rather than leaving it empty or fabricating rows. One row per control
that actually runs; drop a row the day the control is removed. -->
## Security controls / CI

Active automated checks in this repository:

| Control | Scope | When | Workflow |
|---|---|---|---|
| <secret scanner, e.g. gitleaks> | Secret scan (full history) | Every PR | `.github/workflows/<file>.yml` |
| <SAST tool, e.g. CodeQL> | Static analysis | Every PR + weekly | `.github/workflows/<file>.yml` |
| <dependency audit tool> | Known-vulnerability scan | Every PR | `.github/workflows/<file>.yml` |
| <container scanner, e.g. Trivy> | Image scan (OS + libraries) | Release tags | `.github/workflows/<file>.yml` |
| Dependabot | Dependency + Actions updates | Scheduled | `.github/dependabot.yml` |

<!-- Tier 3 only: a formal remediation SLA by severity. -->
**Remediation SLA:** **Critical** findings with an available fix block the
next release until patched. **High** findings with an available fix are
remediated within **30 days**. Findings with no upstream fix available are an
accepted risk, documented in the Security tab.

<!-- Tier 3 only, or any repo with more than one version in active use. -->
## Supported versions

Only the **latest minor release** receives security fixes. Deploy from
tagged releases (`v<major>.<minor>.x`), not from `main`.

<!-- Tier 3 only, or any repo handling personal/regulated data. Link out
rather than duplicating content inline. -->
## Data protection

See [DATA-PROTECTION.md](DATA-PROTECTION.md) for data-handling and privacy
design notes.

<!-- Only if a license or provenance decision has been explicitly accepted
rather than resolved. See docs/security-docs.md's THIRD-PARTY-NOTICES.md
pattern. Delete if not applicable. -->
## Third-party notices

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for dependencies whose
license could not be conclusively verified and were accepted as a documented,
dated risk.
