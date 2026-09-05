# Testing Strategy

## Tiers
1. **Vitest:** frozen semantic/static architecture contracts plus parser/identity/continuity derivation laws.
2. **Real PostgreSQL:** ordered migration chain plus RLS, lifecycle, revision, idempotency and atomic transaction attacks.
3. **Playwright:** browser IndexedDB/Rapid Correction/Continuity interruption behavior and XLSX template round-trip.
4. **Build/typecheck:** production TypeScript/Vite boundary.

## Teaching Continuity acceptance
Continuity unit contracts cover no-history, active Meeting priority, historical completed Meeting visibility and deterministic latest Checkpoint reconstruction.

Real PostgreSQL contracts prove:
- Start Class creates one `in_progress` Meeting;
- same-op lost-ACK Start replay is idempotent;
- a different duplicate Start reuses the existing active Meeting;
- the database invariant rejects a second active Meeting for one Class;
- checkpoint sequence is deterministic and retry does not duplicate;
- blank `stopped_at` is rejected;
- absence of a lifecycle RPC call leaves the Meeting in progress;
- explicit Complete preserves Checkpoints/history;
- a later Start creates a new Meeting identity;
- Cancel is explicit history;
- optional Lesson/exact LessonVersion context is retained;
- foreign Class/Meeting/Lesson and anonymous access fail closed.

Playwright continuity tests prove durable checkpoint enqueue survives reload, network/unknown failure retains `PENDING_SAFE`, retry uses the same op_id, server-confirmed save removes local payload, and a fresh browser derivation reconstructs the active Meeting + latest LAST/NEXT context from canonical-shaped data.

## Rapid Correction acceptance
Golden 40 paper coverage retains arbitrary physical order, duplicate names, zero, negative, Missing, Excused, Skip and Pending Safe restart semantics.

## Golden Bulk acceptance
The bulk suite builds a 40-Enrollment class with duplicate display names and resolves rows by stable Enrollment identity in arbitrary order. Parser contracts prove blank != zero, numeric 0, negative values, explicit Missing/Excused and malformed values. Browser acceptance generates the Nilai SMP XLSX template and parses it back with exact Enrollment identities; malformed workbook rejection is exercised.

Real PostgreSQL bulk contracts prove atomic multi-Result commit, graded Attempt creation, zero/negative/Missing semantics, duplicate Enrollment rejection, foreign-workspace rejection, stale-row whole-batch Conflict with canonical snapshot, transaction rollback on a failing row, lost-ACK same-op replay without duplicate Attempts, changed-payload op-id denial, ledger uniqueness and anonymous denial.

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
CI uses ephemeral PostgreSQL; no production database or service-role browser credential is required.

## Still out of scope
Full Today dispatcher, Before Leaving queue, stale long-absence Quick Update, pacing/Effective Meetings, reporting/finalization, artifacts, backup/restore, legacy migration, AI, collaboration, full offline, schedule engine, automatic homework, gamification and generic global search.
