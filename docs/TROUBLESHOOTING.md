# Troubleshooting

## App shows “Konfigurasi belum siap”

Copy `.env.example` to `.env.local`, set the Supabase URL and publishable/anon key, then restart Vite. Never substitute a service-role key.

## Login fails

The UI surfaces the Supabase Auth error. Verify the configured project, account credentials, and project auth settings. R3.0 intentionally does not implement signup/recovery/admin account management.

## “Database belum kompatibel”

Do not continue writing academic data. Verify that the expected migration under `supabase/migrations/` has been applied and that `app_schema_version` matches `src/config/schema.ts`.

## Build/typecheck fails

```bash
node --version
npm --version
npm install --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

Use Node 22 LTS first because CI verifies that baseline.

## Legacy behavior differs

Inspect `legacy/streamlit/` as migration evidence, but do not patch R3 semantics to match legacy shortcuts without Governor review.
