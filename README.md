# Nilai SMP

Nilai SMP R3 is a mobile-first, single-teacher daily workspace. Target architecture: **React + Vite + Supabase**, delivered through Cloudflare Workers Static Assets. The historical Streamlit app remains under `legacy/streamlit/` as migration evidence, not target architecture.

## Implementation status

**IMPLEMENTED**

- **R3.0 Foundation:** React/Vite/TypeScript shell, browser-safe Supabase client, persisted Auth baseline, source-controlled migrations, fail-closed schema compatibility, Vitest/Playwright, Cloudflare static delivery.
- **R3.1 Academic Spine:** Personal Workspace, Academic Year, Academic Period, Class, Student and Enrollment with owner RLS and workspace-aware structural integrity.
- **R3.2 Safe Work:** Dexie/IndexedDB durable recovery queue, Pending Safe truth law, explicit FAILED/CONFLICT states, startup/reconnect recovery and deterministic server/client errors.
- **R3.1 Teaching Core:** Material, stable Lesson, append-only LessonVersion history, actual Meeting, multiple Checkpoints, Activity and explicit multi-Meeting Activity links.
- **R3.3 Assessment Core:** stable Assessment, immutable-ruleset ScoringProfile, one current Result per Assessment × Enrollment, explicit Result states and preserved Attempt evidence.
- **R3.3 Rapid Correction:** explicit resumable correction sessions, arbitrary paper-order student search, mobile rapid judgement and Pending Safe academic operations.
- **R3.3 Bulk Assessment:** desktop Bulk Entry plus Nilai SMP-owned XLSX template/import, stable Enrollment identity, Preview/Validate before mutation, and online atomic Result/Attempt batch commit with idempotency and revision conflicts.

**NOT YET IMPLEMENTED**

Today/Continue and pacing; reporting/finalization; artifacts; portable backup/restore engine; legacy data migration; Teacher Brief/AI features; collaboration/multi-teacher roles; full offline; generic global search; fuzzy spreadsheet matching; generic spreadsheet engine.

## Input-path laws

Assessment != Result; Result != Attempt. Workflow state != score. `UNCHECKED`, `GRADED`, `MISSING`, and `EXCUSED` are explicit states. `0 != blank`; Missing != 0. MAKEUP != REMEDIAL. Spreadsheet row != Student identity; template Assessment/Enrollment UUIDs are stable round-trip keys and display name never silently disambiguates duplicates.

Rapid Correction, Bulk Entry and Excel Import are distinct workflows. Rapid Correction may truthfully use the durable Pending Safe queue. Bulk Import does **not** pretend to be offline: parse/preview is local, Commit requires connectivity, one PostgreSQL transaction accepts all intended mutations or none, and UI says Saved only after server acknowledgement.

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

The database suite uses disposable PostgreSQL with a minimal Supabase-compatible auth harness. CI covers RLS, atomic bulk commit/idempotency/revision contracts, rapid-correction durability and browser XLSX round-trip behavior.

## Repository map

```text
src/app/                 application/bootstrap and auth gate
src/components/          rapid correction + desktop bulk workflow
src/config/              browser config and schema-version contract
src/domain/              canonical TypeScript domain contracts
src/services/academic/   academic/assessment/correction/bulk boundaries
src/services/safeWork/   narrow durable rapid-operation queue and sync worker
supabase/migrations/     append-only canonical database migrations
tests/database/          real PostgreSQL contract attacks
tests/unit/              fast static/domain contracts
tests/e2e/               critical browser acceptance
legacy/streamlit/        preserved pre-R3 behavior evidence
```

Source-of-truth order remains current repository/merged implementation first, then frozen R1/R2/R3 contracts. Legacy code cannot redefine frozen semantics.
