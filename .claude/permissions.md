# CI-triage autonomy & protected-paths policy

This file is the human-readable contract for the `ci-triage` loop (see
`.claude/LOOP.md`). The `ci-triage` skill and sub-agent reference it, and
`.claude/settings.json` enforces the machine-checkable parts.

## Protected paths — human approval required

The loop must **never autonomously edit** these to make CI green. If a fix
appears to require touching them, **stop and escalate** (comment + state-file
entry) instead. `settings.json` marks these `ask`, so any edit prompts a human.

| Path | Why it is protected |
|------|---------------------|
| `backend/prisma/schema.prisma` | Data-model changes need migration review |
| `backend/src/modules/auth/**` | Auth guards/strategies — never weaken to pass a test |
| `infrastructure/**` | AWS CDK — real cloud resources |
| `.github/workflows/**` | The verification oracle; the loop must not rewrite its own gate |
| `.claude/skills/**`, `.claude/agents/**`, `.claude/permissions.md`, `.claude/settings.json`, `.claude/LOOP.md` | The loop's own guardrails |

`.claude/ci-triage-state.md` is **not** protected — the loop appends to it every run.

## Autonomy by classification

| Class | Autonomous action |
|-------|-------------------|
| `bug` (deterministic, reproduced locally, non-protected app code) | Open a **draft PR** with the minimal fix |
| `dependency` (version drift, non-protected) | Open a **draft PR** pinning/adjusting the dep |
| `flake` (passes on rerun) | Re-run the failed job once; **do not patch**; bump the flake counter |
| `env` / `infra` | **Escalate** — comment + state entry, no code change |
| anything touching a protected path | **Escalate** — never edit autonomously |

## Merge / push-to-main policy

- The **autonomous loop never auto-merges** and never pushes to `main` on its own
  — it always stops at a **draft PR** and leaves merging to a human.
- Merging or pushing to `main` happens **only on an explicit user request**. The
  earlier blanket `deny` on these was removed from `settings.json` at the user's
  direction so that a requested merge can go through; the loop's autonomous
  behaviour above is unchanged.

## Hard nevers (still enforced as `deny` in settings.json)

- Never force-push (`git push --force` / `-f`).
- Never disable or delete a failing test to go green — file an escalation instead.
- Never commit secrets or real `DATABASE_URL` values.

## Escalation format

When escalating, the loop must:
1. Add an entry under **Open items / escalations** in `.claude/ci-triage-state.md`
   with the run id/PR, the classification, and why a human is needed.
2. If a PR exists, post a comment summarizing the failure, the classification,
   and the recommended next step.
3. Stop — do not attempt a workaround that touches a protected path.
