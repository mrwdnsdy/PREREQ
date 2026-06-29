# CI-triage state

Durable memory for the CI-triage loop (see `.claude/LOOP.md`). The agent appends
a run entry every time it triages a failure. Newest entries at the top.

## Open items / escalations

- **[env/config] No ESLint config exists in any workspace.** There is no
  `.eslintrc*` or `eslint.config.*`, yet `backend` and `frontend` both have a
  `lint` script, so `npm run lint` fails at startup. CI runs lint as
  `continue-on-error` (non-blocking) until a config lands. Durable fix: add an
  ESLint flat config per workspace and clean up the resulting findings.
  _Owner: human decision._

- **[dependency] backend `npm install` requires `--legacy-peer-deps`.**
  `@nestjs/serve-static@^5.0.3` resolves to a v5.x that peer-requires
  `@nestjs/common@^11`, while the app is on NestJS 10. Because lockfiles are
  gitignored, plain `npm install` fails with `ERESOLVE`. CI works around this with
  `--legacy-peer-deps`. Durable fix (a `dependency`-class PR): pin
  `@nestjs/serve-static` to a Nest-10-compatible version, or commit a lockfile.
  _Owner: human decision._

## Flake counters

_(none yet)_

---

## Run template

```
## Run <YYYY-MM-DD HH:MM> — run_id <id> / PR #<n> / branch <name>
- Trigger: ci-failure | push | manual
- Failing job(s)/step(s): backend:test | frontend:lint | infrastructure:build | ...
- Classification: bug | flake | dependency | env | infra
- Files checked: <paths>
- Reproduced locally: yes/no — <command + result>
- Action taken: opened draft PR #x | re-ran job | escalated
- PR(s): #x (<status>)
- Escalation: none | <reason + where flagged>
- Flake counter: <test id → count> (if applicable)
- Next move: <what the next run should do>
```

---

## Run 2026-06-29 — bootstrap / branch claude/ci-triage-skill-o4jrsp
- Trigger: manual (loop bootstrap)
- Failing job(s)/step(s): backend:install (pre-CI, discovered while standing up the oracle)
- Classification: dependency
- Files checked: backend/package.json, .gitignore
- Reproduced locally: yes — `npm install` → `ERESOLVE` (@nestjs/serve-static peer @nestjs/common@^11 vs ^10)
- Action taken: escalated (see Open items); CI uses `--legacy-peer-deps` so the
  oracle is green-able while the human decides on a durable pin/lockfile.
- PR(s): the bootstrap PR for this branch
- Escalation: logged above — pin serve-static or commit a lockfile
- Note: local pre-push verification was limited — the sandbox proxy resets the
  Prisma engine CDN (`binaries.prisma.sh`), so a full, representative
  `npm install` could not run here. The GitHub Actions run is the authoritative
  verification (its runners have open network).
- Next move: triage the first real CI run on this branch via the github MCP;
  classify any failures (unpinned transitive types in frontend/infra are likely
  `dependency`-class, durable fix = lockfile or pinning).
