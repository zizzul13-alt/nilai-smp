# Testing

CI remains Rp0 and uses Node plus disposable PostgreSQL 17; never production data.

Required final sequence: clean `npm ci`, typecheck, Vitest unit/static contracts, PostgreSQL RLS/constraint/Safe Work contracts, production build, Chromium install, Playwright E2E.

R3.2 coverage must prove: durable enqueue truth ordering, IndexedDB restart persistence, forced persistence failure, namespace isolation, network/retry behavior, same-op lost ACK idempotency, auth pause, revision conflict, cross-workspace denial, and local cleanup after save. Browser IndexedDB E2E is the persistence boundary; PostgreSQL tests exercise the real migration/RPC transaction rather than regex alone.
