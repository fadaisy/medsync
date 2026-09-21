# ADR 0095 — Symptoms at booking as words only, the clinic's patient card, and coloured and custom availability blocks

**Status:** Accepted — product-owner decision (2026-09-21); **PROVISIONAL** pending CSO review of the regulatory
posture (PRD §5.4) — the amended boundary in ruling 1 narrows a claim the CSO signed, and the CSO has not yet
re-read it.

**Builds on** [ADR 0084](0084-book-or-queue-two-doors-relabelled.md) §3 and §12, [ADR 0088](0088-gate-c-booking-flow.md),
[ADR 0093](0093-fhir-appointment-mapping.md), [ADR 0094](0094-gate-h-rulings-and-closeout.md) (the firewall test),
[ADR 0032](0032-reception-non-clinical-boundary.md) and [ADR 0038](0038-triage-worklist-name-reveal.md) (the reveal
model this extends). **Supersedes in part:** PRD §2.1 (the "symptom checklists, severity scales, duration questions"
row), §2.3 bullet 2, §5.4 bullet 1 and §7.2 rule 1 — the "no symptom input" half of each; every other word of them
stands. ADR 0088's "no clinical question anywhere in a booking path" is narrowed the same way: no clinical
_question_ — a symptom list is an optional statement, not a question that branches. ADR 0038's last line ("we do
**not** generalise this to other lists") is superseded for the three surfaces in ruling 3.

## Context

Three things the owner asked for on 2026-09-21, after the UI pass, all on the same day and all touching the
scheduling surfaces:

1. **The clinic knows nothing about why the patient is coming.** A booking carries Appendix A's administrative
   reason and an optional free-text note. The desk, the doctor's schedule and the clinician list show a patient
   code, a reason word and, at most, the note. The owner wants the patient to be able to say what is bothering them
   — the way they would to the receptionist — and the clinic to read it. PRD §5.4 and §7.2 rule 1 forbade that
   outright; the owner ruled to amend them, narrowly.
2. **The doctor's schedule showed codes and monograms of codes.** The clinician list joined `users.full_name`
   unaudited (a patient's `full_name` is signup metadata, not the encrypted `first_name`/`surname` the PHI model
   guards); the doctor's calendar showed nothing but the code. A clinician who has agreed to see a patient at
   10:30 could not see who was coming.
3. **The availability calendar coloured every block the same, and one kind red.** `unavailable` blocks wore the
   `critical` tone in the clinician list; the six kinds were told apart by a word alone; a doctor with a
   commitment that is none of the six (a clinic meeting, a lecture they attend rather than give) had to lie and
   call it `admin`.

The shared vocabulary for (1) — `supabase/functions/_shared/symptoms.ts` — the identity card for (2) —
`components/medsync/patient-identity.tsx` — and migration `0065` for (1) and (3) were written before this record;
this ADR records why they have the shape they have.

## Decision

### Rulings

