# playbook

playbook is a tiered engineering standard for repository security, CI, documentation, and governance.
It turns lessons from real repository audits into shared requirements, copy-ready templates, and
a reusable verifier, so each project does not have to invent its own maintenance policy.
Four additive tiers keep controls proportional to what a repository ships and who depends on it.

[![CI](https://github.com/solarssk/playbook/actions/workflows/ci.yml/badge.svg)](https://github.com/solarssk/playbook/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/solarssk/playbook)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/solarssk/playbook)](https://github.com/solarssk/playbook/releases/latest)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/solarssk/playbook/badge)](https://securityscorecards.dev/viewer/?uri=github.com/solarssk/playbook)

## What you get

| Resource | Use it to |
|---|---|
| [Tier checklists](docs/tiers.md) | Choose the maintenance baseline, from an empty repo to a flagship product |
| [CI cookbook](docs/ci-cookbook.md) | Copy tested patterns for dependency audits, secret scanning, SAST, releases, and workflow hygiene |
| [Starter templates](templates/) | Create README, contribution, security, ownership, issue, and PR files |
| [Reusable verifier](.github/workflows/verify-tier.yml) | Check the automated subset in CI and expose gaps that still need review |

## Adopt the standard

Start with [how to pick a tier](docs/tiers.md#how-to-pick-a-tier), then use its additive checklist.
The standard scales by risk and audience, not repository size or ambition:

| Tier | Baseline |
|---|---|
| 0: every repository | Ownership, license, repository settings, and a README that explains what and why |
| 1: small tools | Minimal CI, pinned dependencies and actions, dependency audits, secret scanning, and private reporting |
| 2: real dependents | Tests, type checks, SAST, enforced PR gates, contributor docs, and artifact controls where applicable |
| 3: flagship | Dynamic scanning, coverage and quality gates, user docs, and auditor-facing security documentation |

This table is an orientation, not a replacement for the [full requirements and conditions](docs/tiers.md#at-a-glance).
Pick the lowest tier that fits; when genuinely unsure, undershoot. Tier 2 includes Tiers 0 and 1.
Tier 3 is earned by operating at flagship scale, not chosen for completeness.

Follow the [adoption workflow in AGENTS.md](AGENTS.md#if-you-were-sent-here-from-another-repository)
to inspect real files and settings, apply only missing controls, and record the tier and rationale.

## Verify without overstating the result

Use the [verifier setup recipe](docs/ci-cookbook.md#13-verifying-a-repo-against-this-standard-automatically)
to call the reusable workflow, pinned to a published release's full commit SHA.
It reads the declared tier from the adopting repository's agent instructions unless an input overrides it.
Dependabot proposes pin updates; release warnings point to the [release notes and adopter actions](https://github.com/solarssk/playbook/releases).

| Result | Meaning |
|---|---|
| `automated_checks=passed` | No hard automated check failed |
| `assessment=partial` | Manual requirements and unverified settings still need review |
| `automated_checks=failed`, `assessment=failed` | A hard automated check failed |

**A green verifier is partial evidence, not proof of compliance.**
Presence does not prove execution or enforcement; heuristic matches remain warnings.
Live settings checks are explicitly skipped without an administrative read token.
Keep that token out of PR-triggered workflows. See the [result and platform contract](docs/compatibility.md).

playbook applies its own Tier 2 standard, with CI checking the automated subset.
Other repositories execute its verifier with their tokens, so its blast radius matters more than its size.
It has one audience and entry point, so it needs no audience-routing table.

## Reference

| Guide | Covers |
|---|---|
| [README standard](docs/readme-standard.md) | Section order, badges, and content boundaries by tier |
| [Governance](docs/governance.md) | Ownership, branch protection, labels, milestones, and settings |
| [Security documentation](docs/security-docs.md) | Private disclosure and security policies by tier |
| [OpenSSF](docs/openssf.md) | Report-only Scorecard at Tier 2; passing Best Practices badge at Tier 3 |
| [DeepWiki](docs/deepwiki.md) | Optional public-repo navigation, never authoritative documentation or evidence |
| [Compatibility](docs/compatibility.md) | Public interfaces, verification limits, source identity, and deviations |
| [CHANGELOG](CHANGELOG.md) | Published changes and required adopter actions |

Read the guide for your task, not the whole repository.
For changes, see [CONTRIBUTING.md](CONTRIBUTING.md) and [agent instructions](AGENTS.md).
Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).
