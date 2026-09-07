# Cloudflare Candidate / Rollback Runbook

Status: operator-ready, **not** production authorization.

This runbook prepares P4/P6 execution after the blocked real-browser Auth/Storage proof is completed. It does not change the production gate order and it must not be used to claim P4/P5/P6 PASS before the required real evidence exists.

## Architecture law

```text
Browser
  -> Cloudflare Workers Static Assets (`dist/`)
  -> Supabase Auth / Data API / RPC / Storage
```

Cloudflare is delivery only. Do not add Worker-side state, KV, D1, Durable Objects, queues, or an academic backend.

`wrangler.jsonc` must continue to serve `./dist` with `not_found_handling: "single-page-application"`.

## Before first deployment

Require:
- current `main` exact CI is green;
- `HOSTED_SCHEMA_TRUTH = PASS`;
- browser-safe production values are known for exactly:
  - `VITE_SUPABASE_URL`;
  - `VITE_SUPABASE_PUBLISHABLE_KEY`;
- no service-role key, DB password, access token, or Cloudflare credential is stored in `VITE_*`, Git, screenshots, or evidence documents;
- the Supabase project ref derived from `VITE_SUPABASE_URL` matches the approved production-candidate project in the latest hosted evidence.

P2/P3 may still be blocked while this operator lane is prepared, but **actual cutover remains forbidden** until every gate in `docs/PRODUCTION_READINESS.md` is PASS.

## Build the exact candidate

Set the two browser-safe variables only in the operator shell, then run:

```bash
npm ci --no-audit --no-fund
npm run candidate:preflight
```

`candidate:preflight` performs:
1. fail-closed browser-env validation;
2. the production Vite build;
3. scan of `dist/` for dev/source/privileged markers;
4. proof that the intended Supabase URL and publishable key were embedded;
5. `wrangler deploy --dry-run` so Cloudflare packaging is checked without publishing.

Do not publish if this fails.

## First candidate deploy

Use an authenticated, deliberate operator session:

```bash
npm run deploy
```

The deploy script rebuilds through the same fail-closed candidate builder before `wrangler deploy`.

Record sanitized evidence immediately:
- Git commit SHA;
- build command: `npm run candidate:preflight` / `npm run deploy`;
- Wrangler version (`npx wrangler --version`);
- Worker name (`nilai-smp`);
- Cloudflare version/deployment ID emitted by Wrangler;
- public HTTPS URL;
- Supabase project ref (not keys/tokens);
- deployment timestamp.

Never record the Cloudflare API token or any privileged credential.

## P4 URL smoke

After Wrangler reports the candidate URL:

```bash
npm run candidate:smoke -- https://<candidate-host>
```

The smoke probe requires:
- root returns `200` HTML;
- a deliberately nonexistent deep navigation path also returns `200` HTML via SPA fallback;
- both responses contain the Nilai SMP SPA root;
- neither response exposes `/src/` nor Vite dev-client paths.

This script is necessary but not sufficient for `CLOUDFLARE_CANDIDATE = PASS`: the deployed browser must still load with the intended production Supabase config.

## Known-good rollback proof

Rollback changes frontend/static deployment only. It does **not** roll back Supabase schema or data.

Before production cutover:
1. record the known-good Cloudflare version ID;
2. deploy one controlled later candidate that remains schema-compatible;
3. smoke that later candidate;
4. roll back explicitly:

```bash
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --message "Nilai SMP rollback proof"
```

5. re-run:

```bash
npm run candidate:smoke -- https://<production-host>
```

6. verify in the Cloudflare dashboard/CLI that the known-good version is active again;
7. record the rollback deployment/version evidence without credentials.

Do not use rollback to compensate for an incompatible database migration. After live data exists, schema is forward-moving; prefer forward repair when an older frontend is not compatible with current hosted schema.

## Explicit gate boundaries

This runbook does **not** authorize these claims by itself:

```text
REAL_AUTH_RLS_STORAGE = PASS
REAL_RECOVERY = PASS
CLOUDFLARE_CANDIDATE = PASS
DEPLOYED_DAILY_DRIVER = PASS
KNOWN_GOOD_ROLLBACK = PASS
PRODUCTION_CUTOVER = TRUE
```

They require the real evidence defined in `docs/PRODUCTION_READINESS.md`.
