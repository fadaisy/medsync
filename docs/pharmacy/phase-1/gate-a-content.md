# Pharmacy Phase 1 — GATE A content annex

For Fadhul (owner, CSO), the pharmacist reviewer (not yet named) and each hospital's pharmacy in charge. Annex to the
Phase 1 GATE A proposal. Prompt: [PROMPT-PHARMACY-PHASE-1.md](PROMPT-PHARMACY-PHASE-1.md) (Section 14, Appendices
A, B, D, E). Design choices and names: [gate-a-brief.md](gate-a-brief.md). Step 0 findings:
[STOP-REPORTS.md](STOP-REPORTS.md). House style follows Phase 0's copy table
([phase-0/gate-a-proposal.md](../phase-0/gate-a-proposal.md) §5.7).

Four parts:

1. Every string, with where it appears, who reads it, who signs it and its status.
2. The sign-off packs, as blank templates ready to fill.
3. The legal sheet: eight questions, no answer on record yet.
4. The permission map, version 2, as a draft.

**Nothing in this annex is signed except the six items Phase 0 signed on 11 Oct 2026** (Part 1.1). Every other
string, list and map is `draft`. No medicine, dose, class, high-risk entry, level or price is proposed anywhere.

**Signers, as D-PH1-36 assigns them.** These abbreviations are used throughout:

| Code | Who                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSO  | The Clinical Safety Officer (Fadhul). Signs staff-facing copy alone.                                                                                                                                           |
| PR   | The pharmacist reviewer. Not yet named (STOP 0). Signs the clinical sets with the CSO, and patient-facing copy with the CSO.                                                                                   |
| PIC  | The pharmacy in charge: a `department_heads` row on the Pharmacy department (Head of Pharmacy) or on a dispensing point's unit. Signs operational reason lists with the CSO; signs operational settings alone. |
| 2U   | Two different users approve a message template (draft → approved), after its copy is signed (D-PH1-48, the generalised `ncd_sms_template`).                                                                    |

Every signature takes a fresh second factor. Where a second eligible person exists, the author of a change is not its
only signer, and the CSO is not also the second approver of a switch. Where none exists, the exception is recorded in
words on the signature (D-PH1-36, D-PH1-43).

---

## Part 1 — Every string (Appendix B), with status

### 1.1 Phase 0 strings already signed, carried into Phase 1

