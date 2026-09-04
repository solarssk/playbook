# Contributing to <repo-name>

<!--
TIER GUIDANCE (delete this comment block before publishing):

This template is written for a Tier 2 repo (has users beyond the maintainer,
accepts external issues/PRs, and has CI, as defined in docs/tiers.md). Trim
it down for Tier 1 (solo tool, no external contributors expected yet: keep
"Before you start," "Development setup," and "Opening a pull request," and
drop the rest) or expand it for Tier 3 flagship scope: add a Code of Conduct
link, and, once a second maintainer actually has write access (which often
but not always coincides with reaching Tier 3), path-specific review routing
per CODEOWNERS and a stricter "don't merge your own PR" rule. See
docs/tiers.md for the full tier definitions and docs/governance.md for the
CODEOWNERS/branch protection detail behind this section.
-->

Thanks for your interest in contributing. This document covers the practical
steps for proposing a change.

<!-- Tier 3 only: uncomment once a CODE_OF_CONDUCT.md exists.
By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
-->

## Before you start

- For anything beyond a small fix, open an issue first to discuss the
  approach. This avoids wasted work on changes that don't fit the project's
  scope.
- Search existing issues before opening a new one; someone may already be
  working on it.
- Found a security vulnerability? Do **not** open a public issue. Follow
  [SECURITY.md](SECURITY.md) instead.

## Ways to contribute

| Type | Where to start |
|------|-----------------|
| Bug report | Open a [Bug report](../../issues/new?template=bug.yml) issue. Include reproduction steps and expected vs. actual behavior. Strip secrets and personal data from any logs first. |
| Feature request | Open an issue describing the goal, scope, and what "done" looks like. |
| Code change | Fork or branch, then open a pull request (see below). |
| Documentation | <Describe where docs live and how they're published, e.g. "in `docs/`, rendered from `main`" or "on the GitHub Wiki, edited directly."> |

## Development setup

<Point to the single source of truth for local setup, usually the README's
own "Quick start" or "Development" section, rather than duplicating install
steps here. Two copies of the same instructions drift out of sync.>

See [README.md](README.md#quick-start) for prerequisites and local setup.

## Making a change

1. Branch from `main`:

   | Prefix | Use for |
   |--------|---------|
   | `feature/<slug>` | New functionality |
   | `fix/<slug>` | Bug fixes |
   | `chore/<slug>` | Maintenance, dependencies, tooling |
   | `docs/<slug>` | Documentation only |

2. Commit using a clear, consistent format. <If the repo uses Conventional
   Commits, say so and link https://www.conventionalcommits.org/; otherwise
   describe the house style in one line.>

3. Run the test suite and any linters/type checks before opening a PR. <List
   the actual commands, e.g. `npm test`, `pytest`, `ruff check .`.> Don't open
   a PR on a red suite; if you must, say so explicitly and why.

4. Match the style already used in the file or package you're editing.

## Using AI coding tools

AI-assisted contributions are welcome. The same bar applies as to any other
contribution: you're responsible for what you submit, not the tool that helped
write it.

A few practices that keep AI-assisted PRs useful instead of noisy:

- **Read and understand every line before submitting.** Don't paste
  agent output you haven't verified against the actual codebase.
- **Run it, don't guess.** Build, typecheck, and run the real test suite.
  "Looks correct" isn't a substitute for a passing run.
- **Keep the diff scoped to the issue.** Agents tend to "improve" adjacent
  code or add speculative abstractions. Resist that: ship the minimum change
  that solves the stated problem, matching existing style.
- **Don't invent.** No fabricated APIs, made-up test coverage, or confident
  claims about behavior you haven't actually checked.
- **Write commits and PR text like a human would.** Describe what changed and
  why, without tool-generated boilerplate.

## Opening a pull request

Use the repository's [PR template](.github/pull_request_template.md) and keep
the section headings as they are.

<!-- While this is a single-maintainer project: state review ownership
explicitly rather than leaving it implicit.
This is currently a single-maintainer project: @<maintainer-handle> reviews
and merges every PR, including their own, once CI is green. There's no one
else to hand it to yet.
-->

<!-- Once a second maintainer has write access: replace the paragraph above
with something like this instead.
Please don't merge your own PR. Request review from another maintainer
listed in CODEOWNERS and wait for approval.
-->

<!-- Only if delete_branch_on_merge is intentionally off, e.g. for a
stacked-PR workflow. Otherwise delete this note.
Branches aren't auto-deleted on merge in this repo: a later branch's base is
sometimes an earlier, still-open PR's branch, so branches routinely need to
outlive their own PR's merge.
-->

## Questions

Open an issue, or reach **@<maintainer-handle>**.
