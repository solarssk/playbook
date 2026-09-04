# Claude Code: playbook

@AGENTS.md

Rules below are Claude-Code-specific. Shared rules, what this repo is, how to apply it to
another repository, the tier system, live in `AGENTS.md`. Read that first.

## When asked to bring another repo "up to standard"

This is the main real-world use of this repo: you're working in some other repository and told
to check it against, or bring it up to, this standard.

1. **Plan before changing anything.** Determine the tier (see `AGENTS.md`), read that tier's
   checklist, then state which items are already met, which are missing, and which you're
   deliberately skipping and why, before writing a diff. A reviewer should be able to predict
   every file you'll touch from that plan.
2. **Verify, don't infer.** "The README says CI is set up" and "CI is actually set up" are
   different claims. Check the real files and the real repository settings
   (`gh api repos/<owner>/<repo>/...`), not descriptions of them. A prior PR's title or
   description is a hint, never a source of truth on its own.
3. **Don't upsize the repo's tier by accident.** If you're only asked to fix one item, fix that
   item. Don't also add Tier 3 tooling because you noticed it was "missing" while you were in
   there. Flag it in the PR description instead, and let the repo owner decide whether that tier
   jump is warranted.
4. **Small, reviewable diffs.** A repo-maintenance change is rarely coupled to application logic.
   Keep it in its own commit or PR, separate from any unrelated feature work happening at the
   same time.

## When editing this repo's own docs or templates

- Every doc here is read by both humans and other agents. Write for both: be explicit, avoid
  relying on tone or subtlety to convey a rule.
- Keep the tiering framing intact. The fastest way this repo degrades into "just do what the
  fanciest repo in the org does" is edits that quietly assume Tier 3 as the default.
- No personal narrative, no real infrastructure details. See `AGENTS.md` for the full rule. If
  unsure whether a sentence crosses that line, cut the specific detail and keep the general
  principle.
- No em dashes. No AI-slop filler ("it's important to note," "in today's landscape,"
  "leverage," "robust," "seamless"). Write like a person who has actually run these repos, not
  like a press release about them.

## Compounding

When you, or another agent, get something about this repo wrong (apply a template
inconsistently, miss a tier distinction, restate a rule that's already stated elsewhere and drift
out of sync), fix the root doc, not just the immediate symptom, so the next agent reading this
repo doesn't repeat the mistake.
