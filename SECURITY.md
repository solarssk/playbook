# Security Policy

## Reporting a Vulnerability

Please do NOT open a public issue for security vulnerabilities.

Report privately via [GitHub Security Advisories](https://github.com/solarssk/playbook/security/advisories/new)
or by contacting @solarssk directly.

We aim to acknowledge reports within 48 hours.

This repository is documentation and templates, not a running service: there's no deployed
attack surface. A report here would most likely be about a template or CI snippet that, if
copied as-is, would introduce a real vulnerability in an adopting repository (a missing
`persist-credentials: false`, an overly broad `permissions:` block, a workflow trigger that
exposes secrets to a fork PR). That's exactly the kind of thing worth reporting privately first.

The reusable workflow `verify-tier.yml` and the script it runs also execute in other repositories'
CI, with those repositories' tokens. A vulnerability in either is in scope, and is the most
serious kind of report this repository can receive.

## Verifying a release

Each GitHub Release carries a source archive, a `SHA256SUMS` file, and a signed build provenance
attestation for the archive. To check that an archive was built by this repository's own release
workflow. Set `TAG` to the release and `OWNER` to the account that owns the repository:

```bash
TAG=v0.2.0
OWNER=example-owner
gh attestation verify "playbook-${TAG}.tar.gz" --repo "${OWNER}/playbook"
```

Repositories that call `verify-tier.yml` should pin it to a commit SHA rather than a tag or
`@main`, so a change to what "passing" means is always a diff they review. See
[docs/ci-cookbook.md](docs/ci-cookbook.md#13-verifying-a-repo-against-this-standard-automatically).

## How this repository is checked

CI runs on every pull request: Markdown lint, YAML and snippet validation, unit tests for the
scripts, `actionlint` and `zizmor` on the workflows, CodeQL (JavaScript and Actions), dependency
review, gitleaks, SonarCloud, and this repository's own `verify-tier` at Tier 2. OpenSSF
Scorecard runs weekly. The workflows are in [.github/workflows/](.github/workflows/).
