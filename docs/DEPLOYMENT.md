# Deployment

Static delivery foundation is implemented; production cutover remains separately governed.

## Clean build
```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```
Only browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may reach the client. Never expose service-role/database/deployment credentials.

## Delivery
`wrangler.jsonc` serves `./dist` with SPA fallback. Cloudflare is delivery, not academic backend. Supabase/PostgreSQL remains canonical.

## Migration order
```text
r3.0-foundation.1
-> r3.1-academic-spine.1
-> r3.2-safe-work.1
-> r3.1-teaching-core.1
-> r3.3-assessment-core.1
-> r3.3-rapid-correction.1
```
The runtime head and `src/config/schema.ts` must both be `r3.3-rapid-correction.1`. Apply migrations strictly in filename order before deploying this frontend. Never pre-set schema versions or apply fragments. The browser fails closed on mismatch.

Rapid correction requires normal browser IndexedDB availability for Pending Safe durability. Routine teacher operation must not require Supabase dashboard maintenance. Production cutover remains separately governed.
