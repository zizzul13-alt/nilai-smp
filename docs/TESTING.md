# Testing Strategy

## R3.0 implemented tiers

1. **Unit tests (Vitest):** browser configuration, auth state/service behavior, schema compatibility.
2. **Database/contract tests (Vitest):** source-controlled migration/version contract and browser write restrictions for the compatibility table.
3. **Integration foundation:** Supabase services are isolated behind small modules so later tests can use a real test project/local Supabase without coupling presentation to data access.
4. **Critical E2E (Playwright):** mobile + desktop Chromium projects; R3.0 verifies the clear fail-closed configuration state without requiring secrets.

## Commands

Start clean verification from the committed dependency graph:

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

CI uses the same committed lockfile with `npm ci --no-audit --no-fund`, additionally installs Chromium with system dependencies, and runs all tiers available in R3.0.

## Deferred by design

Real academic database integration tests and authenticated E2E workflows require the later canonical schema/test fixture strategy. They must not be fabricated against the legacy schema.
