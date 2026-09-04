# Security Policy

## Reporting a Vulnerability

Please do NOT open a public issue for security vulnerabilities.

Report privately via [GitHub Security Advisories](../../security/advisories/new)
or by contacting @solarssk directly.

We aim to acknowledge reports within 48 hours.

This repository is documentation and templates, not a running service: there's no deployed
attack surface. A report here would most likely be about a template or CI snippet that, if
copied as-is, would introduce a real vulnerability in an adopting repository (a missing
`persist-credentials: false`, an overly broad `permissions:` block, a workflow trigger that
exposes secrets to a fork PR). That's exactly the kind of thing worth reporting privately first.
