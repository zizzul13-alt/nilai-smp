# Nilai SMP

Nilai SMP R3 is a mobile-first, single-teacher daily workspace. The target architecture is **React + Vite + Supabase**, delivered as Cloudflare Workers Static Assets.

This repository is in staged migration from the historical Streamlit application. The old implementation is preserved under `legacy/streamlit/` as evidence and migration reference; it is not the target architecture.

## R3.0 implementation status

**IMPLEMENTED**

- React + Vite + TypeScript application shell.
- Browser-safe Supabase client configuration.
- Supabase Auth baseline: session restore, email/password login, auth-state subscription, logout, explicit errors.
- Source-controlled migration path under `supabase/migrations/`.
- Minimal schema compatibility version table and fail-closed frontend check after authentication.
- Vitest unit/contract test foundation and Playwright E2E harness.
- Cloudflare Workers Static Assets SPA configuration.
- Documentation and reproducible verification commands.

**PLANNED / FROZEN CONTRACT, NOT YET IMPLEMENTED**

Academic Year/Period, Student/Enrollment, Material/Lesson/Meeting, Activity, Assessment, Result/Attempt, scoring/correction, Dexie Pending Safe, synchronization/conflicts, Today/Continue, pacing, reporting, artifacts, portable backup/restore, legacy data migration, AI recommendation features, and collaboration.

## Prerequisites

- Node.js 22 LTS (the repository accepts supported Node 22–24; CI verifies Node 22).
- npm.
- A Supabase project when exercising real authentication/database behavior.

## Setup

For a reproducible clean install, use the committed lockfile:

```bash
npm ci --no-audit --no-fund
cp .env.example .env.local
npm run dev
```

Set only browser-safe values in `.env.local`:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
```

Never put service-role keys, database passwords, or privileged deployment credentials into `VITE_*` variables.

## Verification

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run verify` runs typecheck, unit/contract tests, and production build. E2E is separate because Playwright browser binaries must be installed once with `npx playwright install chromium`.

No lint framework is configured in R3.0; TypeScript strict typechecking is the static-analysis baseline to avoid adding another dependency before rules are justified.

## Repository map

```text
src/app/                 application/bootstrap and auth gate
src/components/          minimal presentation components
src/config/              browser config and schema-version contract
src/services/            Supabase, auth, and data-access foundations
src/styles/              minimal mobile-first shell styling
supabase/migrations/     canonical source-controlled database migrations
tests/unit/              fast unit + database-contract tests
tests/e2e/               critical browser E2E harness
docs/                    durable architecture/operations contracts
legacy/streamlit/        preserved pre-R3 implementation
```

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SYNC_CONTRACT.md`
- `docs/BACKUP_RESTORE.md`
- `docs/DEPLOYMENT.md`
- `docs/TROUBLESHOOTING.md`
- `docs/TESTING.md`

The source-of-truth order remains: current repository and merged implementation first, then frozen R1/R2 contracts. Legacy code does not gain authority to redefine frozen semantics.
