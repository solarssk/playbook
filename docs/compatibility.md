# Compatibility and assessment

The tier checklist in [tiers.md](tiers.md) is the standard. The verifier is a partial
implementation of that checklist, not a second definition of compliance.

## Public interfaces and versioning

The public interfaces are the tier requirements, reusable-workflow inputs and secrets,
check IDs and statuses, workflow outputs and exit behavior, and copyable templates.
Changing an internal helper without changing these interfaces is not an adopter-facing change.

Starting with v1.0.0:

- A patch fixes an implementation or documentation error without adding a requirement.
  Correctly rejecting an input that was always invalid is a bug fix.
- A minor release adds optional functionality or a check that does not introduce a new
  blocking requirement.
- A major release adds or tightens a mandatory requirement, changes a valid input or exit
  contract, or removes or renames a public interface. Give the migration steps by tier.

Before v1.0.0, minor releases may change these interfaces. They still need a CHANGELOG entry
and an **Adopter action** list whenever existing adopters must change something. Never silently
change what an already-pinned workflow executes.

## Verification results

Every result has a stable check ID. `pass` means the specific automated check succeeded,
not that every aspect of its tier requirement was assessed. `fail` is a hard failure;
`warn` means manual verification or remediation is needed; `skip` means an applicable check
could not run, or a conditional requirement does not apply.

Presence checks establish only presence. Text that resembles a scanner, permission block,
or gate does not prove execution, thresholds, or enforcement. Heuristic checks stay `warn`
even when a match is found. Full YAML semantics, scanner results, bypass rules, documentation
quality, and the correctness of the chosen tier still need review.

The reusable workflow exposes:

| Output | Values | Meaning |
|---|---|---|
| `automated_checks` | `passed`, `failed` | Whether any hard automated check failed |
| `assessment` | `partial`, `failed` | Partial evidence with no hard failure, or a hard failure |

The CLI exits 1 on a hard failure or invalid tier, and 0 otherwise. Warnings and skipped
checks do not become hard failures. No output currently means "fully compliant". Invalid
input can fail before outputs are written; callers must also inspect the job result.
The Markdown table is for readers; integrations should use workflow outputs, not parse it.

Without an administrative read token, live-setting checks remain explicitly skipped.
With one, classic protection and active branch Rulesets are assessed together. Matching
required-check names cannot prove that all necessary checks are required or that no actor
can bypass them.

## Source identity and platforms

Pin a caller's `uses:` reference to a full commit SHA. On GitHub.com, the called workflow
checks out its own `${{ job.workflow_sha }}`, after validating the source SHA and repository.
It does not use a mutable release tag, `github.sha`, or the caller's `github.workflow_sha`.
The verifier has no npm runtime dependency.

These `job` fields were [introduced on GitHub.com in September 2026](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/).
GitHub Enterprise Server is not supported by this workflow. Missing source identity fails
before checkout instead of falling back to a branch. A local CLI run does not exercise this
platform contract; a real cross-repository workflow run is needed before release.

`PLAYBOOK_RELEASE` is version-notification metadata, not source identity. Release tooling
checks that it matches the stable `vX.Y.Z` tag and CHANGELOG section, and that checkout still
uses the called workflow SHA. Prerelease tags and release candidates are not supported by
the current publisher or latest-release comparison.

A GitHub Release, source archive, checksum file, and provenance attestation are published
for each release. An attestation does not make a release immutable. Enabling GitHub's
immutable-release setting affects future releases only, not previously published releases.
Release-setting changes and publication are separate administrative operations.

## Assessment and deviations

An adoption review records the declared tier, evidence checked, missing requirements,
and deliberately inapplicable requirements. Do not treat a warning, a missing token, or
a documented gap as a pass. A green verifier is not grounds to hide those items.

If a repository deliberately deviates from a requirement, record the requirement and tier,
reason, accountable role, approval reference, review or expiry date, and remediation or
compensating control in its contributor documentation. Keep the affected requirement
visible as unmet. This is a review record, not a waiver that establishes compliance.
An expired decision needs renewed review. There is no automated exception engine.

Tool false positives need a narrower treatment: scope the suppression to the exact rule
and file, cite the upstream behavior, assign a review date, and retain an independent check
where possible. This repository's temporary actionlint compatibility suppression is
documented in [CONTRIBUTING.md](../CONTRIBUTING.md#workflow-linter-compatibility).
