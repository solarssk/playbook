# README Standard

This document defines how `README.md` should be written for any repository owned
by this organization. It is tiered, not one-size-fits-all: a two-file config
repo and a multi-service product do not need the same README, and forcing them
to converge on the same template produces either a bloated README on the small
repo or a thin, unhelpful one on the large repo. Pick a tier, follow its
required section list, and treat everything above that tier as optional.

This standard is informed by three things:

1. The [**Standard Readme** specification](https://github.com/RichardLitt/standard-readme),
   an established open convention for section order and formatting. This
   document follows its ordering logic where it applies, and departs from it
   explicitly where a tiered, multi-repo organization has different needs
   (see [Deviations from Standard Readme](#deviations-from-standard-readme)).
2. The [**AGENTS.md** convention](https://agents.md), an open spec for giving
   AI coding agents build/test/style/architecture context in a dedicated file
   separate from the human-facing README.
3. Patterns observed to actually work, and to actually fail, across a
   cross-repo audit of real, in-production repositories of varying size and
   audience. Where this document recommends against something (a missing
   table of contents, a routing table on a single-audience tool, deep
   algorithmic narrative inlined into a README), that recommendation traces
   back to a concrete, observed case, not a hypothetical.

Use the companion file, [`templates/README.template.md`](../templates/README.template.md),
as the literal starting point for a new or rewritten README. This document
explains the *why*; the template is the *what to paste*.

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

**Open with one paragraph that explains what the project is and why it
exists, before a single line of setup instruction.**

This is the single most valuable habit in this entire standard, and it is
the one thing every genuinely good README shares regardless of tier or
length. A reader, human or AI agent, who has never seen the repo before
needs to answer two questions before anything else is useful to them: *what
does this do*, and *why would I want it instead of the obvious alternative*.
A wall of badges, a table of contents, or a `docker compose up` command
answers neither.

Concretely:

- The first paragraph after the title is prose, not a table, not a badge
  row, not a bullet list. It describes the problem and the solution in
  plain language a new reader can absorb in ten seconds.
- Say what the project replaces or avoids, if that's the reason it exists.
  "Self-hosted alternative to `<paid SaaS product>`'s `<feature>`, without
  the recurring fee or handing data to a third party" tells a reader more in
  one line than a feature table does.
- Naming the non-goals is often as useful as naming the goals: a short
  "it does **not** do X, Y, Z" list prevents a reader from evaluating the
  project against a use case it was never meant to cover, and prevents an
  agent from "fixing" a deliberate omission.
- Setup instructions (Install, Quick start, Usage) always come *after* this
  paragraph, never before it, regardless of tier.

## Tiers

Pick a tier based on the repository's actual shape, not its ambition. A tier
is a floor, not a target. Do not add Tier 3 sections to a Tier 1 repo
"for consistency." An oversized README is a maintenance liability: every
extra table, badge, and cross-link is one more thing that goes stale.

| | Tier 1: small, single-purpose tools | Tier 2: public tools with real dependents | Tier 3: flagship |
|---|---|---|---|
| **Shape** | Single-purpose script, small library, a config repo, a single GitHub Action | A real service or tool: has install/configure/deploy steps, its own CI, its own release versioning | A product with genuinely distinct audiences and/or a monorepo of independently-documented components |
| **Audience** | One audience, usually also the maintainer | One primary audience (operator and developer are typically the same person) | Multiple *distinct* audiences who each need a different entry point |
| **Deployment surface** | None, or "copy this file" | Real: containers, environment variables, a reverse proxy, a database | Real, plus a distinct production deployment path from local development |
| **Typical length** | Under ~60 lines | 60–250 lines | 150+ lines, but structured so no single audience has to read all of it |

If in doubt between two tiers, pick the lower one and let the README grow
into the next tier when a real section demands it (a second audience shows
up, CI starts publishing artifacts worth badging, etc.). It is much cheaper
to add a section later than to carry an unused one indefinitely.

## Section order by tier

Sections are listed in the order they should appear. "Required" means the
README is incomplete without it. "Optional" means include it only when the
repo genuinely has that content. An empty or boilerplate version of an
optional section is worse than omitting it.

### Tier 1: small, single-purpose tools

1. **Title** (`#`): must match the repository name exactly.
2. **Description** (required), the core-principle paragraph above: what it
   is, why it exists. Two to four sentences.
3. **Install / Usage** (required): usually a single combined section for a
   Tier 1 repo; copy-paste-runnable.
4. **Configuration** (optional): only if there's more than one or two
   settings; otherwise fold into Usage.
5. **License** (required): final section, always.

Nothing else is required. No badges, no table of contents, no routing table,
no documentation map: all of those cost more upkeep than a two-file repo
can justify. If the repo has an `AGENTS.md`, one line pointing to it is
enough (see [README vs AGENTS.md](#readme-vs-agentsmd-vs-docs)); nothing
more.

### Tier 2: public tools with real dependents

1. **Title**: matches the repository name.
2. **Description** (required): the core-principle paragraph, plus, where
   useful, a short explicit list of what the project deliberately does
   *not* do.
3. **Badges** (optional, see [Badges](#badges)).
4. **Table of contents** (required once the README exceeds ~100 lines, see
   [Table of contents](#table-of-contents-in-your-readme)).
5. **Documentation links** (optional): a short list or small table
   pointing to `docs/*.md`, `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`.
   Link out; do not summarize their contents here beyond one clause per
   link. This is *not* the audience-routing table described below. It's a
   plain reference list for the one audience this tier serves.
6. **Quick start / Install** (required): copy-paste-runnable, verified
   against the repo's actual current commands.
7. **Usage / Configuration** (required), how to actually operate the
   thing day to day: primary commands, key environment variables, common
   flags. Keep to what a working session needs; push exhaustive reference
   material to a linked doc.
8. **API / Endpoints reference** (optional): for anything exposing a
   network interface, a short table (method, path, purpose) is almost
   always worth including; it's high value per line.
9. **Security at a glance** (optional but recommended once the project has
   any network exposure, secrets, or auth surface): three to six bullets
   of the most important guarantees ("no mailbox enumeration," "secrets
   never logged"), plus a link to `SECURITY.md` for the full model. Do not
   inline the full threat model here.
10. **Additional sections as needed** (deployment notes, troubleshooting
    summary, logging/observability): each kept short, linking to a doc for
    depth rather than expanding in place.
11. **Contributing** (optional): a pointer to `CONTRIBUTING.md`, not the
    process itself.
12. **License** (required): final section, always.

### Tier 3: flagship (additional, on top of Tier 2)

Everything in Tier 2 applies; these are the additions, in the position they
should be inserted:

- **Banner / logo** (optional): above the title, only if the project
  already has one; do not commission one just to fill this slot.
- **Full badge row** (optional, expands on Tier 2's badges, see
  [Badges](#badges)).
- **"Who are you" routing table** (optional, high-value *only* when
  justified, see [the routing table section](#the-who-are-you-routing-table)):
  placed immediately after the description, before any setup content.
- **Architecture / flow diagram** (optional): a short Mermaid diagram
  showing the primary data or request flow earns its place when the system
  has more than two or three moving parts; skip it if it would just
  restate the description paragraph as boxes and arrows.
- **Features table** (optional): useful once there are more features than
  fit comfortably in prose; a two- or three-column table (area / what it
  does) scans faster than paragraphs.
- **Stack table** (optional): a table of the primary runtime, framework,
  and infrastructure choices; useful mainly as a fast compatibility check
  for a developer or integrator deciding whether to invest time.
- **Repo layout table** (optional, monorepos only): path-to-role mapping
  with a link into each component's own README.
- **Roadmap** (optional): a pointer to `CHANGELOG.md` or a versioning
  document, not a duplicated status list. Anything that changes over time
  (what's shipped, what's next) belongs in exactly one place; a second copy
  in the README will drift.

## Badges

Badges are worth including when each one is a true, current, actionable
signal, not decoration. Before adding a badge, ask: *does this tell a
reader something they'd otherwise have to go find out?*

**Worth it, in this order:**

1. **CI status**: if the repo has a CI workflow, a passing/failing badge
   is the fastest possible trust signal.
2. **License**: especially for anything public; answers a real question
   in one glance.
3. **Latest release / version**: if the project cuts versioned releases,
   this saves a trip to the releases page.
4. **Platform support** (e.g., which container architectures are
   published): worth it specifically when it answers "will this run on my
   hardware," which is a real decision point for self-hosted software.

**Usually not worth it:**

- A row of language/framework badges (runtime version, web framework,
  database, ORM) that just restates the Stack table in icon form. It adds
  visual weight without adding information the reader didn't already have
  one section away. Treat this as optional flourish at Tier 3 at most,
  never required, and skip it entirely below Tier 3.
- Any badge for a tier the repo hasn't reached: a release badge on a repo
  that has never cut a tagged release, a CI badge pointing at a workflow
  that doesn't exist yet.

Skip badges entirely at Tier 1. A two-file config repo has no CI run, no
release cadence, and no platform matrix worth signaling. A badge row there
is pure ceremony.

## The "who are you" routing table

A table near the top of the README that says "if you are role X, start
here; if you are role Y, start there" is a powerful pattern for exactly one
situation: **the project genuinely has more than one audience who need
different entry points and would otherwise get lost in content meant for
someone else.** A real example of "genuinely multi-audience": a self-hosted
product with end users who never touch code, IT operators who deploy and
run it, developers who build it, and a security/compliance reviewer who
needs to evaluate it before it's adopted: four audiences, four different
documents, none of which is a subset of another.

That is the bar. Below it, a routing table is needless ceremony:

- If the operator and the developer are the same person (true for most
  self-hosted single-service tools), there is nothing to route between:
  one linear README serves them both.
- If "routing" really just means "here are the docs," that's a plain
  documentation list (Tier 2's "Documentation links" section), not an
  audience table. The tell is whether the rows differ by *who the reader
  is* or just by *what topic they want*: only the former justifies this
  pattern.
- A routing table that ends up with three of four rows pointing a
  single-audience reader back into the same README is a sign the table
  shouldn't exist.

When it *is* justified, place it immediately after the description
paragraph and before any setup content. A multi-audience reader should
never have to scroll past a Quick Start meant for someone else to find
their own starting point. Keep one row per audience, each pointing to
exactly one document.

## Table of contents (in your README)

Follow the Standard Readme threshold: **required once the README exceeds
roughly 100 lines**, optional below that. A short, single-screen README
doesn't need a navigation aid; a long one does, and skipping it is a real,
observed failure mode: a README with two dozen section headers and no
table of contents forces every reader to scroll-hunt for the one section
they need.

To keep it accurate:

- Every table-of-contents entry must be a working relative link to the
  section's generated anchor (lowercase, spaces to hyphens, punctuation
  stripped). Verify this after any heading rename, not just at creation.
  A broken TOC anchor is a bug, not a cosmetic nit.
- For a long TOC (Tier 3-length README), wrap it in a collapsed
  `<details><summary>` block so it doesn't push real content below the
  fold on load.
- Update the table of contents in the same change that adds, removes, or
  renames a heading, never as a separate cleanup pass. Treat it the same
  way you'd treat a stale link: something to fix in the commit that broke
  it.
- If the repo's tooling already includes a markdown formatter or linter,
  prefer an automated TOC generator over hand-maintenance; if not, hand
  maintenance is fine as long as the update happens in the same commit as
  the heading change.

## Quick start / Install / Usage

A stale quick start is worse than no quick start. It actively costs a new
reader more time than figuring it out from source would have, because they
trust it first and only discover it's wrong after it fails. Treat this
section as a tested artifact, not documentation prose:

- Every command in this section must work against the repository's
  **current** state: current script names, current environment variable
  names, current flags. Do not carry forward a command that used to be
  correct.
- When a change to the codebase renames a script, a config key, or a CLI
  flag that appears in the README, updating the README is part of that
  change, not a follow-up task.
- Prefer a single copy-paste-able block over a prose description of steps.
  Numbered prose steps are acceptable when a step is inherently manual
  (e.g., "click Add New Plugin in wp-admin"), but anything scriptable
  should be an actual command.
- Show the minimum path to a working result first. Configuration variants,
  advanced flags, and edge cases belong after the minimal path succeeds, or
  in a linked doc, not interleaved with it.
- If the project has both a "fast/dev" path and a "production" path (e.g.,
  hot-reload dev server vs. a built production bundle, or a local Compose
  file vs. a production deployment), show the dev path in Quick Start and
  link to a dedicated deployment doc for production. Don't merge the two
  into one ambiguous block.
- If the project's test suite or CI can exercise the documented commands,
  that's the strongest guarantee against drift; where practical, prefer a
  quick start built from commands the CI already runs over commands that
  exist only in the README.

## README vs AGENTS.md vs docs/*

Three documents, three audiences, and content should live in exactly one of
them:

| | Audience | Contents |
|---|---|---|
| **`README.md`** | A human (or an agent) deciding *whether and how* to use or run the project | What it is, why it exists, how to get it running, where to go next |
| **`AGENTS.md`** | An AI coding agent *working inside* the codebase | Build/test commands, code style and lint conventions, architectural context an agent needs to make correct changes, PR/commit conventions |
| **`docs/*.md`** | A human going deep on one topic | Full architecture and design-decision writeups, complete threat models, deployment runbooks, troubleshooting guides, compatibility notes |

The failure mode this table exists to prevent is deep technical content
migrating into the README because it was easiest to add it where the
author was already writing. Two concrete tells that content is in the
wrong place:

- **A multi-paragraph narrative belongs in `docs/`, not the README.** A
  walkthrough of *why* a particular library was evaluated and rejected, a
  step-by-step explanation of an idempotency or retry algorithm, or a
  detailed compatibility log from a real deployment are all valuable, as
  a page in `docs/ARCHITECTURE.md` or similar, linked from the README with
  one summary line. Inlined into the README itself, the same content
  buries the "what is this and how do I start" information every reader
  needs under material almost none of them do.
- **Build commands, lint rules, and code-style conventions belong in
  `AGENTS.md`, not the README.** If a repo has an `AGENTS.md`, the README
  should link to it for that content rather than restating it. Restating
  it creates two documents that can silently disagree the next time either
  one is updated. If the repo does not yet have an `AGENTS.md` and an
  agent will be working in it, creating one is out of scope for this
  standard, but the principle still applies: keep that material out of the
  README either way.

A useful gut check when drafting or reviewing a README section: *if I
deleted this section, would a reader lose their ability to decide whether
to use the project and get it running?* If yes, it stays in the README. If
the honest answer is "no, but it's interesting/important context," it
belongs in a linked doc.

## Deviations from Standard Readme

This standard follows [Standard
Readme](https://github.com/RichardLitt/standard-readme)'s section ordering
and its core formatting rules (no broken links, section titles link from
the table of contents, code examples must actually work) closely, with
three deliberate departures:

1. **Tiering.** Standard Readme describes one README shape with optional
   sections; this document adds explicit tiers so that "optional" has a
   concrete answer ("optional, and skip it below Tier 2") instead of being
   left to individual judgment on every repo.
2. **AGENTS.md integration.** Standard Readme predates the AGENTS.md
   convention and has no position on it. This standard treats AGENTS.md as
   the answer to "where does agent-facing technical detail go instead of
   the README," which is now a real question every repo in this
   organization has to answer.
3. **Security placement.** Standard Readme lists Security as an early,
   optional section (for security-disclosure contact info). This standard
   keeps that but adds "Security at a glance" as a short, later Tier 2+
   section for a different purpose: a few bullets of the most
   security-relevant guarantees, linking to `SECURITY.md` for the full
   model, because several repos in this organization have a real network
   or secrets-handling surface worth summarizing in-line, not just a
   disclosure contact.

## Checklist

Run this against any README, new or existing, to self-assess against
this standard. Each item should be a clean yes.

1. Does the first paragraph explain what the project is and why it exists,
   before any setup instruction appears?
2. Does the title match the repository name exactly?
3. Is there a License section, and is it the last section in the file?
4. If the README is longer than ~100 lines, is there a table of contents,
   and does every entry link to a working anchor?
5. Do all Quick Start / Install / Usage commands actually work against the
   project's current code, not a previous version of a script name, flag,
   or config key?
6. If badges are present, is each one a true, current, meaningful signal
   (CI, license, release, platform support) rather than decoration?
7. Is a "who are you" routing table present only if the project genuinely
   serves more than one distinct audience with different entry points,
   and absent otherwise?
8. Does deep technical or architectural content (algorithms,
   design-decision narratives, full threat models) live in `docs/` or
   `AGENTS.md`, with only a link and a one-line summary in the README?
9. If the repo has an `AGENTS.md`, does the README link to it for
   build/test/style detail instead of restating that content?
10. Are Contributing and Security handled as short pointers to
    `CONTRIBUTING.md` / `SECURITY.md` rather than inlined processes?
11. Are there no broken internal links: relative paths to docs, section
    anchors, the `LICENSE` file?
12. Is anything that changes over time (roadmap, what's shipped, what's
    next) tracked in exactly one canonical place (e.g., `CHANGELOG.md`)
    rather than duplicated in the README, where it will drift?
</content>
