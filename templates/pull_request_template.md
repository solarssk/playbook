<!--
Required PR format for this repository. Keep these section headings as they
are. If a checklist item does not apply, keep it and add a brief note instead
of deleting it. That keeps the template's meaning consistent across PRs.

TIER GUIDANCE: this template is Tier 2-appropriate (real users, full CI, see
docs/tiers.md). For Tier 1 (solo tool, at most a minimal lint/build check),
trim to "Description" plus a short checklist covering just secrets and
"tests pass locally". The Documentation impact and multi-item checklist
below assume review/CI infrastructure a Tier 1 repo may not have. Delete
this comment block before publishing.
-->

## Description

<!--
Cover two things, as separate paragraphs:
1. What problem this solves, in plain language. Skip only for pure internal
   maintenance (dependency bump, CI tweak) with no user-facing effect, and
   say so explicitly instead.
2. What changed in the code, grouped by area if it touches more than one.
   Describe the diff as shipped, not the original plan.
-->

## How to test

<!--
List concrete verification steps. If tests were not run, state that plainly
and explain why.
-->

## What stays / known limitations

<!--
Anything intentionally left out, deferred, or still transitional.
-->

<!-- Tier 2+ only, if the repo has user-facing docs separate from the code
(a wiki, a docs/ site, a README that needs to stay in sync). Delete this
section for a repo with no separate documentation surface. -->
## Documentation impact

<!--
Choose exactly one option.
-->

- [ ] Docs updated
- [ ] No doc update needed (explain why)

---

## Checklist

- [ ] No secrets / keys / passwords in the diff
- [ ] No real personal data in examples, fixtures, or tests (use synthetic
      `@example.com`-style placeholders)
- [ ] Tests pass locally
<!-- Tier 2+, if the repo has migrations. Delete if not applicable. -->
- [ ] Schema changes include a migration
