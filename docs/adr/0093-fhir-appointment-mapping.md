# ADR 0093 — FHIR R4 Appointment mapping: at the boundary, versioned, exposed to nobody yet

**Status:** Accepted — records what shipped at Gate D (2026-09-13), written at Gate H (2026-09-19)

**Builds on** [ADR 0089](0089-gate-d-identity-and-lifecycle.md) (which shipped the module inside a larger
record), [ADR 0090](0090-gate-e-notifications-waitlist-cancellation.md) (the waitlist the mapping derives
from). Inputs: `docs/booking-app-prd.md` §4.3, §4.7, §5.4; `docs/booking-app-gate-a-proposal.md` §6;
`docs/booking-app-build/GATE-H-BUILD.md` §5 item 15.

## Context

The PRD's interoperability claim is one sentence: "MedSync stores its own statuses and maps at the API
boundary. It does not store literal FHIR." Uganda's MoH Health Information Exchange and Interoperability
Guidelines, and the DHSAC assessment that will precede any deployment, ask for exactly this artefact — the
mapping, its version, and what is _not_ mapped. ADR 0089 described the module in two lines among fourteen
other decisions. MoH review will not find it there. This record is the mapping's own.

## Decision

### The module

`lib/fhir/appointment-r4.ts` — pure TypeScript, **zero imports**, in the shape of `_shared/slots.ts` so
Next, Deno and React Native can import one copy. `FHIR_PROFILE = "r4"` names the target;
`meta.profile` on every resource carries `https://medsync.health/fhir/r4/Appointment`. An R5 or R6 map is a
second file beside this one selected by configuration — never a rewrite, never a column.

### R4 is the target, not R5

FHIR R5 is current and R6 is in ballot; Uganda's deployed systems (DHIS2's FHIR adapters, the HIE
reference implementations named in the MoH guidelines) speak R4. R4 maximises the chance that the first
consumer needs no translation. The profile is versioned precisely so this can change without touching data.

### The status map — the actual CHECK, exhaustively

`appointments_status_check` (migration 0060) is the stored vocabulary; the map covers every value and a
`never` in the `default` arm makes a widened CHECK fail at compile time and at runtime, loudly, at the
boundary. `tests/fhir/appointment-r4.test.ts` also asserts the schema's `APPOINTMENT_STATUSES` and the
mapper's cases are the same set, so the test run fails before the compiler is asked.

| MedSync                                  | FHIR `AppointmentStatus` | Note                                                                          |
| ---------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `requested`, `pending_approval`          | `pending`                | ADR 0089 C15: `pending_approval` is canonical; `requested` stays in the CHECK |
| `confirmed`                              | `booked`                 |                                                                               |
| `arrived`                                | `arrived`                | or **`checked-in`, derived** — see below                                      |
| `in_progress`, `completed`               | `fulfilled`              |                                                                               |
| `cancelled`, `declined`, `rescheduled`   | `cancelled`              | `rescheduled` is the OLD row; the new row's `replaces` points back at it      |
| `no_show`                                | `noshow`                 |                                                                               |
| `void`                                   | `entered-in-error`       | in the CHECK since 0060; no writer yet                                        |
| a live `waitlist_entries` row (no appt.) | `waitlist`               | **derived**, never stored                                                     |

Two values are **derived, never stored**, and that is the point of mapping at the boundary:

- **`checked-in`** = `arrived` **and** a `patient_intakes` row exists for the appointment **and**, when the
  booking was provisional, the desk reconciled it (`confirmed` or `created`, ADR 0089). It is not
  `checked_in_at`, which only the declared open-queue path sets. An unreconciled provisional who has walked
  in is `arrived`: FHIR's "checked-in" means the facility knows who this is, and MedSync will not claim that
  until a human has said so (PRD §2.8).
- **`waitlist`** = a `waitlist_entries` row in `waiting` or `offered` (ADR 0090). An `accepted` entry has a
  real appointment row of its own; `expired` and `withdrawn` are not a wish for a place. Gate H narrowed the
  mapper's input type to the two live states — the Gate D stub accepted any string because the table did
  not yet exist.

### The resource — minimal, and what is deliberately absent

