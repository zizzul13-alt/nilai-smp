# Deployment

## Status

Static delivery foundation is implemented; production cutover remains separately governed.

## Build

```bash
npm ci --no-audit --no-fund
npm run verify
```

Provide only browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put service-role/database/deployment credentials in browser variables.

## Cloudflare Workers Static Assets

`wrangler.jsonc` serves `./dist` with SPA fallback. Cloudflare is delivery, not the academic backend.

```bash
npm run deploy
```

## Supabase migrations

Apply `supabase/migrations/` strictly in filename order before releasing a frontend that expects the new schema head:

```text
r3.0-foundation.1
-> r3.1-academic-spine.1
-> r3.2-safe-work.1
-> r3.1-teaching-core.1
-> r3.3-assessment-core.1
```

The current runtime head is `r3.3-assessment-core.1`, matching `src/config/schema.ts`. The R3.1 Teaching Core remains intentionally after R3.2 because it closed a previously missed R3.1 residual; R3.3 then extends that cumulative state.

Each migration advances `app_schema_version` only after its complete contract exists. Do not pre-set schema versions, apply fragments, or point destructive contract tests at production. The browser fails closed on mismatch.

Routine teacher operation must not require Supabase dashboard maintenance. Production cutover remains separately governed.
