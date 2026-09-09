# Nilai SMP — Real-Device Mobile Acceptance Findings

Date: 2026-09-09
Baseline main: `ba9d4e192fd3bdabfc314dab817a76a3e4bb877f`
Production origin: `https://nilai-smp.z-izzul13.workers.dev`

## Scope

This evidence records observations from a real Android authenticated session against the deployed Cloudflare production candidate. It does not claim full authenticated write, Storage, adversary, binary recovery, or production cutover proof.

## Observed PASS evidence

- Public Cloudflare origin rendered successfully on a real Android device.
- Supabase recovery redirect reached the production origin and yielded a real authenticated browser session.
- The authenticated application rendered Teacher-A-owned fixture data across Today, Teaching, Rapid Correction, Assessment, and Reporting surfaces.
- Session continuity survived navigation across those surfaces.
- No blank shell or obvious runtime crash was observed during the captured navigation.

## Observed usability defects

1. Primary daily navigation is horizontally scrollable on the tested mobile viewport; later destinations are partially hidden and require horizontal scrolling.
2. Mobile viewport usage is vertically expensive in several screens: header/navigation/context surfaces consume enough height that primary actions may fall below the initial viewport.
3. User-facing copy is inconsistently localized. English labels visible in the production UI include `Today`, `Teaching`, `Rapid Correction`, `Assessment`, `Reporting`, `Data & Setup`, `Bulk Entry / Import`, `Artifacts`, and `Recovery` alongside Indonesian copy.
4. Synthetic fixture names remain visible in the daily-driver workspace. They remain useful as recovery evidence and must not be deleted before the recovery proof chain is closed.
5. Password-recovery redirection can authenticate the user, but the application currently has no dedicated password-update UI. Google SSO is being considered separately and remains HOLD; this finding does not authorize SSO implementation.

## Governance status

- `R3_IMPLEMENTATION = CLOSED`
- `P5_PUBLIC_SHELL_DEPLOYED_SMOKE = PASS`
- `P5_AUTHENTICATED_DAILY_DRIVER = PARTIAL_PASS` (read/navigation evidence only)
- `P2_REAL_AUTH_RLS_STORAGE = NOT_YET_PASS`
- `P3_REAL_RECOVERY = NOT_YET_PASS`
- `PRODUCTION_CUTOVER = FALSE`

## Repair constraints

Any mobile/usability repair must be bounded and schema-neutral:

- no academic semantics changes;
- no RLS/schema changes;
- no Safe Work durability weakening;
- no production-cutover claim;
- preserve mobile access to every current primary daily-driver destination;
- prefer Indonesian user-facing labels;
- reduce avoidable mobile navigation/viewport friction without turning this into a redesign.
