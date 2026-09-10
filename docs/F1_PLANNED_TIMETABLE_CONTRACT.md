# F1 — Planned Timetable Semantic Contract

Status: IMPLEMENTATION CONTRACT

Base: exact-main `050008544b376010ece0ba6260350dda4d27415e`

## Product purpose

F1 removes repeated class-selection friction in the teacher's daily workflow. It is an expectation layer over the existing canonical academic graph; it is not teaching history.

## Non-negotiable truth law

```text
PLANNED SLOT != ACTUAL MEETING
```

A planned slot says that a class is expected at a local weekday/time. A Meeting says teaching actually occurred or was explicitly started. F1 must never manufacture the latter from the former.

Therefore F1 MUST NOT:
- create a Meeting when a slot begins;
- create a cancelled Meeting when a slot is skipped;
- infer attendance, checkpoint, lesson progress, Result, Attempt, or report truth from a slot;
- require a scheduler/background worker;
- silently choose a different class when the teacher explicitly chooses one.

## Canonical entity

`planned_schedules`

Required fields:
- `id uuid`
- `workspace_id uuid`
- `class_id uuid`
- `weekday smallint` using ISO weekday `1=Monday ... 7=Sunday`
- `local_start_time time`
- `local_end_time time`
- `effective_from date`
- `effective_until date null`
- `status text` constrained to `active|archived`
- `revision bigint`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints:
- `local_start_time < local_end_time`;
- if present, `effective_until >= effective_from`;
- ownership is workspace-rooted and class must belong to the same workspace;
- exact duplicate active slots for the same class/day/time/effective range are forbidden;
- overlapping slots are not automatically rewritten or merged. If overlap handling becomes necessary, it must remain explicit and deterministic.

No room, week-pattern, holiday engine, recurrence DSL, calendar-server semantics, or exception algebra in F1.

## Time semantics

Planned time is intentionally local wall-clock school time. F1 does not reinterpret a planned slot as an instant in UTC.

The Today derivation receives an explicit local date/time boundary from the client/runtime. Tests must freeze that input; they must not depend on CI machine timezone.

## Read model

The bounded read model may expose:

```text
PlannedSlotContext
  schedule_id
  class_id
  class_name
  weekday
  local_start_time
  local_end_time
  effective_from
  effective_until?
```

Today may deterministically derive:
- `likely-now` — local time is inside one active effective slot;
- `next-planned` — nearest later effective slot;
- `none` — no applicable planned slot.

If multiple rows are equally eligible, derivation must be stable and must surface ambiguity rather than invent teaching truth.

## Today precedence

Existing actual/in-progress truth remains stronger than schedule convenience.

Precedence:

```text
active Meeting
> active correction
> existing continuity/re-entry attention that requires explicit teacher handling
> likely planned class
> next planned class
> existing manual/default class flow
```

A planned suggestion may preselect or recommend a class, but the visible action remains explicit:

```text
Likely 8D · 09:30–10:10
[ Start Class ]
```

Only pressing `Start Class` invokes existing Meeting creation semantics.

Manual class selection always wins.

## Setup/UI boundary

F1 setup is a small teacher-owned timetable editor, not a calendar product. Minimum operations:
- list slots grouped by weekday;
- add slot;
- edit slot;
- archive slot;
- select canonical Class;
- set weekday/start/end/effective dates.

The UI must use class display names, but mutations use canonical class IDs.

## Security / RLS

All reads/writes are owner-scoped through the personal workspace. A user must not read or mutate another workspace's schedules. Cross-workspace class references are rejected even if an ID is known.

## Recovery / portability

`planned_schedules` becomes canonical user data. F1 is incomplete until portable backup/restore includes it and recovery validation rejects cross-workspace or malformed rows.

## Rollback law

Schema addition must be backward-compatible with the previous frontend: old frontend ignores `planned_schedules`. Deploying F1 schema therefore must not require old frontend code to understand the table. Rolling the frontend back does not delete timetable rows.

## Acceptance gates

F1 closes only when all are proven:
1. schema constraints and RLS owner/adversary tests PASS;
2. deterministic Today derivation tests PASS, including no-slot, likely-now, next-slot, expired, archived, overlap/ambiguity, and timezone-independent fixtures;
3. explicit Start Class is the only path from suggestion to Meeting creation;
4. setup CRUD works on mobile and desktop;
5. backup/restore contract includes planned schedules;
6. existing exact-head typecheck/unit/PostgreSQL/build/Chromium/E2E suite remains green;
7. deployed real-device smoke confirms Today suggestion and manual override without fabricated Meeting.

## Explicitly deferred

- automatic Meeting materialization;
- inferred cancellation/absence;
- timetable notifications;
- holiday calendars;
- alternating-week schedules;
- rooms/teacher collaboration;
- external calendar sync;
- AI schedule authoring.
