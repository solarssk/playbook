# playbook

playbook is the single source of truth for how `<org>` repositories are maintained:
security posture, CI, documentation structure, and governance. It exists so the same
handful of decisions do not get re-litigated, or silently drift apart, in every
repository separately, each one inventing its own vulnerability-disclosure policy, CI
shape, and README layout from scratch. The standard is organized into four tiers (see
[docs/tiers.md](docs/tiers.md)), each strictly additive on the one before it, so a
single-file configuration repo and a flagship product apply the same document without
either one contradicting the other. It was built by auditing several real
repositories, keeping what worked, and being explicit about what is overkill for a
small project versus what a larger one actually needs. It is deliberately not a copy
of any single existing repository's setup: "the most sophisticated repo in the org
does X" is treated as one input to a tiering decision, never as the decision itself.
This repository is itself maintained at Tier 1: small, single-purpose, one
maintainer, which is why its own README skips the badge row and the audience-routing
table that a larger project in this same standard would need.

## Table of contents

- [How to use this repository](#how-to-use-this-repository)
  - [Adopting the standard in another repo](#adopting-the-standard-in-another-repo)
  - [Browsing this repo as a reference](#browsing-this-repo-as-a-reference)
- [License](#license)

## How to use this repository

There are two real ways this repository gets used, and they call for different entry
points. Either you are bringing another repository in line with this standard, in
which case start with the tiering workflow below, or you already know what you are
looking for and just want the relevant document, in which case skip to the map.

### Adopting the standard in another repo

This is the common case: you maintain, or were asked to bring up to standard, some
*other* `<org>` repository, and want to apply this playbook to it.

1. **Determine that repository's tier.** Work through the questions in
   [docs/tiers.md, "How to pick a tier"](docs/tiers.md#how-to-pick-a-tier). Read the
   repository rather than guessing: what it ships, who depends on it, whether it
   handles another party's data. Pick the lowest tier that is honestly still correct,
   and undershoot when unsure, since it is cheap to add a control later and expensive
   to maintain one nobody needed.
2. **Follow that tier's checklist** in [docs/tiers.md](docs/tiers.md). The tiers are
   additive: Tier 2 means Tier 0 plus Tier 1 plus Tier 2's own list, never a separate
   list picked in isolation. Do not borrow items from a higher tier because they
   looked useful; each one has a cost in upkeep, and a control nobody looks at is not
   a security posture.
3. **Apply only what is missing**, using [templates/](templates/) as starting points
   and [docs/ci-cookbook.md](docs/ci-cookbook.md) for the exact CI wiring. Verify
   against the target repository's real files and real repository settings first,
   not a README claim or a past pull request's description; a prior attempt at a
   control can be partial, buggy, or silently reverted.
4. **Point back to this repo** so the next person, or agent, does not have to
   re-derive the tier from scratch. Add a short block like this to the target
   repository's own `AGENTS.md` (or `CLAUDE.md`) the first time it is assessed:

   ```markdown
   ## Repository standard
   This repository follows the solarssk engineering standard: https://github.com/solarssk/playbook
   Tier: 2 (see playbook/docs/tiers.md)
   ```

   Without that block, the next person or agent to touch the repository has no way
   to tell whether a missing control was never assessed or was deliberately skipped,
   and ends up re-deriving the tier decision from scratch.

See [AGENTS.md](AGENTS.md) for the full version of this workflow, written for AI
coding agents doing the same job, including how to explain tier and rationale in a
pull request description.

### Browsing this repo as a reference

The other case is simpler: you want to read one specific policy or pattern directly,
without adopting anything into another repository. Maybe you are writing a
`SECURITY.md` for a repo that is not otherwise following this standard, or you just
need the exact commit-SHA-pinning syntax for a GitHub Actions workflow. Use the map
below to go straight to the document you need.

| Document | Covers |
|---|---|
| [AGENTS.md](AGENTS.md) | The full standard and adoption workflow, written for AI coding agents. Read natively by Cursor and other AGENTS.md-adopting agent tools; Claude Code reads it through a one-line `CLAUDE.md` stub instead of a second, duplicated file. |
| [docs/tiers.md](docs/tiers.md) | The four-tier system itself: how to pick a tier, and each tier's checklist. Start here for "what does my repo actually need." |
| [docs/readme-standard.md](docs/readme-standard.md) | How a README should be structured, section by section, per tier. This README follows it. |
| [docs/ci-cookbook.md](docs/ci-cookbook.md) | Copy-paste CI recipes: SHA-pinning actions, concurrency groups, CodeQL, Semgrep, gitleaks, Dependabot, container scanning, Codecov, SonarCloud. |
| [docs/openssf.md](docs/openssf.md) | OpenSSF Scorecard workflow and the Best Practices badge: which tier each belongs to, how to read the score, and what not to chase. |
| [docs/deepwiki.md](docs/deepwiki.md) | DeepWiki: an optional generated navigation aid for public repos, why it is never the source of truth, and how to steer it. |
| [docs/governance.md](docs/governance.md) | CODEOWNERS, branch protection, labels and milestones, and the repository settings each tier expects. |
| [docs/security-docs.md](docs/security-docs.md) | How to write `SECURITY.md` and handle vulnerability disclosure, by tier. |
| [templates/](templates/) | Ready-to-copy starter files: a README template, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, and issue and pull request templates. |
| [.github/workflows/release.yml](.github/workflows/release.yml) | Publishes a GitHub Release from the CHANGELOG when a version tag is pushed. The Release is how a repository following this standard learns a newer version exists. |
| [.github/workflows/verify-tier.yml](.github/workflows/verify-tier.yml) | A reusable workflow another repository calls to check itself against this standard automatically, from one place. See docs/ci-cookbook.md #13. |

Nothing here needs to be read end to end. Read the one document your question maps
to, and follow its own links from there. If you are new to this repository and not
here for a specific document, [docs/tiers.md](docs/tiers.md) is the best starting
point: everything else in this repository exists to support one of its tiers.

## License

[MIT](LICENSE).
