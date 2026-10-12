# Pharmacy Phase 1 — GATE A proposal

Prompt: [PROMPT-PHARMACY-PHASE-1.md](PROMPT-PHARMACY-PHASE-1.md), Step 1. Step 0: [STOP-REPORTS.md](STOP-REPORTS.md).
Design choices common to every GATE A document: [gate-a-brief.md](gate-a-brief.md).

**Status: signed by the CSO on 12 Oct 2026 (§14); 7 rows provisional pending legal answers.** Documents only; no product code changes at this step.

| Part                                                                  | Where                                        |
| --------------------------------------------------------------------- | -------------------------------------------- |
| Annotated wireframes of every screen in Section 5, as built           | [gate-a-wireframes.md](gate-a-wireframes.md) |
| Appendix B strings with status · the sign-off packs · the legal sheet | [gate-a-content.md](gate-a-content.md)       |
| The hazard log                                                        | [hazard-log.md](hazard-log.md)               |
| Everything else (this file)                                           | §1–§14 below                                 |

**Before this can be signed, three things must be on record:**

1. **The pharmacist reviewer's name** (roadmap D-PH-13). Not given yet.
2. **An interim written answer to legal questions 1 to 6** (Appendix E): for each, a document reference, who gave
   it and the date. None is on record. See [the legal sheet](gate-a-content.md).
3. **The CSO's decision on every row of §14**, and the pharmacist reviewer's on the rows D-PH1-36 gives them.

Q7's counts (owner SQL B in the STOP 0 report) are not back yet. §4 shows where they go.

---

## 1. What changes from the prompt, and why

Step 0 found eight places where the repo cannot do what the prompt assumes. Each becomes a decision for signature
(D-PH1-41 to 48, §14). The rest of the prompt stands as written.

| #        | The prompt assumes                                                                                 | Step 0 found                                                                                 | Proposed             |
| -------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------- | -------------------- |
| D-PH1-41 | The prescriber can "Change the prescription" and "Stop this medicine" through **existing** actions | No prescriber action changes or cancels a placed line (Q4)                                   | Approved 12 Oct 2026 |
| D-PH1-42 | A witness proves who they are "through the mechanism Step 0 finds"                                 | No mechanism exists. The resus witness is a typed name (Q9)                                  | Approved 12 Oct 2026 |
| D-PH1-43 | Signed sets go "through the signed-reference mechanism if it can hold them"                        | It cannot: signed references are files signed by a commit, with one signer (Q12)             | Approved 12 Oct 2026 |
| D-PH1-44 | The stock answer is stored "through the existing check store"                                      | The store keeps only Stop and Check answers, each with a reason (Q5)                         | Approved 12 Oct 2026 |
| D-PH1-45 | "A viewer assigned to several points chooses one"                                                  | The scope reads one affiliation (Q8)                                                         | Approved 12 Oct 2026 |
| D-PH1-46 | Downtime is generalised from the lab's module (DT-1)                                               | Lab Phase 1 merged on 12 Oct; its sheet numbers are lab-shaped (one report per number) (Q19) | Approved 12 Oct 2026 |
| D-PH1-47 | Queries use "the existing PHI-free per-user channel, if Step 0 finds one"                          | `user:<id>` arrived with lab Phase 1 (0106)                                                  | Approved 12 Oct 2026 |
| D-PH1-48 | Templates go "in the existing template store"                                                      | The only store is `ncd_sms_template`, with NCD purposes only (Q11)                           | Approved 12 Oct 2026 |
| D-PH1-49 | Print events for "changed since printing"                                                          | §1 W3: `prescription_print_events` written by the doctor's print page                        | CSO                  | Approved 12 Oct 2026 |

**Also from Step 0, not decisions:**

- No prescription carries a structured quantity (Q3). Every supply quantity is typed (SU-6, D-PH1-15).
- A refill date can come only from "days covered" typed by the dispenser, or from a course code with a full
  supply (ML-3).
- There is no per-point phone and no street address in the hub (Q8). The go-live page sets the point's phone
  (Section 7). Until then "Call the pharmacy" is absent and the slip's verification line prints the hospital's
  `emergency_phone`. Labels print the hospital name and district until an address field exists. The address is a
  hub change outside this slice; LB-1's fields go to the CSO with this gap named.
- No signed high-risk list exists, so that lane reason cannot fire until a list is signed (D-PH1-29).
- The lane reason "renal check" fires only where the prescriber was asked: with a creatinine on record the check is
  a Note and is not stored (Q7).

**Found while drawing the screens** ([gate-a-wireframes.md](gate-a-wireframes.md), last section):

| #   | Gap                                                                                                     | Proposed                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | No per-point phone. "Call the pharmacy", the slip's verification line and two patient messages need one | The point's phone is set on the go-live page and becomes part of RD-1 condition 6 ("an in-charge named **and a phone set** for the point"). Messages and the slip are never sent or printed without it                                                                                                                                                      |
| W2  | No street address. Label and slip ask for one                                                           | Both print the hospital name and district. The address field is a hub change outside this slice; LB-1 goes to the CSO with the gap named (legal Q6)                                                                                                                                                                                                         |
| W3  | "Changed since printing" needs a record of when the doctor printed. None exists (Q20)                   | **D-PH1-49:** the doctor's prescription print page writes one `prescription_print_events` row per line on `beforeprint`. The paper does not change. Without it, the chip is not built and CD-8's attestation still asks that the paper matches the screen. The same page still prints cancelled and completed lines (R17); a fix is reported, not made here |
| W4  | No strength on the catalogue; a "different strength" cannot be listed                                   | D-PH1-14 becomes, in effect, **no strength change** until a signed mapping between catalogue ids exists. Same-strength pack changes are unaffected                                                                                                                                                                                                          |
| W5  | No presence signal                                                                                      | "Supply without a pharmacist" relies on its reason and the look-back list (5.3)                                                                                                                                                                                                                                                                             |
| W6  | The nurse chip mounts on `MarGrid`, whose prescription-linked rows nothing writes yet                   | The chip is built and shows wherever a linked row exists; the seam is recorded (D-PH1-33)                                                                                                                                                                                                                                                                   |
| W7  | The patient list is one `self_medications` row per prescription                                         | One entry per line. A later supply of the rest updates nothing in the patient's own row; "{n} given" is read from supplies. "Not given today" is read from line events, never written as a medicine to take                                                                                                                                                 |
| W8  | No patient contact route                                                                                | "Ask about my medicines" is absent                                                                                                                                                                                                                                                                                                                          |
| W9  | Two co-sign wordings                                                                                    | Use Phase 0's signed text ("Not yet co-signed. A senior has not signed this prescription.") and add "Cannot be supplied yet." as a new draft lead                                                                                                                                                                                                           |
| W10 | The stock "detail panel"                                                                                | A page of its own, not a side panel (ADR 0161)                                                                                                                                                                                                                                                                                                              |
| W11 | Every quantity is typed                                                                                 | The ≤ 8 interactions budget counts one typed quantity per line (Section 4 allows it)                                                                                                                                                                                                                                                                        |

