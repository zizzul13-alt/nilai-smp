# Nilai SMP

Nilai SMP R3 is a mobile-first, single-teacher daily workspace. Target architecture: **React + Vite + Supabase**, delivered through Cloudflare Workers Static Assets. The historical Streamlit app remains under `legacy/streamlit/` as migration evidence, not target architecture.

## Implementation status

**IMPLEMENTED**

- **R3.0 Foundation:** React/Vite/TypeScript shell, browser-safe Supabase client, persisted Auth baseline, source-controlled migrations, fail-closed schema compatibility, Vitest/Playwright, Cloudflare static delivery.
- **R3.1 Academic Spine:** Personal Workspace, Academic Year, Academic Period, Class, Student and Enrollment with owner RLS and workspace-aware structural integrity.
- **R3.2 Safe Work:** Dexie/IndexedDB durable recovery queue, Pending Safe truth law, explicit FAILED/CONFLICT states, startup/reconnect recovery and deterministic server/client errors.
- **R3.1 Teaching Core:** Material, stable Lesson, append-only LessonVersion history, actual Meeting, multiple Checkpoints, Activity and explicit multi-Meeting Activity links.
- **R3.3 Assessment Core:** stable Assessment, immutable-ruleset ScoringProfile, one current Result per Assessment × Enrollment, explicit Result states and preserved Attempt evidence.
- **R3.3 Rapid Correction:** explicit resumable correction sessions, arbitrary paper-order student search, mobile rapid judgement, academic Safe Work operations, same-Result causal ordering, idempotent Result + optional Attempt + AppliedOperation server transaction, and in-workflow FAILED/CONFLICT recovery.

**NOT YET IMPLEMENTED**

Assessment Excel import; paste-grid/bulk grade entry; Today/Continue and pacing; reporting/finalization; artifacts; portable backup/restore engine; legacy data migration; Teacher Brief/AI features; collaboration/multi-teacher roles; full offline; generic global search; generic enterprise conflict management.

## Canonical correction laws

Assessment != Activity; Assessment != Result; Result != Attempt. Workflow state != score. `UNCHECKED`, `GRADED`, `MISSING`, and `EXCUSED` are explicit states. `0 != blank`; Missing != 0. MAKEUP != REMEDIAL. Skip leaves UNCHECKED. A CorrectionSession is workflow progress, not evidence, and completes only by explicit teacher action. Pending Safe means the operation has committed durably to the current user + workspace IndexedDB namespace; it does not mean the server has accepted it. PostgreSQL remains canonical truth.

## Prerequisites and setup

Node.js 22 LTS (supported Node 22–24), npm, and a Supabase project when exercising real hosted auth/database behavior.

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

The database suite uses disposable PostgreSQL with a minimal Supabase-compatible auth harness. CI additionally runs real PostgreSQL and Playwright, including rapid-correction durable queue/restart contracts.

## Repository map

```text
src/app/                 application/bootstrap and auth gate
src/components/          mobile correction + minimal presentation components
src/config/              browser config and schema-version contract
src/domain/              canonical TypeScript domain contracts
src/services/academic/   academic/teaching/assessment/correction boundaries
src/services/safeWork/   narrow durable operation queue and sync worker
supabase/migrations/     append-only canonical database migrations
tests/database/          real PostgreSQL contract attacks
tests/unit/              fast static/domain contracts
tests/e2e/               critical IndexedDB/browser E2E
legacy/streamlit/        preserved pre-R3 evidence
```

## Documentation

Durable contracts live in `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SYNC_CONTRACT.md`, `docs/BACKUP_RESTORE.md`, `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`, and `docs/TESTING.md`.

Source-of-truth order remains current repository/merged implementation first, then frozen R1/R2 contracts. Legacy code cannot redefine frozen semantics.
