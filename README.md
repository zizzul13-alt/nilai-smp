# Nilai SMP

Nilai SMP R3 is a mobile-first, single-teacher daily workspace. Target architecture: **React + Vite + Supabase**, delivered through Cloudflare Workers Static Assets. The historical Streamlit app remains under `legacy/streamlit/` as migration evidence, not target architecture.

## Implementation status

**IMPLEMENTED**

- **R3.0 Foundation:** React/Vite/TypeScript shell, browser-safe Supabase client, persisted Auth baseline, source-controlled migrations, fail-closed schema compatibility, Vitest/Playwright, Cloudflare static delivery.
- **R3.1 Academic Spine:** Personal Workspace, Academic Year, Academic Period, Class, Student and Enrollment with owner RLS and workspace-aware structural integrity.
- **R3.2 Safe Work:** Dexie/IndexedDB durable recovery queue, Pending Safe truth law, explicit FAILED/CONFLICT states, startup/reconnect recovery and deterministic server/client errors.
- **R3.1 Teaching Core:** Material, stable Lesson, append-only LessonVersion history, actual Meeting, multiple Checkpoints, Activity and explicit multi-Meeting Activity links.
- **R3.3 Assessment Core:** stable Assessment, immutable-ruleset ScoringProfile, one current Result per Assessment × Enrollment, explicit Result states and preserved Attempt evidence.
- **R3.3 Assessment Workspace:** teacher-visible Assessment creation from an active Class/Period, optional immutable ScoringProfile selection, and current Assessment list.
- **R3.3 Rapid Correction:** explicit resumable correction sessions, arbitrary paper-order student search, mobile rapid judgement and Pending Safe academic operations.
- **R3.3 Bulk Assessment:** desktop Bulk Entry plus Nilai SMP-owned XLSX template/import, strict stable Enrollment identity, Preview/Validate before mutation, bounded XLSX parsing, and online atomic Result batch commit with idempotency and revision conflicts.
- **R3.4 Teaching Continuity:** explicit Meeting lifecycle, durable Checkpoints, Today dispatcher, Continue/Before Leaving/re-entry flows, append-only continuity baselines, and explainable RELAXED/NORMAL/COMPRESSED pacing with teacher override.
- **R3.5 Reporting Core:** versioned Reporting Policy, SIMPLE_MEAN provisional/finalized snapshots, explicit Missing/rounding/KKM semantics, source-consistent finalization, audited reopen, and append-only report history.
- **R3.5 Artifact Core:** stable Artifact identity, append-only ArtifactVersion history, exact LessonVersion/ReportSnapshot provenance, manual-first canonical content, private checksumed DOCX/PDF object metadata, signed downloads, stale-source detection, and archive-first lifecycle.

**NOT YET IMPLEMENTED**

Portable backup/restore engine; legacy data migration into the R3 canonical schema; final Daily Driver integration/production-artifact E2E; Teacher Brief/AI features; collaboration/multi-teacher roles; full offline; generic global search; schedule engine; automatic homework; gamification.

## Continuity laws

UI Session != Teaching Meeting. Browser reload, navigation, logout and close/X never finish a Meeting. `Start Class` creates or reuses one canonical `in_progress` Meeting for the active Class. Completion/cancellation is explicit. A completed Meeting remains historical truth; a later Start creates a new actual occurrence.

Checkpoint is first-class continuity data. `STOPPED AT` is required and `NEXT STEP` is optional. Checkpoint writes follow the Safe Work truth law: React state is transient; Pending Safe is announced only after durable IndexedDB commit; Saved is announced only after server confirmation. Reconnect/auth recovery retries the same operation id, so lost acknowledgements do not duplicate Checkpoints.

## Assessment/reporting laws

Assessment != Result; Result != Attempt. Workflow state != score. `UNCHECKED`, `GRADED`, `MISSING`, and `EXCUSED` are explicit states. `0 != blank`; Missing != 0. MAKEUP != REMEDIAL. Spreadsheet row != Student identity; template Assessment/Enrollment UUIDs are stable round-trip keys and display name/NIS/NISN never silently replace Enrollment identity.

Rapid Correction, Bulk Entry and Excel Import are distinct workflows. Rapid Correction may truthfully use the durable Pending Safe queue. Bulk Import does **not** pretend to be offline: parse/preview is local, Commit requires connectivity, one PostgreSQL transaction accepts all intended mutations or none, and UI says Saved only after server acknowledgement.

Reporting consumes canonical current Result truth under an explicit versioned policy. Raw Attempt evidence is not silently promoted into report output. `UNCHECKED` blocks finalization; finalized snapshots are append-only and require explicit audited Reopen before correction.

## Artifact laws

Artifact identity != ArtifactVersion != ArtifactObject. Manual content is first-class and AI is optional. Lesson/report provenance always points to an exact immutable source identity. Regeneration creates a new ArtifactVersion rather than overwriting historical content. READY binary objects are private and checksumed; overwriting a READY object on the same version is forbidden.

## Prerequisites and setup

Node.js 22 LTS (supported Node 22–24), npm, and a Supabase project when exercising real hosted auth/database/storage behavior.

```bash
npm ci --no-audit --no-fund
cp .env.example .env.local
npm run dev
```

Browser configuration accepts only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never place service-role keys, database passwords, or privileged deployment credentials in `VITE_*` variables.

## Verification

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

The database suite uses disposable PostgreSQL with a minimal Supabase-compatible auth harness. CI covers RLS, continuity lifecycle/idempotency/checkpoint sequencing, Safe Work interruption recovery, atomic bulk commit/idempotency/revision contracts, reporting source consistency, artifact append-only/idempotency/storage metadata contracts, browser UX acceptance, and production build correctness.

## Repository map

```text
src/app/                 application/bootstrap, auth gate and workspace routing
src/components/          Today/teaching/assessment/reporting/artifact workspaces
src/config/              browser config and schema-version contract
src/domain/              canonical TypeScript domain contracts
src/services/academic/   academic/teaching/assessment/correction/reporting boundaries
src/services/artifacts/  artifact versioning, storage and checksum boundaries
src/services/safeWork/   narrow durable rapid/checkpoint operation queue and sync worker
supabase/migrations/     append-only canonical database migrations
tests/database/          real PostgreSQL contract attacks
tests/unit/              fast static/domain/regression contracts
tests/e2e/               critical browser acceptance
legacy/streamlit/        preserved pre-R3 behavior evidence
```

Source-of-truth order remains current repository/merged implementation first, then frozen R1/R2/R3 contracts. Legacy code cannot redefine frozen semantics.