Signed by the CSO on 11 Oct 2026 in the sign-off portal (https://claude.ai/artifact/PrEYQNLnd2Ng7zaq58Rtj6), as held
in `content/pharmacy.ts` (`SIGNED`, `signedBy: "Fadhul (CSO)"`, `signedOn: "2026-10-11"`) and in
`data/pharmacy/permission-map.v1.json`. `content/pharmacy.ts` says: _"Any change to a string below returns it to
`draft` until it is signed again."_ Phase 1 changes none of them in place; where Phase 1 needs different words, it is a
new `draft` row (1.3).

| #   | Key (`content/pharmacy.ts`)                        | Signed text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Where it appears in Phase 1                                                                                                                | Audience | Signers | Status            |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------- | ----------------- |
| S-1 | `PHARMACY_NOTICE` (lead, bodyCounts, bodyNoCounts) | Lead: _MedSync does not record dispensing yet._ Body with counts: _Dispense from the signed prescription as you do today. MedSync does not check drug interactions at this hospital, and {signed} of the {total} medicines on its list have a signed dose reference. Check each prescription yourself._ Body without counts: _Dispense from the signed prescription as you do today. MedSync does not check drug interactions at this hospital, and its dose references are still being signed. Check each prescription yourself._ | Queue and prescription view **at a point that is not live** only (5.1, CK-1). At a live point it is replaced by B-02 or N-1 (conflict C1). | Staff    | CSO     | signed 2026-10-11 |
| S-2 | `COSIGN_CAUTION`                                   | _Not yet co-signed. A senior has not signed this prescription._                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Prescription view at a point that is not live. At a live point, see conflict C2.                                                           | Staff    | CSO     | signed 2026-10-11 |
| S-3 | `NOT_CONTINUED_CAUTION`                            | _Not continued at home_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Queue row state and prescription view (D-PH0-19), live or not. Unchanged.                                                                  | Staff    | CSO     | signed 2026-10-11 |
| S-4 | `OVERRIDE_CAUTION` (lead, body)                    | Lead: _{check} stop, overridden by the prescriber._ Body: _Reasons given: "{reasons}"._                                                                                                                                                                                                                                                                                                                                                                                                                                            | Prescription view, and the review screen's override block (5.3). See C4: the trigger 5.3 adds must sit outside this string.                | Staff    | CSO     | signed 2026-10-11 |
| S-5 | `EMERGENCY_NOTICE`                                 | _Cart restocking is not recorded in MedSync yet. Use this list beside the cart's own checklist when you restock._                                                                                                                                                                                                                                                                                                                                                                                                                  | Emergency doses page. Unchanged: cart reconciliation is Phase 2, so the sentence stays true.                                               | Staff    | CSO     | signed 2026-10-11 |
| S-6 | Permission map v1, note 3                          | The pharmacy technician's registering body is the Pharmacy Board of Uganda. Confirmed by the CSO; no source was cited with it.                                                                                                                                                                                                                                                                                                                                                                                                     | Not a screen string. Carried into the v2 map's notes (Part 4). Legal question 1 asks for the written source.                               | —        | CSO     | signed 2026-10-11 |

### 1.2 Appendix B, every string

Text is verbatim from Appendix B. **No Appendix B string is identical to a Phase 0 signed string**, so every row is
`draft`. Where a row overlaps a signed string, the overlap column quotes the signed text. Section references are to the
prompt.

Placeholder flags: **[MN]** uses `{hospital message name}` (D-PH1-39; RD-4 keeps it off until the name is signed);
**[PH]** uses `{phone}`, whose source is the dispensing point's new phone column (Step 0 Q8: the hub holds only the
hospital's `emergency_phone`) — the signers must confirm that the number used in a patient string or message cannot
itself identify a clinic or condition (hazard 28); **[PT]** uses `{point}` (allowed on staff screens and paper; never
in a message, D-PH1-31); **[MED]** uses `{Medicine}` (staff and prescriber screens only).

**Patient strings carry no medicine name.** B-61 to B-69 name no medicine, condition, clinic, dispensing point or
prescriber. On the signed-in list (5.11) they sit beside the medicine's name, which appears only after sign-in (B-70).
The slip (B-31 to B-37) and the label (B-15, B-41) are paper the patient carries and do list the medicine, by design.

| #    | Key                               | Text                                                                                                                                                                         | Where it appears                                                                         | Audience                         | Signers                                               | Status | Flags and overlap with Phase 0                                                                                                                                         |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | Notice, review screen             | MedSync does not check drug interactions at this hospital, and {n} of these {N} doses {has/have} a signed reference. Check each line yourself.                               | Review screen head (5.3), live point                                                     | Staff                            | CSO                                                   | draft  | Overlaps S-1: _"MedSync does not check drug interactions at this hospital"_ is verbatim from the signed body. Counts are per prescription. No no-counts form: see N-2. |
| B-02 | Notice, queue                     | MedSync does not check drug interactions at this hospital, and {signed} of the {total} medicines on its list have a signed dose reference. Check each prescription yourself. | Queue, live point (5.1, CK-1)                                                            | Staff                            | CSO                                                   | draft  | **Conflict C1.** S-1's body with counts minus its lead and its first sentence. No no-counts form: see N-1.                                                             |
| B-03 | No lane rule                      | This hospital has not signed its review rule, so every prescription needs a pharmacist.                                                                                      | Queue, lane explainer, when no lane rule is signed (5.2, LN-4)                           | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-04 | Lane explainer                    | A prescription goes to "Pharmacist first" when {reasons that are on}. Everything else is "Standard". The list of reasons is signed by the Clinical Safety Officer.           | Under the queue table, always (5.2)                                                      | Staff                            | CSO                                                   | draft  | {reasons that are on} is built from the signed lane rule. **W1:** D-PH1-36 has the lane rule signed by the PR and the CSO; the sentence names the CSO only. See N-6.   |
| B-05 | No high-risk list                 | This hospital has no signed high-risk list, so that reason is not used.                                                                                                      | Lane explainer (D-PH1-29)                                                                | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-06 | Waiting for a pharmacist          | Waiting for a pharmacist                                                                                                                                                     | Review screen, for a viewer without `pharmacy.review` (5.3, LN-2)                        | Staff                            | CSO                                                   | draft  | Shown to technicians; names the role they wait for, never their own.                                                                                                   |
| B-07 | Awaiting co-sign                  | Cannot be supplied yet. A senior has not signed this prescription.                                                                                                           | Review screen and queue, live point (5.2)                                                | Staff                            | CSO                                                   | draft  | **Conflict C2.** Second sentence verbatim from S-2; first sentence differs.                                                                                            |
| B-08 | Changed since printing            | Changed since printing. The paper the patient carries is out of date.                                                                                                        | Queue chip, review head, controlled head (5.2, 5.3, 5.9; PQ-7)                           | Staff                            | CSO                                                   | draft  | **W3:** cannot be computed today: the doctor's prescription print records no print event (Step 0 Q20, R17).                                                            |
| B-09 | Queue footer                      | {n} of {N} at {point}, {lane}. Waiting starts when the prescription was written. A prescription leaves the queue only with a recorded outcome for every line.                | Queue (5.2)                                                                              | Staff                            | CSO                                                   | draft  | [PT]. Replaces Phase 0's interface `queue.footer` at a live point (1.5).                                                                                               |
| B-10 | Earlier, still open               | Written before today, still without an outcome                                                                                                                               | Queue divider (5.2)                                                                      | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-11 | Before go-live                    | Written before this pharmacy began recording in MedSync.                                                                                                                     | Phase 0 view of an earlier prescription, beside **Bring into the queue** (5.1, LO-6)     | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-12 | Ward prescriptions                | Ward doses come from ward stock, which MedSync does not count yet.                                                                                                           | Review screen, ward prescription with inpatient supply off (5.10, D-PH1-02)              | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-13 | Controlled, before Step 7         | Supply this on paper as you do today. MedSync does not record controlled supplies yet.                                                                                       | Review screen, controlled line, before Step 7 ships                                      | Staff                            | CSO                                                   | draft  | Retired when Step 7 ships.                                                                                                                                             |
| B-14 | Substitution note                 | A pharmacist may change the pack or strength only when the dose and the form the patient takes stay the same. Any other change goes back to the prescriber.                  | Under the lines, review screen (5.3)                                                     | Staff                            | CSO; must agree with the substitution rule (PR + CSO) | draft  | **Conflict C3** with D-PH1-14 and 5.3.1. See N-4, N-5.                                                                                                                 |
| B-15 | Pharmacist's line, label          | From the pharmacist: {line}                                                                                                                                                  | Label, patient's list, review screen (5.3.1, LB-2, 5.11)                                 | Patient                          | CSO + PR                                              | draft  | {line} is typed by a holder of `pharmacy.review` (80 characters); never a technician's line.                                                                           |
| B-16 | No product                        | No product is set up for this medicine at {point}.                                                                                                                           | Review screen, product picker (5.3.1)                                                    | Staff                            | CSO                                                   | draft  | [PT]                                                                                                                                                                   |
| B-17 | Not counted                       | Not counted yet.                                                                                                                                                             | Review screen, "On the shelf here" (5.3)                                                 | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-18 | Expired batch                     | Expired {date}. Remove it from the shelf.                                                                                                                                    | Review screen, under the batches (5.3.1); amber with an icon                             | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-19 | Batch changed under you           | Batch {number} now holds {n}. Choose again.                                                                                                                                  | Hand-over, server refusal (5.6, SU-2)                                                    | Staff                            | CSO                                                   | draft  | 5.6 quotes it as "Batch {no}"; one placeholder name.                                                                                                                   |
| B-20 | Already supplied                  | {Medicine} was already supplied at {point}, {time}.                                                                                                                          | Hand-over, server refusal (5.6)                                                          | Staff                            | CSO                                                   | draft  | [MED] [PT]                                                                                                                                                             |
| B-21 | Changed by the prescriber         | {Medicine} was changed by the prescriber at {time}. Review it again.                                                                                                         | Review screen (5.3, RQ-9) and hand-over refusal (5.6)                                    | Staff                            | CSO                                                   | draft  | [MED]. **W2:** 5.6 quotes it without "at {time}". Sign this one form for both places.                                                                                  |
| B-22 | Query sent                        | Query sent {time} · not answered                                                                                                                                             | Review screen, the queried line (5.4)                                                    | Staff                            | CSO                                                   | draft  | Never reads as "the prescriber knows".                                                                                                                                 |
| B-23 | Query not delivered               | The prescriber has NOT been told. Call them and log the call.                                                                                                                | Review screen (5.4); amber                                                               | Staff                            | CSO                                                   | draft  | Capital "NOT" is deliberate in the prompt; the CSO confirms it.                                                                                                        |
| B-24 | Nobody to tell                    | Nobody can be told in MedSync. Call the ward or clinic.                                                                                                                      | Query form (5.4, RQ-3); amber                                                            | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-25 | Phone answer, to the clinician    | The pharmacy recorded your phone answer at {time}. Not you? Tell us.                                                                                                         | Prescriber's problem card (5.4, D-PH1-09, RQ-7)                                          | Prescriber                       | CSO                                                   | draft  |                                                                                                                                                                        |
| B-26 | Query, on the problem card        | From the pharmacy ({cadre}), {time} · {type}. "{proposal}"                                                                                                                   | Prescriber's problem card (5.4)                                                          | Prescriber                       | CSO                                                   | draft  | {cadre} from the catalogue: a technician shows as a pharmacy technician. {type} from the signed query codes. {proposal} verbatim.                                      |
| B-27 | Not supplied, on the problem card | From the pharmacy, {time}. {Medicine} was not supplied: {reason}. {What the patient was told}.                                                                               | Prescriber's problem card (5.4)                                                          | Prescriber                       | CSO                                                   | draft  | [MED]. {reason} from the signed outcome reasons.                                                                                                                       |
| B-28 | Not-supplied footer               | A line that is not supplied always carries a reason and a next step. It never closes on its own.                                                                             | Not on the shelf (5.5)                                                                   | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-29 | Tell the patient                  | Tell the patient now.                                                                                                                                                        | Not on the shelf, "Who is told" (5.5)                                                    | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-30 | No message sent                   | No message is sent. The patient knows only what you tell them.                                                                                                               | Not on the shelf, "Who is told" (5.5)                                                    | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-31 | Slip, title                       | Medicine not supplied: to fill at another pharmacy                                                                                                                           | Slip to fill elsewhere, A5 print (5.5)                                                   | Patient (and the other pharmacy) | CSO + PR; legal Q5                                    | draft  | Replaces the canvas title "Prescription to fill elsewhere".                                                                                                            |
| B-32 | Slip, body                        | This medicine was not available at the hospital pharmacy today. Give this to the pharmacy together with your signed prescription.                                            | Slip (5.5)                                                                               | Patient (and the other pharmacy) | CSO + PR; legal Q5                                    | draft  | The second sentence is D-PH1-13's line. Its wording waits on Q5.                                                                                                       |
| B-33 | Slip, no quantity                 | Quantity: as on the prescription                                                                                                                                             | Slip, when no structured quantity exists (5.5, LB-5)                                     | Patient (and the other pharmacy) | CSO + PR                                              | draft  | Step 0 Q3: no structured quantity exists, so this is the usual case.                                                                                                   |
| B-34 | Slip, changed                     | The prescription was changed on {date}. Ask the hospital for a new copy.                                                                                                     | Slip (5.5)                                                                               | Patient (and the other pharmacy) | CSO + PR                                              | draft  | W3 applies: needs print events.                                                                                                                                        |
| B-35 | Slip, generic names               | Written by generic name.                                                                                                                                                     | Slip (5.5)                                                                               | Patient (and the other pharmacy) | CSO + PR                                              | draft  |                                                                                                                                                                        |
| B-36 | Slip, verification                | To check this is real, call the hospital pharmacy on {phone} and give this code: {code}.                                                                                     | Slip (5.5, LB-6)                                                                         | The other pharmacy               | CSO + PR                                              | draft  | [PH]. {code} carries no patient information (LB-6).                                                                                                                    |
| B-37 | Slip, footer                      | Controlled drugs are never printed on this form. Printed {time} at {point}. Copy {n} of {N}.                                                                                 | Slip (5.5)                                                                               | Patient (and the other pharmacy) | CSO + PR                                              | draft  | [PT] on paper, not in a message.                                                                                                                                       |
| B-38 | Identity rule                     | Two identifiers are needed before the hand-over can be recorded. Ask the person to say them; do not read them out.                                                           | Hand-over, section 1 (5.6)                                                               | Staff                            | CSO (D-PH1-16)                                        | draft  |                                                                                                                                                                        |
| B-39 | Identity mismatch                 | This does not match. Check you have the right patient.                                                                                                                       | Hand-over, section 1 (5.6, SU-4)                                                         | Staff                            | CSO                                                   | draft  | Never echoes the stored value.                                                                                                                                         |
| B-40 | Identified another way            | The card or prescription with the patient's number was shown · Known to staff · Other                                                                                        | Hand-over, section 1, route list (5.6)                                                   | Staff                            | PIC + CSO (identity routes)                           | draft  | Also the identity-routes pack (2.10). "Other" carries a note.                                                                                                          |
| B-41 | Label, warning line               | Keep out of the reach of children.                                                                                                                                           | Printed label (5.6, LB-3)                                                                | Patient                          | PR + CSO (labels)                                     | draft  | Also the labels pack (2.13).                                                                                                                                           |
| B-42 | Label by hand                     | I have written the label on each envelope.                                                                                                                                   | Hand-over, label mode "Written by hand" (5.6, D-PH1-17)                                  | Staff                            | PR + CSO (labels)                                     | draft  |                                                                                                                                                                        |
| B-43 | Supplied without a pharmacist     | Supplied without a pharmacist: {reason}. A pharmacist will look at this supply.                                                                                              | Hand-over head, supply record, look-back list (5.6, 5.7, D-PH1-05)                       | Staff                            | CSO                                                   | draft  | Only where D-PH1-05 is on. {reason} from the signed list (2.8).                                                                                                        |
| B-44 | Look-back tab                     | Look-back · {n} waiting                                                                                                                                                      | Supplied today, tab (5.7); caution icon                                                  | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-45 | Reversed                          | Reversed {time} by {cadre}: {reason}                                                                                                                                         | Supply record, prescriber's problem card (5.7.1)                                         | Staff, prescriber                | CSO                                                   | draft  | {cadre} from the catalogue, never "pharmacist" for a technician.                                                                                                       |
| B-46 | Recorded in error                 | Recorded in error. {reason}                                                                                                                                                  | Supply record, prescriber's problem card (5.7.1)                                         | Staff, prescriber                | CSO                                                   | draft  |                                                                                                                                                                        |
| B-47 | Controlled notice                 | MedSync's record does not replace the paper. Keep the signed prescription and make the entry in the hospital's controlled drugs register, as you do today.                   | Controlled supply screen (5.9); amber, icon, not dismissible                             | Staff                            | CSO; legal Q2                                         | draft  | Holds whatever Q2 answers (3.2).                                                                                                                                       |
| B-48 | Controlled, paper 1               | The signed prescription is here, matches what is on this screen, and will be kept.                                                                                           | Controlled supply screen, required tick (5.9)                                            | Staff                            | CSO; legal Q3                                         | draft  |                                                                                                                                                                        |
| B-49 | Controlled, paper 2               | The entry is made in the controlled drugs register, and the person collecting has signed it.                                                                                 | Controlled supply screen, required tick (5.9)                                            | Staff                            | CSO; legal Q2                                         | draft  |                                                                                                                                                                        |
| B-50 | Controlled, witness               | I, the witness, saw the count and agree with the balance of {n}.                                                                                                             | Controlled supply screen, the witness's agreement (5.9, CD-2)                            | Staff (the witness)              | CSO                                                   | draft  |                                                                                                                                                                        |
| B-51 | Controlled, difference            | The count does not match the record. Record the difference; it goes to the pharmacy in charge.                                                                               | Controlled supply screen and count (5.9); amber                                          | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-52 | Register slip heading             | Copy for the controlled drugs register. This is not the register.                                                                                                            | Register slip print (LB-7)                                                               | Staff                            | CSO; legal Q2                                         | draft  |                                                                                                                                                                        |
| B-53 | No buying outside                 | A controlled drug cannot be sent to another pharmacy on this form. Return it to the prescriber, or record it as owed.                                                        | Not on the shelf, controlled line (5.5)                                                  | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-54 | Stock line, in stock              | On the shelf at {point}. {Counted {when}. / Received {when}, not yet counted.}                                                                                               | Prescribing dialog, Check step (5.10)                                                    | Prescriber                       | CSO                                                   | draft  | [PT]. Level from the availability mapping (2.16). No quantity, ever.                                                                                                   |
| B-55 | Stock line, low                   | Low at {point}. Counted {when}.                                                                                                                                              | Prescribing dialog (5.10)                                                                | Prescriber                       | CSO                                                   | draft  | [PT]                                                                                                                                                                   |
| B-56 | Stock line, out                   | Not on the shelf at {point}{ since {date}}. {In stock at {other point}.}                                                                                                     | Prescribing dialog (5.10)                                                                | Prescriber                       | CSO                                                   | draft  | [PT]                                                                                                                                                                   |
| B-57 | Stock line, not stocked           | Not stocked at {point}.                                                                                                                                                      | Prescribing dialog (5.10)                                                                | Prescriber                       | CSO                                                   | draft  | [PT]                                                                                                                                                                   |
| B-58 | Stock line, not counted           | Stock at {point} has not been counted {since {date} / yet}. This answer may be wrong.                                                                                        | Prescribing dialog (5.10)                                                                | Prescriber                       | CSO                                                   | draft  | [PT]                                                                                                                                                                   |
| B-59 | Stock line, footer                | Stock informs and never blocks. A dispensing point that has not counted says so.                                                                                             | Prescribing dialog (5.10)                                                                | Prescriber                       | CSO                                                   | draft  |                                                                                                                                                                        |
| B-60 | Ward chip                         | Pharmacy: not yet reviewed · Pharmacy: reviewed {time} · Pharmacy: query with the prescriber · Pharmacy: standard lane, not reviewed                                         | Administration record, `MarGrid` row header (5.10, D-PH1-33)                             | Staff (nurses)                   | CSO                                                   | draft  | Four values. Read-only; holds no dose.                                                                                                                                 |
| B-61 | Patient, not given                | Not given today                                                                                                                                                              | Patient's medicine list (5.11)                                                           | Patient                          | CSO + PR                                              | draft  | No medicine name.                                                                                                                                                      |
| B-62 | Patient, buying outside           | The hospital pharmacy had none. Take the paper you were given, with your prescription, to any licensed pharmacy.                                                             | Patient's medicine list (5.11)                                                           | Patient                          | CSO + PR                                              | draft  | No medicine name. Must agree with Q5's answer.                                                                                                                         |
| B-63 | Patient, owed                     | The hospital pharmacy had none today. Ask at the pharmacy, or call {phone}, to find out when it has arrived.                                                                 | Patient's medicine list (5.11)                                                           | Patient                          | CSO + PR                                              | draft  | No medicine name. [PH]. Promises nothing is held (E-PH1-03).                                                                                                           |
| B-64 | Patient, declined                 | The pharmacy did not give this medicine. Speak to your doctor or the pharmacy.                                                                                               | Patient's medicine list (5.11, D-PH1-10)                                                 | Patient                          | CSO + PR                                              | draft  | No medicine name.                                                                                                                                                      |
| B-65 | Patient, refill                   | Next supply due around {date}                                                                                                                                                | Patient's medicine list (5.11, ML-3, D-PH1-30)                                           | Patient                          | CSO + PR                                              | draft  | No medicine name. Shown only when ML-3 allows a date.                                                                                                                  |
| B-66 | In-app or push, not available     | One of your medicines was not available at the hospital today. Open MedSync to see what to do.                                                                               | In-app notice (push specified, not built) (5.11)                                         | Patient                          | CSO + PR, then 2U                                     | draft  | No medicine name. Says "the hospital", not a name.                                                                                                                     |
| B-67 | SMS, owed                         | MedSync: one of your medicines was not available at {hospital message name} today. Call the pharmacy on {phone} to ask when it has arrived.                                  | SMS (5.11)                                                                               | Patient                          | CSO + PR, then 2U; legal Q7                           | draft  | No medicine name. **[MN] [PH].** Banned-term scan. Live SMS off by default.                                                                                            |
| B-68 | SMS, buying outside               | MedSync: one of your medicines was not available at {hospital message name} today. Keep the paper you were given, or call the pharmacy on {phone}.                           | SMS (5.11)                                                                               | Patient                          | CSO + PR, then 2U; legal Q7                           | draft  | No medicine name. **[MN] [PH].**                                                                                                                                       |
| B-69 | In-app, push or SMS, in stock     | A medicine the pharmacy owed you is in stock at {hospital message name} today.                                                                                               | In-app and SMS, sent only on **Tell the patient it is here** (5.7, 5.11)                 | Patient                          | CSO + PR, then 2U; legal Q7 for SMS                   | draft  | No medicine name. **[MN].** Says "in stock today", never "ready to collect".                                                                                           |
| B-70 | Message rule                      | No message names a medicine or a condition. Those appear only after sign-in.                                                                                                 | Not placed by Section 5. Proposed: the message templates page and the "Who is told" list | Staff                            | CSO                                                   | draft  | **W4:** placement to be fixed in the wireframes.                                                                                                                       |
| B-71 | SMS off                           | SMS is off at this hospital.                                                                                                                                                 | Not on the shelf, "Who is told" (5.5, 5.11)                                              | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-72 | Downtime tag                      | Entered after downtime · Supplied {time} · entered {time} · sheet {number}                                                                                                   | Wherever a back-entered supply appears (5.12)                                            | Staff, prescriber                | CSO                                                   | draft  | {number} prints as `DS-00031` (D-PH1-46).                                                                                                                              |
| B-73 | Downtime, no period               | Ask the pharmacy in charge to record this downtime first.                                                                                                                    | Downtime entry, refusal (5.12)                                                           | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-74 | Transcribed                       | Transcribed from a paper prescription by {cadre}                                                                                                                             | Paper prescription record (5.12, E-PH1-10)                                               | Staff, prescriber                | CSO                                                   | draft  | {cadre} from the catalogue.                                                                                                                                            |
| B-75 | Count needed                      | Count needed                                                                                                                                                                 | Stock state (5.8, DT-7)                                                                  | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-76 | Not registered                    | Register this patient at reception first.                                                                                                                                    | Downtime entry (5.12)                                                                    | Staff                            | CSO                                                   | draft  | 5.12 quotes it without the full stop; one form.                                                                                                                        |
| B-77 | Log columns                       | Columns not yet confirmed against this hospital's dispensing log.                                                                                                            | Head of the printed dispensing log, until the column map is confirmed (5.12, DL-1)       | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |
| B-78 | Sheet footer                      | Write each time as it happened. MedSync keeps that time and marks the record "Entered after downtime". Controlled drugs also go in the register as usual.                    | Downtime sheet, A4 print (5.12)                                                          | Staff                            | CSO                                                   | draft  |                                                                                                                                                                        |

### 1.3 New draft rows proposed by this annex

Each resolves a conflict or gap found above. All `draft`.

| #   | Key                                  | Proposed text                                                                                                                                                                                                                                   | Where                                                  | Audience | Signers                              | Status | Why                                                                                         |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- | ------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| N-1 | Notice, queue, live point, no counts | MedSync does not check drug interactions at this hospital, and its dose references are still being signed. Check each prescription yourself.                                                                                                    | Queue, live point, when the counts cannot be read      | Staff    | CSO                                  | draft  | C1: S-1 has a no-counts body; Appendix B has none for a live point.                         |
| N-2 | Notice, review screen, no counts     | MedSync does not check drug interactions at this hospital, and its dose references are still being signed. Check each line yourself.                                                                                                            | Review screen, when the counts cannot be read          | Staff    | CSO                                  | draft  | B-01 has no no-counts form.                                                                 |
| N-3 | Cannot be supplied yet               | Cannot be supplied yet                                                                                                                                                                                                                          | Queue, beside **Open** (5.2); review screen above S-2  | Staff    | CSO                                  | draft  | C2, the recommended option: keeps S-2 signed and adds only these words.                     |
| N-4 | Substitution note, rule signed       | A different pack of the same strength may be supplied by anyone who may dispense. Only a pharmacist may change the strength, and only when the dose and the form the patient takes stay the same. Any other change goes back to the prescriber. | Review screen, under the lines (5.3)                   | Staff    | CSO; agrees with the rule (PR + CSO) | draft  | C3.                                                                                         |
| N-5 | Substitution note, rule unsigned     | A different pack of the same strength may be supplied. Any other change goes back to the prescriber.                                                                                                                                            | Review screen, while the substitution rule is unsigned | Staff    | CSO                                  | draft  | Appendix D: while unsigned, no strength change is offered, so the note must not offer one.  |
| N-6 | Lane explainer, both signers         | A prescription goes to "Pharmacist first" when {reasons that are on}. Everything else is "Standard". The list of reasons is signed by the Clinical Safety Officer and the pharmacist reviewer.                                                  | Under the queue table (5.2)                            | Staff    | CSO                                  | draft  | W1. Alternative to B-04.                                                                    |
| N-7 | Dispensing points note, Phase 1      | A dispensing point names where pharmacy staff work, which prescriptions their queue shows first, and the stock it holds. It records dispensing only once it has been switched on.                                                               | Hub, Pharmacy, each dispensing point                   | Staff    | CSO                                  | draft  | Phase 0's `points.note` ("It holds no stock and records no dispensing yet") becomes untrue. |

### 1.4 Strings quoted in Section 5 that are not in Appendix B

GATE A signs every visible string, so these are listed too. All `draft`, signed by the CSO unless marked. Lane, stage,
filter and button labels (Pharmacist first · Standard · To review · Queried · Ready to hand over · Supply in full …)
are interface labels, signed by the CSO as one set with the wireframes.

| #    | Text                                                                                                                                            | Where                                                    | Audience   | Signers  | Status   | Note                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- | -------- | -------- | ---------------------------------------------------------------------------------------- |
| X-1  | {n} of {N} lines have an outcome. Each supply takes its quantity from the batch shown, in the same step.                                        | Review screen footer (5.3)                               | Staff      | CSO      | draft    |                                                                                          |
| X-2  | 0 · out since {date}                                                                                                                            | Review screen, "On the shelf here" (5.3)                 | Staff      | CSO      | draft    |                                                                                          |
| X-3  | Added at the window                                                                                                                             | Product or batch added at the window (5.3.1)             | Staff      | CSO      | draft    |                                                                                          |
| X-4  | Pharmacy query · waiting {n} min                                                                                                                | Prescriber's problem card chip (5.4)                     | Prescriber | CSO      | draft    |                                                                                          |
| X-5  | {n} from the pharmacy                                                                                                                           | Plan step header (5.4)                                   | Prescriber | CSO      | draft    |                                                                                          |
| X-6  | Out since {date} · {n} days                                                                                                                     | Not on the shelf, head (5.5)                             | Staff      | CSO      | draft    |                                                                                          |
| X-7  | This stock-out has turned away {n} prescriptions since {date}.                                                                                  | Not on the shelf, "Who is told" (5.5)                    | Staff      | CSO      | draft    |                                                                                          |
| X-8  | Reviewed by {cadre} · {time}                                                                                                                    | Hand-over head (5.6)                                     | Staff      | CSO      | draft    | {cadre} is always a pharmacist here (only `pharmacy.review` accepts).                    |
| X-9  | Standard lane: checked at supply                                                                                                                | Hand-over head and supply record (5.6, D-PH1-06)         | Staff      | CSO      | draft    | 5.6 and D-PH1-06 differ in punctuation ("standard lane, checked at supply"); sign one.   |
| X-10 | They said the patient's full name, and it matches.                                                                                              | Hand-over, first identifier (5.6)                        | Staff      | CSO      | draft    |                                                                                          |
| X-11 | The patient says they bought it                                                                                                                 | Open lines (5.7, ML-4)                                   | Staff      | CSO      | draft    |                                                                                          |
| X-12 | The patient could not get it                                                                                                                    | Open lines (5.7); amber, icon                            | Staff      | CSO      | draft    |                                                                                          |
| X-13 | A line stays here until a person supplies it, confirms it was filled elsewhere, or closes it with a reason. Nothing leaves this list by itself. | Open lines explainer (5.7)                               | Staff      | CSO      | draft    | **Gap:** 5.7 asks for a signed explainer and gives no text. Proposed here from D-PH1-12. |
| X-14 | Counted {n} · matched the record                                                                                                                | Stock, count result (5.8)                                | Staff      | CSO      | draft    |                                                                                          |
| X-15 | A medicine with no reorder level set is never shown as low.                                                                                     | Stock page (5.8, D-PH1-23)                               | Staff      | CSO      | draft    | **Gap:** 5.8 says "the page says so" with no text. Proposed here.                        |
| X-16 | Controlled drugs are set up in the next step.                                                                                                   | Stock page, before Step 7 (5.8)                          | Staff      | CSO      | draft    | Retired when Step 7 ships.                                                               |
| X-17 | In stock · Low · Out · {n} days · Expiring · {n} days · Expired, remove · Count needed                                                          | Stock state words (5.8)                                  | Staff      | CSO      | draft    | "Count needed" is also B-75.                                                             |
| X-18 | The prescriber was told it was not on the shelf                                                                                                 | Review screen, line (5.10, D-PH1-44)                     | Staff      | CSO      | draft    |                                                                                          |
| X-19 | From {hospital} pharmacy, {date}.                                                                                                               | Patient's medicine list, group head (5.11)               | Patient    | CSO + PR | draft    | Uses the hospital's own name, after sign-in only.                                        |
| X-20 | {n} {units} given today                                                                                                                         | Patient's medicine list (5.11)                           | Patient    | CSO + PR | draft    | Beside the medicine name, after sign-in.                                                 |
| X-21 | I have bought it · I could not get it                                                                                                           | Patient's medicine list, buttons (5.11, D-PH1-32)        | Patient    | CSO + PR | draft    |                                                                                          |
| X-22 | Ask about my medicines                                                                                                                          | Patient's medicine list (5.11)                           | Patient    | CSO + PR | draft    | Absent when no contact route exists.                                                     |
| X-23 | This patient has no app and no phone number on file, so no message can be sent.                                                                 | Not on the shelf, "Who is told" (5.11)                   | Staff      | CSO      | draft    | **Gap:** 5.11 says "the pharmacy's list says so" with no text. Proposed here.            |
| X-24 | Saved as: supplied {time}, entered {time}.                                                                                                      | Downtime entry footer (5.12)                             | Staff      | CSO      | draft    |                                                                                          |
| X-25 | Pharmacy not linked yet.                                                                                                                        | Prescribing dialog (5.10), when no serving point is live | Prescriber | —        | existing | Existing prescribing text, unchanged; not part of this sign-off.                         |

### 1.5 Phase 0 interface strings that stop being true at a live point

Interface copy, never signed. Listed so none survives where it is false.

| `content/pharmacy.ts` key                                         | Phase 0 text (short)                                                            | Why it is false at a live point                          | Replaced by                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| `queue.footer`                                                    | "… This list is read-only: a prescription stays here until the end of the day." | Lines stay until an outcome; nothing drops at day's end  | B-09                         |
| `queue.emptyLane`, `queue.emptyAll`, `period.*`, `queue.titleFor` | "… yet today", period filter                                                    | The period filter goes (5.1)                             | Wireframes' empty states     |
| `view.footer`                                                     | "Read-only. To change this prescription, speak to the prescriber."              | The review screen records decisions                      | Review screen (5.3)          |
| `notChecked`                                                      | 'Drug interactions. · Stock. The prescriber saw "Pharmacy not linked yet".'     | With the stock line on, the prescriber saw a real answer | X-18, or unchanged while off |
| `points.note`                                                     | "… It holds no stock and records no dispensing yet."                            | Points hold stock from Step 4                            | N-7                          |
| `lane.*` (window, ward, open)                                     | "For the window", "On the wards", "Visit open"                                  | The tabs become review lanes (5.1)                       | Lane tabs (5.2)              |

### 1.6 Conflicts and wording issues found

**Conflicts with Phase 0's signed strings**

- **C1 — the queue notice (B-02 against S-1).** Phase 0 signed the lead _"MedSync does not record dispensing yet."_ and
  a body that opens _"Dispense from the signed prescription as you do today."_ At a live point the lead is false and
  must be dropped (5.1, CK-1). Appendix B drops the lead **and** the first sentence of the body; 5.1 says only "the
  sentence about dispensing … is dropped; the rest stays". Proposed: B-02 as the live-point text (both sentences
  dropped, since "as you do today" is also untrue at a live point), N-1 for the no-counts case, and S-1 unchanged at
  every point that is not live. B-02 and N-1 are new strings and need signing; S-1 stays signed.
