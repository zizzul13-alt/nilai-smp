# Testing Strategy

## Implemented tiers

1. **Vitest:** browser config, auth/service behavior, schema compatibility, migration contracts, Safe Work and canonical-domain invariants.
2. **Real PostgreSQL:** `npm run test:db` applies the full ordered migration chain to disposable PostgreSQL 17 with the Supabase-compatible auth harness, runs inherited attacks, then R3.3 Assessment attacks.
3. **Service boundary:** explicit Academic, Teaching, and Assessment services remain outside presentation; PostgreSQL remains authorization.
4. **Playwright:** cumulative mobile/desktop foundation and actual Dexie Safe Work durability/retry/conflict coverage.

## Assessment Core database reality

R3.3 tests prove owned ScoringProfile and Assessment creation, Assessment independence from Activity, stable UUID identity, negative scoring, explicit UNCHECKED/MISSING/EXCUSED null-score states, GRADED zero preservation, negative graded score, one current Result per Assessment × Enrollment, ORIGINAL/MAKEUP/REMEDIAL/CORRECTION history, preserved prior attempts, cross-workspace Class/Profile/Activity/Enrollment attacks, owner isolation, anonymous denial, and denial of direct browser Result/Attempt split writes.

The canonical Result + optional Attempt path is one PostgreSQL function transaction. Tests exercise the RPC and verify both current Result truth and appended evidence. PostgreSQL transactional semantics prevent a function failure from committing only one half.

Inherited R3.0–R3.2 and Teaching Core coverage remains cumulative, including LessonVersion append-only history and Safe Work lost-ACK/conflict/error-class behavior.

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

Rapid correction production UI, correction-session resume, Excel assessment import, bulk grade entry, Today/Continue, reporting/finalization, artifacts, backup/restore engine, legacy migration, AI/collaboration, full offline, generic conflict-resolution UI, sophisticated statistics, and Assessment Safe Work integration remain future authorized work.