`toFhirAppointment(row, ctx)` emits `resourceType`, `id`, `meta.profile`, `status`, `start`, `end`,
`participant[]` and, when known, `serviceType` (the service line, coded under
`https://medsync.health/fhir/CodeSystem/service-line`) and `replaces`.

- **Participants**: `Patient/{user}` (`accepted`), or for a provisional booking
  `Patient/provisional/{id}` with status **`needs-action`** — there is no Patient resource until the desk
  reconciles (PRD §2.8: "explicitly confirms or creates. Never automatic. Never silent."); then
  `PractitionerRole/{clinician}` and `Location/{hospital}`, both `accepted`.
- **`reasonCode` is not emitted, and a test pins that.** FHIR's `reasonCode` is a clinical concept
  (SNOMED-coded). MedSync's booking reason is Appendix A's closed, administrative list of thirteen, and PRD
  §5.4's not-a-medical-device boundary (`tests/booking/clinical-firewall.test.ts`) rests on the booking
  reason never being read as clinical by anything. Emitting it under a clinical element would say the
  opposite to the first system that consumed it.
- **No `comment`, no `description`, no `patientInstruction`**: the reason note and the arrival-window copy
  are patient-facing text under PHI rules, not interoperability fields.
- **Not built, by decision**: the `Schedule`/`Slot`, `HealthcareService`, `Location`/`Organization` and
  `PractitionerRole` skeletons the Gate A proposal (§6) sketched. The proposal also named the export
  `FHIR_APPOINTMENT_MAP_VERSION = 'r4.1'`; what shipped is `FHIR_PROFILE = "r4"`. Capacity is the shared
  slot engine's and the position allocator's, and mapping it to `Slot` before a consumer exists would
  freeze an interface nobody has asked for. Each is a pure function over a table already present
  (`availability_blocks` + `buildSlots`, `service_lines`, `hospitals`, `staff_affiliations`) and belongs
  beside this file when a consumer names it.

### No route, no storage

Nothing FHIR is stored — no column, no JSON blob, no cache. No route serves the resource. The mapping is
called by nothing in production today; it exists so that the first consumer (a facility's HMIS, an HIE
node, a DHIS2 adapter) is a route and an auth decision away, not a modelling exercise. The DHIS2 aggregate
seam (attendance counts by service, never patient-level) is likewise **not built** and left clean; Gate
H's reports module (`lib/hospital-admin/reports.ts`) is the first place those aggregates exist and is the
natural source for it.

### Uganda alignment, stated plainly

The mapping conforms to the MoH HIE and Interoperability Guidelines' direction (FHIR at the exchange
boundary, national vocabularies where they exist). It does **not** yet carry a Ugandan facility identifier
(the MFL code) on `Location`, because `hospitals` has no such column; nor the council registration number
that `clinician_profiles.registration_number` already holds on `PractitionerRole`, because no consumer has
asked and a registration number leaving the building is its own decision. Both are additive `identifier[]`
entries. The `Health Information and Digital Health Strategic Plan 2020/21–2024/25` is past its period; the
claim should be re-read against its successor before DHSAC submission.

## Consequences

- A CHECK widening on `appointments.status` fails `npm run test` until the map is extended. That is the
  guarantee MoH review can be shown.
- `checked-in` and `waitlist` can never drift from the truth, because they are computed from the rows that
  are the truth.
- The first consumer gets an `Appointment` in one call; anything more (Slot, PractitionerRole) is a small
  pure function to add, and this ADR is the place to record which profile it targets.
- The mapping cannot be demonstrated end-to-end until a route exists. When one does, it needs its own ADR:
  which role may call it, which tenant scope, and whether `Patient/provisional/…` references are permitted
  to leave the building at all.

## Alternatives considered

- **Store FHIR natively.** Rejected in the platform's first interoperability decision and reaffirmed here:
  MedSync's statuses carry facts (`pending_approval`, `rescheduled`, a provisional participant) that FHIR's
  value set flattens; storing the flattened form would lose them.
- **Target R5.** Rejected for the consumer landscape; kept one configuration change away.
- **Map `reason` to `reasonCode` with a MedSync code system.** Rejected; see above — the firewall matters
  more than a fuller resource.
- **Build the Slot/Schedule skeletons now.** Rejected as speculative; recorded so nobody thinks it was
  forgotten.