- **C2 — awaiting co-sign (B-07 against S-2).** Same situation, two wordings: signed _"Not yet co-signed. A senior has
  not signed this prescription."_ against _"Cannot be supplied yet. A senior has not signed this prescription."_ Option
  A: B-07 replaces S-2 at a live point (one new string to sign). **Option B (recommended):** keep S-2 as signed
  everywhere and add only N-3, _"Cannot be supplied yet"_, which the queue needs beside **Open** in any case (5.2).
- **C3 — the substitution note (B-14 against D-PH1-14 and 5.3.1).** Not a Phase 0 conflict, but internal: B-14 says _"A
  pharmacist may change the pack or strength …"_, while D-PH1-14 and 5.3.1 let anyone who may dispense change the pack
  at the same strength, with no reason. Signed as written, B-14 would tell a technician they may not do what the
  system lets them do. Proposed: N-4 when the substitution rule is signed, N-5 while it is unsigned (no strength
  change is offered then).
- **C4 — the override block (S-4 against 5.3).** 5.3 shows "the check, what triggered it, and the reason". The signed
  string has `{check}` and `{reasons}` only. Proposed: show the trigger as its own labelled field outside the signed
  string, so S-4 stays signed. Putting it inside the string would return S-4 to `draft`.

S-3 (not continued), S-5 (emergency notice) and S-6 (the technicians' registering body) carry into Phase 1 unchanged
and do not conflict.

**Wording issues inside Appendix B**

- **W1** B-04 names only the CSO as the lane rule's signer; D-PH1-36 names the pharmacist reviewer too (N-6).
- **W2** B-21 has "at {time}"; 5.6's quote has none. B-19 is "{number}" in Appendix B and "{no}" in 5.6. B-76 has a full
  stop in Appendix B and none in 5.12. X-9 differs in punctuation from D-PH1-06. Sign one form of each.
- **W3** B-08 and B-34 depend on knowing when the prescription was last printed. No print event exists for the
  doctor's print (Step 0 Q20, R17). Either the doctor's print starts writing an event (outside this slice's "no change
  to how a prescription is printed") or both strings stay unused, and PQ-7 stays unbuilt. Decision for GATE A.
- **W4** B-70 has no place on any screen in Section 5.
- **W5** Labels (LB-1) and section 13(4)(a) need the supplier's address; the hub holds no street address (Step 0 Q8).
  See 2.13.

### 1.7 Counts by status

| Group                                   | signed 2026-10-11 | draft   | existing, not in this sign-off |
| --------------------------------------- | ----------------- | ------- | ------------------------------ |
| 1.1 Phase 0 signed, carried             | 6                 | 0       | 0                              |
| 1.2 Appendix B                          | 0                 | 78      | 0                              |
| 1.3 New rows proposed here              | 0                 | 7       | 0                              |
| 1.4 Section 5 strings not in Appendix B | 0                 | 24      | 1                              |
| **Total**                               | **6**             | **109** | **1**                          |

By signer, Appendix B only: CSO alone 57 · CSO + PR 13 (patient strings, slips, the pharmacist's line) · CSO + PR then
2U 4 (the messages) · PR + CSO, labels 2 · PIC + CSO 1 (identity routes) · CSO, agreeing with the substitution rule 1.
Legal questions bear on 11 rows (Q2: B-47, B-49, B-52; Q3: B-48; Q5: B-31, B-32, and B-62 by agreement; Q7: B-67,
B-68, B-69; Q6 on B-41 through the labels pack).

---

## Part 2 — Sign-off packs (Appendix D), as templates

Appendix D: _"Reasons, codes and wording may be drafted for them; medicines, classes and levels may not."_ Rows
quoted from Appendix D are marked **(Appendix D)**. Rows this annex drafts are marked **(drafted here)**. Every row is
`draft`. Empty rows are left for the signers.

### 2.0 What happens while a pack is unsigned (Appendix D, verbatim)

| Pack                                                                                         | While unsigned                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| The lane rule                                                                                | Every prescription is pharmacist-first, and the queue says so                                                                                       |
| The high-risk list                                                                           | That lane reason does not fire, and the lane explainer says there is no list                                                                        |
| Controlled classes                                                                           | A medicine prescribing flags takes the full controlled path with no class named. A point cannot go live until every stocked medicine has a decision |
| The substitution rule                                                                        | No strength change is offered                                                                                                                       |
| Plain-words templates                                                                        | Labels print the directions as written                                                                                                              |
| Reason and code lists, label fields, counselling points, the witness list, staff-facing copy | A point cannot go live (RD-1)                                                                                                                       |
| Patient-facing copy, templates, the message name                                             | The patient's list and live SMS cannot be switched on (RD-4)                                                                                        |
| The availability mapping                                                                     | The stock line cannot be switched on                                                                                                                |

### 2.1 The signature block (every pack)

Stored as one row of `pharmacy_signed_sets` (D-PH1-43). Content acts only when `signed`.

| Field                                                             | Value |
| ----------------------------------------------------------------- | ----- |
| Hospital                                                          |       |
| Pack (`kind`) and version                                         |       |
| Content sha256                                                    |       |
| First signer: name, role, date, fresh second factor (yes/no)      |       |
| Second signer: name, role, date, fresh second factor (yes/no)     |       |
| Exception, in words (only where no second eligible person exists) |       |
| Author of this version (must not be the only signer)              |       |

### 2.2 Lane reasons, per hospital

- **Decision:** D-PH1-04. Rules LN-1 to LN-8.
- **Signers:** PR + CSO (clinical set).
- **Sources:** owner SQL B (STOP-REPORTS Q7), not yet returned; the stored facts from Step 0 Q7.
- **While unsigned:** every prescription is pharmacist-first (B-03); a point cannot go live.

| Reason (Appendix D)                     | The stored fact it reads (Step 0 Q7)                                                                                            | Share of last 30 days' prescriptions | On or off (D-PH1-04 recommendation, not signed) | Note                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A stop the prescriber overrode          | A check answer with outcome `stop`, or the legacy `allergy` code                                                                | awaiting owner SQL B                 | on                                              |                                                                                                                    |
| A controlled drug                       | `prescriptions.controlled`                                                                                                      | awaiting owner SQL B                 | on, always (LN-5)                               | Cannot be switched off.                                                                                            |
| The child check fired                   | Check code `child`, titled "Child" in the prescribing dialog (`lib/pharmacy/checks.ts`); SQL B also counts `paediatric_routing` | awaiting owner SQL B                 | on                                              | What the check tests is confirmed in `lib/prescribing/plan-checks.ts` before signing.                              |
| The renal check fired                   | Check code `kidney`, titled "Kidney function"                                                                                   | awaiting owner SQL B                 | on                                              | Stored only when no creatinine was on record; a renal medicine with a creatinine note leaves no trace (Step 0 Q7). |
| A medicine on the signed high-risk list | Signed data keyed to the medicine (2.3)                                                                                         | 0 until a list is signed             | on (fires only once 2.3 is signed)              | The catalogue's draft `highAlert` flag is not a source and is not on the row.                                      |
| A pre-set dose the prescriber changed   | A regimen with non-empty `edits`                                                                                                | awaiting owner SQL B                 | on                                              |                                                                                                                    |
| A typed dose with no signed reference   | A drug line with a problem and no regimen                                                                                       | awaiting owner SQL B                 | **off for now**                                 | Would catch nearly every prescription today. Turn on as signed doses grow.                                         |
| All reasons together                    | —                                                                                                                               | awaiting owner SQL B                 | —                                               |                                                                                                                    |

### 2.3 The high-risk list, per hospital

- **Decision:** D-PH1-29. **Signers:** PR + CSO. **No medicine is proposed.**
- **Sources to consult (Appendix D):** the hospital's Medicine and Therapeutics Committee; the Uganda Clinical
  Guidelines 2023; the ISMP list of high-alert medications in acute care settings; WHO's _Medication Without Harm_
  material on high-risk situations.
- **While unsigned:** that lane reason does not fire, and the explainer shows B-05.

| Medicine (catalogue id) | Why it is on the list | Source | CSO decision |
| ----------------------- | --------------------- | ------ | ------------ |
|                         |                       |        |              |

### 2.4 Controlled classes, per stocked medicine

- **Decision:** D-PH1-28, D-PH1-26; rule CD-1. **Signers:** PR + CSO. **No medicine or class is proposed.** The
  catalogue's `controlled` flag (a draft on 8 drugs, Step 0 Q6) is not a signed class and is not a source.
- **Sources:** the schedules to the National Drug Policy and Authority Act, read from the Act itself (not read for
  this prompt), and the narcotics statute in force (legal Q4).
- **While unsigned:** a medicine prescribing flags takes the full controlled path with no class named; a point cannot
  go live until every medicine it stocks has a decision, "not controlled" included.

| Medicine (catalogue id) | Controlled or not | Class and group | The schedule and entry it comes from | What the class calls for at supply | Signed |
| ----------------------- | ----------------- | --------------- | ------------------------------------ | ---------------------------------- | ------ |
|                         |                   |                 |                                      |                                    |        |

### 2.5 The witness list

- **Decision:** D-PH1-27; rule CD-2; authentication D-PH1-42 (the witness's own password and TOTP).
- **Signers:** D-PH1-36 does not name this pack. **Proposed:** PR + CSO, as it governs controlled supply. Fadhul to
  confirm.
- **While unsigned:** a point cannot go live.

| Who may witness                                                                 | Which controlled actions                                                       | Condition                                   | Source                           | Signed |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------- | ------ |
| Any holder of `pharmacy.dispense` at the hospital (drafted here, from D-PH1-27) | Supply, count, receipt, reversal, confirming a back-entered supply (5.9, DT-8) | Never the actor; authenticated (D-PH1-42)   | D-PH1-27                         |        |
| Nurses or doctors                                                               | Not proposed                                                                   | Only if the hospital's own procedure allows | The hospital's written procedure |        |

### 2.6 Outcome and close reasons

- **Decisions:** D-PH1-10, D-PH1-11, D-PH1-12; rule LO-2. **Signers:** PIC + CSO (operational). "Other" always carries
  text.
- **While unsigned:** a point cannot go live.

| List                       | Code               | Wording                                                 | Origin       | Signed |
| -------------------------- | ------------------ | ------------------------------------------------------- | ------------ | ------ |
| Not supplied               | `out_point`        | Out of stock at this dispensing point                   | Appendix D   |        |
| Not supplied               | `out_hospital`     | Out of stock in the hospital                            | Appendix D   |        |
| Not supplied               | `expired_only`     | Expired or damaged stock only                           | Appendix D   |        |
| Not supplied               | `not_stocked`      | Not stocked at this hospital                            | Appendix D   |        |
| Not supplied               | `other`            | Other (with text)                                       | Appendix D   |        |
| Closed                     | `not_collected`    | Not collected                                           | Appendix D   |        |
| Closed                     | `patient_declined` | The patient declined                                    | Appendix D   |        |
| Closed                     | `filled_elsewhere` | Filled elsewhere                                        | Appendix D   |        |
| Closed                     | `other`            | Other (with text)                                       | Appendix D   |        |
| Declined by the pharmacist | `concern_stands`   | Query answered; the concern stands                      | drafted here |        |
| Declined by the pharmacist | `no_answer`        | No answer from the prescriber; cannot supply as written | drafted here |        |
| Declined by the pharmacist | `incomplete`       | Prescription incomplete or unclear                      | drafted here |        |
| Declined by the pharmacist | `other`            | Other (with text)                                       | drafted here |        |

The patient's words for each outcome are B-61 to B-64 (CSO + PR), not this list.

### 2.7 Reversal, correction and stock reasons

- **Decisions:** D-PH1-25, D-PH1-24; rules SL-6, SL-11. **Signers:** PIC + CSO (operational). Count-difference reasons
  are not named in D-PH1-36; proposed as an adjustment-type list under the same signers.
- **While unsigned:** a point cannot go live.

| List                             | Code                 | Wording                                      | Origin       | Signed |
| -------------------------------- | -------------------- | -------------------------------------------- | ------------ | ------ |
| Reversal                         | `handed_back`        | Handed back at the window                    | Appendix D   |        |
| Reversal                         | `wrong_patient`      | Recorded against the wrong patient           | Appendix D   |        |
| Reversal                         | `entered_in_error`   | Entered in error                             | Appendix D   |        |
| Reversal                         | `other`              | Other (with text)                            | Appendix D   |        |
| Recorded in error                | `wrong_patient`      | Wrong patient                                | Appendix D   |        |
| Recorded in error                | `wrong_entry`        | Wrong medicine or quantity entered           | Appendix D   |        |
| Recorded in error                | `never_handed_over`  | Never handed over                            | Appendix D   |        |
| Recorded in error                | `other`              | Other (with text)                            | Appendix D   |        |
| Adjustment                       | `damaged`            | Damaged                                      | Appendix D   |        |
| Adjustment                       | `expired_removed`    | Expired, removed                             | Appendix D   |        |
| Adjustment                       | `lost`               | Lost                                         | Appendix D   |        |
| Adjustment                       | `found`              | Found on the shelf                           | Appendix D   |        |
| Adjustment                       | `other`              | Other (with text)                            | Appendix D   |        |
| Batch other than first to expire | `first_not_found`    | First-to-expire batch not found on the shelf | drafted here |        |
| Batch other than first to expire | `first_unfit`        | First-to-expire batch damaged or unfit       | drafted here |        |
| Batch other than first to expire | `other`              | Other (with text)                            | drafted here |        |
| Count difference                 | `supply_unrecorded`  | A supply or issue was not recorded           | drafted here |        |
| Count difference                 | `receipt_unrecorded` | A receipt was not recorded                   | drafted here |        |
| Count difference                 | `damaged`            | Damaged or broken                            | drafted here |        |
| Count difference                 | `unknown`            | Cause not known                              | drafted here |        |
| Count difference                 | `other`              | Other (with text)                            | drafted here |        |

For a controlled drug, every count difference also goes to the pharmacy in charge (B-51) and stays open until they
close it with a note (5.9).

### 2.8 Supply without a pharmacist (only if D-PH1-05 is on)

- **Decision:** D-PH1-05. **Signers:** PIC + CSO (operational). The setting itself also needs legal Q1 on record and a
  second approver; never for a controlled drug.
- **While unsigned:** the setting cannot be switched on; a pharmacist-first prescription waits for a pharmacist.
- Kept short on purpose (hazard 9: it must not become the normal way of working).

| Code                | Wording                                  | Origin       | Signed |
| ------------------- | ---------------------------------------- | ------------ | ------ |
| `no_pharmacist`     | No pharmacist on duty                    | Appendix D   |        |
| `cannot_be_reached` | The pharmacist on duty cannot be reached | drafted here |        |
| `other`             | Other (with text)                        | drafted here |        |

### 2.9 Payment exemption reasons (only if the hospital uses payment status)

- **Decision:** D-PH1-20. **Signers:** PIC + CSO (operational). Source: the hospital's own exemption policy. Nothing
  drafted: Appendix D proposes no rows.
- **While unsigned:** "Exempt" cannot be chosen at a hospital that uses payment status. **Emergency** is never held.

| Code | Wording | Source (hospital policy reference) | Signed |
| ---- | ------- | ---------------------------------- | ------ |
|      |         |                                    |        |

### 2.10 Identity routes

- **Decision:** D-PH1-16 (the rule itself is the CSO's). **Signers of the list:** PIC + CSO (operational).
- Each route stands in for the second identifier, is stored with the supplier's name, listed for the pharmacy in
  charge and counted. Nobody is turned away for lacking a document.
- **While unsigned:** a point cannot go live.

| Code         | Wording (Appendix B, B-40)                                   | Signed |
| ------------ | ------------------------------------------------------------ | ------ |
| `card_shown` | The card or prescription with the patient's number was shown |        |
| `known`      | Known to staff                                               |        |
| `other`      | Other (with a note)                                          |        |

### 2.11 Query codes, keep reasons and withdraw reasons

- **Decisions:** D-PH1-07, D-PH1-08, D-PH1-09. **Signers:** PR + CSO (query codes are a clinical set). "Other" always
  carries text.
- **While unsigned:** a point cannot go live.

| List                                  | Code                 | Wording                            | Origin       | Signed |
| ------------------------------------- | -------------------- | ---------------------------------- | ------------ | ------ |
| Type of problem                       | `allergy`            | Allergy                            | Appendix D   |        |
| Type of problem                       | `dose`               | Dose unclear or unusual            | Appendix D   |        |
| Type of problem                       | `duplicate`          | Duplicate                          | Appendix D   |        |
| Type of problem                       | `renal`              | Renal function                     | Appendix D   |        |
| Type of problem                       | `not_available`      | Not available, alternative needed  | Appendix D   |        |
| Type of problem                       | `other`              | Other (with text)                  | Appendix D   |        |
| The prescriber's reason for keeping   | `intended`           | Intended as written                | drafted here |        |
| The prescriber's reason for keeping   | `senior_advice`      | A senior or specialist advised it  | drafted here |        |
| The prescriber's reason for keeping   | `discussed`          | Already discussed with the patient | drafted here |        |
| The prescriber's reason for keeping   | `other`              | Other (with text)                  | drafted here |        |
| The pharmacy's reason for withdrawing | `answered_otherwise` | Answered another way               | Appendix D   |        |
| The pharmacy's reason for withdrawing | `unreachable`        | Prescriber could not be reached    | Appendix D   |        |
| The pharmacy's reason for withdrawing | `sent_in_error`      | Sent in error                      | Appendix D   |        |
| The pharmacy's reason for withdrawing | `other`              | Other (with text)                  | Appendix D   |        |

### 2.12 The substitution rule

- **Decision:** D-PH1-14. **Signers:** PR + CSO. The note on screen (N-4 or N-5) must agree with what is signed here.
- **While unsigned:** no strength change is offered.

**Paragraph for signature (drafted here, from D-PH1-14):**

> A different pack of the same medicine, form and strength may be supplied by anyone who may dispense, with no reason.
> A different strength may be supplied only by a pharmacist, only when the dose and the form the patient takes stay the
> same, with a coded reason and the pharmacist's own typed line on how to take it. That line is printed on the label
> and the patient's list as the pharmacist's, under the prescribed directions, and the prescriber is informed. MedSync
> converts nothing. Any other change returns to the prescriber.

**The cautious alternative:** no strength change in this slice.

| Forms where a strength change is never allowed (no form proposed) | Signed |
| ----------------------------------------------------------------- | ------ |
|                                                                   |        |

| Coded reason for a strength change | Wording                              | Origin       | Signed |
| ---------------------------------- | ------------------------------------ | ------------ | ------ |
| `strength_not_stocked`             | Prescribed strength not stocked here | drafted here |        |
| `strength_out`                     | Prescribed strength out of stock     | drafted here |        |
| `other`                            | Other (with text)                    | drafted here |        |

### 2.13 Labels

- **Decisions:** D-PH1-17, D-PH1-18; rules LB-1 to LB-4. **Signers:** PR + CSO. Legal Q6 decides the required
  particulars.
- **Starting points, neither of them a legal reading (Appendix D):** section 13(4)(a) of the National Drug Policy and
  Authority Act, as read for the prompt, calls for a supplied restricted drug to be labelled with the supplier's name
  and address; a dispensing procedure dated November 2023 and hosted by Joint Medical Store lists the patient's name,
  the facility's name, the generic name, strength, quantity, dose and duration. The Ministry's manual, chapter 8, is the
  authority; it was not read for the prompt.
- **Gap (W5):** the hub holds the hospital's `district` and `emergency_phone`, no street address (Step 0 Q8). If the
  address is required, a hub field is needed before a label can carry it.
- **While unsigned:** a point cannot go live.

**Fields and their order** (the proposal in 5.6, for signature; reorder freely):

| Order | Field                                                       | Source in MedSync                      | Required by (to be filled from Q6) | Signed |
| ----- | ----------------------------------------------------------- | -------------------------------------- | ---------------------------------- | ------ |
| 1     | Patient's name                                              | Patient record                         |                                    |        |
| 2     | Medicine by generic name, form and strength as supplied     | Product on the supply                  |                                    |        |
| 3     | Directions as written                                       | The prescription, byte for byte (LB-2) |                                    |        |
| 4     | The pharmacist's line, marked "From the pharmacist", if any | The supply (B-15)                      |                                    |        |
| 5     | Quantity                                                    | The supply                             |                                    |        |
| 6     | Batch and expiry                                            | The batch on the supply                |                                    |        |
| 7     | Date                                                        | The supply                             |                                    |        |
| 8     | Dispensing point, hospital and its address                  | Hub (address: none held today)         |                                    |        |
| 9     | The signed warning lines                                    | This pack                              |                                    |        |
| 10    | Additional instructions chosen from the signed list         | This pack                              |                                    |        |

| Warning lines                      | Origin            | Signed |
| ---------------------------------- | ----------------- | ------ |
| Keep out of the reach of children. | Appendix B (B-41) |        |

| Additional instructions (none proposed; the list is clinical) | Signed |
| ------------------------------------------------------------- | ------ |
|                                                               |        |

| Dispensing point | Label mode (printed / written by hand) | Label size | Set by | Signed |
| ---------------- | -------------------------------------- | ---------- | ------ | ------ |
|                  |                                        |            |        |        |

### 2.14 Plain-words templates

- **Decision:** D-PH1-18; rule LB-2. **Signers:** PR + CSO. None ship.
- Only Plan lines carry structured parts (a frequency code and a course code); EMR-sheet lines are free text and never
  get plain words (Step 0 Q3).
- **While unsigned:** labels print the directions as written.

| The structured pattern | The words | Languages | Signed |
| ---------------------- | --------- | --------- | ------ |
|                        |           |           |        |

### 2.15 Counselling points and languages

- **Decision:** D-PH1-19. **Signers:** PR + CSO. Recorded as ticked; never required to hand over.
- **While unsigned:** a point cannot go live.

| Point (Appendix D)                                 | Signed |
| -------------------------------------------------- | ------ |
| What each medicine is for                          |        |
| How and when to take it                            |        |
| What to do about a missed dose                     |        |
| Side effects to come back for                      |        |
| The medicine to buy outside and where the paper is |        |

| Language (set by the hospital) | Signed |
| ------------------------------ | ------ |
|                                |        |

### 2.16 The availability mapping

- **Decision:** D-PH1-22 (CSO). D-PH1-36 does not name this pack; the CSO signs, as D-PH1-22 says. Storage: D-PH1-44.
- **While unsigned:** the stock line cannot be switched on; the prescriber keeps seeing "Pharmacy not linked yet."
- The prescriber never sees a quantity. No state is ever a Stop. Placing always works.

| Stock state                       | Proposed level (D-PH1-22) | Prescriber's choices at a Check               | Wording | Signed |
| --------------------------------- | ------------------------- | --------------------------------------------- | ------- | ------ |
| On the shelf                      | Note                      | —                                             | B-54    |        |
| Low                               | Note                      | —                                             | B-55    |        |
| Not counted                       | Note                      | —                                             | B-58    |        |
| Not on the shelf                  | Check                     | Aware; prescribe anyway · Pick something else | B-56    |        |
| Not stocked                       | Check                     | Aware; prescribe anyway · Pick something else | B-57    |        |
| No live point serving the patient | unchanged                 | —                                             | X-25    |        |

A Check answer is stored in `check_answers` with the prescriber's reason (0088's CHECK holds). Every answer shown is
also kept in `pharmacy_stock_answers`.

### 2.17 The hospital's message name

- **Decision:** D-PH1-39. **Signers:** CSO + PR (patient-facing). Used by B-67, B-68, B-69.
- **While unsigned:** the patient's list and live SMS cannot be switched on (RD-4).

| Hospital | Message name | Why it reveals no condition | Signed |
| -------- | ------------ | --------------------------- | ------ |
|          |              |                             |        |

### 2.18 The dispensing log's columns (HMIS 016)

- **Decision:** DL-1. **Signer:** PIC alone (an operational setting, D-PH1-36).
- **The columns were not read for the prompt.** The pharmacy in charge copies the headings from the hospital's current
  HMIS 016 book, in order. The 2010 HMIS manual names form 016 the "Prescription and Dispensing Log"; the 2023 EMHS
  manual (s. 8.5) calls it the "Daily Dispensing Log". Confirm the current name and columns against the book in use.
- **While unconfirmed:** the printed log carries B-77 at the top.

| Position | Column heading, as in the hospital's book | The MedSync fact it maps to | MedSync cannot fill it (yes/no) |
| -------- | ----------------------------------------- | --------------------------- | ------------------------------- |
|          |                                           |                             |                                 |

### 2.19 Operational figures (not signed by the CSO)

- **Decision:** D-PH1-23. **Set by:** PIC alone. Operational, not clinical. No figure is proposed.
- **While unset:** a medicine is never "low" (X-15), a count never goes stale, and the Stock page's expiring figure
  uses no look-ahead.

| Dispensing point | Medicine (catalogue id) | Reorder level (issue units) | Set by | Date |
| ---------------- | ----------------------- | --------------------------- | ------ | ---- |
|                  |                         |                             |        |      |

| Dispensing point | Count freshness (days) | Set by | Date |
| ---------------- | ---------------------- | ------ | ---- |
|                  |                        |        |      |

| Hospital | Expiry look-ahead (days) | Set by | Date |
| -------- | ------------------------ | ------ | ---- |
|          |                          |        |      |

---

## Part 3 — The legal sheet (Appendix E)

**GATE A cannot be signed until questions 1 to 6 each have an interim written answer on record: a document reference,
who gave it, and the date.** The same answers are RD-1's second condition before any point goes live. Question 7 gates
live SMS. Question 8 gates nothing; until it is answered, nothing is deleted.

**As of 12 Oct 2026 no question has an interim answer on record.** None is assumed below. "What the build does" shows
what changes with each possible answer, so the lawyer's answer can be applied without redesign.

### 3.1 The record (stored in `pharmacy_legal_answers`)

| Q   | Gates                   | Interim answer on record | Document reference | Given by (name, role) | Date | Interim or final |
| --- | ----------------------- | ------------------------ | ------------------ | --------------------- | ---- | ---------------- |
| 1   | GATE A; go-live; map v2 | **None**                 |                    |                       |      |                  |
| 2   | GATE A; go-live         | **None**                 |                    |                       |      |                  |
| 3   | GATE A; go-live         | **None**                 |                    |                       |      |                  |
| 4   | GATE A; go-live         | **None**                 |                    |                       |      |                  |
| 5   | GATE A; go-live         | **None**                 |                    |                       |      |                  |
| 6   | GATE A; go-live         | **None**                 |                    |                       |      |                  |
| 7   | Live SMS                | **None**                 |                    |                       |      |                  |
| 8   | Nothing; no deletion    | **None**                 |                    |                       |      |                  |

### 3.2 Each question

**Q1. Who may review and who may dispense in a hospital pharmacy: a pharmacist, a pharmacy technician, other staff;
and whether a dispensing point needs a pharmacist in charge. Which body registers pharmacy technicians. Whether
hospital staff supply under an order of the National Drug Authority (section 13(2)(c)), and what that order says.**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer, in writing, citing the instrument; where the answer rests on the National Drug
  Authority's order or the Pharmacy Board of Uganda's rules, the document from that body.
- **What the build does, by answer:**
  - _Technicians may dispense:_ PHARMACY*TECH holds `pharmacy.dispense` with the conditions of Appendix A (Part 4).
    \_They may not:* PHARMACY_TECH keeps `view` and `stock` only; a technician cannot record a hand-over and every
    supply needs a pharmacist.
  - _Only a pharmacist may supply without a pharmacist's review:_ D-PH1-05 can never be switched on; the server refuses
    the setting. _Others may, under conditions:_ the setting may be offered, still with a second approver and never for
    a controlled drug.
  - _A point needs a pharmacist in charge:_ RD-1 condition 6 checks that the named in-charge's cadre is PHARMACIST, and
    a technician never receives `pharmacy.manage` through a hub assignment. _It does not:_ a technician in charge may
    hold `pharmacy.manage` while assigned.
  - _Registering body:_ the written source is recorded beside S-6 (the CSO's confirmation of the Pharmacy Board of
    Uganda, given without a source).
  - _Hospital staff supply under an order (s. 13(2)(c)):_ the order's reference is recorded on the hospital's settings,
    and its terms are checked against Appendix A before the map is signed.
  - _Until answered:_ the permission map v2 cannot be signed (D-PH1-03); v1 stays in force (view only), so nobody can
    record a supply.

**Q2. Whether an electronic record can serve as the Prescription Book (section 13(4)(b)) or the Classified Drugs Book
(section 24), and how section 20(4)(b) (supply from the dispensing department of an approved institution, under the
Minister's regulations) applies to a hospital pharmacy. Which regulations exist.**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer; the regulations themselves, if any exist.
- **What the build does, by answer:**
  - _Either way:_ MedSync's record is never called the Prescription Book, the Classified Drugs Book or the register in
    this slice. B-47 and B-49 keep the paper, and the register slip says it is not the register (B-52).
  - _An electronic record cannot serve:_ B-47, B-49 and B-52 stand as written; both paper ticks stay required.
    _It can:_ nothing changes in this slice; replacing the paper would be a separate decision and ADR.
  - _Section 20(4)(b) applies to this hospital's dispensing department:_ the s. 20(1)–(2) particulars may not bind the
    hospital's own supply; that bears on Q3 and the wording of B-48. _It does not:_ Q3's answer governs as asked.

**Q3. Whether an electronic prescription satisfies section 20(2) for Class A and Class B Group I drugs ("indelible
writing, dated and signed").**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer.
- **What the build does, by answer:**
  - _It does not satisfy s. 20(2):_ a controlled supply requires the signed paper prescription. B-48 is a required tick
    and **Record supply** stays off without it (already the design). A prescription written only in MedSync cannot be
    supplied as a controlled drug until the paper exists.
  - _It does:_ the tick stays in this slice; removing it is a later decision.
  - _Either way:_ the slip to fill elsewhere never carries a controlled drug (B-37, B-53, LB-5).

**Q4. Which narcotics statute is in force beside the Act, and what it adds for a hospital pharmacy.**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer, including whether the Narcotic Drugs and Psychotropic Substances (Control) Act,
  2024 has commenced (the statutory instrument, if any).
- **What the build does, by answer:**
  - It names the source the controlled-classes pack (2.4) is read from: the Act's schedules, the 2024 Act's, or both.
  - _If the 2024 Act has commenced:_ as read for the prompt (not a legal reading), s. 7(2) has a pharmacist supply a
    narcotic drug only where a medical practitioner prescribed it. The build would then check the prescriber's cadre
    on a controlled line before supply, and a technician could never supply one (already the case: no
    `pharmacy.controlled`). Its s. 14(2) record period feeds Q8.
  - _Until answered:_ the controlled-classes pack cannot be signed, so no point can go live.

**Q5. Whether a not-supplied slip that goes with the patient's signed prescription lets another pharmacy supply the
rest; what the slip may and may not say; and who keeps the original when a prescription is only partly dispensed
(sections 20(3) and 21(b)).**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer.
- **What the build does, by answer:**
  - _The slip with the signed prescription is enough:_ the slip prints D-PH1-13's line (B-32) and B-31 to B-37 as
    signed.
  - _It is not:_ the prescriber-signed alternative. The slip carries a signature box and goes back to the prescriber
    before the patient leaves; "The patient buys it outside" then routes through a query, and B-32 and B-62 are
    re-worded.
  - _The hospital must keep the original when partly dispensed:_ the patient cannot carry the signed prescription, so
    B-32 and B-62 change, and the prescriber-signed alternative is the only route.
  - _What the slip may not say:_ removed from B-31 to B-37 before signing.

**Q6. What particulars a dispensed medicine's label must carry (sections 13(4)(a) and 25 refer to "prescribed
particulars"; the instrument was not found).**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer, citing the instrument that prescribes the particulars, or confirming none exists.
- **What the build does, by answer:** it fills the "Required by" column of the labels pack (2.13) and fixes LB-1's
  fields and order. If the supplier's address is required (s. 13(4)(a) as read), a hub address field is added before
  any label prints (W5). Until answered, the labels pack cannot be signed, so no point can go live.

**Q7. The basis under the Data Protection and Privacy Act 2019 for sending a patient an SMS about their medicines, and
what consent it needs.**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer.
- **What the build does, by answer:** until answered, live SMS stays off at every hospital (RD-4) and B-71 shows. If
  consent is required, a send checks `consent_records` (`sms_communication`, not revoked) and `sms_opt_outs` first;
  the answer fixes which. The in-app list behind sign-in is not gated by Q7.

**Q8. How long MedSync must keep supply records.**

- **Interim answer on record:** none.
- **Who must give it:** the lawyer.
- **What the build does, by answer:** nothing is deleted, whatever the answer; no retention job is built in this slice.
  The sources give periods as read for the prompt (two years for a fully dispensed prescription, s. 21(b); seven years
  for records under the 2024 Act, s. 14(2), if it has commenced). The answer sets the minimum a later slice must keep.

### 3.3 Sources checked (Appendix E, 11 Oct 2026; re-verify at build time)

Reproduced from Appendix E, with its caveats. **None of these summaries is a legal reading.**

- **National Drug Policy and Authority Act,** consolidated text at 31 Dec 2023 on ULII. Read through an automated
  extract of the first 100,000 of about 111,000 characters; **the schedules were not read.** As numbered there: only a
  registered pharmacist, medical practitioner, dentist, veterinary surgeon or licensed person may supply or dispense a
  restricted drug (s. 13(1)), with an exception for hospital staff acting under an order of the Drug Authority (s.
  13(2)(c)); a supplied restricted drug is labelled with the supplier's name and address (s. 13(4)(a)); the
  Prescription Book is written up within twenty-four hours of supply (s. 13(4)(b)); a Class A or Class B Group I drug
  is supplied only on a prescription that is in indelible writing, dated and signed, names the prescriber and the
  patient with their addresses, and gives the total amount and the dose (s. 20(1), (2)); that rule does not apply to
  supply from the dispensing department of an approved institution under the Minister's regulations (s. 20(4)(b)); a
  fully dispensed prescription is kept on the premises for two years (s. 21(b)); before supplying a Class A, B or C
  Group II drug the supplier enters it in the Classified Drugs Book, with the signature of the person it is delivered
  to (s. 24(1), (2)). **This is a summary of what the text says, not a legal reading**, and how these sections apply
  inside a hospital is question 2. https://ulii.org/en/akn/ug/act/statute/1993/13/eng@2023-12-31
- **Narcotic Drugs and Psychotropic Substances (Control) Act, 2024** (Act 2 of 2024), ULII text dated 23 Feb 2024,
  read the same way. It comes into force on a date the Minister appoints by statutory instrument (s. 1); **whether it
  has commenced was not confirmed.** A pharmacist supplies a narcotic drug or psychotropic substance only where a
  medical practitioner has prescribed it (s. 7(2)). Records the Authority prescribes are kept by a licensee for seven
  years (s. 14(2)). It repeals sections 47 to 49 of the National Drug Policy and Authority Act (s. 86).
  https://ulii.org/en/akn/ug/act/2024/2/eng@2024-02-23
- **Essential Medicines and Health Supplies Management Manual, July 2023,** Ministry of Health. The contents were read:
  chapter 7 Requisitioning and Issuing Supplies; chapter 8 Dispensing Medicines, with the Daily Dispensing Log (HMIS 016) at section 8.5; chapter 13 Management of Narcotic Drugs and Psychotropic Substances, with Class A drugs at 13.2
  and storage, issue and dispensing at 13.3 to 13.4; section 18.4, the Expired or Spoiled Medicines Register.
  **Chapters 8 and 13 themselves were not read**: the copy reached was cut short. The pharmacy in charge supplies them
  at Step 1.
  https://guluhospital.net/wp-content/uploads/2023/10/2023-EMHS-Manual_MASTER_COPY_31st-July-2023.pdf
- **HMIS Health Unit Procedure Manual, volume 1, August 2010,** list of forms: Stock Card (HMIS 015), Prescription and
  Dispensing Log (HMIS 016), Requisition and Issue Voucher (HMIS 017), Stock Book (HMIS 083), Discrepancy Report (HMIS
  087), Expired or Spoiled Medicines Register (HMIS 088). These are the 2010 numbers and the 2010 name for form 016;
  **the columns were not read.** Confirm each against the hospital's current books.
- **A dispensing procedure dated 25 Nov 2023, hosted by Joint Medical Store;** its issuer is not named. It lists the
  label fields quoted in Appendix D and the points a patient is told. **A starting point for the label pack, not an
  authority.** https://jms.co.ug/wp-content/uploads/2026/05/13.-PROCEDURE-FOR-DISPENSING-MEDICINES.pdf
- **Carried from Phase 0:** the Pharmacy and Drugs Act (the Pharmacy Board and its registrar; the text read does not
  mention pharmacy technicians); the Ministry of Health's letter of 18 Sept 2026 on licensing powers; section 14(1)(b)
  of the National Drug Policy and Authority Act on a pharmacist's supervision of a licensed retail business.
- **Not verified:** the dispensing chapter's procedure and label requirements; the columns of HMIS 016; the Ministry's
  rules for Class A drugs in a hospital; any guidance on electronic prescriptions or registers; the registering body
  and scope of pharmacy technicians.

---

## Part 4 — The permission map, version 2 (Appendix A), draft

**Not signable before legal question 1 has a written answer** (D-PH1-03). Until then
`data/pharmacy/permission-map.v1.json` (signed 10 Oct 2026, view only) stays in force. Signers: the CSO, with the
legal answer on record. This block is a proposal for review; the file is written at Step 2 only after signature.

```json
{
  "map": "medsync.pharmacy-permission-map",
  "version": "2.0.0",
  "status": "draft",
  "signedBy": null,
  "signedOn": null,
  "basis": "Pharmacy Phase 1 GATE A (PROMPT-PHARMACY-PHASE-1.md Appendix A, Section 8; D-PH1-03, D-PH1-05, D-PH1-27); supersedes v1.0.0 on signature",
  "notes": [
    "Not signable before legal question 1 (Appendix E) has a written answer on record in pharmacy_legal_answers. Until then v1.0.0 stays in force.",
    "Cadre codes are the Pharmacy Board cadres seeded in 0009. A cadre not listed here, pharmacy interns included, holds no pharmacy permission until Fadhul adds a row (roadmap D-PH-10).",
    "PHARMACY_TECH holds pharmacy.dispense only for: standard-lane prescriptions; pharmacist-first lines a pharmacist has accepted; and, only where the D-PH1-05 hospital setting is on, a pharmacist-first prescription with a reason from the signed list, which then goes on the look-back list. Never a controlled line. The scope is enforced by the supply engine, not by this map.",
    "Any holder of pharmacy.dispense at the hospital may witness a controlled action (D-PH1-27, CD-2), never as the actor, authenticated with their own second factor (D-PH1-42). A pharmacy technician may therefore witness but holds no pharmacy.controlled.",
    "pharmacy.manage is never granted by cadre. It comes only from a hub assignment: a department_heads row (substantive or acting, effective-dated) on the Pharmacy department (Head of Pharmacy) or on a dispensing point's unit (that point's in-charge), and lasts while the assignment does. A pharmacy technician receives it only if the answer to legal question 1 allows a technician in charge.",
    "A pharmacy technician is never shown, recorded or printed as a pharmacist. The technician's registering body (the Pharmacy Board of Uganda) was confirmed by the CSO on 2026-10-11; legal question 1 asks for the written source.",
    "Outside this map: doctors and clinical officers answer queries with the prescribing permission they already hold; nurses and midwives read the review state of inpatient lines and may be the named collector where D-PH1-02 is on; the hospital admin holds the go-live page and pharmacy settings, with no PHI; a superadmin has no pharmacy access without break-glass."
  ],
  "permissions": [
    "pharmacy.view",
    "pharmacy.review",
    "pharmacy.dispense",
    "pharmacy.stock",
    "pharmacy.controlled",
    "pharmacy.manage"
  ],
  "cadres": {
    "PHARMACIST": [
      "pharmacy.view",
      "pharmacy.review",
      "pharmacy.dispense",
      "pharmacy.stock",
      "pharmacy.controlled"
    ],
    "PHARMACY_TECH": ["pharmacy.view", "pharmacy.dispense", "pharmacy.stock"]
  }
}
```

**What legal question 1 can change in this block:** if technicians may not dispense, `pharmacy.dispense` comes out of
PHARMACY_TECH (and with it the may-witness note); if a point needs a pharmacist in charge, the `pharmacy.manage` note
loses its technician clause; if a pharmacist-only rule covers all supply without review, the D-PH1-05 clause goes.
