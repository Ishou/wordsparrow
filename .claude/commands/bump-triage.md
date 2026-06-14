---
description: Triage and prioritize the open `post-bump-enhancement` issues opened by the ADR-0068 breaking-bump pipeline — dedupe across spine re-runs, rank into priority tiers, auto-label + comment, confirm before closing consolidations.
---

# /bump-triage — prioritize the breaking-bump follow-up issues

Runs the `bump-triage` skill against the repo's open `post-bump-enhancement`
backlog. Invoke the skill (`bump-triage`) as the source of truth and follow it
end to end.

## Invocation

- `/bump-triage` — triage all open `post-bump-enhancement` issues.
- `/bump-triage <#issue ...>` — triage only the named issues (e.g. when a single
  new bump just landed a handful).

## What it does

1. Reads every open `post-bump-enhancement` issue and the spine issue each cites.
2. Collapses duplicates (same task from re-run bumps) and consolidates
   multi-angle investigations into umbrella issues.
3. Ranks the survivors into `priority:high` / `medium` / `low`.
4. **Auto-applies** the priority labels and posts per-issue triage comments
   (each with a "verify the synthesized claim before implementing" caveat).
5. **Confirms with you before** closing any duplicate/consolidation.
6. Reports a compact table plus the duplication count and the synthesized-body
   reminder.

See `.claude/skills/bump-triage/SKILL.md` for the full heuristics and the
mutation policy.
