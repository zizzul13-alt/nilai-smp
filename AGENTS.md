# Nilai SMP — AI Agent Operating Rules

This repository is an evidence-first, production-minded teaching application. AI agents must preserve the academic data model, teacher workflow, and current repository truth before optimizing convenience.

## Authority order

For implementation facts and current status, use:

`CURRENT REPOSITORY / MERGED IMPLEMENTATION > CURRENT REPOSITORY DOCS / CONTRACTS > ACCEPTED GOVERNOR DECISIONS > OLD CHAT / HANDOFF / MEMORY`

A copied brief is not authoritative when the repository has moved. Inspect first, reconcile, skip completed work, then continue from the first actual unfinished step.

## Core operating law

Be autonomous in execution, conservative in scope, exact about academic semantics, and evidence-backed in every closure claim.

Do not redesign frozen architecture merely because another framework, pattern, or abstraction is attractive. The target remains the current React + Vite + Supabase architecture unless newer accepted repository evidence supersedes it.

## Academic semantic invariants

Never silently collapse these distinctions:

- Assessment != Result
- Result != Attempt
- workflow state != score
- UNCHECKED != GRADED != MISSING != EXCUSED
- 0 != blank
- Missing != 0
- MAKEUP != REMEDIAL != CORRECTION != ORIGINAL
- Preview != Commit
- spreadsheet row != Student/Enrollment identity
- UI Session != Teaching Meeting
- Artifact != ArtifactVersion != ArtifactObject
- Archive != verified portable backup

Do not infer an AttemptKind or other academic meaning merely because a value changed. Preserve explicit teacher intent and canonical identities.

## Implementation workflow

Default loop:

`INSPECT → RECONCILE → DEFINE BOUNDED CONTRACT → IMPLEMENT → TARGETED TEST → ADVERSARIAL REVIEW → REPAIR → FULL REGRESSION → DIFF REVIEW → PR/EXACT-HEAD VERIFY → MERGE ONLY WHEN AUTHORIZED`

When a defect is repairable inside already-authorized scope, repair and continue instead of repeatedly asking for confirmation.

## Merge discipline

A green CI run is necessary but not sufficient. Before merge, review:

- exact PR head / expected SHA;
- academic semantics;
- schema constraints and ownership boundaries;
- RLS / owner-adversary behavior when applicable;
- idempotency, conflict, and atomicity contracts;
- mobile/desktop product behavior when applicable;
- regression coverage;
- diff scope;
- blockers vs non-blocking residuals.

Never weaken tests or canonical semantics merely to obtain green CI.

## Data / persistence discipline

Prefer canonical PostgreSQL truth with explicit constraints, foreign keys, ownership, RLS, deterministic RPC/service boundaries, and stable domain IDs.

Client/UI state is not canonical academic truth. Local durable queues may preserve Pending Safe operations only where the accepted contract explicitly allows them. Do not pretend bulk/import flows are offline-safe when they require one online atomic transaction.

## Product priority

Optimize for the teacher's real daily use:

`SIMPLE → FAST → MOBILE-FRIENDLY → RELIABLE → SAFE → LOW-MAINTENANCE`

Hide engineering complexity from normal use. Prefer free/no-credit-card and low-attention infrastructure where architecture decisions permit it, but never trade away data integrity to satisfy infrastructure convenience.

## Scope discipline

Do not silently add post-R3 ideas, AI features, multi-teacher collaboration, generic search, schedule automation, gamification, or other parked concepts unless explicitly authorized by current governance.

Report useful out-of-scope findings instead of implementing them.

## Collaboration continuity boot

For fresh chats or reduced-context models, read in this order:

1. `AGENTS.md`
2. `docs/AI_OPERATOR_CONTINUITY_PROFILE.yaml`
3. `docs/HUMAN_AI_COLLABORATION_CONTINUITY_PLAYBOOK.md` when interaction semantics are unclear
4. the exact current contract/status document for the active workstream
5. actual code, migrations, tests, PR/CI evidence required for the decision

These continuity files describe how to work with the operator. They do not store mutable implementation state and never override current repository reality.
