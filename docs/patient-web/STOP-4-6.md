# STOP 4, 5 and 6: Visits and booking, Care, Me (25 Oct 2026)

All behind `PATIENT_WEB_TIDE=1`. `PW_ROUTES` now covers `/patient/{care,visits,book,me}` and their pages
(tested in `tests/patient-web/guards.test.ts`, "PW_ROUTES").

| Step     | Pages                                                                       | Scenarios (Vitest)          |
| -------- | --------------------------------------------------------------------------- | --------------------------- |
| 4 Visits | `/patient/visits`, `/patient/visits/[id]` (ticket turns over; Move, Cancel) | S13, S14 — `visits.test.ts` |
| 4 Book   | `/patient/book`, `/book/wrong` (forced light), `/book/today`, `/book/day`   | S9–S12 — `book.test.ts`     |
| 5 Care   | hub, medicines, trends, labs, move and eat, messages                        | S15–S17 — `care.test.ts`    |
| 6 Me     | Me, conditions/allergies/family, records, places, profile, household        | S18–S20 — `me.test.ts`      |

Typecheck, lint (0 errors) and the full Vitest suite pass. Signed-in pages are NOT yet seen in a browser
(the test patients are the owner's to seed on dev).

Lead fixes on integration:

- W4: Book's addresses carried the booking reason ("antenatal") and the symptom area. They now carry only a
  position in a list the server holds (`lib/patient-web/opaque.ts`).
- L5: Home and the plus showed medicine names as stored (a visit record can hold "5 mg"); they now go
  through the same no-dose rule as Care (`@patient-core/care-no-dose`).
- Never colour alone: the sugar diary's cells had their word for screen readers only; a visible ↑ / ↓ / ↑↑
  now sits beside the number and in the legend.
- One visit linked Messages at `/patient/care/chat`; it is `/patient/care/messages`.
- Household's date of birth was a native date input (Tide guard); it is a typed YYYY-MM-DD field.

Needs the owner:

- Payment strip wording "Not paid · UGX X" on a visit (no payment record exists on the server).
- No map anywhere: the repo has no web map component and adding one needs a dependency decision.
- Messages always shows the honest "not available" line; the flag-on chat thread is not built.
- "Show conditions on my card" resets every visit (nothing may be kept in browser storage, W3).
- Me's "Add to my medicines" imports the old `app/patient/care/visits/[summaryId]/actions.ts`; Step 9 must
  keep or move it when the old pages go.
- Pure phone rules copied into new `packages/patient-core/*` files (visits-calendar, book-days,
  book-attachments, care-_, me-_); the phone still has its own copies until a mobile change re-exports them.
- Same-day "no slot left" is detected from the message text, because `callEdge` drops error codes.
