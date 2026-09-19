## Description

<!--
Cover two things, as separate paragraphs:
1. What problem this solves, in plain language.
2. What changed, grouped by area if it touches more than one. Describe the diff as shipped,
   not the original plan.
-->

## Tier impact

<!--
Which tier checklist(s) does this change? Is it additive for repositories already following the
standard, or does it break them? If it adds or tightens a requirement, the CHANGELOG entry needs
an "Adopter action" list.
-->

## How to test

<!--
Concrete verification steps. If something was not run, say so plainly and why.
-->

## What stays / known limitations

<!--
Anything intentionally left out, deferred, or still transitional.
-->

## Documentation impact

<!--
Select exactly one. CI checks the choice against the diff: "Docs updated" needs a change under
docs/, templates/, README.md, AGENTS.md, CLAUDE.md, SECURITY.md, or CONTRIBUTING.md; a CI-only or
script-only change is the case for "No doc update needed", with a real reason after the colon.
-->

- [ ] Docs updated
- [ ] No doc update needed: <state the reason>

---

## Checklist

- [ ] No secrets, keys, or passwords in the diff
- [ ] No real infrastructure details (hostnames, IPs, device models) or personal data in examples
- [ ] Snippets are syntactically valid and copy-paste-ready
- [ ] Checks pass locally (`node --test "scripts/**/*.test.mjs"`)
- [ ] `CHANGELOG.md` updated if the standard's recommendations changed
