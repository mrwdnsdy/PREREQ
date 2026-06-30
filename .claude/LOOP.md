# The CI-triage loop

> The agent forgets each run. The file does not.

This repo runs one engineered loop: **automated triage of CI failures**. This
document describes what the loop does, why it qualifies as a loop, and where each
piece lives.

## Anatomy

```
Find work ──▶ Hand to agent ──▶ Check result ──▶ Record ──▶ Decide next move ─┐
   ▲                                                                          │
   └──────────────────────────── next move ──────────────────────────────────┘
```

| Step | What happens | Artifact |
|------|--------------|----------|
| **Find work** | A CI run goes red (on push or PR), or `/ci-triage` is invoked | `.github/workflows/ci.yml` |
| **Hand to agent** | The failure is handed to a bounded sub-agent with the right tools | `.claude/agents/ci-triage.md` |
| **Check result** | Reproduce locally; re-run the job; confirm the diagnosis | `.claude/skills/ci-triage/SKILL.md` |
| **Record** | Append a run entry — classification, files checked, action taken | `.claude/ci-triage-state.md` |
| **Decide next move** | Draft a PR (bug/dependency), re-run (flake), or escalate (env/infra/protected) | `.claude/permissions.md` |

## Why this qualifies — the four-condition gate

A loop is worth building only when all four hold. Run the test before you build.

1. **The task repeats.** CI runs on every push and PR; failures recur across the
   monorepo (backend / frontend / infrastructure). This is not a one-off script.
2. **Verification is automated.** `.github/workflows/ci.yml` is the red/green
   oracle. The loop never has to guess whether the work is good — lint, build,
   and tests fail it without a human in the room.
3. **The token budget can absorb the waste.** Each run is bounded: scoped job
   logs, a single workspace to reproduce, a minimal fix. Retries and re-reads are
   cheap relative to a fixed CI surface.
4. **The agent has a senior engineer's tools.** Log access (github MCP), a
   reproduction environment (the repo + npm), the ability to run the code
   (lint/build/test), and PR authoring. See `.claude/agents/ci-triage.md`.

## Boundaries

Autonomy and protected paths are defined in `.claude/permissions.md` and enforced
by `.claude/settings.json`. In short: the loop opens **draft PRs** for fixable
classes and **escalates** the rest; it never edits the data model, auth, infra,
or its own guardrails to go green; it never merges or pushes to `main`.

## Triggers

- **On CI failure** — subscribe to PR activity so a red check re-invokes the loop.
- **On every code update** — CI runs on push/PR, so any change is verified.
- **Manually** — `/ci-triage <run-id | PR#>` to triage on demand.

(The subscription/skill invocation is configured in the Claude Code harness; the
*behavior* it runs is version-controlled here in `.claude/`.)
