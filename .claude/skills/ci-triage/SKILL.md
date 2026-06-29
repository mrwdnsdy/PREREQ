---
name: ci-triage
description: >-
  Triage a failing GitHub Actions CI run on PREREQ. Read the run + job logs,
  reproduce the failure locally, classify it (env / flake / bug / dependency /
  infra), then open a DRAFT PR with the smallest fix for the fixable classes or
  escalate the rest. Trigger when a CI run fails (on push or PR) or when invoked
  manually as `/ci-triage <run-id | PR#>`.
---

# CI triage skill

This is the procedural knowledge for the CI-triage loop. The loop anatomy and
the four-condition gate live in `.claude/LOOP.md`; the autonomy boundaries live
in `.claude/permissions.md`. Read both before acting.

PREREQ is an npm-workspaces monorepo: `backend/` (NestJS + Prisma + Jest),
`frontend/` (React + Vite; lint + build only), `infrastructure/` (AWS CDK).
The verification oracle is `.github/workflows/ci.yml` — three jobs:
`backend`, `frontend`, `infrastructure`. The **blocking** signal is `build` +
`test`; `lint` runs `continue-on-error` because the repo has **no ESLint config
yet** (tracked as an escalation in `.claude/ci-triage-state.md`), so a lint
failure does not fail the job.

## Procedure (Find → Hand → Check → Record → Decide)

1. **Find.** Identify the failing run. Inputs: a run id, a PR number, or a
   branch. Fetch the run and the failing job logs:
   `mcp__github__actions_list` (filter `status=failure`), `actions_get`,
   `get_job_logs`, `get_check_run`.
2. **Hand.** Identify which workspace job failed (`backend` / `frontend` /
   `infrastructure`) and which step (install / prisma generate / lint / build /
   test). One run can fail multiple jobs — handle each (CI uses
   `fail-fast: false` so all failures are visible).
3. **Check.** Reproduce locally with the exact workspace command before
   touching anything:
   - backend: `cd backend && npm install --legacy-peer-deps && npm run prisma:generate && npm run lint && npm run build && npm test -- --passWithNoTests`
   - frontend: `cd frontend && npm install && npm run lint && npm run build`
   - infrastructure: `cd infrastructure && npm install && npm run build`
   > Note: `npm install` for **backend** currently requires `--legacy-peer-deps`
   > (see the dependency note below). Lockfiles are intentionally gitignored.
4. **Decide + act.** Classify (below), apply the smallest fix matching the class
   on a new branch, re-run locally to confirm green, then open a **draft PR**.
   Never push to `main`. Never merge.
5. **Record.** Append a run entry to `.claude/ci-triage-state.md`.

## Classification rules

- **env** — missing secret, wrong env var, infra not provisioned (e.g. a future
  `DATABASE_URL` not set in CI). → Fix belongs in the **workflow**, which is
  protected. **Escalate.**
- **flake** — passes on rerun with no code change. → **Re-run the failed job
  once** (`mcp__github__actions_run_trigger` / re-run). Do **not** patch. Bump
  the flake counter in the state file; escalate if it recurs ≥3×.
- **bug** — deterministic failure reproducible locally, tied to recent app code.
  → Draft a minimal fix in the responsible **non-protected** module.
- **dependency** — failure tied to a version bump or unpinned transitive
  resolution (common here: no lockfile). → Draft a PR pinning/adjusting the dep.
- **infra** — timeout, OOM, runner issue, or a CDK (`infrastructure/`) build
  break. CDK is protected. → **Escalate.**

## Fix patterns (mapped to this repo)

- **Auth failures** → `backend/src/modules/auth/` (guards `jwt-auth.guard.ts`,
  `project-access.guard.ts`; strategies `jwt.strategy.ts`, `cognito.strategy.ts`;
  `auth.service.ts`). This path is **protected** — never weaken a guard or
  strategy to make a test pass. Escalate.
- **Backend test fails with a missing Prisma type** (e.g. `DependencyType`)
  → the CI step `npm run prisma:generate` did not run or failed. Fix is in the
  **workflow** (protected) — escalate; do not edit the spec.
- **Database-dependent tests** (none today — current specs mock `PrismaService`)
  → when added, CI must run `npx prisma db push` against a Postgres service.
  Never `prisma migrate deploy` — there is no `prisma/migrations/` directory.
- **Frontend lint** (`eslint . --max-warnings 0`) → currently non-blocking (no
  ESLint config exists). Fix the offending `.ts/.tsx` when addressing it;
  **build** (`tsc && vite build`) type errors → fix the types (blocking).
- **Lint fails to even start** ("could not find config" / migration-guide
  message) → this is the known missing-ESLint-config gap, not a code bug.
  Adding configs is a tracked escalation, not an autonomous fix.
- **Dependency / install break** → the known live example: `@nestjs/serve-static`
  resolves to a v5.x that peer-requires `@nestjs/common@^11` while the app is on
  NestJS 10, so plain `npm install` fails. CI works around this with
  `--legacy-peer-deps`; the durable fix (pin `@nestjs/serve-static` to a
  Nest-10-compatible version, or commit a lockfile) is a `dependency`-class PR.

## Never do

- Never edit `backend/prisma/schema.prisma`, `backend/src/modules/auth/**`,
  `infrastructure/**`, `.github/workflows/**`, or the loop's own files under
  `.claude/` (skills/agents/permissions/settings/LOOP) to make CI green —
  escalate instead.
- Never disable, skip, or delete a failing test — file an escalation.
- Never push to `main`, never force-push, never merge or enable auto-merge.
- Never commit secrets or real `DATABASE_URL` values.
