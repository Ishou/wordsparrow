---
description: Triage and prioritize open GitHub issues — assign `priority:high|medium|low`, dedupe AI-synthesized follow-ups across spine re-runs, auto-label + comment, confirm before closing consolidations. Works on any open issue except the Renovate Dependency Dashboard.
---

# /triage — prioritize the open issues

Runs the `triage` skill against the repo's open issues. Invoke the skill
(`triage`) as the source of truth and follow it end to end.

## Invocation

- `/triage` — triage all open issues (except the Renovate Dependency Dashboard).
- `/triage <#issue ...>` — triage only the named issues (e.g. when a single new
  bump just landed a handful, or to re-rank a specific bug).

## What it does

1. Reads every open issue (skipping the bot-managed Dependency Dashboard) and
   classifies each by lens: human-authored, AI-synthesized
   (`ai-driven` / `post-bump-enhancement`), or `breaking-bump` spine.
2. For AI-synthesized issues: collapses duplicates (same task from re-run bumps)
   and consolidates multi-angle investigations into umbrella issues.
3. Ranks the survivors into `priority:high` / `medium` / `low`.
4. **Auto-applies** the priority labels and posts per-issue triage comments
   (Lens B comments carry a "verify the synthesized claim before implementing"
   caveat).
5. **Confirms with you before** closing any duplicate/consolidation.
6. Reports a compact table plus, for any AI-synthesized issues, the duplication
   count and the synthesized-body reminder.

See `.claude/skills/triage/SKILL.md` for the full heuristics and the mutation
policy.
