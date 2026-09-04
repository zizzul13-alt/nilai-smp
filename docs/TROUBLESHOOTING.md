# Troubleshooting

## Configuration/login
Use `.env.local` with browser-safe Supabase URL + publishable key only. Never substitute a service-role key.

## Database incompatible
Stop writes and apply ordered migrations. Current runtime expects `r3.3-rapid-correction.1` after foundation -> academic spine -> safe work -> teaching core -> assessment core -> rapid correction. Do not manually pre-set the version.

## Pending Safe
Pending Safe means the judgement transaction committed to IndexedDB, not that PostgreSQL saved it. Preserve browser storage. Network/auth retryable failures stay Pending Safe. Closing/reopening the browser must not erase them.

## FAILED
The operation was durably preserved but server classified it permanent. In the correction recovery panel identify the affected Enrollment and intended state/score. Fix the cause if appropriate and choose Retry, or Discard local to abandon that local intention. Discard never edits server truth.

## CONFLICT
A stale Result revision means server truth changed first. No silent overwrite occurs. Compare the local intended judgement with the current canonical Result shown by the correction context, then explicitly discard/re-enter the desired correction or retry only after resolving the revision situation. Later operations for the same Assessment × Enrollment remain causally blocked; other students can continue.

## Dexie failure
If IndexedDB commit fails, UI must say it is not Pending Safe and must not advance under a false durability claim. Check browser storage/private-mode restrictions and retry the judgement.

## Logout/account switch
If unsynced work exists, logout warns and preserves it under its `auth_user_id + workspace_id` namespace. Do not clear IndexedDB merely to log out. Another account's queue must never be displayed.

## Assessment write errors
Do not bypass `apply_assessment_judgement_operation()` with direct Result/Attempt writes. Verify owned Assessment/Class/Enrollment integrity, explicit state/score semantics and valid Attempt kind. PGRST301/28000 are retryable auth; PGRST000/offline is retryable network; P3202/P3401/P3402/P3403/22023 are permanent classes.

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
Use Node 22 LTS first and do not bypass lockfile disagreement.
