# Nilai SMP — UI Product Maturation Track

Status: ACTIVE
Base candidate: `bd6d0b4942a45a00e6b1871c0b72e5c5f46ee063`

## Mission

Mature the already-working R3 daily-driver UI into a finished teacher-facing product without rediscovering the workflow, weakening academic truth, or reopening Core semantics.

This track is presentation/workflow maturation, not a product rewrite.

## Locked product truth

- Existing teacher workflow and canonical domain semantics are authoritative.
- Mobile-first daily use remains primary.
- `Hari ini`, `Mengajar`, `Koreksi cepat`, `Penilaian`, and `Laporan` remain the primary work surfaces unless evidence proves a bounded navigation defect.
- Data/setup, bulk import, documents, and recovery remain secondary tools.
- Safe Work semantics, RLS, Auth, backup/recovery, reporting truth, stable IDs, and explicit academic mutations must not be weakened for visual convenience.
- Future features remain governed by `FUTURE_ROADMAP.md`; this track must not silently implement F1+.

## U0 — Current UI truth / residue audit

### KEEP

- Primary-vs-secondary navigation split.
- Fixed mobile app chrome with independently scrolling workspace.
- Minimum touch target baseline.
- Focus reset when changing workspace mode.
- Narrow daily-driver surfaces rather than a generic ERP dashboard.
- Existing domain-specific components and service boundaries.

### MATURE

- Product identity and visual hierarchy: current shell is intentionally minimal and still reads like an engineering candidate.
- Active navigation state: make current location obvious without relying on dark-vs-gray alone.
- Header density on small screens.
- Secondary-tool disclosure so it is available without competing with daily work.
- Card hierarchy, spacing rhythm, headings, labels, and action emphasis across Today/Teaching/Correction/Assessment/Reporting.
- Loading, empty, success, warning, error, pending-safe, and conflict states into one coherent visual language.
- Forms and dense assessment surfaces for one-hand/mobile scanning where semantically safe.
- Desktop use should gain breathing room without becoming a separate information architecture.

### REPLACE / REMOVE

- Remove release/milestone residue such as user-facing `R3` branding. R3 is engineering history, not product identity.
- Replace developer-facing copy where it leaks implementation concepts that do not help the teacher act.
- Avoid generic gray-card sameness where it obscures action priority.

### FUTURE SEAMS — DO NOT IMPLEMENT HERE

- F1 Planned Timetable may later enrich Today with planned-vs-actual context.
- F2 Teacher Brief may later add bounded advisory context.
- F3 bounded search may later appear inside specific workflows.
- F4 reporting/export refinements remain evidence-driven.

UI maturation may leave clean composition seams for these, but must not create fake schedule/AI/report truth.

## Execution batches

### U1 — Product shell

Remove milestone residue; mature login/header/nav/tool disclosure; establish consistent product-level visual tokens and active/focus states. Preserve the accepted mobile sticky-scroll behavior.

### U2 — Today

Make current action, continuity memory, stale/re-entry state, and pacing legible at a glance. Do not infer meetings or timetable truth.

### U3 — Teaching + Rapid Correction

Optimize class continuity and judgement loops for speed, touch, recovery visibility, and error prevention. Preserve explicit mutations and stable IDs.

### U4 — Assessment + Reporting

Improve dense-data scanning, provisional/finalized distinction, form hierarchy, and action safety without changing calculation/report semantics.

### U5 — Secondary surfaces

Mature setup, bulk import, documents, and recovery as clearly secondary administrative tools. Destructive/recovery actions require stronger hierarchy than ordinary actions.

### U6 — Cross-cutting states + accessibility

Keyboard/focus, reduced-motion-safe transitions if any, contrast, status semantics, touch targets, overflow, empty/loading/error/success consistency, and narrow-screen resilience.

### U7 — Acceptance

Require automated regression plus real mobile and desktop acceptance. No UI batch is complete merely because it builds.

## Guardrails

1. No schema migration solely for visual polish.
2. No weakening tests to accommodate UI changes.
3. No new feature semantics hidden inside UI work.
4. No automatic canonical mutation for convenience.
5. No regression of mobile fixed chrome/workspace scrolling.
6. No horizontal page overflow at supported mobile width.
7. Important actions remain understandable without color alone.
8. User-facing copy should describe teacher intent, not internal milestone names.

## Closure rule

The track closes only when the deployed application reads as a coherent teacher product on real mobile and desktop while preserving the proven R3 contracts. Future-feature implementation starts from the existing `FUTURE_ROADMAP.md`, not from a new brainstorming cycle.
