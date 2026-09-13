# Hosted recovery-target evidence — 2026-09-13

Current main at branch creation: `4d11855f5a40f13883b08a385ea933535c8a4345`

Production source project: `ifnnmmilurqtvvxywrlo`
Candidate recovery-target project: `pnfhmsfvylhilzbkrjrm`

## Production export truth

Using the real production workspace owner identity under hosted RLS, `export_portable_backup()` successfully produced a portable manifest of 297,990 bytes. The manifest was not persisted in this evidence and no secrets or session tokens were handled.

## Recovery-target truth

The target has the required bootstrap workspace, but its portable recovery tables are not empty. Non-zero examples include:

- academic_years: 1
- academic_periods: 1
- classes: 1
- students: 1
- enrollments: 1
- materials: 1
- lessons: 1
- lesson_versions: 1
- meetings: 1
- checkpoints: 1
- assessments: 1
- assessment_results: 1
- audit_events: 2
- artifacts: 1
- artifact_versions: 1
- artifact_objects: 1

This is distinct from the required empty bootstrap target. A workspace row by itself is expected by the restore contract, but portable tables must be empty.

## Hosted nonempty-target fail-closed proof

A schema-valid portable backup envelope with all required table arrays present was passed to `restore_portable_backup_operation(...)` as the real owner identity of the target workspace.

The hosted database rejected restore with:

`P3701: restore target is not empty: academic_years`

No persisted mutation occurred.

## Free-tier branch check

A Supabase development branch would cost `$0.01344/hour` for the current organization. It was not created because the project operating guardrail is Rp0 / no-CC / free-tier.

## Hosted Artifact integrity observation

Production `artifact_objects` currently contains:

- one `PENDING_UPLOAD` OTHER/octet-stream row with no physical object and no SHA-256, consistent with pending semantics;
- one `READY` PDF row with SHA-256 present and a physical private Storage object whose recorded size exactly matches the canonical database byte size (`1,031,861` bytes).

This strengthens hosted Artifact metadata integrity evidence, but does not replace real authenticated byte download/upload or signed-object access proof.

## Acceptance disposition

`P3_REAL_RECOVERY` remains **NOT PROVEN**, but the reason is now concrete and verified:

- production portable export works under the real owner identity;
- the only zero-cost second hosted project is a nonempty target;
- restore correctly fails closed on that target;
- creating a disposable Supabase branch is not free.

Completing P3 therefore requires either an explicitly authorized destructive reset/reuse of the second project, or another genuinely empty hosted target that satisfies the zero-cost policy.

No project data was deleted, no project was reset, and no production cutover is claimed.
