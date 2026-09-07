# Post-R3 Future Roadmap

## Purpose

This document governs product/architecture possibilities **after first production is proven**. It is not a commitment to implement every item.

Nilai SMP is intentionally optimized for a **single teacher, mobile-first daily workflow, low maintenance, free-tier-friendly hosting, strong academic truth, and recoverability**. Future work must improve that product rather than transform it into a generic school ERP.

The first-production critical path is governed by `docs/PRODUCTION_READINESS.md`.

## Decision rule

A future feature earns implementation priority only when it satisfies most of these:

1. removes repeated real teacher friction;
2. preserves explicit academic truth;
3. works comfortably for one teacher;
4. does not require permanent paid infrastructure;
5. does not turn narrow Safe Work into an uncontrolled distributed-sync problem;
6. can be explained and recovered;
7. has a bounded migration/rollback story;
8. adds more daily value than maintenance burden.

Passing tests is necessary but not sufficient.

---

# Priority map

| Future direction | Teacher value | Architecture cost | Semantic risk | Free-tier fit | Recommended state |
|---|---:|---:|---:|---:|---|
| Planned timetable / schedule expectation layer | High | Medium | Medium | Excellent | **F1 candidate** |
| Teacher Brief / AI advisory | Medium-High | Medium | Medium | Conditional | **F2 candidate after stable production** |
| Bounded navigation/search improvements | Medium | Low-Medium | Low | Excellent | **F3 opportunistic** |
| Reporting/export refinements from observed use | High if pain appears | Low-Medium | Medium | Excellent | **Evidence-driven** |
| Full offline replica + general sync | Medium | Very High | Very High | Mixed | **Defer** |
| Multi-teacher collaboration / roles | Low for current owner | Very High | Very High | Mixed | **Defer unless product scope changes** |
| Automatic homework | Unproven | Medium-High | High | Good | **Do not auto-authorize** |
| Gamification | Low for teacher tool | Medium | Medium | Good | **Low priority** |
| Generic global search | Medium-low | Medium | Medium | Good | **Defer until navigation pain is observed** |

The ranking is intentionally asymmetric: the architecture should not pay multi-user/distributed-system costs for hypothetical future users when the product is currently a personal teacher tool.

---

# F1 — Planned Timetable / Schedule Expectation Layer

## Why this is the strongest first feature candidate

Today currently knows actual teaching history and explicit re-entry baselines, but intentionally does **not** fabricate timetable truth. A bounded planned timetable can reduce one of the most repetitive daily actions: choosing which class is likely relevant now.

The important design distinction is:

```text
PLANNED SLOT != ACTUAL MEETING
```

A schedule is an expectation. A Meeting remains an actual teaching occurrence created only by explicit `Start Class`.

## Proposed semantic model

Candidate entities:

```text
PlannedSchedule
  id
  workspace_id
  class_id
  weekday
  local_start_time
  local_end_time
  effective_from
  effective_until?     # optional bounded school-term validity
  status active|archived
  revision
```

Optional later extension:
- label/room;
- week-pattern if real use demands it.

Do not start with a general recurrence engine, calendar server, exception algebra, public-holiday database, or automatic Meeting materialization.

## Today behavior

Today may derive:
- “Likely now”;
- “Next planned class”;
- “No planned class right now”.

But the primary action remains:

```text
Likely Class IX A 09:30-10:10
[ Start Class ]
```

not:

```text
Meeting automatically created at 09:30  # forbidden
```

If the teacher teaches a different class, manual choice wins.

## Absence / cancellation truth

Skipping a planned slot must not create a cancelled Meeting automatically. “No Meeting happened” and “Meeting explicitly cancelled” are different facts.

If absence/cancellation tracking ever becomes useful, model it separately and explicitly rather than inferring it from an untouched timetable row.

## Why this fits free tier

The data volume is tiny, derivation can remain PostgreSQL/client-side, and no scheduler/background worker is required.

## F1 entry condition

Implement only after:
- first production is stable;
- teacher has used Today enough to confirm class-selection friction is real;
- frozen semantic contract states Planned Slot != Meeting.

---

# F2 — Teacher Brief / AI Advisory Layer

## Product intent

AI should help the teacher notice and summarize; it must not become the hidden authority over academic records.

A useful Teacher Brief could summarize:
- active/incomplete Meeting continuity;
- pending Safe Work/conflicts;
- classes that appear behind pacing intent;
- assessments with UNCHECKED/MISSING state requiring attention;
- reporting cycles approaching finalization but still incomplete;
- stale lesson/report-sourced artifacts;
- recovery/backup freshness warning if that operational metadata is later tracked.

## Hard boundary

