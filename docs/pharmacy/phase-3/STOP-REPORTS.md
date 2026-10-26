# Pharmacy Phase 3: STOP reports (first merge, Steps 0 to 6)

**STOP 0 and 1:** see `gate-a-proposal.md`. Everything there was signed on 25 Oct 2026. **Scope:** the first merge only, then a stop for the owner.

| Step | Built                                                                                                                                                                                                                                                                                                         | Proof                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | Migration 0210 (GATED): content entries with the signing guard (two signers, or one with a recorded exception), append-only signatures and imports, PCNE coding (hidden until permitted), query intent, `accepted_interaction`                                                                                | `tests/emr-db/pharmacy-clinical-data.test.ts`: S1 (the Phase 1 data lane passes), S2 (pharmacy reads drafts; a prescriber reads only entries in force; the superadmin and other hospitals read nothing), S3 (signed entries and signatures never change; withdrawal is the one change) |
| 3    | Pure engines: content (CC), interactions (IX), interventions (IV)                                                                                                                                                                                                                                             | `tests/pharmacy/clinical/engines.test.ts`: S5 to S7, S12, S13, S15, S24, S25, S27, IX-8 and IX-9                                                                                                                                                                                       |
| 4    | Clinical content page (`/pharmacy/clinical/content`): drafts for pairs, alert levels, look-back windows and the "check worth signing" minimum; import of the 78 candidates, keyed on the file's hash; signing with the signer's own fresh second factor and the exception text; withdrawal                    | Actions in `app/pharmacy/clinical/actions.ts`                                                                                                                                                                                                                                          |
| 5    | The prescribing dialog's interaction line (behind `PHARMACY_INTERACTIONS`); the answer stored with its entry and version; suppression; "nothing fired" shown as a Note; the notice gives the signed pair count; the review screen shows fired pairs with the prescriber's answer or "Fired after prescribing" | `tests/pharmacy/clinical/dialog.test.ts` (S16, S17, S23); the notice test (S22)                                                                                                                                                                                                        |
| 6    | Interventions page (`/pharmacy/clinical/interventions`, behind `PHARMACY_INTERVENTION_REVIEW`): figures, by type, by dispensing point, waiting, "a check worth signing" from the signed minimum, CSV of counts for `pharmacy.manage`                                                                          | engines S24, S25, S27                                                                                                                                                                                                                                                                  |

## Not done in the first merge (honest)

- **At review:** the pharmacist's **Supply, with a reason** (`accepted_interaction`) and **Ask the prescriber** with the alert attached are not built. The existing Phase 1 query form is used meanwhile, and the line event's kind is already allowed (0210).
- **Restricted pairs at review:** masked for every viewer until the review reads the viewer's class access (IX-8 is only partly done).
- **Query codes:** the added codes (Interaction, Antibiotic review, Reconciliation) and the PCNE map have no editing form. PCNE stays hidden in any case until the PCNE Board's permission is recorded.
- **"Ward" in intervention review** is the query's dispensing point until queries carry the patient's ward.
- **Signer roles:** another eligible signer means another `pharmacy.manage` holder, until the pharmacist reviewer and the AMS chair are named (D-PH3-26).
- **Not measured:** the dialog timing budget (p95), and screenshots or axe for the two new routes.

## For the owner

1. **Apply 0210** when ready:

   ```bash
   cd ~/Desktop/medsync-pharmclose && npm run db:migrate
   ```

2. **Sign the Phase 3 wording:** `content/pharmacy-clinical.ts`, currently draft. Until it is signed, the flags stay off in production.
3. **Turn on** `PHARMACY_INTERACTIONS` and `PHARMACY_INTERVENTION_REVIEW` per hospital.
4. **Then, in Clinical content:** import the candidates, have the pharmacist reviewer finish the pairs, sign the alert levels and look-back windows, then sign the pairs.

---

# Steps 7–8: stewardship and reactions (25 Oct 2026)

**Built:**

- **Migration 0211:**
  - packs `aware_pack`, `review_settings` and `reaction_timelines`;
  - `pharmacy_ams_reviews`;
  - the reaction reports, their medicines and their events.

  All are append-only, with RLS.

- **Engines:** `lib/pharmacy/clinical/stewardship.ts` and `reactions.ts`.
- **Write paths:**
  - `reaction-store.ts`;
  - `lib/emr/write/reactions.ts`, which writes the unconfirmed allergy.
- **AWaRe import:** an exact match on the generic; the medicines it cannot match are listed.
- **Pages:**
  - `/pharmacy/clinical/stewardship` shows the figures with their counts, the reviews due, the Reserve antibiotics started, and a by-ward list;
  - `/pharmacy/clinical/reactions` is the list, with state and due-by;
  - `/pharmacy/clinical/reactions/[id]` shows the report with initials, age and sex. From there, staff print or copy it (both logged), set causality, record it as submitted (route and date), or close it with a reason.
- **Record a suspected reaction:** a dialog on the prescription review page.
- **Nav:** Stewardship and Reactions entries, behind `PHARMACY_STEWARDSHIP` and `PHARMACY_REACTIONS`.
- **ADRs:** 0392 and 0393.

**Checks:**

- typecheck clean;
- lint clean;
- pharmacy unit tests: 843 passed;
- 0211 lane test passed (a submission needs a route and a date; reports and events are append-only; the new packs are allowed).

**Not done (honest):**

- **Stewardship gaps:**
  - the doctor-side review card and MAR chip;
  - recording an AMS review from the page (the table exists, the form does not);
  - the ward is not read;
  - a culture's "released" state is not shown (lab events are not joined).
- **Reaction gaps:**
  - the confirm/refute screen for prescribers;
  - more than one suspected medicine per form.
- **Waiting for the owner's go-ahead:** Steps 9–10 (reconciliation, hardening).

**For the owner:**

- apply 0210 → 0211 (`cd ~/Desktop/medsync-pharmclose && npm run db:migrate`);
- sign `PHARMACY_CLINICAL_COPY`;
- import and sign the AWaRe pack, the review settings and the reaction timelines.

---

# Steps 9–10: reconciliation and hardening (25 Oct 2026)

Step 9 is commit 258853ec: 0212, the engine, the prescriber's Medicines for home page, and the pharmacist's Reconciliation pages.

Step 10 adds:

- tests for S48, for no prescription writes, and for H3-14;
- ADR 0395;
- `hazard-log.md` and `USER-GUIDE.md`;
- `FINAL-REPORT.md`, which holds the numbers, the Definition of Done and what is open.