**Found while writing the hazard log** ([hazard-log.md](hazard-log.md), last section):

| #   | Gap                                                                                                                                                                                            | Proposed                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Visit close sets `completed` on the lines the prescriber chose **not** to continue (`stopRxIds`, `lib/emr/write/encounter.ts:251-275`); Phase 0 shows them as "Not continued at home" (signed) | For the pharmacy a `completed` line is not to be supplied: it takes the closed outcome `cancelled_by_prescriber`, reason "not continued at visit close". Lines continued at close stay `active`. LO-1, LN-2 and SU-2 read it that way (HZ-PH1-47) |
| H2  | Strength is not part of the medicine key; "a product of the prescribed medicine" does not prove strength                                                                                       | `pharmacy_products.strength` (text, as on the pack), shown beside the prescribed strength as written. The supplier confirms the match; a mismatch can go only through SU-8, which W4 makes unavailable for now                                    |
| H3  | A unique (line, version) index would refuse a split (S38) and a later supply of what was owed (S40)                                                                                            | No such index. Under the per-line lock the guard is: no live supply on a line whose outcome is `supplied` or another closed outcome, and the quantity supplied never exceeds a recorded quantity left to supply. Corrects STOP 0 item 4's wording |
| H4  | A change made outside a query loses the old → new link                                                                                                                                         | `cancelPrescriptionLine` takes an optional "replaced by" line, kept on `prescription_cancellations.replaced_by`. The queue groups by it with or without a query                                                                                   |
| H5  | Attempt limits reset with each new hand-over or action                                                                                                                                         | Identity: five wrong attempts per patient per hospital-local day close the typed check for that patient until the in-charge reopens it. Attestation: five failures per witness account per hour lock that account's attestations                  |
| H6  | A used sheet never named in a downtime record stays `unused` and unseen                                                                                                                        | Reserved sheets still `unused` after 7 days are listed for the in-charge to name or void                                                                                                                                                          |
| H7  | Stopping an admission medicine leaves its prescription active (STOP 0, 11a)                                                                                                                    | A prerequisite: fixed in prescribing before any hospital switches individual inpatient supply on (D-PH1-02)                                                                                                                                       |
| H8  | The stock-answer snapshot could fail the placement (Law 10)                                                                                                                                    | `pharmacy_stock_answers` is written in its own savepoint; a failure is logged and the prescription is placed                                                                                                                                      |

**Found while listing the strings** ([gate-a-content.md](gate-a-content.md), Part 1):

- **C1, the queue notice:** at a live point both of Phase 0's opening sentences go ("does not record dispensing
  yet" and "as you do today"). The signed notice stays unchanged at points that are not live.
- **C2, the co-sign caution:** keep the signed text and add "Cannot be supplied yet." as a new draft lead.
- **C3, the substitution note:** as written in Appendix B it tells a technician they cannot change a pack. Two
  replacements are drafted, one for while the substitution rule is unsigned and one for after.
- **C4, the override block:** the trigger is shown as its own field, so the signed string stays signed.
- **Count:** 115 strings in all, 6 signed in Phase 0 and 109 draft.

---

## 2. Access

- **Permission map, version 2** (Appendix A; draft JSON in [gate-a-content.md](gate-a-content.md), Part 4):
  - Pharmacist: view, review, dispense, stock, controlled.
  - Pharmacy technician: view, dispense, stock.
  - Technician scope: dispense covers only standard-lane prescriptions and lines a pharmacist accepted
    (D-PH1-05 widens it). A technician may witness if the signed witness list says so.
  - **Not signable before legal question 1 has a written answer** (D-PH1-03).
- **Where it is derived:** permissions stay derived from the approved cadre, as in Phase 0 (`lib/pharmacy/access.ts`
  reads the map). Granting is the 0098 trigger's `pharmacy_staff` row, inside the approval transaction.
  - Version 2 changes the map file, not the trigger.
  - A backfill is not needed for v2: existing pharmacy staff already hold the carrier, and their new
    permissions follow their cadre the moment the signed v2 is in force.
  - The backfill script from Phase 0 is re-run as a dry run to prove nobody is missing the carrier.
- **`pharmacy.manage`** (PA2-3) is held while the person has an open `department_heads` row on the Pharmacy
  department or on a dispensing point's unit, and a pharmacy-cadre affiliation at that hospital.
  - It lapses when the row ends.
  - A trigger on `department_heads` writes the grant and lapse to `audit_log`, as 0098 does for affiliations.
  - If legal question 1 says an in-charge must be a pharmacist, a technician's head row does not grant `manage`,
    and the go-live page says why.
- **In the database:** one SQL helper, `private.pharmacy_can(p_perm text, p_hospital uuid)`, mirrors the signed map
  for RLS. It is generated from the same JSON and a test proves the two agree for every cadre × permission (as
  Phase 0 tested the read narrowing).
- **The acting point (D-PH1-45):**
  - Each write checks that the point belongs to the hospital and to one of the viewer's affiliations.
  - Each write also checks that the point is live where the action needs it (PA2-4).
  - Every event stores the point.
- **Revocation (PA2-7):** the 0098 trigger already removes the carrier in the transaction that ends the
  affiliation. With it every derived permission goes. Events keep the name and cadre they were written with.

---

## 3. Scope, line stages and outcomes

### 3.1 Scope (LO-6, D-PH1-01, D-PH1-38)

- **Window prescriptions:** in scope when written at or after the hospital's first live point's `live_at`, or
  brought into the queue by a person (`pharmacy_scope_entries`: who, when, which placement).
