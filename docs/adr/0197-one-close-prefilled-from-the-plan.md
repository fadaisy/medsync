# ADR 0197 — One close, prefilled from the Plan

**Status:** Proposed — 2026-10-03. Supersedes, for hospitals with `ENCOUNTER_CLOSE_V2` on, the second entry of the
disposition in ADR 0139's completion sheet. ADR 0139's one completion path (`ha-complete-encounter`) stands.

## Context

Step 10 Plan records a disposition (`admit | observe_eu | refer | discharge`, with a ward name or a destination).
"Complete visit" then asks for it again in the completion vocabulary and never sends `disposition_detail`, so the
referral printout reads an empty reason, urgency and transport. Nothing links the two answers.

## Decision

1. **The close dialog starts from the Plan.** `discharge → home`, `admit → admitted` (with the ward), `refer →
referred_out` (with the destination). The other outcomes (died, left before completion, left against advice,
   transferred) have no Plan answer and are chosen in the dialog.
2. **`observe_eu` is not a closure.** The visit stays open; the dialog says so and links back to the Plan.
3. **A change is recorded.** When the dialog's outcome differs from the Plan's, `disposition_detail.plan_said`
   keeps the Plan's answer and the visit's disposition event reads "Plan said X; closed as Y". The note is not
   rewritten: it is usually signed before the close, and a signed note never changes.
4. **Referral detail is written.** Destination, reason, urgency and transport go into `disposition_detail`
   (`destination`, `reason`, `urgency`, `transport`), the keys the referral printout already reads.
5. **The Plan's ward becomes an id.** `disposition.wardId` (uuid) joins `disposition.ward` (the name, kept for the
   words and for drafts saved before). The ward list carries ids and, with `WARD_BUILDER` on, each ward's free,
   arriving and occupied counts as words.
6. **Behind `ENCOUNTER_CLOSE_V2`** (per hospital, needs `EMR_V1`). Off, the old sheet is unchanged.

## Consequences

- One answer, given once; the printout and the record agree.
- The Plan's prefill needs `CLERKING_PLAN_V2`; without it the dialog starts empty ("No plan yet: choose below").

## Alternatives considered

- **Write the disposition when the Plan is marked done.** A plan is not a closure: the patient may still be
  observed, and the Plan reopens on any change.
