# AGENTS.md

This file is for AI coding agents, and for anyone reading it as a checklist. If you're a human
looking for an overview of what this repository is, read [README.md](README.md) first. This
file assumes you already know that and goes straight to instructions.

## What this repository is for

This repository (the playbook) is the single source of truth for how solarssk repositories are
maintained: security posture, CI, documentation structure, and governance. It exists so the same
handful of decisions don't get re-litigated, or silently drift apart, in every repository
separately. Other repositories point at this one instead of duplicating its content.

It is **not** a checklist copied from any one existing repository. It's a tiered standard, see
[docs/tiers.md](docs/tiers.md), built by auditing several real repositories, keeping what worked,
and being explicit about what's overkill for a smaller project. Treat "the most sophisticated
repo in the org does X" as an input to a decision, never as the decision itself.

## If you were sent here from another repository

Someone pointed you at this repo because you're working on a *different* repository and were
asked to bring it in line with this standard, or to check whether it already is. Do this:

1. **Determine that repository's tier.** Use the questions in
   [docs/tiers.md, "How to pick a tier"](docs/tiers.md#how-to-pick-a-tier). Don't guess: read the
   repo (what does it ship, who depends on it, does it handle another party's data) and pick the
   lowest tier that's honestly still correct. When genuinely unsure, undershoot.
2. **Read that tier's checklist** in [docs/tiers.md](docs/tiers.md), remembering it's additive.
   Tier 2 means Tier 0 plus Tier 1 plus Tier 2's own list.
3. **Check what's actually already there before proposing changes.** Read the real files and the
   real repository settings (`gh api repos/<owner>/<repo>`, `gh api
   repos/<owner>/<repo>/branches/<default>/protection`). Don't infer compliance from a README
   claim, a comment, or what a previous PR *said* it did. A past attempt at a fix can be partial,
   buggy, or silently reverted; verify against the artifact, not the description of it. This
   matters especially for anything CI-shaped: read the actual workflow YAML, not just its
   filename.
4. **Apply only what's missing**, using [templates/](templates/) as starting points and
   [docs/ci-cookbook.md](docs/ci-cookbook.md) for the exact CI wiring. Don't add Tier 3 machinery
   to a Tier 1 repo because it happened to be convenient to copy.
5. **Explain tier and rationale in the PR description**: which tier you determined the repo to
   be, and for anything you deliberately did *not* add (a required-review count staying at 0 for
   a solo-maintained repo, for example), say so explicitly rather than leaving a silent gap that
   reads as an oversight later.
6. **Optionally, wire up automatic verification** so future drift gets caught without another
   agent re-reading the whole repo: add a workflow that calls
   [.github/workflows/verify-tier.yml](.github/workflows/verify-tier.yml), pinned to a released
   tag. See [docs/ci-cookbook.md #13](docs/ci-cookbook.md#13-verifying-a-repo-against-this-standard-automatically)
   for the exact call and what it can and can't check on its own.

To make step 1 discoverable without re-deriving it every time, that repository's own AGENTS.md
(or CLAUDE.md) should carry a short pointer block once it's been assessed:

```markdown
## Repository standard
This repository follows the solarssk engineering standard: https://github.com/solarssk/playbook
Tier: 2 (see playbook/docs/tiers.md)
```

Add that block the first time you bring a repository up to standard, so the next agent doesn't
have to re-derive the tier from scratch.

## If you're working on this repository itself

- **This repo is small on purpose.** It's documentation and templates, not a running service.
  Tier 0/1 hygiene applies to it (LICENSE, CODEOWNERS, a minimal CI that lints Markdown/YAML). It
  does not need Tier 2+ machinery, because it doesn't ship a service or a container.
- **No personal narrative, anywhere in this repo.** Every rule here is stated as a generic
  engineering principle on its own merits. "A reporter needs a private channel to disclose a
  vulnerability before it's public" is fine reasoning; "because the maintainer doesn't use a work
  laptop" is not. Nothing here should reference who owns this GitHub account, their employment
  situation, device setup, or any other biographical detail. If the reasoning you're about to
  write only makes sense with that context, find the generic version of the reasoning instead, or
  cut the sentence.
- **No real infrastructure details, ever.** No real IPs, hostnames, device models, or usernames,
  including in examples. Use clearly fictional placeholders (`<owner>/<repo>`, `192.0.2.0/24`,
  `@<maintainer-handle>`).
- **Keep it tiered, resist "just copy the best example."** When updating a doc or template based
  on something observed in a real repository, ask which tier it actually belongs at before
  adding it. The fastest way for this repo to become useless is for every addition to assume
  Tier 3.
- **Every code snippet in this repo must be syntactically correct and copy-paste-ready.** This
  repo is read by agents that will paste snippets directly into real CI files; a snippet that
  looks plausible but doesn't parse is worse than no snippet.
- **Write plainly.** No em dashes; use periods, commas, or colons instead. Avoid stock filler
  phrasing ("it's important to note," "in today's fast-paced world," "leverage," "seamless,"
  "robust," "game-changer"). Say the specific thing. If a sentence would read the same with the
  specifics removed, cut it.
- **Update [CHANGELOG.md](CHANGELOG.md)** for any change that alters what the standard actually
  recommends, not for typo fixes. Repositories that adopted an earlier version benefit from being
  able to see what changed and why.

## Agent-instruction files across tools

An adopting repository should carry its agent instructions in one real file, plus a
one-line stub for any tool that doesn't read that file natively:

- `AGENTS.md` (repo root) holds the actual content: build/test commands, code style,
  architectural context. It's read natively by Cursor's Project Rules system and by
  other AGENTS.md-adopting agents, as an alternative to a tool-specific rules file for
  straightforward cases.
- `CLAUDE.md` (repo root) is a single line, `@AGENTS.md`, for tools that don't read
  AGENTS.md natively (Claude Code is one). This repo's own `CLAUDE.md` is the working
  example: it imports this file rather than duplicating it.
- `.cursor/rules/*.mdc` is worth adding only when a repository needs Cursor-specific
  rules a flat AGENTS.md can't express: glob-scoped or agent-requested activation for
  a subset of files. Skip it in the baseline otherwise. Never use the older root
  `.cursorrules` file; it's deprecated in favor of `.cursor/rules/*.mdc` and AGENTS.md.

One real file beats three redundant ones that can silently drift apart the next time
any one of them is updated.

## Map of this repository

| File | Purpose |
|---|---|
| [README.md](README.md) | Human-facing overview: what this is, how to adopt it |
| [docs/tiers.md](docs/tiers.md) | The tier system. Start here for "what does my repo need" |
| [docs/readme-standard.md](docs/readme-standard.md) | How a README should be structured, per tier |
| [docs/ci-cookbook.md](docs/ci-cookbook.md) | Copy-paste recipes: CodeQL, Semgrep, gitleaks, Dependabot, Trivy, Codecov, SonarCloud, concurrency, SHA-pinning |
| [docs/governance.md](docs/governance.md) | CODEOWNERS, branch protection, labels/milestones, repo settings |
| [docs/security-docs.md](docs/security-docs.md) | How to write SECURITY.md and handle vulnerability disclosure |
| [templates/](templates/) | Ready-to-copy starter files |
| [.github/workflows/verify-tier.yml](.github/workflows/verify-tier.yml) | A reusable workflow another repo calls to check itself against this standard automatically. See docs/ci-cookbook.md #13 |

## Conventions for this repo's own commits and PRs

- Conventional-commit-style prefixes (`docs:`, `fix:`, `chore:`) are welcome but not enforced.
  This repo has no automated release process that depends on them.
- A change to a template file should note, in the PR description, which tier(s) it affects and
  whether it's a breaking change for repositories that already adopted the old version.