1. **Symptoms at booking, descriptive only** (owner). A booking may carry the symptoms the patient chose to state,
   each with a duration, purely as words for the clinic. Optional for the patient; a patient who states nothing
   books exactly as before. This supersedes PRD §5.4 bullet 1 and §7.2 rule 1 **in part** — the part that said
   "no symptom input". Everything that made the old rule the regulatory posture **stays and is tested**
   (`tests/booking/clinical-firewall.test.ts`, rewritten for the amended rule):
   - no severity, no urgency, no "how bad", no scale — the selector asks nothing that would let the patient rate
     themselves (the evidence in ADR 0084 §3 against self-rating is unchanged);
   - no scoring, no routing, no ordering and no colour derived from the list — never a sort key, a filter, a
     badge or a tint on any surface, patient or staff;
   - the **engine-import ban**: no booking path imports `lib/triage`, `lib/clerkship` or `lib/encounter`;
   - the **field-isolation ban**: nothing under `lib/triage`, `lib/clerkship` or `lib/encounter` reads
     `appointments.symptoms` — the words reach a clinician's eyes, never an engine's input;
   - Appendix A's thirteen reasons are unchanged and stay administrative; `reasonCode` is still never emitted to
     FHIR (ADR 0093);
   - the emergency interstitial (ADR 0088) and the emergency block (ADR 0084 §3) are unchanged and still precede
     any capacity step;
   - the catalogue's decision-support flags (`must_not_miss`, `is_pain`, `uganda_flag`, `ros_screen`) are never
     selected onto a booking surface — the booking reads `code, display, synonyms, system, sort_order` and nothing
     else;
   - the patient sees `SYMPTOMS_NOTE` verbatim under every selector: _"This is passed to the clinic as you wrote
     it. It does not change your place in line or your time."_ The sentence is the boundary stated in the
     patient's own terms, and the firewall test asserts it is present wherever the selector is.

   Why this is still not a medical device: the software takes the words and carries them. It produces no output a
   reasonable person would act on as a judgement about their clinical state (PRD §2.1's own test) — the readers
   are the clinician and the desk that took the words, who read them the way they would read a note the patient
   handed over. The narrowing is real, though, and is what the PROVISIONAL status is for.

2. **The shape** (build decision). `appointments.symptoms` is a **jsonb list** on the booking, `NULL` when the
   patient said nothing; each element `{code, label, duration}`; at most **8** entries (`MAX_SYMPTOMS`), a label of
   at most **80** characters (`MAX_SYMPTOM_LABEL`), and one of **five** duration codes (`today`, `days`, `week`,
   `weeks`, `month_plus` — shown as "Started today" … "A month or more"). The zod is the same in every writer and
   `_shared/book.ts` is the one place that writes the column. The catalogue is the **89 shared, CSO-signed
   `symptom_catalog` rows** (`scope = 'shared' AND active`), rendered **flat** — grouped by body system under lay
   names (`SYMPTOM_SYSTEMS`: "Breathing", "Stomach and bowels", …), ordered by the catalogue's own `sort_order` and
   nothing else. A typed-in symptom is stored with `code = null` and **never becomes a catalogue row** — the
   catalogue is governed (ADR 0061: proposal, CSO approval), a booking is not. The audit row for the booking records a
   **count** of symptoms, not the words. A chosen symptom without a duration blocks Continue ("Choose a duration
   for each one.") — no default duration, because a default is a guess written in the patient's name.

3. **The clinic sees who is coming** (owner). A clinician sees the **name, photo, age, sex and complaint** of a
   patient booked with them, or on their department's pending or queue list, on the doctor's schedule (calendar
   cards, the pending and queue rails, the detail sheet), the clinician list and reception's expected board. The
   booking is the care relationship. The reveal is **audited per patient per fetch** — one `clinical_phi_access_log`
   row, `access_basis = 'department_recent'`, `surface = '<surface>#operational'`, mirroring
   `lib/reception/queries.ts` — and **fails closed**: if the audit insert fails, `displayName` and `photoUrl` are
   null and the card titles itself with the code. A photograph identifies a person as surely as a name, so it sits
   behind the same row. Age is computed from the date of birth; sex is the raw enum labelled at render; the
   complaint is `complaintLine(symptoms, reason_note)` — the symptoms as words, then the note in quotes. Hospital
   admin **stays code-only** (ADR 0032; `lib/hospital-admin/pending.ts`): it is non-clinical, and nothing in
   `lib/hospital-admin` imports the reveal. This generalises ADR 0038's list-level reveal from "the triage
   worklist" to "a booking with this clinician or department is the care relationship", and replaces the
   unaudited `users.full_name` join `app/clinician/schedule` had with the audited decrypt of `first_name` and
   `surname`.

4. **One colour per block kind, and a custom kind** (owner). Each availability kind has one card tint, one `Pill`
   tone and one word, and every surface reads them from **one exported map** in
   `components/scheduling/calendar/helpers.ts` (`AVAILABILITY_KIND_LABEL`, `AVAILABILITY_KIND_TONES`,
   `AVAILABILITY_CARD_CLASSES`); the duplicate maps in the clinician list and the doctor's sheet are gone. A legend
   under the doctor's calendar names the kinds present in the window.

   | Kind          | Card tint (light / dark)                                                | Pill tone      | Word                                 |
   | ------------- | ----------------------------------------------------------------------- | -------------- | ------------------------------------ |
   | `bookable`    | `bg-brand-50 border-brand-200` / `bg-brand-950/30 border-brand-900`     | `admitted`     | Bookable                             |
   | `teaching`    | `bg-blue-50 border-blue-200` / `bg-blue-950/30 border-blue-900`         | `info` (new)   | Teaching                             |
   | `ward_round`  | `bg-status-discharged-bg border-violet-200` / `border-violet-900`       | `discharged`   | Ward round                           |
   | `admin`       | `bg-gray-100 border-gray-300` / `bg-gray-800/60 border-gray-700`        | `neutral`      | Admin                                |
   | `leave`       | `bg-status-caution-bg border-amber-300` / `border-amber-800`            | `caution`      | Leave                                |
   | `unavailable` | `bg-orange-50 border-orange-300` / `bg-orange-950/30 border-orange-800` | `notice` (new) | Unavailable                          |
   | `custom`      | `bg-status-stable-bg border-green-300` / `border-green-800`             | `stable`       | the block's own label; pill "Custom" |

   **Never red** for any kind — an unavailable doctor is not an emergency (DESIGN-medsync.md; the `critical` tone
   the clinician list used is the fix below). Two `Pill` tones are new: `info` and `notice`. A **custom** block
   carries a `label` (≤ 40 characters, required when `kind = custom`) and is **inert to the slot engine** (build
   decision): neither `BOOKABLE_KINDS` nor `BLOCKING_KINDS` in `_shared/slots.ts` list it, exactly like `teaching`,
   `ward_round` and `admin` — it is the clinician's own commitment drawn on their calendar. A doctor who needs to
   stop bookings uses `unavailable` or `leave`, which exist for that.

### The schema (migration 0065, GATED)

`appointments.symptoms jsonb` with a CHECK that the container is a list (the element shape is every writer's job,
and every writer goes through `_shared/book.ts`); `availability_blocks.kind` CHECK re-issued with `custom`;
`availability_blocks.label text` with a length CHECK (1–40) and `custom_has_label`. No new audit action
(`book_appointment` / `book_on_behalf` / `set_clinician_availability` cover the writes); no RLS change (both columns
ride their tables' policies — a patient reads their own symptoms back through `appointments_select_scoped`;
`availability_blocks` has no client write policy). Dry-run BEGIN/ROLLBACK: clean. Sequencing: **0065 before the
redeployed functions** (`pt-request-appointment`, `ha-book-on-behalf`, `reschedule-appointment`,
`pt-accept-rebooking`, `ha-set-clinician-availability` write the new columns) **and before the Next app** (it
selects them).

### Surfaces

- **The selector**, on the web wizard, the reception desk and the phone, under one title — "What is bothering
  you?" — and one lede: "Optional. Choose anything that fits, or type your own." A search box over display and
  synonyms; the catalogue as toggle chips grouped by lay system name; the chosen ones listed above it, each with its
  own five-chip duration row; "Something else" with an Add control for a typed entry; remove on each; the
  `SYMPTOMS_NOTE` sentence beneath. The copy avoids the assessment vocabulary the firewall bans and never phrases a
  duration as a question — the chips carry it. "How are you feeling today?" stays banned
  (`docs/booking-app-build/REFERENCE-LANGUAGE.md`): it invites a self-rating; "What is bothering you?" asks for a
  statement.
- **The patient card** (`PatientIdentityCard`, `PatientAvatar`): row density on the rails, the clinician list and
  the expected board; card density on the calendar's detail. The photo when there is one, else a monogram — of the
  name, or of the code's last four characters, never a stock face (ADR 0085).
- **The doctor's schedule**: coloured blocks by the table above, the custom kind in the availability sheet with its
  label field, and the legend beneath the calendar.

## Consequences

- **The regulatory claim is narrower and must be re-examined.** PRD §5.4 said "no question about symptoms,
  severity, duration". It now says: symptoms and duration may be _stated_, never assessed. The CSO signed the old
  sentence; the new one is provisional until they sign it. Every mechanism that made the old claim true by
  construction is still a failing test away from anyone who breaks it.
- **PHI audit volume grows.** One `clinical_phi_access_log` row per patient per fetch on three surfaces (the
  doctor's schedule, the clinician list, the expected board), where before only the expected board and the triage
  worklist wrote at list level. ADR 0038 accepted this for one small list; a doctor's week is larger. The upgrade
  path if it matters is the one ADR 0038 named — reveal on expand — and nothing here precludes it.
- **A booking now carries words a clinician will read** before any triage. The firewall keeps them out of the
  engines; it cannot keep them out of a clinician's head, and it should not — that is the point.
- **What the next team must know:** `_shared/symptoms.ts` is the fourth zero-import module shared by Deno, Next and
  Expo (`@/supabase/functions/_shared/symptoms`, `../_shared/symptoms.ts`, `@shared/symptoms`) — keep it
  import-free. One writer for `appointments.symptoms` (`_shared/book.ts`). Deploy order: **migrate 0065 →
  functions → web**. The reveal helper is `lib/scheduling/patient-identity.ts`; `lib/hospital-admin` must never
  import it.

## Alternatives considered

- **A feature flag on the symptom selector.** Rejected by the owner: build it on. A flag would have let the
  regulatory question be deferred without being answered; the PROVISIONAL status answers it honestly instead.
- **A child table (`appointment_symptoms`) for symptoms.** Rejected: one row per booking is the unit — the
  symptoms are written at booking by the core (and copied unchanged by `reschedule-appointment` and
  `pt-accept-rebooking` from a row the core validated), and read as one line. A jsonb column rides the
  appointment's existing RLS and needs no new policy, no new audit target and no join on every staff surface.
- **Storing symptoms in `reason_note`.** Rejected: the note is prose, and anything folded into it would have to be
  parsed back out later. A list with codes and durations is a list.
- **Naming without audit** (the `users.full_name` join the clinician list already had). Rejected: a name is PHI, a
  photo is identifying, and the platform's model since ADR 0028 is an audited reveal or none. The join was a leak,
  and it is gone.
- **A custom kind that blocks bookings.** Rejected: `teaching`, `ward_round` and `admin` set the precedent that a
  named commitment is informational, and an explicit `unavailable` already exists for stopping bookings. A block
  that sometimes blocks would have to be explained every time it is drawn.
