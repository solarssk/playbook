# Contributing to playbook

Thanks for your interest in contributing. This document covers the practical steps for
proposing a change to the standard.

## Before you start

- For anything beyond a small fix, open an issue first to discuss the approach. A change to what
  the standard recommends affects every repository that follows it, so agreeing on the direction
  first avoids wasted work.
- Search existing issues before opening a new one; someone may already be working on it.
- Found a security problem in a template or CI snippet? Do **not** open a public issue. Follow
  [SECURITY.md](SECURITY.md) instead.
- Read [AGENTS.md](AGENTS.md). Its rules for this repository apply to every contributor, human or
  agent: keep the tiering intact, no personal narrative, no real infrastructure details, no em
  dashes, and every snippet must be copy-paste-ready.

## Ways to contribute

| Type | Where to start |
|------|-----------------|
| Bug report | Open a [Bug report](../../issues/new?template=bug.yml) issue: a wrong recipe, a broken snippet, a doc that contradicts another. |
| Change to the standard | Open an issue describing the problem, which tier it affects, and what "done" looks like. |
| Fix or improvement | Branch, then open a pull request (see below). |
| Documentation | The documents in [docs/](docs/) and [templates/](templates/) are the product. There is no separate docs site. |

## Development setup

There is nothing to build. Use Node.js 26 and Python 3.12. In a Python virtual environment,
install the development tools from the lockfiles:

```bash
npm ci --ignore-scripts
python -m pip install --require-hashes --only-binary :all: --no-deps -r scripts/requirements.txt
```

Then run the same checks CI runs:

```bash
node --test "scripts/**/*.test.mjs"   # unit tests for the verification scripts
npm run typecheck                    # production JavaScript, no emitted files
python -m mypy --check-untyped-defs scripts/validate_yaml.py scripts/check_doc_snippets.py
python -m pytest scripts/
node scripts/release-check.mjs       # source-ref contract, release metadata and CHANGELOG
node scripts/verify-tier.mjs          # this repository against its own standard (set INPUT_TIER=2)
python scripts/check_doc_snippets.py  # every YAML/JSON snippet in the docs parses (--extract also writes workflow snippets to .snippet-workflows/ for actionlint)
```

`actionlint` and `zizmor` lint the workflows; both run offline against a checkout.
The verifier itself still runs with Node.js alone; npm packages are development tools.
The `Required CI` job aggregates `ci.yml` and fails on failed, cancelled, or skipped jobs.
It does not configure branch protection. See [the rollout procedure](docs/governance.md#branch-protection).

Dependabot groups version updates and allows one open version-update PR per ecosystem. CodeQL
updates remain a separate group from other Actions. Security updates use a separate limit and
can still overlap. Update `@types/node` and the Node.js version in every workflow together;
Dependabot ignores major version updates to the types until that coordinated change is made.
Dependabot adds the `type: chore` label. During triage, assign the PR and select the active release
milestone.

### Workflow-linter compatibility

actionlint 1.7.12 does not recognize GitHub.com's documented `job.workflow_sha` and
`job.workflow_repository` properties. `.github/actionlint.yaml` ignores only those missing
property diagnostics in `verify-tier.yml`. Other expression checks remain enabled.
Repository maintainers own this exception; review it by **2027-02-01** and remove it when
actionlint supports the fields. The [GitHub announcement](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/)
is the upstream evidence. Python tests exercise the fail-closed source guard independently.
A real cross-repository run is still required before release.

## Making a change

1. Branch from `main`:

   | Prefix | Use for |
   |--------|---------|
   | `feature/<slug>` | New recommendations or documents |
   | `fix/<slug>` | Corrections to existing content or scripts |
   | `chore/<slug>` | CI, tooling, dependencies |
   | `docs/<slug>` | Documentation-only changes |

2. Commit with a conventional-style prefix (`docs:`, `fix:`, `chore:`). It is welcome but not
   enforced; this repository has no release automation that depends on it.

3. Run the checks above before opening a PR. Don't open one on a red run; if you must, say so
   and why.

4. Ask which tier a change belongs to before adding it. A recommendation that quietly assumes
   Tier 3 makes the standard less useful to the repositories it is meant for.

5. Update [CHANGELOG.md](CHANGELOG.md) when a change alters what the standard recommends. If it
   adds or tightens a requirement, add an `### Adopter action` list by tier, so a repository
   following the standard knows what to change.

Follow [the compatibility policy](docs/compatibility.md) when changing public interfaces.
Do not publish a release as part of an ordinary implementation PR.

## Using AI coding tools

AI-assisted contributions are welcome. The same bar applies as to any other contribution: you
are responsible for what you submit, not the tool that helped write it.

- **Read and understand every line before submitting.** Verify agent output against the actual
  repository.
- **Run it, don't guess.** Snippets must parse and lint; the CI jobs above check this.
- **Keep the diff scoped to the issue.** Match the existing style.
- **Don't invent.** No fabricated tool options, versions, or SHAs. Resolve a version to its
  commit yourself, and check a claimed behavior against the tool's own documentation.

## Opening a pull request

Use the repository's [PR template](.github/pull_request_template.md) and keep the section
headings as they are. Select exactly one **Documentation impact** option; CI checks it against
the diff.

This is currently a single-maintainer project: the maintainer named in
[CODEOWNERS](.github/CODEOWNERS) reviews and merges each PR once CI is green. The required review
count stays at 0 until a second maintainer has write access; see
[docs/governance.md](docs/governance.md).

## Questions

Open an issue.