```text
CANONICAL DATA -> deterministic bounded context -> AI suggestion
AI suggestion != canonical academic truth
```

AI must not silently:
- create/complete/cancel Meeting;
- invent Checkpoint;
- grade Result;
- infer AttemptKind;
- finalize ReportSnapshot;
- overwrite LessonVersion;
- overwrite ArtifactVersion;
- alter Student/Enrollment identity.

## Best architecture

### Stage 1 — deterministic brief without AI

Before calling any provider, construct a machine-readable `TeacherBriefContext` from bounded canonical reads.

Example shape:

```text
TeacherBriefContext
  generated_at
  active_meetings[]
  continuity_attention[]
  pending_safe_summary
  pacing_attention[]
  assessment_attention[]
  reporting_attention[]
  artifact_attention[]
```

This object should be independently useful and testable even if no AI provider is configured.

### Stage 2 — optional provider adapter

Provider receives only the bounded context required for the requested brief.

Provider-specific logic must stay behind an adapter. Academic services must not depend directly on OpenAI/Gemini/Groq/etc.

### Stage 3 — explicit save if wanted

Transient brief text may remain transient.

If the teacher deliberately saves AI-assisted material as a document, use existing Artifact semantics:
- append a new ArtifactVersion;
- keep exact source/provenance;
- record generator/provider/model metadata;
- never overwrite historical ArtifactVersion.

## Privacy law

Student data should not be sent to external AI merely because it exists. Minimize context and prefer identifiers/aggregates when names are unnecessary.

A provider should be considered untrusted with respect to academic truth: output is advisory text, not executable authority.

## Free-tier strategy

AI should be optional and provider-pluggable. No core workflow may stop working when AI quota is exhausted or the provider disappears.

A first implementation should therefore support:

```text
No AI configured -> full Nilai SMP still works
AI unavailable     -> brief falls back to deterministic context
AI available       -> optional narrative/priority summary
```

## F2 entry condition

Only after stable production and after a real usage review identifies repeated “what should I handle next?” cognitive load that deterministic Today alone does not solve.

---

# F3 — Bounded Navigation / Search Improvements

## Why not generic global search first

The current product graph has strong identities and scoped workspaces. A generic omnibox searching every entity can easily become:
- expensive broad queries;
- ambiguous identity resolution;
- hidden coupling between domains;
- accidental replacement for intentionally focused workflows.

Prefer bounded search where the teacher actually needs it.

Good candidates:
- Student/Enrollment search inside Rapid Correction;
- Class selector search if class count ever grows;
- Lesson selector search within a Class/Material context;
- Artifact title/type filter;
- Assessment filter within selected Class/Period.

Bad first candidate:
- one global search box that can mutate/navigate every entity through fuzzy name matching.

## Identity law

Search may locate an entity by display text, but subsequent mutation must still use stable canonical IDs.

Display name must never silently replace Student/Enrollment identity in assessment workflows.

---

# F4 — Evidence-driven Reporting and Export Refinements

Reporting is already semantically strong. Future changes should come from real school workflow pain, not from adding grading formulas speculatively.

Possible low-risk refinements:
- clearer provisional vs finalized comparison;
- teacher-visible explanation of calculation entries;
- class/period export formats required by actual school administration;
- print layouts;
- selected snapshots as document Artifacts;
- bounded CSV/XLSX interoperability exports.

Any new reporting policy must remain explicit and versioned. Never change how old finalized snapshots are interpreted retroactively.

A new aggregation method is a schema/semantic package, not a UI toggle.

---

# F5 — Full Offline: intentionally deferred

## Why narrow Safe Work is different

Current Safe Work protects the highest-risk interruption cases with a deliberately narrow queue:
- rapid judgement;
- teaching checkpoints;
- bounded retryable operations.

The server remains canonical.

“Full offline” would be a qualitatively different architecture:

```text
local canonical replica
+ offline reads/writes across most entities
+ conflict model
+ synchronization ordering
+ stale reference handling
+ auth/session expiry behavior
+ local schema migrations
+ multi-tab coordination
+ attachment queueing
+ report/finalization restrictions
+ recovery interactions
```

That is a distributed database problem, not an IndexedDB feature.

## When reconsideration is justified

Only reconsider if real production evidence shows the teacher frequently works through long connectivity outages where current Pending Safe coverage is insufficient.

Before implementation, require a separate Offline Architecture research/contract phase. Do not expand Dexie table-by-table ad hoc.

---

# F6 — Multi-teacher Collaboration: intentionally deferred

## Current architecture is personal-owner by design

Current ownership root is effectively:

```text
auth.user -> personal workspace -> protected graph
```

Adding collaboration is not “invite another teacher”. It changes the security model.

