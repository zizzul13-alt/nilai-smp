# Testing Strategy

## Implemented tiers

1. **Unit/static contract tests (Vitest):** browser configuration, auth state/service behavior, schema compatibility, source-controlled migration contracts, and Safe Work source contracts.
2. **Real database contract tests:** `tests/database/run-contract-tests.sh` applies the ordered migrations to disposable PostgreSQL and executes actual PostgreSQL constraints, RLS, revision/idempotency behavior, and deterministic Safe Work error classes as `authenticated`/`anon` roles with Supabase-compatible `auth.uid()` claims.
3. **Integration boundary:** Supabase operations remain behind small services. R3.1 adds the academic-spine service; R3.2 adds the narrow Safe Work RPC client without moving authorization into presentation code.
4. **Critical E2E (Playwright):** mobile + desktop Chromium retain fail-closed browser foundation checks. R3.2 additionally exercises real browser IndexedDB through Dexie for durable recovery semantics. Final academic management UX is not part of R3.2.

## Database test reality

The database suite is not regex evidence. CI starts an ephemeral PostgreSQL 17 service, creates only the minimal Supabase-compatible test auth roles/schema, applies the real ordered migrations, then attacks RLS and composite FK/unique constraints. It never connects to production and needs no paid project or service-role browser credential.

The cumulative attack matrix retains R3.1 coverage for A/B/anonymous reads, own/foreign writes, workspace bootstrap, duplicate names, duplicate enrollment, class identity reuse across periods, and cross-workspace Academic Period/Class/Enrollment references. R3.2 extends it with Student revision, exactly-once `op_id` replay, lost ACK, altered-payload rejection, conflict/no-overwrite, applied-operation isolation, and stable server error classes for auth loss, workspace integrity, op-id mismatch, and missing/not-owned targets.

## R3.2 browser durability coverage

Playwright proves actual Dexie/IndexedDB durable enqueue ordering, page/application lifecycle restart persistence, forced persistence failure, namespace isolation, network retry, stable-op lost ACK replay, auth pause, revision conflict, local cleanup after save, and the repair law that `FAILED`/`CONFLICT` do not automatically call the server again on later startup/reconnect-style sync. A failed/conflicted earlier operation also causally blocks later pending work for the same entity.

This is not an OS-level forced-browser-process-kill proof and is not full offline mode.

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

Final teaching/assessment UX and tests, reporting, backup/restore, legacy migration, full offline, automatic conflict merge/resolution UI, and later-domain durability semantics belong to later authorized work.
