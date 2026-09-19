# Gate H build contract — telemetry, the tests that hold the line, and the parked rulings (READ IN FULL)

Repo /Users/airm1/Desktop/medsync, branch `feat/booking-app`. Inputs: `docs/booking-app-prd.md` (§3.3.4,
§3.4, §3.5, §3.6, §4.5, §5.4), `docs/booking-app-gate-a-proposal.md` (§10 row H, Part 8 #11),
ADRs 0084–0091, `docs/booking-app-handoff.md` §4 (the parked list), `DESIGN-medsync.md`, `AGENTS.md`.

Gate H is the closeout: measure what was built, prove the clinical boundary by test, and settle the six
rulings earlier gates deliberately parked. Surveyed against the code on 2026-09-19 — every raw table these
reports need already exists (`clinic_sessions`, `appointments`, `queue_entries`, `notification_dispatches`,
`visit_ratings`, `encounters`, `prescriptions`). No migration is required for the reports themselves.

## Rulings assumed (ADR 0093)

- **A metric is operational, never a patient score.** PRD §3.3.4 forbids punitive automation; Gate E kept
  unconfirmed-release off by default for the same reason. No-show data measures a _clinic's_ access
  problem — never a patient's reliability. No surface ranks, flags or colours a patient by attendance, and
  no metric feeds any booking decision. The reports page says so in words.
- **The not-a-medical-device boundary is enforced by test, not policy.** PRD §5.4 states it outright: "an
  invariant test asserts that no booking-flow field feeds any scoring or routing function." That test does
  not exist today — gates D, E and F each shipped their own invariant suite
  (`tests/identity/gate-d-invariants.test.ts`, `tests/notifications/gate-e-invariants.test.ts`,
  `tests/channels/gate-f-invariants.test.ts`) but nothing guards §5.4. It is Gate H's first deliverable
  because it is the claim the whole product's regulatory posture rests on.
- **Budgets need somewhere to run.** There is no `.github/workflows` at all and no analyzer, Lighthouse or
  size tooling in `package.json`. A budget nobody runs is not a budget. Gate H adds CI _or_ an explicit
  local gate — the owner picks — and wires the check into it.
- **Superadmin aggregates stay PHI-free** (§3.5). `app/admin/scheduling-rollup/page.tsx` is the existing
  cross-tenant page and the pattern to follow: counts and rates, never a name, never a code.

## Build

### 1. The invariant tests (blocking — do these first)

1. **PRD §5.4, the booking/clinical firewall.** A source-level test, in the house style of the three existing
   gate suites: no booking-flow input (`reason`, `reason_note`, the USSD `text`, the inbound-SMS body, any
   `waitlist_entries.reason`) may reach `lib/triage`, `lib/clerkship`, `lib/encounter`'s scoring, or any
   ranking/ordering function. Assert the absence of the import edges and of the field names inside those
   modules, and assert that the booking surfaces ask no clinical question (the Appendix A reason list is
   administrative and closed — a new entry that reads clinical fails the test).
2. **Red reserved, and never colour alone** (DESIGN-medsync.md anti-patterns). Assert that patient- and
   booking-surface components use `status-critical` / `destructive` only on genuine emergency paths (the
   emergency notice, the resus surface), and that every status indicator pairs its colour with a text label.
   `/styleguide` is the visual contract to check against when tokens change.
3. Wire both into `npm run test`; they are cheap source-greps, not integration tests.

### 2. Reports (PRD §3.4) — `/hospital-admin/reports`

One page, six honest numbers, each with its basis stated and its blind spots named. All computable today:

| Metric             | Source                                                                        | Note                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Fill rate          | `clinic_sessions.booked_count` ÷ `ceil(capacity_booked × overbooking_factor)` | per line, per day                                                                                                              |
| No-show rate       | `appointments.status = 'no_show'` ÷ live bookings                             | framed as a clinic access signal — see the ruling                                                                              |
| Wait accuracy      | `queue_entries.called_at` vs `appointments.arrival_window_start/end`          | the §3.6 measure; the window was stored at confirmation and never recomputed (ADR 0088 C10)                                    |
| Demand vs capacity | requests (incl. `waitlist_entries`) vs published capacity                     | a waitlist that never drains is the signal                                                                                     |
| Refill load        | `prescriptions` + `appointments.reason = 'refill'`                            | confirm the join at build time                                                                                                 |
| SMS spend          | `notification_dispatches.cost_amount/currency`                                | **already built** — `_components/sent-today-panel.tsx`; generalise it from "today" to a range rather than writing a second one |

4. Build the page from the existing hospital-admin patterns (`requireHospitalAdminScope`, the `DataTable`
   primitives). Every number states its window and its denominator; a metric with too little data says so
   rather than printing a misleading percentage.
5. **§3.6 detector**: a facility that never honours positions. Arrival-to-called against the promised window,
   aggregated per session and per line. This is the one metric that judges the _facility_, and it exists so a
   patient's arrival window means something. Surface it on the same page.
6. **§3.5**: extend the superadmin rollup with the same aggregates cross-tenant, PHI-free.

### 3. Budgets and accessibility (PRD §4.5)

7. Add `@next/bundle-analyzer` behind an env flag and a size check with an explicit ceiling on the patient
   routes (they are the ones on a Ugandan phone on mobile data). Decide with the owner: a
   `.github/workflows/ci.yml` running typecheck + lint + test + the size check on push, or an
   `npm run budget` gate run before each deploy. CI is the better answer and costs nothing on a public repo.
8. Accessibility: nothing exists today. Add an axe pass over the patient and reception surfaces, and fix what
   it finds. The design system's rules (no colour-alone, 44px targets, focus rings) are already written —
   this is about proving them.

### 4. The parked rulings (handoff §4)

Each needs a decision recorded in the ADR, and most need a small build:

9. **Four-eyes on un-reconcile** — today `ha-reconcile-identity` requires hospital_admin + a 20-char reason
   and audits it; there is no four-eyes step (`grep` confirms). The superadmin four-eyes helper exists as a
   pattern. Decide: keep the current bar, or require a second approver.
10. **Cross-tenant un-reconcile** — what happens when two hospitals hold bookings for one provisional row.
11. **Desk booking a stated minor** — the client refuses; the server does not. Close the gap or record why.
12. **Template edits leaving unbooked old instances published** — decide the cascade.
13. **Staff cancel reasons visible to a booking agent** — a privacy call.
14. **Consent re-acceptance on next sign-in** (handoff ~line 79) — patients who accepted a consent whose text
    nobody can now identify. Owner already decided: ask them to re-accept. Build it.

### 5. ADRs owed

15. **FHIR mapping** — `lib/fhir/appointment-r4.ts` exists and is described inside ADR 0089, but the mapping
    has no ADR of its own. Write one; it is the interoperability claim MoH review will ask for.
16. **ADR 0093** — this gate's rulings, plus the closeout: what shipped across A′–H, what is deferred
    (payments, live SMS channels, iOS push), and what the next team must know.
17. Mirror both in `CHANGELOG.md`.

## Verify

- **The firewall holds**: the §5.4 test fails if you add `reason_note` to any triage input, and fails if a
  booking surface gains a clinical question. Prove it by trying both on a scratch branch.
- **No metric is punitive**: no page ranks or colours a patient by attendance; the no-show panel names the
  clinic, not the patient; nothing in the booking path reads a metric.
- **Numbers are honest**: each states its window and denominator; a thin sample says "too few visits to
  report" rather than "0%". Cross-check one fill rate and one wait-accuracy figure by hand against the rows.
- **PHI**: the superadmin aggregates contain no name, code or phone; the reports page respects
  `requireHospitalAdminScope` and a second hospital's admin sees nothing of the first's (the
  `tests/hospital-admin/tenant-isolation.test.ts` pattern).
- **Budgets bite**: the size check fails on a deliberately bloated import, and the failure is visible where
  the team will see it.
- **Gates**: `npm run typecheck && npm run lint && npm run test && npm run build`; both mobile toolchains
  clean; `/styleguide` still matches the tokens.
