# NILAI SMP — HUMAN / AI COLLABORATION CONTINUITY PLAYBOOK

Status: durable collaboration aid  
Scope: Nilai SMP project collaboration behavior only  
Mutable implementation state: **NOT STORED HERE**

## 1. Why this exists

This file preserves the working pattern that has repeatedly produced accepted results on Nilai SMP, so a fresh chat or reduced-context model can operate correctly without reconstructing the entire history.

This is not a current-state ledger. For current truth, inspect the repository.

Authority order:

`CURRENT REPOSITORY / MERGED IMPLEMENTATION > CURRENT CONTRACTS / STATUS DOCS > ACCEPTED GOVERNOR DECISIONS > OLD CHAT / HANDOFF / MEMORY`

## 2. What the operator usually wants

Nilai SMP is not treated as a demo app. The operator repeatedly pushes toward a daily-use teacher product that is:

`SIMPLE → FAST → MOBILE-FRIENDLY → RELIABLE → SAFE → LOW-MAINTENANCE`

The user commonly asks to keep moving until the actual core destination is reached, but without silently broadening scope.

Typical intent:

- inspect the repo first;
- do not repeat completed work;
- continue from the first real unfinished step;
- if a repair is obviously inside accepted scope, repair it and continue;
- prove real behavior, not just architecture or code presence;
- merge only when semantics, diff, and exact-head evidence are actually acceptable.

## 3. First-response behavior

For repository-dependent work:

1. inspect current `main` and relevant open PRs;
2. inspect the exact contract/status docs for the active workstream;
3. compare current repo truth with the user's brief;
4. skip already-completed phases;
5. identify the first actual unfinished step;
6. continue there;
7. do not reopen closed work without specific invalidating evidence.

When the user says variants of:

- `cek repo dulu`
- `kalau sudah lewati skip`
- `lanjut seadanya`
- `gas sampai selesai`

this is the required recovery algorithm, not casual phrasing.

## 4. Common command semantics

### `ACC`

Usually means the substantive result is accepted.

Depending on context, this may mean:

- continue to the next bounded phase;
- persist the accepted contract/closure;
- merge if all already-defined merge conditions are met.

It does **not** mean to ignore missing evidence or semantic defects.

### `gas` / `lanjut`

Means continue the already-understood bounded task without low-value confirmation.

If a failure is repairable inside scope, repair it and continue.

### `gaspoll` / `roro jonggrang` / `was wes wos` / `sampai selesai`

Means execute the entire already-authorized chain:

`inspect → implement → test → inspect failure → repair → retest → full regression → diff review → exact-head proof → merge/closure if valid`

The phrase means **more execution**, not permission to invent new scope.

### `mendalam` / `DEEP`

Means increase depth of review:

- semantic edge cases;
- data-model contradictions;
- RLS/ownership boundaries;
- atomicity/idempotency/conflict behavior;
- mobile/desktop failure paths;
- production-vs-dev proof;
- rollback/recovery implications.

It does not itself authorize implementation.

### `jangan implement dulu`

Read-only/research mode. Inspect, compare, review, or verify only.

### `udah?` / `selesai?`

Do not answer with another roadmap unless work is actually incomplete.

Preferred shape:

`VERDICT → EXACT PROOF → BLOCKER/RESIDUAL → NEXT REQUIRED ACTION (if any)`

### `kalau udah pas merge saja`

Means:

1. inspect exact PR head;
2. inspect diff;
3. inspect tests/CI;
4. verify semantic correctness;
5. verify no blocker/residual is being misclassified;
6. merge only if the accepted exit condition is truly satisfied.

Green CI alone is not enough.

### `bukan, bukan` / `wait` / `lah`

Treat as a strong signal that the current interpretation is wrong or incomplete.

Re-check the disputed premise immediately. Do not defend the old interpretation. Preserve only facts that remain valid after the correction.

### Additional brief after work already started

Treat it as a constraint patch.

- integrate it if compatible;
- do not restart from zero unnecessarily;
- if it invalidates previous work, state exactly what is invalidated and why.

## 5. Nilai SMP semantic correctness law

This project is especially sensitive to silent academic meaning corruption.

Never collapse these distinctions:

- Assessment != Result
- Result != Attempt
- workflow state != score
- `UNCHECKED`, `GRADED`, `MISSING`, `EXCUSED` are different truths
- 0 != blank
- Missing != 0
- ORIGINAL != MAKEUP != REMEDIAL != CORRECTION
- spreadsheet row != Student identity
- display name/NIS/NISN must not silently replace stable Enrollment identity
- Preview != Commit
- UI Session != Teaching Meeting
- Artifact != ArtifactVersion != ArtifactObject
- Archive != verified portable backup

A recurring rejection pattern is fabricated semantics. Example: changing a Result does **not** automatically mean `attempt_kind = CORRECTION`.

When the teacher must choose semantic intent, preserve that explicit choice instead of inferring it from convenience.

## 6. What usually gets accepted

### A. Repository-grounded status

Use exact evidence:

- PR number;
- exact head SHA;
- merged/not merged state;
- exact workflow run or test lane;
- migration or contract file;
- observed real-device/runtime behavior;
- exact unresolved blocker.

### B. Clear verdict early

Good answers begin with one of:

- PASS / FAIL / CONDITIONAL PASS
- COMPLETE / INCOMPLETE
- BLOCKED / UNBLOCKED
- MERGE / DO NOT MERGE
- REAL / PARTIAL / NOT PROVEN

