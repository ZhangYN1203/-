# Reliable orders and calibrated printing implementation plan

> **For agentic workers:** Use the approved design and TDD. Independent printing and production-storage domains may run concurrently under dispatching-parallel-agents; the primary agent owns database, order saving, IPC integration and final verification.

**Goal:** Implement reliable local order saving and user-adjustable continuous-paper printing, with one persistent store for production records.

**Architecture:** Keep Electron/React/sql.js. Batch business changes in synchronous transactions with atomic persistence. Print and preview share measured physical pages; legacy IndexedDB records migrate into isolated SQLite document records.

**Tech Stack:** Electron 33, React 18, TypeScript, sql.js, Vite, Vitest, Chromium browser tests.

**Spec:** docs/superpowers/specs/2026-11-16-order-reliability-print-design.md (including approved in-app calibration additions).

## Global constraints
- Default dot-matrix continuous paper: 240×95mm. All layout dimensions and offsets use mm.
- No cloud service or paid API. Preserve original data; migration is backed up and repeatable.
- Complete implementation in this session without another approval gate; user approved implementation.
- Work on codex/order-reliability-print-settings; deliver a reviewable PR, not a merge.

## Review focus
- A disk-write failure must leave memory and disk with the previous complete order.
- A long wrapped row must not be truncated by a fixed-height physical page.
- Profile changes and font loading must invalidate stale pagination before printing.
- Legacy IndexedDB migration must be backed up before switch, safely idempotent, and retain old data.
- Existing production associations must protect order edits/deletes without rewriting stock history.

## Task 1: Reliable persistence and whole-order save
Files: electron/database.ts, electron/handlers.ts, src/pages/OrderEdit.tsx, tests/database.test.ts, tests/orders.test.ts.
Interfaces: export withTransaction<T>(fn: () => T): T and backupDatabase(label?: string): string from database.ts. Existing queryAll/queryOne/run stay compatible. Export saveOrderWithItems({id?, order, items}) returning {id, documentNo} from handlers.ts.
- [x] Add Vitest tooling and record existing type/build baseline.
- [x] Write/run failing real sql.js tests for transaction rollback, one persistence operation per batch, disk failure recovery and whole-order atomicity.
- [x] Implement memory snapshot restoration, atomic temp-file persistence, recovery backup, validated amounts, unique document allocation and historical packageSpec snapshot.
- [x] Replace renderer delete-immediately and multi-IPC save with local drafts and one atomic save; prompt for unsaved changes.
- [x] Verify backend tests and commit.

## Task 2: Print templates, calibration and native print service
Files owned by printing implementer: electron/print-model.ts, electron/print-service.ts, src/printing/**, src/pages/OrderPrint.tsx, src/styles/print.css, tests/printing*.test.*.
Interfaces: print service exposes registration-independent functions; document request is {html, css, paperWidthMm, paperHeightMm, printerName?, mode: 'print'|'pdf', defaultName?}, result {success:boolean,canceled?:boolean,error?:string,filePath?:string}. Renderer uses electronAPI.printDocument(request), electronAPI.listPrinters(); settings persist through existing getPrintSettings/setPrintSettings. Implementer reports final exact export names for primary-agent IPC wiring.
- [x] Write/run failing tests for malformed templates, physical width/height, visible columns, measurements, overflow, profiles and native print/PDF options.
- [x] Implement shared validated print model and measured pagination with long text/last-page footer handling.
- [x] Build in-app settings and calibration: 0.1/0.5/1mm nudges, widths/margins/offsets, fonts, row spacing, visible/reordered columns, separate preview zoom and actual scale, template and printer profiles, reset/undo/save/import/export.
- [x] Reuse page DOM/CSS in native print/PDF; support current-page and three-page calibration trials; report cancel/fail accurately.
- [x] Verify printing tests and commit.

## Task 3: SQLite production records and legacy migration
Files owned by production implementer: electron/production-store.ts, public/new-modules.js, tests/production*.test.*.
Interfaces: import withTransaction, backupDatabase, queryAll, queryOne, run from database.ts. Expose getProductionStatus(), migrateProductionData(bundle), getProductionRecords(store), getProductionRecord(store,id), applyProductionOperations(operations). Operation shape {type:'add'|'put'|'delete',store,data?,id?}, return {results:any[]}. Renderer API uses the same names. Report exact signatures for IPC wiring.
- [x] Write/run failing real-database tests for migration, retries, backup failure, conflicting identifiers, invalid stores and rollback of multi-record inventory changes.
- [x] Implement SQLite document records with explicit store allowlist, legacy JSON backup, idempotent migration version and unchanged original IndexedDB.
- [x] Adapt storage helpers and critical inventory/log mutations to atomic batch IPC, preserving standalone browser fallback only where explicit.
- [x] Link new production tasks to real SQLite orders through getOrders; leave unmatched legacy tasks visibly unlinked.
- [x] Verify production tests and commit.

## Task 4: Integrate, exercise UI, review and deliver
Files: electron/main.ts, electron/preload.ts, src/types/index.ts, src/utils/ipc.ts, build/start scripts, README, browser tests.
- [x] Wire all domain APIs with explicit channels; remove injected legacy printing controls.
- [x] Validate settings atomically, protect orders linked to production, fix build/start and packaged WASM paths.
- [x] Run all unit/integration tests, frontend and main-process typechecks/builds.
- [x] Exercise settings, preview, export, pagination and draft cancellation in Chromium, including long multi-page content.
- [x] Obtain fresh whole-branch review, reproduce/fix important findings, rerun checks.
- [x] Push feature branch changes through GitHub and create PR with validation results and Windows calibration steps.
