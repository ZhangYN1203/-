# Implementation ledger

Plan: docs/superpowers/plans/2026-11-16-order-print-implementation.md
Approved spec: docs/superpowers/specs/2026-11-16-order-reliability-print-design.md

- User approved implementation and confirmed dot-matrix 240×95mm paper and flexible in-app calibration.
- Isolated source snapshot at /workspace/work/shipping-review on feature branch; no original checkout is present.
- Execution: primary agent owns atomic persistence, whole-order save and integration. Independent print and production modules use dispatching-parallel-agents with disjoint file ownership. A fresh whole-branch review follows.
- Pre-flight: printing depends only on existing settings API and new IPC to be wired by primary. Production depends on withTransaction/backupDatabase; these exported names are fixed in plan.
- Historical packageSpec unknown: leave blank and mark for review, never infer historical truth from current product data.
- Remote feature branch already contains approved design; implementation push must use the current remote head as parent and preserve the design.
- Production domain (2026-11-16): implemented isolated SQLite document tables for ten legacy IndexedDB stores; main-process complete-bundle validation, SQL + fsynced JSON backups before one atomic import, migration marker, retry and preserved original IndexedDB. New tasks select real saved orders and snapshot them in main; unique legacy number matches link, unmatched tasks remain visibly unlinked. Stock/material/production/log writes now use one IPC batch with stale-quantity protection and intra-batch IDs. Exported hasLinkedProductionOrder for root order guards.
- Production verification: initial 10 storage tests and 4 renderer tests observed red; added targeted red/green regressions for missing linked-order guard, failed-migration sidebar navigation and imported status escaping. Latest focused run: 13 real sql.js tests + 6 JSDOM renderer tests passed (19/19), node --check public/new-modules.js passed, Electron TypeScript check passed. Last full-suite run during parallel implementation was 43/48 with five root-owned order failures already reported; root owns final suite after integration. Changed only production-store.ts, new-modules.js, production test files and this authorized ledger entry; no commits.

- Task 1: complete. Transaction and disk-failure tests observed RED then GREEN; order + draft suite 19 tests (including later guard additions).
- Task 2: printing agent completed physical model, preview, native/PDF service, UI and profiles; 21 focused printing tests.
- Task 3: production agent completed storage, backups, migration and atomic stock/log updates; 19 focused tests.
- Integration baseline: npm run typecheck passed; npm run build passed; 59 unit/integration tests passed and 3 Chromium browser tests passed.
- Fixed pre-existing frontend project-reference error and missing legacy updateProduct import/undo result narrowing, required for a clean build.
- Hardware boundary: Windows printer driver, physical margins and continuous feed cannot be proven in cloud Chromium; calibration controls and local steps are provided.

- Final review: three Important findings reproduced with failing tests: customer identity on replacement, caught Excel import error committing partial catalog, duplicate finished-product warehousing. All fixed in one pass with 5 RED→GREEN regressions (including renderer/backend duplicate protection).
- Final: Ruling: promoted preprinted missing dynamic document number from Minor to Important because printed orders need identity; fixed with a failing shared-render regression.
- Final: Ruling: use Electron's native single-instance lock for this in-memory file database; concurrent processes are disallowed rather than attempting cross-process database merging. Cost: user gets one application window per profile, focused on second launch.
- Verification limits: no Windows physical printer/driver/feed tests; fsync plus atomic replace tested, full OS/power-loss simulation not tested; large unusual catalogs/migration bundles not stress-tested.
- Windows packaging: standard NSIS build reaches packaging but cloud Linux lacks Wine. A Windows build and physical install remain required; no installer-success claim.

- Final verified tree: 64 unit/integration tests passed, 3 Chromium end-to-end tests passed (including generated PDF MediaBox), frontend/Electron typecheck and builds passed; git diff --check and production JS syntax passed. PDF:4 pages,679.92×269.04pt (~240×95mm).
- Final: deferred minors: none; preprinted document number was fixed.

- Delivered: https://github.com/ZhangYN1203/-/pull/1 ; GitHub reports clean/mergeable. Verified all 39 published files against local Git blob hashes. Main branch remains unchanged.