- **Ward prescriptions** with individual inpatient supply off: in scope only when pharmacist-first, review-only.
- **Emergency rows:** never in scope.
- **A version** is a prescription row (owner's answer at STOP 0). A changed line is a new row; the old row is
  `cancelled` (D-PH1-41) and its pharmacy outcome is `replaced`.
- **Where a replacement belongs.** The existing dialog gives the new row a new `placement_id`. The pharmacy keeps it
  with the prescription it replaces: the `answered: changed` query event names `replaced_by`, and the queue
  projection groups that row under the original placement. A new line placed with no query link is a new
  prescription in the queue.

### 3.2 The moves (LO-4), drawn

```
                                ┌──────────────────────── a query is sent (stays; query open beside it) ─┐
                                │                                                                        │
 new line in scope ──needs co-sign──▶ awaiting_cosign ──co-signed──▶ to_review ◀─────────────────────────┘
        │                                                  │   ▲  ▲  ▲
        └──no co-sign needed───────────────────────────────┘   │  │  │ keep · withdrawn · changed-not-this-line
                                                               │  │  │
                              accepted / decision saved /      │  │ queried ◀── query sent ── to_review, ready
                              D-PH1-05 reason                  │  │    │   ◀── phone answer disputed (RQ-7)
                                          ▼                    │  │    └── declined (LO-7) ──▶ declined ■
                                        ready ── LN-8 loses ───┘  │
                                          │       acceptance      └── declined after an answer ─▶ declined ■
       full hand-over ────────────────────┼──────────────────────────────────▶ supplied ■
       part, rest owed ───────────────────┤──▶ owed ◇ ◀──changed to owed── buying_outside ◇
       part, rest outside ────────────────┘──▶ buying_outside ◇ ──confirmed filled──▶ closed ■ (filled elsewhere)
                                                 owed ◇ / buying_outside ◇ ── hand-over of the rest ──▶ supplied ■
                                                 owed ◇ / buying_outside ◇ ── part of the rest ──▶ same ◇, new quantities
                                                 owed ◇ / buying_outside ◇ ── a person closes, with a reason ──▶ closed ■
 to_review/ready ── recorded owed / buying outside (accepted first if pharmacist-first) ──▶ owed ◇ / buying_outside ◇
 any stage, owed, buying_outside ── prescriber changes the line ──▶ replaced ■ (the new row enters as a new line)
 any stage, owed, buying_outside ── prescriber cancels ──▶ cancelled_by_prescriber ■
 any stage written before today ── closed as not collected ──▶ closed ■
 supplied ■ / ◇ reached by a hand-over ── reversed same day, or recorded in error ──▶ the state before that hand-over
 any stage, owed, buying_outside ── supply entered after downtime ──▶ supplied ■ or the ◇ the sheet shows
 any stage ── "not supplied" row after downtime ──▶ owed ◇ or buying_outside ◇
 to_review (review-only ward line) ── accepted ──▶ reviewed ■

 ■ closed outcome   ◇ open outcome (listed in Open lines until a person or a prescriber closes it)
```

Every other move is refused. The exhaustive test walks every (state, event) pair of the table and expects exactly
the table. Nothing moves with time (LO-5).

### 3.3 One worked example per move

All fixture data: Patient Nine-9, Fixture tablet A (FTA), point "Outpatient pharmacy" (OP).

| #   | Move                                   | Example                                                                                                                                                  |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | new → awaiting_cosign                  | An intern's FTA line needs a senior's co-sign; the queue shows "▲ Awaiting co-sign" and "Cannot be supplied yet".                                        |
| 2   | new → to_review                        | A medical officer's FTA line, no co-sign needed.                                                                                                         |
| 3   | awaiting_cosign → to_review / queried  | The senior co-signs at 10:05. With a query still open on the line it lands at Queried.                                                                   |
| 4   | to_review/ready → queried              | The pharmacist asks "dose unclear or unusual" on FTA.                                                                                                    |
| 5   | awaiting_cosign + query                | A query on line 1 before co-sign: the line stays Awaiting co-sign, query open beside it.                                                                 |
| 6   | to_review → ready                      | Pharmacist-first: "Accept this line". Standard: the technician saves "Supply in full, 28 tablets".                                                       |
| 7   | to_review/ready → owed                 | OP has none; recorded owed, reason "out of stock at this dispensing point".                                                                              |
| 8   | to_review/ready → buying_outside       | The slip prints; the patient takes it with the signed prescription.                                                                                      |
| 9   | ready → to_review (LN-8)               | A query is answered by replacing line 2 with a controlled medicine; the prescription becomes pharmacist-first; FTA, ready without acceptance, goes back. |
| 10  | ready → supplied                       | Hand-over of 28 from batch FX-001.                                                                                                                       |
| 11  | ready → owed with quantities           | 14 supplied now, 14 owed.                                                                                                                                |
| 12  | ready → buying_outside with quantities | 14 supplied now, 14 to buy outside; the slip prints for 14.                                                                                              |
| 13  | queried → to_review (keep)             | The prescriber keeps it as written: "dose intended, reviewed".                                                                                           |
| 14  | queried → to_review (whole Rx changed) | Whole-prescription query; the prescriber changes line 2 only and confirms "Changes made"; FTA (line 1) returns to review.                                |
| 15  | to_review/ready → queried (dispute)    | A phone "keep" was logged; the named clinician disputes it.                                                                                              |
| 16  | queried → declined                     | The pharmacist declines while the query is open; the query closes as withdrawn.                                                                          |
| 17  | queried → to_review (withdrawn)        | The prescriber cannot be reached; withdrawn "prescriber could not be reached".                                                                           |
| 18  | to_review → declined                   | After a "keep", the pharmacist still declines, with a reason; the prescriber is told.                                                                    |
| 19  | any → replaced                         | The prescriber changes the dose: a new row is placed, the old row is cancelled; the old line is replaced.                                                |
| 20  | any → cancelled_by_prescriber          | The prescriber stops FTA through `cancelPrescriptionLine`.                                                                                               |
| 21  | owed/buying_outside → supplied         | Stock arrived; "Supply now" hands over the 14 owed.                                                                                                      |
| 22  | owed → owed (part)                     | 7 of the 14 owed are supplied; 7 still owed.                                                                                                             |
| 23  | owed ⇄ buying_outside                  | The patient cannot wait; changed to buying outside; the slip prints. Later changed back.                                                                 |
| 24  | buying_outside → closed (filled)       | The patient phones: bought at a licensed pharmacy. Who said so is stored.                                                                                |
| 25  | owed/buying_outside → closed           | Closed "patient declined", by the pharmacy in charge.                                                                                                    |
| 26  | any (before today) → closed            | A three-day-old prescription closed as not collected.                                                                                                    |
| 27  | supplied → previous                    | Handed back at the window and reversed at 14:40; the line is at ready again.                                                                             |
| 28  | any → supplied (downtime)              | Sheet DS-00031 row 4 entered at 14:52 with "supplied 13:40".                                                                                             |
| 29  | any → owed/buying_outside (downtime)   | Sheet row 5, "not supplied, owed".                                                                                                                       |
| 30  | to_review → reviewed                   | A pharmacist-first ward line accepted; no ward supply recorded (D-PH1-02 off).                                                                           |

### 3.4 The two-point race, drawn out

```
 time        Outpatient pharmacy (A)                     Inpatient pharmacy (B)
 10:00:00.10 recordHandover(line L, FX-002 ×28)
             BEGIN; advisory lock on L ── granted
 10:00:00.12                                             recordHandover(line L, FX-090 ×28)
                                                         BEGIN; advisory lock on L ── waits
 10:00:00.14 re-check L: ready, version = row id ✓
             lock batch FX-002 FOR UPDATE; holds 140 ✓
             write supply, movement −28, outcome supplied
             COMMIT ── lock released
 10:00:00.15                                             lock granted; re-check L: outcome supplied ✗
                                                         ROLLBACK — nothing written
                                                         "Fixture tablet A was already supplied at
                                                          Outpatient pharmacy, 10:00."
```

The same lock serialises a downtime back-entry against a live supply. Back-entry does not refuse; it records and
flags the possible double supply for look-back (DT-10).

---

## 4. Lanes (LN, D-PH1-04)

**The rule:**

- A prescription is pharmacist-first when any active line matches any reason that is **signed and switched on** at
  that hospital. Otherwise it is standard.
- A controlled line always makes it pharmacist-first (LN-5).
- With no signed rule, every prescription is pharmacist-first (LN-4).
- Reasons read stored facts only (Step 0, Q7).

| Reason                          | Stored fact it reads                                                            | Share of the last 30 days' prescriptions (Q7) | Proposed  |
| ------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| A stop the prescriber overrode  | an answer with outcome `stop`, or the legacy `allergy` code                     | **awaiting owner SQL B**                      | on        |
| Controlled drug                 | `prescriptions.controlled`, or a signed controlled class                        | awaiting                                      | always on |
| Child check                     | answer code `child` ("Child" in the dialog)                                     | awaiting                                      | on        |
| Renal check                     | answer code `kidney` ("Kidney function"); only when no creatinine was on record | awaiting                                      | on        |
| On the signed high-risk list    | the medicine's id on the hospital's signed list                                 | 0: no list is signed                          | on, inert |
| A pre-set dose was changed      | `regimen_id` set and `edits` not empty                                          | awaiting                                      | on        |
| Typed dose, no signed reference | a drug line with a problem and no regimen                                       | awaiting                                      | **off**   |

**The same six fixture prescriptions under three sets of reasons:**

- **Set P** is the proposal above.
- **Set W** is wider: P plus "typed dose".
- **Set N** is narrow: overridden stop and controlled only.

| Fixture Rx | Its lines                                             | P          | W          | N          |
| ---------- | ----------------------------------------------------- | ---------- | ---------- | ---------- |
| R1         | FTA from a signed regimen, unchanged                  | standard   | standard   | standard   |
| R2         | FTA typed dose (no regimen)                           | standard   | **pharm.** | standard   |
| R3         | Fixture capsule C, allergy stop overridden            | **pharm.** | **pharm.** | **pharm.** |
| R4         | FTA for a child under the threshold, "Child" answered | **pharm.** | **pharm.** | standard   |
| R5         | FTA regimen, dose edited + Fixture tablet B typed     | **pharm.** | **pharm.** | standard   |
| R6         | Fixture injection D flagged controlled                | **pharm.** | **pharm.** | **pharm.** |

Step 0 found that nearly every non-emergency line is either typed or from a draft regimen, since only four
catalogue drugs carry a signed dose. So Set W would put nearly all prescriptions in the pharmacist-first lane.
That is why "typed dose" is proposed off (D-PH1-04), and the CSO decides with SQL B's counts in hand.

**Snapshot:** the lane, its reasons and the rule version are copied onto the first review or supply event (LN-7). A
prescriber's new line recomputes the lane for the prescription as it now stands (LN-8).

---

## 5. The stock ledger, with a worked day (SL, D-PH1-23, D-PH1-24)

**The model:**

- **Batch:** a product, batch number and expiry at a point.
- **Ledger:** movements are append-only by trigger.
- **Balance:** the sum of a batch's movements at a point. No stored figure.
- **Guard:** a trigger takes the batch row lock and refuses any movement that would leave a live balance below
  zero. A downtime movement carries a flag that lets it through (DT-7).
- **Counts:** blind. A difference writes a `count_correction` in the same transaction, with a reason.
- **Stock-out:** a projection derived from the ledger (SL-9).

**One day at Outpatient pharmacy (OP).** Fixture product "Fixture tablet A, issue unit tablet".

- Batch FX-001 expires 31 Mar 2027; FX-002 expires 30 Sep 2027.
- Opening balances: FX-001 50, FX-002 0.

| #   | Time  | Event                                                             | Movements written                                          | FX-001 | FX-002 |
| --- | ----- | ----------------------------------------------------------------- | ---------------------------------------------------------- | ------ | ------ |
| 1   | 08:05 | Receipt from the main store, delivery ref "DN-FIXTURE-1"          | `received` FX-002 +200                                     | 50     | 200    |
| 2   | 09:10 | Supply S1, 30 (first expiry: FX-001)                              | `supplied` FX-001 −30                                      | 20     | 200    |
| 3   | 09:40 | Supply S2, 30: **split** across two batches in expiry order       | `supplied` FX-001 −20; `supplied` FX-002 −10 (two labels)  | 0      | 190    |
| 4   | 10:15 | Supply S3, 28                                                     | `supplied` FX-002 −28                                      | 0      | 162    |
| 5   | 11:00 | Supply S4, 14                                                     | `supplied` FX-002 −14                                      | 0      | 148    |
| 6   | 12:30 | Blind count: the counter types 145 (not shown 148)                | `counted` event; `count_correction` FX-002 −3, reason      | 0      | 145    |
| 7   | 13:00 | Adjustment: damaged, 5                                            | `adjusted` FX-002 −5, reason "damaged"                     | 0      | 140    |
| 8   | 13:30 | Transfer to Inpatient pharmacy, 40                                | `transfer_out` FX-002 −40 here; `transfer_in` +40 there    | 0      | 100    |
| 9   | 14:00 | Supply S5, 20                                                     | `supplied` FX-002 −20                                      | 0      | 80     |
| 10  | 14:20 | Supply S6, 10                                                     | `supplied` FX-002 −10                                      | 0      | 70     |
| 11  | 14:40 | S6 reversed: handed back at the window, pack **fit**              | `reversed` FX-002 +10                                      | 0      | 80     |
| 12  | 15:10 | S5 reversed: recorded against the wrong patient, pack **not fit** | `reversed` FX-002 +20; `adjusted` FX-002 −20 (written off) | 0      | 80     |

**Checks on the day:**

- FX-002 = 200 − 10 − 28 − 14 − 3 − 5 − 40 − 20 − 10 + 10 + 20 − 20 = **80**. The projection equals the ledger
  (SL-2).
- FX-001 reached 0 at row 3, but the medicine's unexpired total never did, so **no stock-out** is recorded
  (SL-9).
- Six supplies wrote seven `supplied` movements, because S2 split. Each supply event has exactly its movements,
  and none exist without one (SL-10).
- At 15:10 the prescriber's dialog (Step 9) would say "On the shelf at Outpatient pharmacy. Counted 12:30." No
  quantity.

---

## 6. Queries (RQ, D-PH1-07 to 10, D-PH1-47)

**The model:**

- **Query:** one line or the whole prescription. It holds a coded type, the proposal text, "patient waiting" and
  the sender.
- **Events** (append-only): `created`, `notified`, `seen`, `call_logged`, `answered`, `disputed`, `withdrawn`.
- **State** is derived from the events: `not_sent`, `open` or `answered` (a dispute reopens it).

**Recipients** are resolved when the query is sent and stored on `notified`.

| Case | Prescription                                                | Recipients                                                     | The pharmacy sees                                           |
| ---- | ----------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| 1    | Written by the encounter's clinician (a medical officer)    | that medical officer                                           | "Medical officer, Diabetes clinic" before sending           |
| 2    | Written by an intern; the encounter's clinician is a senior | the intern and the senior                                      | both, by cadre and place                                    |
| 3    | The prescriber's affiliation has ended                      | the encounter's clinician; the prescriber is listed as skipped | "Medical officer (left the hospital): skipped"              |
| 4    | Nobody active is left                                       | none: the query is `not_sent`                                  | "▲ Nobody can be told in MedSync. Call the ward or clinic." |

**What the pharmacy sees for each delivery outcome.** In-app delivery is the query itself: it shows on the
recipient's problem card and plan step the next time either renders. Realtime only makes that sooner.

| Outcome                                                                | Pharmacy line                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Created and the `notified` event written (the recipient online or not) | "Query sent 10:42 · not answered" (never "the prescriber knows")           |
| The recipient's client rendered it (`seen`)                            | unchanged. `seen` is never shown as an answer (RQ-8)                       |
| The `notified` write failed, or no recipient could be resolved         | "▲ The prescriber has NOT been told. Call them and log the call."          |
| Answered in the app                                                    | the answer, its coded reason, who and when                                 |
| Answered by a logged phone "keep"                                      | "Answered by phone: kept as written ({cadre}, {time}). Logged by {cadre}." |

**Delivery mechanics (D-PH1-47):**

- **Order of writes:** the query and its `created` event commit first. The `notified` event is written after
  commit, so a failed notification never removes the query; it leaves the query without `notified`, and the
  pharmacy sees "has NOT been told".
- **Realtime:** a trigger on `pharmacy_query_events` calls `private.notify_user_event(recipient, 'pharmacy',
ref)`, which sends `{kind, ref, at}` on `user:<id>`.
- **Clients:** the plan step and the doctor workspace refresh on that event. When unsubscribed they poll every
  15 s.
- **Budgets:** ≤ 5 s with realtime, ≤ 15 s polling (S15, measured in the harness).
- **No escalation:** none in this slice (RQ-10).

---

## 7. Supply, identity, controlled drugs, availability, the patient's list, downtime, going live

Each is specified in the prompt (6.8 to 6.13). This section records how each lands on this branch.

- **Hand-over (SU-1, SU-2):** one database transaction. It takes the advisory lock on every line and `FOR UPDATE`
  on every batch, then re-checks everything, then writes. The supply, its movements, the outcome events, the
  hand-over and (Step 9) the list entries all commit together.
- **Identity (SU-4, D-PH1-16):**
  - **First identifier:** the full name, attested by the supplier.
  - **Second identifier:** the date of birth or phone number on file, typed by the supplier and compared on the
    server:
    - date of birth: in SQL after normalising the format;
    - phone: E.164 normalisation, then `blindIndex(typed) = phone_hmac`, falling back to decrypt-and-compare
      where `phone_hmac` is null.
  - **Logging:** every attempt is logged in `pharmacy_identity_attempts`, which stores the outcome but never the
    typed value. After five wrong attempts the typed check closes for that hand-over.
  - **No date of birth or phone number** ever leaves the server (Step 0 confirmed the Phase 0 read model sends
    neither).
- **Controlled drugs (CD, D-PH1-26 to 28, D-PH1-42):**
  - **Order on screen:** the witness attests first. The supplier then types the count per batch; it is written
    as a witnessed count event before MedSync's balance is returned. Then the two paper attestations and the
    witness's agreement.
  - **Paper:** MedSync never names its record the register.
  - **Until Step 7 is built:** a controlled line has no supply decision, and its product cannot be added.
- **Availability (AV, Step 9):**
  - `getAvailability` answers from the live point whose `serves` matches where the prescription is being written
    (the clinic or emergency → window or emergency; a ward → wards).
  - It returns states, never a quantity.
  - With no live point the answer is `not_linked`, as today.
- **The patient's list (ML, Step 9):** written through `self_medications` with a new `source_supply_id` column
  (unique per patient). It reuses `selfMedicationFromPrescription`'s shape. A reversal or a correction withdraws
  the entry (ML-6).
- **Downtime (DT, D-PH1-46):**
  - **Sheets:** one number space per hospital (`downtime_form_numbers`), shown as `DS-` on pharmacy sheets.
  - **Supply rows:** a back-entered supply goes through the hand-over transaction with `supplied_at` from the
    sheet and `entered_after_downtime`.
  - **Paper prescriptions** are their own records.
  - **Refusals:** entry refuses only what DT-4 lists, and flags the rest for look-back (DT-10).
- **Going live (RD, D-PH1-35):**
  - **Page:** in the hub's Pharmacy panel, one card per point. It shows the six conditions with evidence.
  - **Switches:** "Switch on dispensing" and "Switch off" each need a second approver. Both are modelled on
    `lab_cutover`: `pharmacy_golive` rows with CHECK `approved_by <> requested_by`.
  - **One transaction:** the approval stamps `live_at` on the point.
  - **Before Step 8:** the test hospital's points are made live by a fixture only.

---

## 8. Schema diff (numbers from the ledger; every migration GATED, owner-applied)

All tables:

- have RLS on;
- grant clients no INSERT, UPDATE or DELETE (every write goes through a server action as the table owner, in one
  transaction);
- carry `hospital_id` and, where an action is at a point, `dispensing_point_id`.

Event tables are append-only through `public.block_modify_append_only()`, the trigger 0105 already uses. It fires
for every role that is subject to triggers, the service role included. Only a superuser session with
`session_replication_role = replica` can bypass it, and that is the owner's own database access, outside the app.

| Migration | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Step |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0122      | `pharmacy_signed_sets` (D-PH1-43); `pharmacy_attestations` (D-PH1-42: who attested for whom, method, action, outcome; never a secret); `private.pharmacy_can(perm, hospital)`; the `department_heads` audit trigger for `pharmacy.manage`                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2    |
| 0123      | Catalogue: `pharmacy_products` (hospital, medicine id = catalogue id, name, manufacturer, pack size, issue unit locked after the first movement, registration number, price numeric UGX nullable, active); `pharmacy_product_points`; national list: `pharmacy_national_list_editions`, `pharmacy_national_list_rows`, `pharmacy_medicine_links`                                                                                                                                                                                                                                                                                                                                         | 2    |
| 0124      | Stock: `pharmacy_batches` (UNIQUE point + product + batch number; expiry date or month); `pharmacy_stock_movements` (append-only, kind CHECK, signed quantity, `effective_at`, `recorded_at`, actor, reason, source, witness, `downtime` flag); the balance guard trigger; `pharmacy_counts` + `pharmacy_count_lines`; `pharmacy_reorder_levels`; `pharmacy_stock_requests`; `pharmacy_batch_corrections`; `pharmacy_stockouts` (projection, rebuilt by trigger)                                                                                                                                                                                                                         | 2    |
| 0125      | Review: `pharmacy_scope_entries`; `pharmacy_line_events` (append-only; prescription id = the version, kind, lane snapshot, rule version, reason, quantities, point); `pharmacy_queries` + `pharmacy_query_events` (append-only); `private.notify_user_event` and its trigger (D-PH1-47)                                                                                                                                                                                                                                                                                                                                                                                                  | 2    |
| 0126      | Supply: `pharmacy_handovers` (UNIQUE client key; collector; identity route; label mode; counselling; language; payment status and detail; `entered_after_downtime`; sheet and row; `supplied_at`, `entered_at`); `pharmacy_supplies` (append-only; line or paper line; product; batch; quantity; issue unit; days covered; price snapshot; prescribed and supplied strength; substitution reason; the pharmacist's line and author; reviewer event; point; supplying organisation); `pharmacy_supply_reversals`; `pharmacy_supply_corrections`; `pharmacy_look_backs`; `pharmacy_identity_attempts`; `pharmacy_print_events`; `pharmacy_slips` (UNIQUE code); `pharmacy_patient_notices` | 2    |
| 0127      | Controlled: `pharmacy_controlled_entries`; `pharmacy_controlled_differences`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2    |
| 0128      | Downtime, generalised (D-PH1-46): `downtime_form_numbers.workspace` and pharmacy states, the guard rewritten (lab moves unchanged); `downtime_drills.workspace`, `dispensing_point_id`; `paper_prescriptions` + `paper_prescription_lines`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2    |
| 0129      | Going live: `pharmacy_dispensing_points` gains `live_at`, `switched_off_at`, `label_mode`, `count_freshness_days`, `phone`; `pharmacy_golive`; `pharmacy_briefings`; `pharmacy_legal_answers`; `pharmacy_pilot_notes`; `pharmacy_hospital_settings` (inpatient supply, payment required, supply without a pharmacist with its approver, expiry look-ahead, live SMS, message name, log column map)                                                                                                                                                                                                                                                                                       | 2    |
| 0130      | `prescription_cancellations` (append-only: prescription id, coded reason, note, actor, time) for `cancelPrescriptionLine` (D-PH1-41); `prescription_print_events` (prescription id, actor, time; D-PH1-49). The row's `state` moves to `cancelled` as the co-sign withdrawal already does; `audit_prescriptions` records it. No prescription column                                                                                                                                                                                                                                                                                                                                      | 2    |
| 0131      | Step 9: `pharmacy_stock_answers` (D-PH1-44); `self_medications.source_supply_id` (UNIQUE per patient); `ncd_sms_template.workspace` and the pharmacy purposes (D-PH1-48)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 9    |

The rest of the block (0132–0146) is held for fixes found in later steps. Flags (`pharmacyDispensing`,
`pharmacyStockAnswer`, `pharmacyPatientList`, `pharmacyDowntime`) are per-hospital rows in the house flag
mechanism, off by default, with the env kill switch as in Phase 0.

---

## 9. RLS probe plan

These run in the PGlite lane with every migration replayed (as Phase 0's 0100 probes did). There is one probe per
object × actor, and each expects exactly the access in the prompt's Section 7 table:

- pharmacy staff by permission;
- `view` only;
- no `review`;
- no `controlled`;
- the prescriber;
- a nurse;
- the patient;
- reception;
- lab staff;
- the hospital admin;
- another hospital's pharmacist;
- superadmin without break-glass;
- anonymous.

Writes:

- **Direct client writes:** every INSERT, UPDATE and DELETE as `authenticated` is denied on every table.
- **Append-only:** UPDATE and DELETE on movements, supplies, hand-overs, line events, query events and controlled
  entries are denied as `authenticated`, as the service role and as the table owner (the trigger).

Reads:

- **Identifiers:** no pharmacy-reachable select returns `date_of_birth`, `phone_encrypted` or `phone_hmac`. This is
  a probe on every pharmacy read function plus a static test over `lib/pharmacy/**` selects.
- **Prescriber reads** (queries, outcomes) go through a server function scoped to patients they may prescribe for.
- **The nurse's chip** is `pharmacy_line_review_state(prescription_id)` (SECURITY DEFINER), which returns one word.

---

## 10. Concurrency: how the races are tested

| Race                                              | Database guarantee                                               | Proven by                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Two supplies take the last units of a batch       | `FOR UPDATE` on the batch + the balance guard trigger            | PGlite: the second supply in sequence is refused with the figure. **Real race test:** two connections, exactly one commits |
| One line handed over at two points                | advisory transaction lock on the line, then the outcome re-check | PGlite sequential + real race test                                                                                         |
| A failure between the supply row and its movement | one transaction                                                  | PGlite with an injected throw: neither row exists                                                                          |
| A double tap                                      | UNIQUE client key on the hand-over                               | PGlite: one row, the same id returned                                                                                      |
| Two answers to one query                          | advisory lock on the query + "first answer wins" re-check        | PGlite sequential + real race test                                                                                         |

The real race test lives in `tests/rls/` style (postgres-js, two connections, `DATABASE_URL`). It runs only when
the owner points it at the dev Supabase. It never runs against production.

---

## 11. Test plan

| Lane                                     | What                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)                            | Every rule ID in 6.1 to 6.13 has a test named after it. LO-4 exhaustive; LO-5 30-day clock; LO-9 and SL-10 properties (seeded random sequences); AV-3 order with every pair of co-holding states; direction byte-equality (screen, label, slip); banned-term scan with failing fixtures; two-hospital fixtures for every list and projection; the Law 2 test (every pharmacy action enumerated; none writes `prescriptions`) |
| PGlite lane (`EMR_PGLITE=1`)             | Migrations, RLS probes (§9), append-only triggers, the balance guard, transactions with injected failures, the generalised downtime guard with the **lab's existing tests unchanged**                                                                                                                                                                                                                                        |
| Real race test (owner-run, dev Supabase) | §10                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Harness (`~/Desktop/pharm0-harness`)     | S1 to S96 as scripted runs; screenshots at 1440, 834 and 390 against the artboards; axe on every new route; interaction counts and timings (budgets in Section 4 and Section 11)                                                                                                                                                                                                                                             |
| CI static                                | Red-scarcity over every new route and component; no hex; "pharmacist" never applied to a technician; no clinical number, medicine list or price in code, seeds or copy                                                                                                                                                                                                                                                       |

---

## 12. Rollout

| When                  | What                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge 1 (Steps 0–6)   | Everything behind flags, off in production. The test hospital's points are made live by fixture only. Production unchanged                                                                                                                                 |
| Merge 2 (Steps 7–8)   | The go-live page and the switch exist. Still nothing live in production                                                                                                                                                                                    |
| Going live, per point | 1. Signed content in force. 2. Legal answers on record. 3. `pharmacyDispensing` on; products set up; opening count. 4. `pharmacyDowntime` on; a drill. 5. Briefings. 6. An in-charge named. 7. Switch on (two people). 8. Pilot note before a second point |
| Merge 3 (Step 9)      | `pharmacyStockAnswer` on after the first point has run (D-PH1-35), then `pharmacyPatientList`, then live SMS. Each is refused in production while its content is unsigned (RD-4)                                                                           |
| Switch off            | Reason + second approver. The point returns to read-only; its Open lines stay workable from any live point (RD-3)                                                                                                                                          |

---

## 13. ADR drafts (0260–0279)

| ADR  | Title                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------ |
| 0260 | Pharmacy records are events beside the prescription; the pharmacy never changes a prescription   |
| 0261 | Line stages and outcomes; what may close a line; nothing closes by itself                        |
| 0262 | Review lanes: signed reasons, the fail-safe with no signed rule, the standard lane's record      |
| 0263 | Queries to the prescriber: sent, seen, answered; phone answers and dispute; no escalation        |
| 0264 | The stock ledger: movements, batches, balance as a projection, blind counts                      |
| 0265 | One action, two records: the hand-over transaction, first expiry first out, no reservation       |
| 0266 | Identity at hand-over                                                                            |
| 0267 | Substitution, and no conversion                                                                  |
| 0268 | Controlled drugs: the witnessed record beside the statutory paper                                |
| 0269 | The availability seam's real answer, and why the prescriber sees no quantity                     |
| 0270 | The patient's medicine list from supplies, the refill date, messages that name no medicine       |
| 0271 | Downtime: one shared module, back-entry with true times, paper prescriptions as their own record |
| 0272 | Going live per dispensing point: six conditions and two people                                   |
| 0273 | The location-neutral supply record                                                               |
| 0274 | Payment status and price as recorded facts, with no billing                                      |
| 0275 | The look-back list                                                                               |
| 0276 | Scope on go-live day, and what happens when a point is switched off                              |
| 0277 | Three merges and one go-live                                                                     |
| 0278 | A line version is a prescription row; the prescriber's cancel action (D-PH1-41)                  |
| 0279 | Second-person attestation for witnesses and signers (D-PH1-42)                                   |

Each is written at the step that builds it. Each records the Data Protection and Privacy Act 2019 basis where it
touches personal data (Section 12).

---

## 14. Decisions for signature

**Signers:**

- **CSO:** Fadhul. Signs every row.
- **Pharmacist reviewer** (name not yet given). Co-signs the rows marked **PR** (D-PH1-36).
- **Legal:** rows marked **L** cannot be signed until the legal answer named is on record.

| #           | Decision                                         | Recommendation (full text: prompt Section 14 and §1 above)                                                     | Who             | Decision                                              |
| ----------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------- |
| D-PH1-01    | Which prescriptions end in an outcome            | Every window prescription written since the hospital's first point went live                                   | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-02    | Inpatient prescriptions                          | Setting off: pharmacist-first ward prescriptions reviewed only; standard ones not listed                       | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-03    | Permission map v2                                | Appendix A ([gate-a-content.md](gate-a-content.md) Part 4)                                                     | CSO, L Q1       | Approved, provisional until legal Q1 (12 Oct 2026)    |
| D-PH1-04    | Lane reasons                                     | §4: on except "typed dose"; with SQL B's counts                                                                | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-05    | No pharmacist on duty                            | Setting off by default; on only with legal Q1 and a second approver; never controlled                          | CSO, L Q1       | Approved, provisional until legal Q1 (12 Oct 2026)    |
| D-PH1-06    | The standard lane                                | No review recorded; "standard lane, checked at supply"                                                         | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-07    | Query codes and answer reasons                   | Appendix D pack                                                                                                | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-08    | Who may answer                                   | Any clinician who may prescribe for the patient; first answer wins                                             | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-09    | Phone answers                                    | A logged "keep" answers and can be disputed; "change" and "stop" change nothing                                | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-10    | Declining to supply                              | Only after a query on the line                                                                                 | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-11    | Outcome, close, reversal, adjustment reasons     | Appendix D packs                                                                                               | CSO + in-charge | Approved 12 Oct 2026                                  |
| D-PH1-12    | Not collected                                    | Stays listed until a person closes it                                                                          | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-13    | The slip                                         | A not-supplied slip that goes with the signed prescription; wording per legal Q5                               | CSO, L Q5       | Approved, provisional until legal Q5 (12 Oct 2026)    |
| D-PH1-14    | Substitution                                     | Same strength: anyone who may dispense; different strength: a pharmacist with their line                       | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-15    | Quantity with none on the prescription           | Typed by the dispenser; prescribing unchanged                                                                  | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-16    | Identity                                         | Name said + DOB or phone typed and compared on the server; "identified another way" listed and counted         | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-17    | Labels                                           | Mode per point; one per batch; fields per legal Q6                                                             | CSO, PR, L Q6   | Approved, provisional until legal Q6 (12 Oct 2026)    |
| D-PH1-18    | Plain words                                      | None ship                                                                                                      | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-19    | Counselling points and languages                 | Appendix D pack; ticked, never required                                                                        | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-20    | Payment status                                   | Recorded, never verified; Emergency never held                                                                 | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-21    | Price                                            | Optional on the product; snapshot on the supply                                                                | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-22    | Stock state levels in the dialog                 | Note: on the shelf, low, not counted. Check: out, not stocked. Never a Stop                                    | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-23    | Reorder levels and count freshness               | The in-charge's operational figures                                                                            | in-charge       | Approved 12 Oct 2026                                  |
| D-PH1-24    | Counts                                           | Blind; controlled committed first                                                                              | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-25    | Reversal and correction                          | Same day by a pharmacist or the in-charge; later "recorded in error"                                           | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-26    | Controlled drugs                                 | Witnessed record + two attestations + a slip; the paper stays                                                  | CSO, L Q2–4     | Approved, provisional until legal Q2–Q4 (12 Oct 2026) |
| D-PH1-27    | Who may witness                                  | Any holder of `pharmacy.dispense`, never the actor                                                             | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-28    | Controlled classes                               | The reviewer signs a decision per stocked medicine                                                             | PR, CSO, L Q4   | Approved, provisional until legal Q4 (12 Oct 2026)    |
| D-PH1-29    | High-risk list                                   | Per hospital, signed; none proposed                                                                            | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-30    | Refill date                                      | Only from days covered, or a course code supplied in full                                                      | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-31    | Patient wording and messages                     | Appendix B; no medicine, condition, clinic, point or prescriber; SMS off                                       | CSO, PR, L Q7   | Approved, provisional until legal Q7 (12 Oct 2026)    |
| D-PH1-32    | What a patient's tap does                        | "Bought it" closes; "could not get it" stays open and tells both                                               | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-33    | The ward chip                                    | Read-only on `MarGrid`; never holds a dose                                                                     | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-34    | Downtime                                         | Any dispenser enters; only the in-charge records a period; flag, never refuse                                  | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-35    | Going live and rollout order                     | §12                                                                                                            | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-36    | Who signs what                                   | Prompt Section 14 as written; Fadhul's several roles recorded as an exception wherever no second person exists | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-37    | Prescriber's name and council number on the slip | Printed on the slip only                                                                                       | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-38    | Prescriptions before go-live                     | Out of scope until brought in; nothing closed in bulk                                                          | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-39    | Message name                                     | One neutral, signed name per hospital                                                                          | CSO, PR         | Approved 12 Oct 2026                                  |
| D-PH1-40    | Step 9                                           | Build after the floor; may be deferred                                                                         | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-41    | Prescriber cancel action                         | §1: `cancelPrescriptionLine`; link held on the pharmacy's event                                                | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-42    | Witness and signer authentication                | §1: password + authenticator code checked on a throwaway client                                                | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-43    | Signed sets store                                | §1: `pharmacy_signed_sets`                                                                                     | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-44    | Stock answer storage                             | §1: `check_answers` for Checks + `pharmacy_stock_answers` for all                                              | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-45    | Several points per person                        | §1: chooser; point on every event                                                                              | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-46    | Downtime generalised                             | §1: lab tables widened once, lab moves unchanged                                                               | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-47    | Query delivery                                   | §1: `user:<id>` + 15 s polling                                                                                 | CSO             | Approved 12 Oct 2026                                  |
| D-PH1-48    | Message templates                                | §1: `ncd_sms_template` generalised once                                                                        | CSO             | Approved 12 Oct 2026                                  |
| E-PH1-01–13 | Engineering decisions                            | As the prompt's Section 14, with E-PH1-07 → D-PH1-43, E-PH1-08 → D-PH1-46, E-PH1-06 → D-PH1-47                 | CSO             | Approved 12 Oct 2026 (each of E-PH1-01 to 13)         |

**Signature block**

| Role                  | Name                | Decision                                                                                                                                                                                                        | Date        |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| CSO                   | Fadhul              | All 63 rows approved as recommended, no changes; 7 provisional until their legal answer (D-PH1-03, 05, 13, 17, 26, 28, 31). The §1 corrections (W1–W11, H1–H8, C1–C4) adopted                                   | 12 Oct 2026 |
| Pharmacist reviewer   | none yet            | **Owner's choice:** the CSO signs alone now; a registered pharmacist co-signs the clinical packs and the hazard log before any production point goes live. The go-live page checks for it (RD-1 condition 1)    | 12 Oct 2026 |
| Legal interim answers | none yet (Q1 to Q6) | **Owner's choice:** deferred. Build continues at the test hospital; the provisional rows use the stricter option; no production point can be switched on until all six answers are on record (RD-1 condition 2) | 12 Oct 2026 |

Signed through the GATE A decisions page (https://claude.ai/artifact/LVDHizt73bKagVvHZNQn7D), which stores each decision
with the signer, the time and the exact recommendation approved. A second factor at signing was not captured by that
page; the signatures in `pharmacy_signed_sets` (D-PH1-43) will require one.

**Recorded exceptions (D-PH1-36, HZ-PH1-37).**

1. Fadhul holds the superadmin, CSO and audit-reviewer roles, and signed every row alone. Rows the prompt gives to
   the pharmacist reviewer as well (marked PR) are signed for building; for production they wait for a pharmacist's
   co-signature.
2. Claude did the review and cross-checks; that is not a pharmacist's review and is not recorded as one.

**What "provisional" means in the build.** Until its legal answer is recorded:

- D-PH1-03: the permission map v2 acts only outside production.
- D-PH1-05: "supply without a pharmacist" cannot be switched on.
- D-PH1-13: the slip carries its draft wording and prints only outside production.
- D-PH1-17: labels carry the full proposed field set.
- D-PH1-26 and D-PH1-28: the full controlled path applies to anything flagged.
- D-PH1-31: live SMS stays off.

Content marked draft or provisional acts at the test hospital and never in production. This is the same production
gate Phase 0 used for its wording (CS-5).
