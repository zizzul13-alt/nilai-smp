# Testing Strategy

## Implemented tiers

1. **Vitest:** browser configuration, auth/service behavior, schema compatibility, migration contracts, Safe Work contracts, and Teaching Core migration invariants.
2. **Real PostgreSQL:** `tests/database/run-contract-tests.sh` applies every ordered migration to disposable PostgreSQL 17 with minimal Supabase-compatible auth roles/`auth.uid()`, then attacks real constraints and RLS.
3. **Service boundary:** small explicit academic services remain outside presentation; Teaching Core adds only a minimal owned read boundary. Authorization stays in PostgreSQL.
4. **Playwright:** mobile + desktop foundation checks plus actual Dexie/IndexedDB Safe Work durability/retry/conflict tests remain cumulative.

## Database test reality

This is not regex evidence. CI creates disposable PostgreSQL, applies R3.0 -> Academic Spine -> Safe Work -> Teaching Core migrations, then executes SQL as authenticated A/B and anon.

Inherited coverage remains: workspace bootstrap, Academic Year/Period/Class/Student/Enrollment integrity, duplicate identity rules, Safe Work Student revision, exactly-once `op_id`, lost ACK, altered-payload rejection, conflict/no-overwrite, applied-operation isolation, and deterministic error classes.

Teaching Core coverage adds owned Material/Lesson creation, LessonVersion v1/v2 history and duplicate rejection, lessonless Meeting, valid Lesson+Version Meeting, proof that Meeting does not rewrite LessonVersion, multiple/latest Checkpoints, Activity spanning two Meetings, duplicate-link rejection, every requested cross-workspace FK attack, representative A-vs-B SELECT/INSERT/UPDATE/DELETE RLS attacks, and anonymous denial.

## R3.2 browser durability coverage

Playwright continues to prove actual Dexie durable enqueue ordering, page/application lifecycle persistence, persistence failure, namespace isolation, network retry, stable-op lost ACK replay, auth pause, revision conflict, cleanup after save, and that FAILED/CONFLICT do not auto-retry. Teaching Core does not broaden offline/Safe Work behavior.

## Commands

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

CI runs the same committed verification against ephemeral PostgreSQL. No production database or browser service-role credential is required.

## Deferred by design

Assessment/Result/Attempt, scoring/correction, teacher-facing Teaching Core management UX, Today/Continue, reporting, artifacts, backup/restore engine, legacy migration, AI/collaboration, full offline, generic conflict-resolution UI, and later-domain Safe Work mutations remain future authorized work.
