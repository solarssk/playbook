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

There is nothing to build. To run the same checks CI runs:

```bash
node --test "scripts/**/*.test.mjs"   # unit tests for the verification scripts
node scripts/release-check.mjs        # workflow pin and CHANGELOG agree
node scripts/verify-tier.mjs          # this repository against its own standard (set INPUT_TIER=2)
python scripts/check_doc_snippets.py  # every YAML/JSON snippet in the docs parses (--extract also writes workflow snippets to .snippet-workflows/ for actionlint)
```

`actionlint` and `zizmor` lint the workflows; both run offline against a checkout. Install the
Python dependency from the hash-pinned lockfile:
`python -m pip install --require-hashes --only-binary :all: --no-deps -r scripts/requirements.txt`.

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