A credible design would require at least:
- WorkspaceMembership;
- explicit roles/capabilities;
- invite lifecycle;
- read/write authorization per domain;
- actor identity on important mutations;
- ownership transfer/removal semantics;
- concurrent editing/conflict policy;
- report finalization permissions;
- artifact access rules;
- backup/restore behavior for shared ownership;
- audit changes;
- RLS rewrite and attack matrix.

That cost is unjustified for the current single-teacher product unless scope explicitly changes.

## Hard rule

Never retrofit collaboration by weakening owner RLS or sharing one login.

---

# F7 — Automatic Homework: advisory only if ever pursued

Pacing currently describes available capacity and teacher intent. It deliberately does not create homework.

If homework support becomes valuable, safe progression is:

```text
Teacher asks for suggestion
-> deterministic/AI draft
-> teacher reviews
-> explicit create/save
```

Forbidden progression:

```text
COMPRESSED pacing
-> system automatically assigns homework
```

A pacing algorithm does not know enough about student circumstances to become assignment authority.

---

# F8 — Gamification: low priority

Gamification adds state, incentives, UI surface, and potentially student-facing semantics without solving a current core teacher problem.

Do not introduce points, streaks, badges, leaderboards, or reward loops unless a future user-research package establishes a concrete educational and workflow need.

Nilai SMP should remain a teacher productivity/truth tool before it becomes a student engagement product.

---

# F9 — Generic Global Search: defer until scope justifies it

Global search becomes attractive if the product accumulates many classes, materials, assessments, reports, and artifacts across years.

If needed later, build it as a read-only discovery index first. Navigation from search result should preserve canonical entity identity and domain authorization.

Do not let fuzzy search become a mutation identity mechanism.

---

# Cross-cutting future laws

## 1. Actual history outranks convenience

Never invent actual Meeting, Checkpoint, Result, Attempt, finalized ReportSnapshot, or READY Artifact state to make a dashboard look complete.

## 2. Planned != actual

Future schedule/calendar features are expectations; actual Meeting truth remains explicit.

## 3. AI != authority

AI may summarize/draft/recommend. Canonical academic mutation requires existing deterministic contracts and explicit teacher action.

## 4. Append before overwrite

For historically meaningful content/policies, prefer versioned append-only state over in-place rewrite.

## 5. Stable IDs survive UI convenience

Names, spreadsheet rows, search strings, or AI text do not replace canonical entity identifiers.

## 6. Free-tier dependency must be replaceable

No future provider should become so embedded that provider loss makes academic data unreadable or core workflows unusable.

## 7. Recovery evolves with schema

A new canonical table/entity is incomplete until portable export/restore, RLS, tests, and compatibility behavior are considered.

## 8. Production rollback is part of design

Every future schema package must state whether the previous frontend remains compatible. Cloudflare rollback cannot rewind Supabase state.

---

# Recommended order after first production

Do not start all tracks together.

```text
FIRST PRODUCTION
   |
   v
OBSERVATION WINDOW
   |  collect actual friction, failures, repeated manual work
   v
F1 Planned Timetable / expectation layer (if class-selection friction confirmed)
   |
   v
F2 Teacher Brief context + optional AI (if attention-management friction confirmed)
   |
   +--> F3 bounded navigation improvements as small evidence-driven packages
   +--> F4 reporting/export refinements as school requirements appear

DEFERRED UNLESS SCOPE/REALITY CHANGES:
   F5 Full Offline
   F6 Multi-teacher Collaboration
   F7 Automatic Homework
   F8 Gamification
   F9 Generic Global Search
```

## Observation window evidence to collect

Before selecting F1/F2/etc., record actual pain such as:
- how often Today requires manual class selection;
- how often network interruptions exceed narrow Safe Work coverage;
- how often teacher forgets incomplete corrections/reporting;
- whether school requires a specific export;
- whether Artifact workflow is actually used;
- whether lesson/pacing context is valuable enough to surface more aggressively;
- whether another teacher truly needs account-level collaboration.

The roadmap should react to those observations rather than to feature-count pressure.

---

# Current recommendation

For the present product and owner profile:

1. **Do not implement a new product feature before Production Readiness closes.**
2. Once stable, **F1 Planned Timetable / expectation layer** is the best first feature candidate because it can improve Today without corrupting actual Meeting truth.
3. **F2 Teacher Brief** is the best AI direction, but begin with deterministic bounded context and keep provider narration optional.
4. Treat **full offline and collaboration as architectural programs**, not incremental convenience features.
5. Keep automatic homework, gamification, and global search below evidence-backed teacher workflow improvements.

This ordering maximizes daily value while preserving the strongest asset already built into R3: explicit, recoverable academic truth.
