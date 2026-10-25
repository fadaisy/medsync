# ADR 0392: Stewardship from a signed AWaRe pack; review due on the signed day

**Status:** Accepted, 2026-10-25. Pharmacy Phase 3 GATE A (D-PH3-06 to D-PH3-11), Step 7.

## Decision

- **Tagging.** Antibiotics are tagged Access, Watch or Reserve only from a signed `aware_pack` entry. The import matches generics exactly. A medicine that does not match is listed in `unmatched`; it is never guessed.
- **Day of therapy.** It counts calendar days in local time (Africa/Kampala), from the first charted dose. When nothing is charted, it counts from the prescription and says so.
- **When a review is due.** A review is due only on the interval signed for that group in `review_settings`. A group with no interval never prompts. Nothing assumes an interval (Law 6).
- **Recording a review.** A review is stored in `pharmacy_ams_reviews` (0211, append-only) with one of four answers: continue, change, switch to oral, or stop. Continue needs a stop date; stop needs a reason. Nothing stops an antibiotic (Law 5).
- **How figures are shown.** Every figure is a share of prescriptions, given with its numerator, its denominator and a definition (AM-8). The figures are not DDDs.

## Limits (ponytail)

- The ward is not read yet, so "by ward" shows a single row.
- Lab release is not joined, so a culture reads only as sent or not sent.
- The doctor-side review card and the MAR chip are not built.
