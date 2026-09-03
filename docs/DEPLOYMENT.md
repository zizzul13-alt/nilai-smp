# Deployment

## Status

Static delivery foundation is implemented; production cutover remains separately governed.

## Build

```bash
npm ci --no-audit --no-fund
npm run verify
```

Provide browser-safe build variables through the deployment environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

These are public client configuration, not privileged secrets.

## Cloudflare Workers Static Assets

`wrangler.jsonc` points to `./dist` and uses `not_found_handling: single-page-application` for SPA fallback. No Worker script/API backend is introduced.

```bash
npm run deploy
```

Cloudflare account authentication belongs to the deployment/CI environment. Do not put API tokens in the repository or in `VITE_*` variables.

## Supabase migrations

Apply source-controlled files in `supabase/migrations/` in filename order through the governed deployment process before releasing a frontend that expects the new schema version. R3.1 requires the academic-spine migration to complete before `app_schema_version` becomes `r3.1-academic-spine.1`; that version write is intentionally the migration's final operation.

Do not manually pre-set the schema version, apply only fragments of the migration, or point destructive contract tests at production. The browser remains fail-closed until the deployed schema matches `src/config/schema.ts`.

Routine teacher operation must not require Supabase dashboard maintenance. Production cutover requires separate Governor authorization.
