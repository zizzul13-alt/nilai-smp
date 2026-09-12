# F2.1 Worker-first routing repair

Production deploy of exact main `ed0abc13a0e77c4632cabdda4d3c32c4d4014484` proved the Worker and `env.AI` binding deploy successfully, but unauthenticated `POST /api/teacher-brief` returned an empty 405 from the static-assets layer instead of the Worker endpoint's 401.

Repair: set `assets.run_worker_first` to `true` so all requests enter the Worker first; non-API requests are still delegated to `env.ASSETS.fetch(request)` by `worker/index.ts`.

Scope remains F2.1 only. No schema, academic semantics, F4, or mutation behavior changes.
