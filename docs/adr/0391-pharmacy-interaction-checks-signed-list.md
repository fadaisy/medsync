# ADR 0391 — Interaction checks from a signed list; "partial" and suppression

**Status:** Accepted — 2026-10-25, Pharmacy Phase 3 GATE A (D-PH3-01 to D-PH3-05).

## Decision

- A pure engine fires signed pairs against what the patient takes now: active lines, the basket, doses charted within the signed look-back, supplies within the signed look-back, and Continue admission medicines.
- Levels come only from the signed mapping. With none signed, nothing fires and the dialog says so.
- The dialog shows one interaction line at the highest fired level. One answer covers it, stored in `check_answers` with each entry's id, key and version (IX-5).
- A pair answered within the signed suppression window shows as a Note naming the earlier answer.
- The state is `none` or `partial` with the signed count, and is never complete. The notice says how many pairs are checked and what is not.
- No external interaction database is called (E-PH3-01).
