# Backup / Restore

## Status

R3.6 portable backup/restore core is implemented.

Archive is not backup. Dexie Pending Safe is not backup. Supabase canonical data by itself is not a user-portable recovery artifact.

## Portable backup v1

The Recovery workspace calls the owned `export_portable_backup()` RPC, then reads every READY ArtifactObject from the private `artifact-files` bucket. READY bytes are accepted into the backup only when size and SHA-256 match canonical metadata. The downloaded JSON contains:

- explicit `nilai-smp-portable-backup` format/version identity;
- source schema version and export timestamp;
- canonical workspace-owned rows needed to reconstruct academic, teaching, assessment, reporting, continuity, artifact and idempotency state;
- exact READY artifact binary payloads encoded into the portable file;
- a whole-manifest SHA-256 checksum.

The browser also exposes an XLSX human-escape export derived from canonical Result/Enrollment/Student/Class/Assessment identities. It is for human/provider escape, not round-trip canonical restoration.

## Restore law

Restore is `verify -> restore-to-empty -> restore artifact bytes -> checksum-confirm READY`.

`restore_portable_backup_operation()`:

- derives the target personal workspace from `auth.uid()`;
- never accepts a browser-supplied target workspace owner;
- is idempotent through a deterministic manifest operation identity;
- refuses a non-empty canonical workspace rather than merging two histories;
- preserves stable domain UUIDs while remapping workspace ownership to the signed-in personal workspace;
- reconstructs circular current-version/current-snapshot links only after append-only children exist;
- restores ArtifactObject metadata as `PENDING_UPLOAD`, never fake READY.

The browser then uploads exact backed-up bytes with `upsert:false`. Existing paths on retry must match byte size + SHA-256. Only `confirm_artifact_object_operation()` can move restored object metadata to READY.

A browser/network interruption after canonical restore is recoverable: replaying the same verified backup replays the restore operation and continues PENDING artifact uploads.

## Compatibility

Portable format version is distinct from application schema version. `migratePortableBackup()` is the explicit format-migration boundary. R3.6 v1 currently accepts portable format v1 and fails closed on unknown future formats rather than guessing.

## Disaster/cutover law

Before production cutover preserve independently:

1. the legacy read-only source;
2. a verified portable canonical backup/recovery checkpoint;
3. the legacy migration report.

Do not maintain indefinite dual-writing between legacy and R3. Fatal failure favors stop/preserve/diagnose/forward-repair or verified restore.
