# Bug report: inconsistent WBS numbering between task-creation paths

**Status:** RESOLVED — standardized on the 0-prefixed scheme (see "Resolution")
**Severity:** medium (data-correctness / reporting integrity)
**Found by:** end-to-end tests added in `backend/test/` (see "Evidence" below)
**Affects:** `backend` — `tasks.service.ts` and `schedule-import.service.ts`

## Resolution

Standardized both paths on the **0-prefixed scheme** (`0.1`, `0.1.1`), matching
the pre-existing interactive `POST /tasks` behaviour (the least disruptive option
for existing UI-created data). Changes:

- `schedule-import.service.ts` now generates codes with the `0` root prefix
  (`generateWbsCodes(wbsTree, '0')`) and parents imported top-level tasks under
  the Level 0 root instead of leaving them as siblings (`parentId: null`).
- `WBS_HIERARCHY_RULES.md` updated to document the 0-prefixed scheme.
- The schedule-import e2e assertions were updated to expect `0.1`/`0.1.1` and
  root parenting; both creation paths now produce identical trees.

**Remaining follow-up (not done here):** the import path still writes via
`prisma.task.create` directly and does not run `validateWbsHierarchy`. Routing it
through the shared validation is recommended but was deferred to avoid a larger
refactor (it would require injecting `TasksService` into `ScheduleImportService`).

---

_Original report below._

## Summary

The application has **two independent code paths that create tasks**, and they
produce **structurally different and inconsistently-numbered WBS trees** for the
same conceptual operation (adding a top-level task to a project). Whether a task
ends up numbered `1` or `0.1` — and whether it is a child of the project root or
a sibling of it — depends entirely on *how* it was created.

| | Interactive create (`POST /tasks`) | Schedule import (`POST /tasks/project/:id/import-schedule`) |
|---|---|---|
| Top-level WBS code | `0.1`, `0.2`, `0.1.1` | `1`, `2`, `1.1` |
| Top-level `parentId` | the level-0 root task | `null` (sibling of the root) |
| WBS hierarchy validation | enforced | **bypassed** |
| Matches `WBS_HIERARCHY_RULES.md`? | no | yes |

`WBS_HIERARCHY_RULES.md` documents the intended scheme as `1`, `1.1`, `1.1.1` —
so the **interactive path is the one that deviates** from the documented design.

## Root cause

### 1. Every project has a mandatory level-0 root with WBS code `0`

Both `ProjectsService.create` (`backend/src/modules/projects/projects.service.ts:101-119`)
and `TasksService.ensureProjectRootTask` create a single level-0 task with
`wbsCode: '0'`, and `validateWbsHierarchy` allows only one level-0 task per
project (`backend/src/modules/tasks/tasks.service.ts:84-95`).

### 2. Interactive create numbers children by prefixing the parent's code

`TasksService.generateUniqueWbsCode` returns
`` `${parentWbs}.${maxChild + 1}` `` for any child
(`backend/src/modules/tasks/tasks.service.ts:182`). Because a top-level task
must be created **under** the level-0 root (a second level-0 task is rejected),
its parent's code is `0`, so it is numbered `0.1`, `0.2`, … and their children
`0.1.1`, etc.

### 3. The import path ignores the root, numbers from scratch, and skips validation

`ScheduleImportService` builds an in-memory tree and numbers it with
`generateWbsCodes`, which starts at `1` with no awareness of the `0` root
(`backend/src/modules/tasks/schedule-import.service.ts:137-153`). It then
persists nodes by calling `this.prisma.task.create` **directly**
(`schedule-import.service.ts:240`) — it never calls `TasksService.create` or
`validateWbsHierarchy`. As a result:

- top-level imported tasks are created with `parentId: null`
  (`createTasksFromTree` passes `null`, `schedule-import.service.ts:162`), making
  them siblings of the level-0 root rather than children of it; and
- the WBS hierarchy rules (sequential levels, single root, parent-level checks)
  are not applied to imported data at all.

## Impact

- **Reporting / rollups.** Budget rollups and any tree walk assume a single
  coherent hierarchy. Imported top-level tasks sit *beside* the `0` root
  (`parentId: null`) instead of beneath it, so their costs do not roll up into
  the project-root total the way interactively-created tasks do.
- **Inconsistent identifiers.** The same project can contain both `0.1`-style
  and `1`-style codes depending on task origin, which is confusing to users and
  breaks any code that parses or sorts WBS codes.
- **Unvalidated import data.** The documented WBS rules ("Technical Notes:
  thread-safe validation… prevents orphaned or incorrectly leveled tasks") are
  silently not enforced on the import path.

## Evidence

Both behaviours are now pinned by passing e2e tests (run against a real
Postgres database):

- `backend/test/projects-tasks.e2e-spec.ts` — interactive create yields
  `0.1`, `0.2`, `0.1.1`.
- `backend/test/schedule-import.e2e-spec.ts` — import yields `1`, `1.1`, `1.2`
  with top-level `parentId: null`.

These tests intentionally assert the **current** behaviour so the inconsistency
is visible and regressions are caught; they should be updated when a fix lands.

## Recommended fix

The two paths need to agree on one convention. Recommended direction (matches
the existing docs and is the smaller change):

1. **Make top-level tasks number from `1`, not `0.1`.** In
   `generateUniqueWbsCode`, when the parent is the level-0 root (`wbsCode === '0'`),
   generate root-level codes (`1`, `2`, …) instead of `0.`-prefixed codes — i.e.
   treat the `0` root as a container that is not part of the dotted path. This
   aligns the interactive path with `WBS_HIERARCHY_RULES.md` and with the import
   output.
2. **Route the import path through the shared creation logic** (or at least the
   shared WBS-code generator + `validateWbsHierarchy`) so imported tasks are
   parented and validated identically to interactively-created ones, rather than
   calling `prisma.task.create` directly. This also fixes the `parentId: null`
   divergence and the missing validation.

Either change in isolation is incomplete: fixing only (1) still leaves imported
tasks unparented and unvalidated; fixing only (2) still leaves the `0.`-prefix.
Doing both makes the two paths produce identical trees.

If instead the `0.`-prefixed scheme is the desired behaviour, update
`WBS_HIERARCHY_RULES.md` and the import path to match — but that contradicts the
current documentation and the import output, so it is the less likely intent.

## Notes

No production code was changed while documenting this. The fix touches
`tasks.service.ts` and `schedule-import.service.ts` and should be made
deliberately, updating the e2e assertions above in the same change.
