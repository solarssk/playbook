# README standard

Write a README that explains what the project does, gets readers started, and links to deeper docs. Pick the repository's [tier](tiers.md#how-to-pick-a-tier), follow its required sections, and treat sections above that tier as optional. Use [`templates/README.template.md`](../templates/README.template.md) as the starting point; this guide explains the section choices.

The standard combines [Standard Readme](https://github.com/RichardLitt/standard-readme) section ordering, the [AGENTS.md convention](https://agents.md) for agent-facing context, and lessons from auditing production repositories. See [the deliberate deviations](#deviations-from-standard-readme) for differences from Standard Readme.

## Table of contents

- [The core principle](#the-core-principle)
- [Tiers](#tiers)
- [Section order by tier](#section-order-by-tier)
- [Badges](#badges)
- [The "who are you" routing table](#the-who-are-you-routing-table)
- [Table of contents (in your README)](#table-of-contents-in-your-readme)
- [Quick start / Install / Usage](#quick-start--install--usage)
- [README vs AGENTS.md vs docs/*](#readme-vs-agentsmd-vs-docs)
- [Deviations from Standard Readme](#deviations-from-standard-readme)
- [Checklist](#checklist)

## The core principle

**Open with one paragraph that explains what the project is and why it exists, before a single line of setup instruction.**

Readers need to understand the project and its value before setup commands are useful. Badges, a table of contents, and a `docker compose up` command cannot replace that explanation.

Concretely:

- The first paragraph after the title is prose, not a table, not a badge row, not a bullet list. It describes the problem and the solution in plain language a new reader can absorb in ten seconds.
- Say what the project replaces or avoids, if that's the reason it exists. "Self-hosted alternative to `<paid SaaS product>`'s `<feature>`, without the recurring fee or handing data to a third party" tells a reader more in one line than a feature table does.
- Naming the non-goals is often as useful as naming the goals: a short "it does **not** do X, Y, Z" list prevents a reader from evaluating the project against a use case it was never meant to cover, and prevents an agent from "fixing" a deliberate omission.
- Setup instructions (Install, Quick start, Usage) always come *after* this paragraph, never before it, regardless of tier.

## Tiers

A tier is a floor, not a target. Do not add Tier 3 sections to a Tier 1 README for consistency: unused tables, badges, and cross-links add maintenance.

| | Tier 1: small, single-purpose tools | Tier 2: public tools with real dependents | Tier 3: flagship |
|---|---|---|---|
| **Shape** | Single-purpose script, small library, a config repo, a single GitHub Action | A real service or tool: has install/configure/deploy steps, its own CI, its own release versioning | A product with genuinely distinct audiences and/or a monorepo of independently-documented components |
| **Audience** | One audience, usually also the maintainer | One primary audience (operator and developer are typically the same person) | Multiple *distinct* audiences who each need a different entry point |
| **Deployment surface** | None, or "copy this file" | Real: containers, environment variables, a reverse proxy, a database | Real, plus a distinct production deployment path from local development |
| **Typical length** | Under ~60 lines | 60–250 lines | 150+ lines, but structured so no single audience has to read all of it |

If unsure between two tiers, pick the lower one. Add sections when a new audience or artifact requires them, not in anticipation.

## Section order by tier

Sections are listed in the order they should appear. "Required" means the README is incomplete without it. "Optional" means include it only when the repo genuinely has that content. An empty or boilerplate version of an optional section is worse than omitting it.

### Tier 1: small, single-purpose tools

1. **Title** (`#`): must match the repository name exactly.
2. **Description** (required), the core-principle paragraph above: what it is, why it exists. Two to four sentences.
3. **Install / Usage** (required): usually a single combined section for a Tier 1 repo; copy-paste-runnable.
4. **Configuration** (optional): only if there's more than one or two settings; otherwise fold into Usage.
5. **License** (required): final section, always.

Nothing else is required. No badges, no table of contents, no routing table, no documentation map: all of those cost more upkeep than a two-file repo can justify. If the repo has an `AGENTS.md`, one line pointing to it is enough (see [README vs AGENTS.md](#readme-vs-agentsmd-vs-docs)); nothing more.

### Tier 2: public tools with real dependents

1. **Title**: matches the repository name.
2. **Description** (required): the core-principle paragraph, plus, where useful, a short explicit list of what the project deliberately does *not* do.
3. **Badges** (optional, see [Badges](#badges)).
4. **Table of contents** (required once the README exceeds ~100 lines, see [Table of contents](#table-of-contents-in-your-readme)).
5. **Documentation links** (optional): a short list or small table pointing to `docs/*.md`, `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`. Link out; do not summarize their contents here beyond one clause per link. This is *not* the audience-routing table described below. It's a plain reference list for the one audience this tier serves.
6. **Quick start / Install** (required): copy-paste-runnable, verified against the repo's actual current commands.
7. **Usage / Configuration** (required), how to actually operate the thing day to day: primary commands, key environment variables, common flags. Keep to what a working session needs; push exhaustive reference material to a linked doc.
8. **API / Endpoints reference** (optional): for anything exposing a network interface, a short table (method, path, purpose) is almost always worth including; it's high value per line.
9. **Security at a glance** (optional but recommended once the project has any network exposure, secrets, or auth surface): three to six bullets of the most important guarantees ("no mailbox enumeration," "secrets never logged"), plus a link to `SECURITY.md` for the full model. Do not inline the full threat model here.
10. **Additional sections as needed** (deployment notes, troubleshooting summary, logging/observability): each kept short, linking to a doc for depth rather than expanding in place.
11. **Contributing** (optional): a pointer to `CONTRIBUTING.md`, not the process itself.
12. **License** (required): final section, always.

### Tier 3: flagship (additional, on top of Tier 2)

Everything in Tier 2 applies; these are the additions, in the position they should be inserted:

- **Banner / logo** (optional): above the title, only if the project already has one; do not commission one just to fill this slot.
- **Full badge row** (optional, expands on Tier 2's badges, see [Badges](#badges)).
- **"Who are you" routing table** (optional, high-value *only* when justified, see [the routing table section](#the-who-are-you-routing-table)): placed immediately after the description, before any setup content.
- **Architecture / flow diagram** (optional): a short Mermaid diagram showing the primary data or request flow earns its place when the system has more than two or three moving parts; skip it if it would just restate the description paragraph as boxes and arrows.
- **Features table** (optional): useful once there are more features than fit comfortably in prose; a two- or three-column table (area / what it does) scans faster than paragraphs.
- **Stack table** (optional): a table of the primary runtime, framework, and infrastructure choices; useful mainly as a fast compatibility check for a developer or integrator deciding whether to invest time.
- **Repo layout table** (optional, monorepos only): path-to-role mapping with a link into each component's own README.
- **Roadmap** (optional): a pointer to `CHANGELOG.md` or a versioning document, not a duplicated status list. Anything that changes over time (what's shipped, what's next) belongs in exactly one place; a second copy in the README will drift.

## Badges

Badges are worth including when each one is a true, current, actionable signal, not decoration. Before adding a badge, ask: *does this tell a reader something they'd otherwise have to go find out?*

**Worth it, in this order:**

1. **CI status**: if the repo has a CI workflow, a passing/failing badge is the fastest possible trust signal.
2. **License**: especially for anything public; answers a real question in one glance.
3. **Latest release / version**: if the project cuts versioned releases, this saves a trip to the releases page.
4. **Platform support** (e.g., which container architectures are published): worth it specifically when it answers "will this run on my hardware," which is a real decision point for self-hosted software.
5. **OpenSSF Scorecard**: at Tier 2 and above on a public repo, once the workflow has published a result. Before the first run it renders as an error image. See [openssf.md](openssf.md#scorecard-workflow).
6. **OpenSSF Best Practices**: at Tier 3, only once the passing level is reached. See [openssf.md](openssf.md#best-practices-badge).

**Optional, never required:** the DeepWiki badge, and only after someone has read the generated wiki and judged it accurate. It is an endorsement of a machine-written page. See [deepwiki.md](deepwiki.md#adopting-it).

**Usually not worth it:**

- A row of language/framework badges (runtime version, web framework, database, ORM) that just restates the Stack table in icon form. It adds visual weight without adding information the reader didn't already have one section away. Treat this as optional flourish at Tier 3 at most, never required, and skip it entirely below Tier 3.
- Any badge for a tier the repo hasn't reached: a release badge on a repo that has never cut a tagged release, a CI badge pointing at a workflow that doesn't exist yet.

Skip badges entirely at Tier 1. A two-file config repo has no CI run, no release cadence, and no platform matrix worth signaling. A badge row there is pure ceremony.

## The "who are you" routing table

Use a routing table only for **distinct audiences needing different entry points**. For example, end users, operators, developers, and security reviewers may each need a separate document.

| Reader situation | README structure |
|---|---|
| Operator and developer are the same person | One linear README; no routing table |
| Readers differ only by topic of interest | Documentation links, not audience routing |
| Several rows send one audience back to the same README | Remove the redundant routing table |
| Distinct audiences need separate documents | One row per audience, each linking to exactly one document |

Place a justified routing table immediately after the description, before setup content. Readers should not have to scroll past another audience's setup to find their entry point.

## Table of contents (in your README)

A table of contents is **required above roughly 100 lines**, optional below that, following the Standard Readme threshold.

To keep it accurate:

- Every table-of-contents entry must be a working relative link to the section's generated anchor (lowercase, spaces to hyphens, punctuation stripped). Verify this after any heading rename, not just at creation. A broken TOC anchor is a bug, not a cosmetic nit.
- For a long TOC (Tier 3-length README), wrap it in a collapsed `<details><summary>` block so it doesn't push real content below the fold on load.
- Update the table of contents in the same change that adds, removes, or renames a heading, never as a separate cleanup pass. Treat it the same way you'd treat a stale link: something to fix in the commit that broke it.
- If the repo's tooling already includes a markdown formatter or linter, prefer an automated TOC generator over hand-maintenance; if not, hand maintenance is fine as long as the update happens in the same commit as the heading change.

## Quick start / Install / Usage

Treat the quick start as a tested artifact. Readers should not have to debug stale commands:

- Every command in this section must work against the repository's **current** state: current script names, current environment variable names, current flags. Do not carry forward a command that used to be correct.
- When a change to the codebase renames a script, a config key, or a CLI flag that appears in the README, updating the README is part of that change, not a follow-up task.
- Prefer a single copy-paste-able block over a prose description of steps. Numbered prose steps are acceptable when a step is inherently manual (e.g., "click Add New Plugin in wp-admin"), but anything scriptable should be an actual command.
- Show the minimum path to a working result first. Configuration variants, advanced flags, and edge cases belong after the minimal path succeeds, or in a linked doc, not interleaved with it.
- If the project has both a "fast/dev" path and a "production" path (e.g., hot-reload dev server vs. a built production bundle, or a local Compose file vs. a production deployment), show the dev path in Quick Start and link to a dedicated deployment doc for production. Don't merge the two into one ambiguous block.
- If the project's test suite or CI can exercise the documented commands, that's the strongest guarantee against drift; where practical, prefer a quick start built from commands the CI already runs over commands that exist only in the README.

## README vs AGENTS.md vs docs/*

Keep each kind of content in one canonical place:

| | Audience | Contents |
|---|---|---|
| **`README.md`** | A human (or an agent) deciding *whether and how* to use or run the project | What it is, why it exists, how to get it running, where to go next |
| **`AGENTS.md`** | An AI coding agent *working inside* the codebase | Build/test commands, code style and lint conventions, architectural context an agent needs to make correct changes, PR/commit conventions |
| **`docs/*.md`** | A human or agent going deep on one topic | Full architecture and design-decision writeups, complete threat models, deployment runbooks, troubleshooting guides, compatibility notes |

Move library-selection narratives, algorithm explanations, and deployment compatibility logs to `docs/`, with a one-line summary and link from the README. Link to `AGENTS.md` for build, lint, and style instructions rather than duplicating them. Creating a missing `AGENTS.md` is outside this README standard's scope; its absence is not a reason to put those instructions in the README.

Keep a section in the README if readers need it to decide whether to use the project or get it running. Link out when it supplies deeper context instead.

## Deviations from Standard Readme

This standard follows [Standard Readme](https://github.com/RichardLitt/standard-readme)'s section ordering and its core formatting rules (no broken links, section titles link from the table of contents, code examples must actually work) closely, with three deliberate departures:

1. **Tiering.** Standard Readme describes one README shape with optional sections; this document adds explicit tiers so that "optional" has a concrete answer ("optional, and skip it below Tier 2") instead of being left to individual judgment on every repo.
2. **AGENTS.md integration.** Standard Readme predates the AGENTS.md convention and has no position on it. This standard treats AGENTS.md as the answer to "where does agent-facing technical detail go instead of the README," which is now a real question every repo in this organization has to answer.
3. **Security placement.** Standard Readme lists Security as an early, optional section (for security-disclosure contact info). This standard keeps that but adds "Security at a glance" as a short, later Tier 2+ section for a different purpose: a few bullets of the most security-relevant guarantees, linking to `SECURITY.md` for the full model, because several repos in this organization have a real network or secrets-handling surface worth summarizing in-line, not just a disclosure contact.

## Checklist

Run this against any README, new or existing, to self-assess against this standard. Each item should be a clean yes.

1. Does the first paragraph explain what the project is and why it exists, before any setup instruction appears?
2. Does the title match the repository name exactly?
3. Is there a License section, and is it the last section in the file?
4. If the README is longer than ~100 lines, is there a table of contents, and does every entry link to a working anchor?
5. Do all Quick Start / Install / Usage commands actually work against the project's current code, not a previous version of a script name, flag, or config key?
6. If badges are present, is each one a true, current, meaningful signal (CI, license, release, platform support) rather than decoration?
7. Is a "who are you" routing table present only if the project genuinely serves more than one distinct audience with different entry points, and absent otherwise?
8. Does deep technical or architectural content (algorithms, design-decision narratives, full threat models) live in `docs/` or `AGENTS.md`, with only a link and a one-line summary in the README?
9. If the repo has an `AGENTS.md`, does the README link to it for build/test/style detail instead of restating that content?
10. Are Contributing and Security handled as short pointers to `CONTRIBUTING.md` / `SECURITY.md` rather than inlined processes?
11. Are there no broken internal links: relative paths to docs, section anchors, the `LICENSE` file?
12. Is anything that changes over time (roadmap, what's shipped, what's next) tracked in exactly one canonical place (e.g., `CHANGELOG.md`) rather than duplicated in the README, where it will drift?
</content>
