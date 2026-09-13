# Deep-generation provider-response hotfix — 2026-09-14

Observed on authenticated Android production use after the deep-generation rollout:

- Lesson identity creation succeeded.
- Deep generation progressed through the pipeline.
- `BAHAN_AJAR` failed closed with `INVALID_PROVIDER_RESPONSE (502)`.
- This indicates a malformed/nonconforming Workers AI structured response, not an academic-data or persistence failure.

Hotfix:

- Deep planning/content/blueprint/document calls retry once only when the server reports `INVALID_PROVIDER_RESPONSE (502)`.
- Deep specialist document calls are serialized instead of bursting five specialist requests in parallel.
- Other HTTP/provider failures still fail closed and are not silently converted into success.
- No schema, RLS, assessment, reporting, artifact persistence, or recovery contract changed.

Validation status at commit time: manual code review only; GitHub CI intentionally skipped to conserve Actions quota. Production re-test must be performed through the authenticated mobile workflow.
