# Troubleshooting

## App shows “Konfigurasi belum siap”
Copy `.env.example` to `.env.local`, set the Supabase URL and publishable/anon key, then restart Vite. Never substitute a service-role key.

## Login fails
Verify the configured project, account credentials, and project auth settings. Signup/recovery/admin management remain outside the foundation.

## “Database belum kompatibel”
Do not continue writing academic data. Verify ordered migrations and ensure `app_schema_version` matches `src/config/schema.ts`. Current runtime expects `r3.3-assessment-core.1`.

```text
r3.0-foundation.1
-> r3.1-academic-spine.1
-> r3.2-safe-work.1
-> r3.1-teaching-core.1
-> r3.3-assessment-core.1
```

Do not roll back to an earlier label. Teaching Core's later R3.1 label closes a previously missed R3.1 residual while preserving R3.2; Assessment Core is the cumulative head.

## Pending locally / FAILED / Conflict
These remain R3.2 Safe Work concepts for the Student rename proof. Preserve IndexedDB. Only PENDING_SAFE auto-retries; FAILED and CONFLICT require explicit recovery/resolution. R3.3 assessment writes are not Safe Work-enabled and must not be described as Pending locally.

## Assessment judgement fails
The canonical Result + optional Attempt path is `record_assessment_judgement()`. Do not work around an error by directly writing Result or Attempt tables: browser direct writes are intentionally denied. Verify that the Assessment and Enrollment belong to the same owned Class, Result state/score semantics are valid, and attempt kind is one of ORIGINAL/MAKEUP/REMEDIAL/CORRECTION.

## Authentication versus authorization failures
Safe Work treats gateway/session auth failure (`PGRST301`) and explicit no-auth SQLSTATE (`28000`) as retryable. Generic `42501` is not auth expiry. R3.3 server-canonical RPC errors are not automatically mapped into the Safe Work queue.

## Logout with pending work
Do not clear IndexedDB. Warn only when the current Safe Work namespace has unsynced local work.

## Build/typecheck fails
Use the committed lockfile and full verification sequence:

```bash
node --version
npm --version
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

Use Node 22 LTS first. Do not bypass lockfile disagreement.

## Legacy behavior differs
Inspect `legacy/streamlit/` as migration evidence only; legacy assessment identity cannot redefine R3 semantics.
