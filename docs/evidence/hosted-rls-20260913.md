# Hosted RLS acceptance evidence — 2026-09-13

Candidate application SHA: `4779ad702db9f455c2e95539c5e6da03db55651d`
Supabase production project: `ifnnmmilurqtvvxywrlo`
Mode: read-only / transaction-rollback verification. No existing browser or Android session was revoked or modified.

## Identity truth

- Hosted Auth contains two identities.
- Teacher A is the owner of the production workspace and has signed in previously.
- Teacher B is a distinct hosted Auth identity and is not the workspace owner.
- No password, access token, service-role secret, OAuth credential, or session cookie was copied into this evidence.

## Hosted RLS visibility torture

The database session was switched to PostgreSQL role `authenticated` and `request.jwt.claims.sub` was set to each real hosted Auth UUID, so `auth.uid()` resolved to the tested identity while normal RLS remained active.

Teacher A visibility:

- workspaces: 1
- classes: 11
- students: 382
- enrollments: 382
- assessments: 10
- assessment_results: 56
- artifacts: 1
- artifact_versions: 1
- artifact_objects: 2

Teacher B visibility for the same tested canonical domains:

- workspaces: 0
- classes: 0
- students: 0
- enrollments: 0
- meetings: 0
- checkpoints: 0
- assessments: 0
- assessment_results: 0
- assessment_attempts: 0
- report_snapshots: 0
- report_snapshot_rows: 0
- artifacts: 0
- artifact_versions: 0
- artifact_objects: 0

Anonymous access was also tested and `SELECT` on `public.workspaces` was rejected by PostgreSQL permissions rather than exposing rows.

## Hosted RPC boundary torture

`apply_student_rename_operation(...)` was executed as Teacher A inside a transaction with an unchanged display value. The RPC reached the owner path and returned a successful save result; the transaction was rolled back. A post-check confirmed the original row value and revision remained unchanged.

The same RPC was invoked as Teacher B against Teacher A data and failed closed with `workspace required`. No mutation was applied.

## Private Storage boundary

Bucket `artifact-files` is hosted and private (`public=false`), with a 20 MB limit and the expected PDF/DOCX/octet-stream MIME allowlist.

Hosted `storage.objects` policies are owner-bound through `artifact_objects -> workspaces.owner_user_id = auth.uid()` for both SELECT and INSERT. The production bucket currently contains one physical object.

RLS visibility against hosted `storage.objects`:

- Teacher A: 1 visible object
- Teacher B: 0 visible objects

No Storage object was uploaded, overwritten, downloaded, or deleted by this verification.

## Acceptance disposition

This evidence upgrades the real-hosted RLS portion of P2 from unproven to **PASS for database and Storage metadata isolation**.

It does **not** claim complete `P2_REAL_AUTH_RLS_STORAGE=PASS`, because final P2 additionally requires a real authenticated HTTP/client session plus exact private Artifact byte upload/download and negative signed-object access proof. Those remain unclaimed.

It does not claim P3 recovery, authenticated deployed daily-driver acceptance, Google SSO, or production cutover.