Then explain the evidence.

### C. Blocker and residual separation

Classify findings:

- **BLOCKER** — prevents current exit condition;
- **REPAIRABLE WITHIN SCOPE** — fix now when authorized;
- **RESIDUAL** — real but nonblocking;
- **PARK / FUTURE** — not active roadmap;
- **OUT OF SCOPE** — report, do not implement.

### D. End-to-end completion after authorization

A frequent failure mode is stopping at analysis when execution is already authorized.

If the user asks to gas through a bounded phase, expected behavior is to continue through repair and verification rather than repeatedly ask for permission.

### E. Exact-head merge review

The operator has repeatedly rejected the idea that "CI green" is equivalent to "safe to merge".

Review:

- exact current PR head;
- TypeScript typecheck;
- unit/static contracts;
- PostgreSQL contract tests;
- production build;
- Chromium/browser lane;
- production-artifact lane when relevant;
- academic semantics;
- RLS/ownership boundaries;
- atomicity/idempotency/conflict behavior;
- changed-file scope.

### F. Real hosted proof when production truth requires it

Local/CI proof is not automatically equivalent to real Supabase or real Cloudflare behavior.

Where the contract requires hosted truth, use actual identities and actual hosted boundaries. Typical accepted sequence includes:

- real Auth identities;
- owner/adversary RLS torture;
- RPC/service boundary proof;
- canonical teacher fixture;
- real backup manifest;
- restore/recovery proof;
- production mobile/desktop smoke;
- rollback proof;
- explicit cutover only after evidence.

## 7. Implementation workflow

Default:

`INSPECT → RECONCILE → DEFINE BOUNDED CONTRACT → IMPLEMENT → TARGETED VERIFY → ADVERSARIAL REVIEW → REPAIR → FULL REGRESSION → DIFF REVIEW → EXACT-HEAD VERIFY → MERGE OR REPORT BLOCKER`

Important details:

- inspect before changing;
- define semantics before coding when ambiguity could corrupt data;
- write/strengthen tests that encode the semantic contract;
- do not weaken tests merely to make CI green;
- repair failures inside the active scope without re-asking;
- after repair, rerun the broader relevant suite;
- review diff for accidental scope expansion;
- verify the exact head you are about to merge.

## 8. Database / RLS review pattern

For schema-backed changes, a strong result usually includes more than happy-path SQL.

Check:

- owner-derived access;
- adversary denial;
- foreign-key ownership alignment;
- workspace boundaries;
- unique/canonical identity guarantees;
- malformed-state rejection;
- append-only/history invariants where applicable;
- idempotency and retry behavior;
- concurrency/revision conflict semantics;
- atomicity for multi-row operations.

Do not rely on privileged test setup as proof that real authenticated RLS behavior is correct.

## 9. UI / product review pattern

The app is teacher-first and mobile-first.

When UI work is involved, check:

- mobile real-device usability;
- desktop usability;
- sticky/fixed chrome vs workspace scroll behavior;
- no horizontal overflow in normal paths;
- labels use teacher language, not engineering milestone jargon;
- setup/data browsing exposes enough existing truth to avoid duplicate entry;
- empty states are useful;
- actions do not claim Saved/Pending Safe earlier than the underlying contract allows.

Visual polish does not excuse semantic ambiguity.

## 10. Research / comparison pattern

When comparing options, the user prefers broad exploration but wants convergence.

Use:

`EXPLORE → ELIMINATE WEAK OPTIONS → COMPARE SERIOUS SURVIVORS → RECOMMEND → FALLBACK`

Judge by Nilai SMP constraints, especially:

- teacher usability;
- low-maintenance operations;
- free/no-credit-card preference where feasible;
- actual production compatibility;
- migration/rollback cost;
- data integrity.

Do not recommend technology merely because it is fashionable.

## 11. Reduced-context recovery

When context is limited, read:

1. `AGENTS.md`;
2. `docs/AI_OPERATOR_CONTINUITY_PROFILE.yaml`;
3. the exact current workstream contract/status doc;
4. the task handoff if one exists;
5. actual code/migrations/tests/PR/CI evidence.

Load this full playbook only if collaboration semantics remain unclear.

Emergency rules:

- repository reality wins;
- skip completed work;
- semantic correctness beats convenience;
- green CI is necessary, not sufficient;
- never fabricate AttemptKind or teacher intent;
- Preview is not Commit;
- repair within scope and continue when authorized;
- classify blockers separately from residuals;
- do not claim completion without exact evidence;
- do not silently expand post-R3 scope.

## 12. Anti-patterns

Avoid:

- asking the user to repeat repo facts already available;
- trusting stale handoff over current main;
- merging because tests are green while semantics are wrong;
- fabricating AttemptKind or other academic intent;
- using display fields as stable spreadsheet identity;
- pretending a local preview is committed server truth;
- weakening typecheck/tests/contracts to pass CI;
- hiding RLS/adversary failures;
- treating privileged DB setup as authenticated-user proof;
- stopping after a plan when implementation is already authorized;
- asking confirmation for every routine repair;
- silently broadening scope into future features;
- claiming production readiness from dev-server success alone.

## 13. Maintenance rule

Update this file only for durable, repeated collaboration patterns that help future agents operate Nilai SMP correctly.

Do not turn it into a mutable status ledger or chat transcript.
