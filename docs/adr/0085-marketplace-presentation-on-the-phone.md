# ADR 0085 — Photos, ratings, clock times and slot counts return; the emergency contact becomes a tab

**Status:** Accepted — product-owner decision (2026-09-12)

**Partially supersedes [ADR 0084](0084-book-or-queue-two-doors-relabelled.md)**, section by section:

| ADR 0084                                                     | Becomes                                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| §3 emergency block first on the home screen, above the doors | **Superseded.** The emergency contact is a red tab in the navigation bar; its screen carries the same block, unchanged           |
| §3 no self-rating question                                   | **Superseded in wording only.** The home asks "How are you feeling today?" as its heading; it is not a triage input              |
| §6 no counts the system cannot stand behind                  | **Narrowed.** Counts of open slots the engine derived may be shown ("8 slots"); queue position and wait estimates stay absent    |
| §9 the app assigns a clinician; the patient does not pick    | **Superseded.** The patient picks a doctor from a list, or is offered the soonest by default                                     |
| §10 no clock numerals on patient surfaces                    | **Superseded.** Times are shown as `9:30 AM` in the hospital's zone, always beside the day; sessions remain as the walk-in words |
| §12 no photos, ratings or review counts                      | **Superseded, with a condition:** every rating shown is a real rating a real patient gave after a real attended visit            |
| §2 two unequal doors, verbatim labels                        | **Stands**                                                                                                                       |
| §8 14-day patient horizon in `pt-request-appointment` only   | **Stands**                                                                                                                       |
| §14 walk-ins open by default                                 | **Stands**                                                                                                                       |

**Migrations:** one additive (`0056`): `users.avatar_path`, the `avatars` bucket and its policies, `visit_ratings` and its summary view, and the `rate_visit` audit verb.

## Context

The patient app was rebuilt on ADR 0084's rules and then shown to the product owner beside a reference design (a
conventional doctor-booking app: doctor photos with star ratings and review counts, a "Select Time" grid of clock
times with a slot count, and "How are you feeling today?" as the home heading). The assistant excluded those four
things and said so, naming the sections. The owner's answer was that they want all four present, that doctors and
patients must be able to add a photograph — including on the registration forms — and that the emergency contact
should move to a red icon in the navigation bar.

That is the decision recorded here. It is the owner's call and this record does not re-argue it. What it does is
state the conditions under which each thing can be shown without the product lying, because "no fabricated data"
(`AGENTS.md`, clinical safety) is not an ADR 0084 rule and is not superseded.

## Decision

### 1. Photographs

- `public.users.avatar_path` — the storage key of the person's photograph, or null. One column for staff and
  patients alike; `users` is the one table both have a row in.
- Bucket `avatars`, **private**, 2 MB cap, JPEG/PNG/WebP. Key shape `<userId>/<uuid>.<ext>` like every other
  bucket here (0016). Policies: the owner writes their own folder; every authenticated user may read (a clinician's
  face is shown to the patients who may book them; a patient's face is shown to the patient and to the staff who
  see their record — names already are).
- Reads are **signed URLs**, never public URLs: `pt-bookable-clinicians` signs the clinicians' photos server-side
  for an hour; the phone signs its own. A guessable public path to a patient's face is not acceptable in a
  clinical product.
- Capture: the patient and clinical registration forms take an optional photograph and upload it server-side after
  the account exists (the same service-client upload the hospital form uses for its documents); the web patient
  profile and the doctor workspace get a "Change photo" control; the phone's Settings gets one. Client-side
  downscale to 512 px before upload.
- **No photo → a monogram.** Never a placeholder face, never a stock image.

### 2. Ratings and review counts

- `public.visit_ratings` — one row per attended appointment: `stars` 1–5, optional comment ≤ 500 characters,
  written only by `pt-rate-visit`, which refuses unless the caller is the appointment's patient, the appointment
  ended in the past, and its status is `arrived`, `in_progress` or `completed` (the patient was there). One rating
  per appointment; re-rating replaces.
- `clinician_rating_summary` (view): average and count per clinician. Shown as `★ 4.8 · 12 reviews`.
- **No ratings → "No ratings yet."** Never a number the table does not contain. The reference's `4.9 · 190
Reviews` is what this looks like after 190 patients have rated; it is not what a new deployment shows.
- Ratings are a patient signal, not a clinical one: nothing in triage, assignment or scheduling reads them.

### 3. Clock times and slot counts

- `pt-bookable-clinicians` returns every open slot per day (`slotsByDate`) rather than one instant per session.
  The phone shows a "Select time" grid of the day's slots as `9:30 AM` (hospital zone, 12-hour, AM/PM) and the
  count of slots in that grid. The count is derived from the engine's list at the moment of the read and says so
  implicitly by being the length of what is shown.
- `formatWhen` becomes "Mon 14 Nov · 9:30 AM". The day always accompanies the time.
- The walk-in door keeps "Morning session / Afternoon session": a queue has no clock.
- **Accepted risk, recorded:** ADR 0084 §10 documented the Luganda/Swahili dawn-anchored clock (_ssawa bbiri_ =
  8:00 am). Numerals reintroduce that ambiguity; the AM/PM word does not fully remove it. The mitigation kept is
  the day label beside every time and the reminder SMS naming the same instant.

### 4. The home heading and the doctors list

- Home heading: "How are you feeling today?" It is a heading, not an input, and no branch reads it.
- Home shows a "Doctors" section (department filter chips, rows with photo/monogram, name, department, rating
  or "No ratings yet") leading to a doctor page; "View all" leads to the full list, which is what the
  "Ask for a day" door opens.
- The doctor page is the reference's second screen: photo, rating, name, department, select a day, select a
  time (with the count), the reason, an optional note, and the docked "Book an appointment" — the same
  `pt-request-appointment` call as before with the chosen slot.

### 5. The emergency tab

- A fourth tab, "Emergency", drawn in `status.critical` red — the one place in the app red is permitted, because
  this IS the emergency affordance. Its screen is the emergency block of 0084 §3, byte-identical, with the Call
  control. The block leaves the home screen.
- The tab exists whether or not the hospital's `emergency_phone` is set; without it, the screen shows the
  destination and no number, as before. Still no invented number.

## Consequences

- Two honest empty states become common on day one: monograms instead of photos, "No ratings yet" instead of
  stars. That is correct; the reference's fullness is earned over time, not printed.
- The web patient booking (`app/patient/book`) still follows 0084's presentation. Bringing it to parity with
  this record is a follow-up, not part of this change.
- CSO review items carried forward from 0084 (symptom list wording) are unchanged by this record.
