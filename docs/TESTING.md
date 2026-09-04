# Testing Strategy

## Tiers
1. **Vitest:** frozen semantic/static architecture contracts plus parser/identity laws.
2. **Real PostgreSQL:** ordered migration chain plus RLS, revision, idempotency and atomic transaction attacks.
3. **Playwright:** browser IndexedDB/Rapid Correction behavior and XLSX template round-trip.
4. **Build/typecheck:** production TypeScript/Vite boundary.

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
Reporting/finalization, Today/Continue, artifacts, backup/restore, legacy migration, AI, collaboration, full offline, fuzzy matching, generic spreadsheet engine and generic enterprise conflict management.
