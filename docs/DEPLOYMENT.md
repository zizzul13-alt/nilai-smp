# Deployment

## Status

Static delivery foundation is implemented; production cutover is not authorized by R3.0.

## Build

```bash
npm install --no-audit --no-fund
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

Apply source-controlled files in `supabase/migrations/` through the governed deployment process before releasing a frontend that expects the new schema version. R3.0 does not prescribe routine manual dashboard administration for the teacher.

Production cutover requires a separate Governor authorization.
