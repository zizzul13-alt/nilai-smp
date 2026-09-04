# Testing Strategy

## Tiers
1. **Vitest:** frozen semantic/static architecture contracts.
2. **Real PostgreSQL:** full ordered migration chain plus RLS, revision, idempotency and transaction attacks.
3. **Playwright:** real browser IndexedDB durability, restart, namespace and rapid-workflow queue behavior.
4. **Build/typecheck:** production TypeScript/Vite boundary.

## Rapid Correction acceptance
The Golden 40-paper browser scenario queues an arbitrary reversed physical order without Student-page navigation or server round-trip per paper. It includes score 0, negative score, Missing, Excused and an explicit Skip represented by absence of a write; 39 durable operations survive page restart. Duplicate names are legal because selection/write identity is Enrollment, not display name.

Browser failure coverage proves Dexie transaction failure cannot return Pending Safe, Pending Safe survives reload, same-Result causal keys remain ordered, and user/workspace namespaces remain isolated. Worker/static contracts preserve FAILED/CONFLICT manual recovery and independent-Result progress.

PostgreSQL rapid-correction tests prove atomic Result + optional Attempt + AppliedOperation, same-op lost-ACK replay without duplicate Attempt, zero, negative score, Missing NULL score, stale-revision Conflict without overwrite, op-id payload mismatch, correction-session explicit completion, owner isolation and anonymous denial.

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
Excel/paste-grid, reporting/finalization, Today/Continue, artifacts, backup/restore, legacy migration, AI, collaboration, full offline, generic global search and generic enterprise conflict management.
