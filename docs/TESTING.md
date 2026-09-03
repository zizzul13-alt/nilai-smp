# Testing Strategy

## Implemented tiers

1. **Unit/static contract tests (Vitest):** browser configuration, auth state/service behavior, schema compatibility, and source-controlled migration contracts.
2. **Real database contract tests:** `tests/database/run-contract-tests.sh` applies the migrations to disposable PostgreSQL and executes actual PostgreSQL constraints and RLS as `authenticated`/`anon` roles with Supabase-compatible `auth.uid()` claims.
3. **Integration boundary:** Supabase operations remain behind small services; R3.1 adds the academic-spine service without moving authorization into presentation code.
4. **Critical E2E (Playwright):** mobile + desktop Chromium projects retain the fail-closed browser foundation checks. Final academic management UX is not part of R3.1.

## Database test reality

The database suite is not regex evidence. CI starts an ephemeral PostgreSQL 17 service, creates only the minimal Supabase-compatible test auth roles/schema, applies the real ordered migrations, then attacks RLS and composite FK/unique constraints. It never connects to production and needs no paid project or service-role browser credential.

The attack matrix covers A/B/anonymous reads, own/foreign writes, workspace bootstrap, duplicate names, duplicate enrollment, class identity reuse across periods, and cross-workspace Academic Period/Class/Enrollment references.

## Commands

Start clean verification from the committed dependency graph. A disposable PostgreSQL database must be available through `DATABASE_URL` for `test:db`.

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

CI supplies `postgresql://postgres:postgres@127.0.0.1:5432/postgres` only for its ephemeral service and runs the same committed tests.

## Deferred by design

Authenticated browser E2E fixtures, offline/sync tests, teaching/assessment tests, reporting, backup/restore, and legacy migration tests belong to their later authorized domains.
