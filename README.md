# Nilai SMP

Nilai SMP R3 is a mobile-first, single-teacher daily workspace. Target architecture: **React + Vite + Supabase**, delivered through Cloudflare Workers Static Assets. The historical Streamlit app remains under `legacy/streamlit/` as migration evidence, not target architecture.

## Implementation status

**IMPLEMENTED**

- **R3.0 Foundation:** React/Vite/TypeScript shell, browser-safe Supabase client, persisted Auth baseline, source-controlled migrations, fail-closed schema compatibility, Vitest/Playwright, Cloudflare static delivery.
- **R3.1 Academic Spine:** Personal Workspace, Academic Year, Academic Period, Class, Student and Enrollment with owner RLS and workspace-aware structural integrity.
- **R3.2 Safe Work:** Dexie/IndexedDB durable recovery queue, Pending Safe truth law, explicit FAILED/CONFLICT states, Student rename revision/idempotency proof, startup/reconnect recovery, deterministic server/client errors.
- **R3.1 Teaching Core:** Material, stable Lesson, LessonVersion history, actual Meeting (including lessonless meetings), multiple Checkpoints, Activity and explicit multi-Meeting Activity links.

**NOT YET IMPLEMENTED**

Assessment/Result/Attempt; scoring profiles and correction; rapid correction UI; assessment Excel import; Today/Continue and pacing; reporting; artifacts; portable backup/restore engine; legacy data migration; Teacher Brief/AI features; collaboration/multi-teacher roles; full offline; generic conflict-resolution UI; final teacher-facing Teaching Core management UX.

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

The database suite uses disposable PostgreSQL with a minimal Supabase-compatible auth harness. `npm run verify` covers typecheck, unit/contracts and production build; CI additionally runs real PostgreSQL and Playwright.

## Repository map

```text
src/app/                 application/bootstrap and auth gate
src/components/          minimal presentation components
src/config/              browser config and schema-version contract
src/domain/              canonical TypeScript domain contracts
src/services/academic/   explicit academic read/service boundaries
src/services/safeWork/   narrow local durability/sync proof
supabase/migrations/     append-only canonical database migrations
tests/database/          real PostgreSQL contract attacks
tests/unit/              fast static/domain contracts
tests/e2e/               critical browser E2E
legacy/streamlit/        preserved pre-R3 evidence
```

## Documentation

Durable contracts live in `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SYNC_CONTRACT.md`, `docs/BACKUP_RESTORE.md`, `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`, and `docs/TESTING.md`.

Source-of-truth order remains current repository/merged implementation first, then frozen R1/R2 contracts. Legacy code cannot redefine frozen semantics.
