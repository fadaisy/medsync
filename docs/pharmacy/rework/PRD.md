# PRD — MedSync Pharmacy Workspace Rework

Status: ready to build · Owner: Usama Fadhul · Date: 30 Oct 2026
Reference implementation: `prototype/` (open `prototype/index.html` in a browser). **When this PRD and the prototype disagree on behaviour, the prototype wins; when they disagree on safety, this PRD wins.**
Inputs it replaces: the current workspace reviewed in "Pharmacy Workspace Review" (29 Oct 2026, condensed in `REVIEW-FINDINGS.md`).

---

## 1. Goal

Turn the pharmacy module into a workspace one to three pharmacists at a Ugandan hospital can run every day on a phone, tablet or 1366 px laptop, with stock and controlled drugs that are accountable by construction.

Success means:

- The four critical review findings are closed: C1 view-only in production, C2 unwitnessed controlled drugs on wards and carts, C3 demo data in production, and C4 the month-end count.
- Each daily task meets its click target:

| Task                                     | Target                 |
| ---------------------------------------- | ---------------------- |
| Dispense 3 lines                         | 1 screen, about 6 taps |
| Receive an expected delivery of 10 lines | 1 screen, 1 witness    |
| Issue to a ward                          | about 3 taps           |
| Count a shelf                            | Resumable              |
| Recall a batch                           | About 5 taps           |

- Every stock change is attributable to a named person, plus a witness for controlled drugs. Nothing is edited or deleted; mistakes are corrected with a reversal.
- The facility can file the monthly HMIS 105 sections, the controlled-drugs return and a losses report without retyping anything.

## 2. Users, roles, stations

| Role                               | Works at                                                                   | Can                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pharmacist / pharmacy technician   | One **station** (OPD dispensary or Main store), chosen with the place chip | Dispense, receive, issue, count, record CD doses at the station, hand over their own station, take investigation cases, correct own entries               |
| Store keeper                       | Main store                                                                 | Receive, issue, count, order, store handover                                                                                                              |
| In-charge pharmacist               | Any station; **oversees all**                                              | Everything, plus: approve counts, sign off cases, confirm a CD loss, submit reports, assign cases, explain missed handovers anywhere, resolve differences |
| Ward nurse / midwife (ward tablet) | Their ward                                                                 | Record doses (MAR), confirm ward receipts, sign as witness, do ward handovers. The pharmacy sees these records but does not perform them                  |
| EPI nurse / focal person           | EPI clinic                                                                 | Vaccinate, manage EPI stock and fridge, file HMIS 105 EPI                                                                                                 |

- **Station rule:** a non-in-charge user acts only on their own station (handover, CD dose recording at a ward is the ward's, counts at their station). The in-charge sees every station.
- **Duty roster:** staff by place, role and shift. Day is 08:00–17:00 and night is 17:00–08:00; consultants can be on call for 24 h. The roster drives who can be a witness, who can take over at a handover, and the named people on records.

## 3. Information architecture

The side bar has **6 sections**. A section with more than one page shows its pages as tabs above the page title; each tab carries its own count, and the section badge is the sum of its tabs. Clicking a section opens the page you last had open in it.

| Section  | Pages (tabs)                                                         |
| -------- | -------------------------------------------------------------------- |
| Today    | Dashboard + ranked work list                                         |
| Dispense | Waiting · Ready to collect · Owed · Handed over                      |
| Patients | Inpatients · Outpatients · Immunisation · Reminders                  |
| Stock    | Medicines · Store (Receive · Issue · Count · Order · Cold chain)     |
| Controls | Controlled drugs · Shift handover · Investigations                   |
| Records  | Records (Audit trail · Losses (UGX) · Paper sheets · Reports) · Team |

The global bar has:

- the "+" Start a job button
- Find or scan (Ctrl K or /)
- the place chip, which sets your station
- the network pill (Online, or Offline with a count of changes still to send)
- Emergency supply
- the account menu, which opens Set-up

On a phone (below 761 px) the bottom pill holds Today, Dispense, +, Patients and More. More opens the other sections as labelled groups. Set-up is reached only from the account menu.

## 4. Glossary — one word for one thing

| Word           | Means only                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------- |
| Hand over      | Give medicine to a patient                                                                  |
| Issue          | Send stock to a ward, clinic or another place                                               |
| Receive        | Take a delivery into stock (the GRN is its printout)                                        |
| Place          | A physical location: Main store, OPD dispensary, Ward 3, Maternity, Paediatrics, EPI clinic |
| Station        | The place a pharmacy user is working at now                                                 |
| Owed           | Medicine a patient is still owed after a stock-out                                          |
| On the way     | Issued, not yet confirmed by the receiving place                                            |
| Rules          | Signed hospital settings                                                                    |
| Expiry warning | How far ahead expiry is flagged (90 days)                                                   |
| Witness        | A second named person who approves on their own device                                      |
| Late entry     | Recorded after the event, stamped with both times                                           |
| Correction     | A reversal line plus, if needed, the right line. The original stays                         |
| Case           | An investigation of a discrepancy                                                           |

## 5. Safety invariants (non-negotiable; enforce in SQL where marked [DB])

- **S1 [DB]:** The ledger is append-only. Balances are always summed from movements, never stored and never edited.
- **S2 [DB]:** No movement may take a batch below zero, or move expired, recalled or quarantined stock out. The only exception is a downtime back-entry: it is flagged, and the next live supply of the affected batch needs a count first (fixes H6).
- **S3 [DB]:** Any movement of a **controlled** medicine _out of_ a place needs a `witness_attestation_id` **that has not been used before**. One attestation covers one action and lasts 10 minutes (fixes C2 and M3). This applies at every place: store, dispensary, ward, cart and clinic. The only exception is a downtime back-entry with a paper witness name, which is flagged for the in-charge.
- **S4 [DB]:** Controlled entries carry a `place_id`, not just a dispensing point. Registers exist per medicine per place (fixes C2).
- **S5:** Counts are blind. The ledger figure shows only after every line is counted.
- **S6:** Quantities to hand over are typed or stepped, never pre-filled (rule SU-6). Doses are never written by the system.
- **S7:** A correction is a reversal plus a replacement with a reason. The original stays visible and marked "corrected". A controlled-drug correction needs a witness.
- **S8:** A late entry records `happened_at` and `entered_at`/`entered_by` separately, and stays marked "late" for good.
- **S9:** Only the in-charge may approve a count, confirm a controlled-drug loss (which needs an incident report number), sign off a case, submit a report or assign a case. A person cannot sign off a case they submitted unless they are the only in-charge; that case is flagged.
- **S10:** A witness must be on duty in the required role at that place now. The duty roster decides who qualifies.
- **S11:** A prescription check flag that is "stop" (for example an allergy) can only be cleared by "Prescriber confirmed" with the prescriber's name, or by holding the line.
- **S12:** Workspace wording ships only from signed content. New copy is added with status `draft`. Copy must contain no build codes: a lint rejects `ADR \d|D-PH|Phase \d|seam` (fixes H9).
- **S13:** Production permissions come from the **recorded legal answers per hospital**, not from env constants (fixes C1 and H1). Dev overrides show a staff-visible band, and production refuses to start with them set.
- **S14:** Demo data never lives in the production database (fixes C3). Demos run in a separate project. Any existing demo rows are soft-marked and filtered out. Never `DISABLE TRIGGER` in production.

## 6. Features

The acceptance criteria (AC) are written so they can be tested. The prototype file named in each heading is the behavioural reference.

### 6.1 Today (`today.js`)

- **Tiles** (each opens its page, and its number is coloured only when it needs action):
  - OPD queue (longest wait)
  - Stock (out, or under a month left)
  - Expiring within 90 days
  - Inpatients (doses not given for lack of stock, due now)
  - Refills (missed, due within 5 days)
  - Cold chain (in range, excursions to act on)
  - Vaccines to refill
- **Your work:** one list ranked for the role, with one button per item. The first item is "Next up". It shows 6 items, then "Show all n", then "n for other roles on shift".
- **Item kinds:** emergency to finish, prescriber query waiting, cold-chain excursion, handover due or missed, investigation case, controlled-drug flags, MAR alerts, waiting patients, owed now in stock, refills, counts due or running, ward requests, deliveries, transits not confirmed, approvals, expiring, out of stock, paper entries, recalls.
- **OPD queue:** wait bars, amber over 10 min and red over 20 min.
- **Today so far:** counts from today's ledger.
- **Bottom row:** stock watch (the 6 medicines with the fewest months left), cold chain now (24 h sparkline against the 2–8 °C band), wards (% of due doses given), and expiring batches.
- **AC:** every item opens the exact screen where it is resolved. Item order follows the role's order table.

### 6.2 Dispense (`dispense.js`, `checks.js`)

- **Tabs:** Waiting, Ready to collect, Owed, Handed over. A prescription is one screen.
- **Each line:**
  - name with tags (route, IV, cold chain, controlled) and an "Rx info" card showing:
    - strength and form
    - IV notes
    - dosing for adults, children and special groups
    - pharmacokinetics: absorption, peak, half-life, metabolism, excretion
    - pharmacodynamics: class, mechanism, effect
    - adverse reactions: common and serious
    - interactions
    - contraindications
    - pregnancy
    - what to monitor
    - brands with their stock
    - batches, with VVM for vaccines
  - stock at the dispensary and the store
  - a brand drop-down limited to brands in stock, with quantities
  - FEFO batch, with "Other batch"
  - decision Give, Owe or Hold. Give needs a typed quantity; a quantity different from the prescription needs a reason chip (partial: owe the rest; pack size; prescriber agreed). Hold needs a reason chip.
- **Checks panel** (above the lines):
  - patient facts: weight, allergy, pregnancy, eGFR, current medicines
  - flags per line:
    - allergy: **stop**
    - paediatric dose by mg/kg per dose against a range: check
    - kidney function (e.g. metformin with eGFR 30–45, max 1 g/day): check
    - pregnancy: check
    - duplicate therapy against current medicines: check
    - counselling (e.g. metronidazole with alcohol): info
  - every check or stop flag on a line being given needs an answer: "Checked, give it" plus a reason chip; "Prescriber confirmed" plus a prescriber chip (required for stop); or "Talk to the prescriber", which holds the line and creates a prescriber query
  - queries show on Today until marked answered
- **Hand over:** patient identity check (typed date of birth or the last 4 digits of the phone, never chosen from a list), counselling chips, language, labels printed on hand over, and the next patient opens on its own.
- **Owed list:** lights up on Today when stock arrives ("2 patients owed metronidazole: now in stock"). Owed hand over records FEFO.
- **AC:**
  - Hand over stays disabled while any line is undecided, any check is unanswered, or identity is not confirmed.
  - The check answers and the query are stored and appear in the audit trail.

### 6.3 Patients

**Inpatients (`inpatients.js`, `rounds.js`)**

- The pharmacy's view of the nurses' medicine charts (MAR): per ward, patient cards showing adherence (% of due doses given), flags and next dose.
- **Patient chart:**
  - each dose is given, late, not given (with a reason), no stock, or due
  - pharmacy notes
  - "Track" shows each prescription's journey: Prescribed → Checked → Picked and issued (batch) → Received on the ward → Given (batch per dose) → Returned. It reconciles what should still be on the ward against the ward's ledger and flags anything unaccounted for.
- **Pick for a patient:** next 24 h or rest of course, sent to the ward on the way.
- **Return unused:** from the ward back to the store.
- **"For the pharmacy" list:** out at the pharmacy, pick for a patient, waiting for the ward to confirm.
- **Round pick lists:**
  - for each ward, doses due in the next 12, 24 or 48 h × dose, minus what is already on the ward for that patient, gives the quantity to pick
  - lines are ticked as picked, then one hand-over is sent per ward, with a bag label per patient
  - the ward confirms receipt
  - store shortfalls are flagged
- **AC:**
  - Sending a round creates issue movements to `transit:<ward>` and per-patient supply records.
  - Ward confirmation moves the stock to the ward.

**Outpatients (`outpatients.js`)**

- **Chronic refills:**
  - run-out date = last supply ÷ daily dose
  - status: OK, due within 5 days, overdue
  - pill count at refill: pills brought back give adherence % per interval
  - MPR over the history
- **Antibiotic courses:** day n of N, adherence check-ins every 2 days, missed doses and side effects.
- **Refill dialog** with a pill counter. Alerts go to Today.

**Immunisation (`epi.js`)**

- **Vaccine stock (default tab).** For each vaccine:
  - batch in use, with expiry and VVM ("VVM 2: use first", VVM 3–4 blocked)
  - level bar against min (half the level) and max
  - used today and in the last 7 days
  - days left at the usual daily use
  - cold-room stock
  - status Refill, Watch or OK, with a "Refill from the cold room" button that opens Store › Issue to EPI
  - a 14-day doses-used chart
  - open multi-dose vials: BCG and MR are discarded 6 h after opening; bOPV, IPV, Penta and Td keep up to 28 days under the multi-dose vial policy
  - monthly vaccine control: opening + received − given − wasted = balance
- **Cold chain:** the EPI fridge only (the same component as Store › Cold chain).
- **Clinic dashboard:**
  - KPIs
  - due today as near-square tiles, most overdue first
  - coming back this week
  - defaulters to trace
  - register a client
  - the client register
  - a client card with a Vaccinate dialog that decrements stock and handles open vials
  - indicators:
    - Penta3 and MR1/MR2 coverage
    - fully immunised child
    - dropouts (Penta1→3, Penta1→MR1, BCG→MR1, MR1→MR2)
    - RED/REC category
    - doses against target
    - equity: zero-dose, protected at birth, Td1 in antenatal care, HPV
    - timeliness
    - service delivery
    - availability and wastage
- **AC:** vaccinating records a `vaccinate` movement with batch and client.

**Reminders (`productivity.js` › RemindersView)**

- Rules, each switchable on or off, with English and Luganda templates:
  - refill due in 3 days
  - missed refill (day 1 and day 7)
  - antibiotic course reminder
  - immunisation visit tomorrow
  - immunisation defaulter (3 and 14 days late)
- **Daily queue at 08:00:** recipient, phone, reason, rendered text and language. Statuses: scheduled, sent, failed (with "called instead" or retry), skipped.
- Opt-out on reply STOP. Cost per SMS.
- **AC:** messages are generated from the real refill and EPI data, and no message goes to a patient who opted out. The Luganda templates stay `draft` until a native speaker signs them.

### 6.4 Stock

**Medicines (`medicines.js`, `kit.js`)**

- One list with filters: all, under a month, out, expiring within 90 days, controlled, cold chain.
- Grouped by therapeutic class: antibiotics, analgesics, fluids & electrolytes, antihypertensives, anticonvulsants, antidiabetics, haematinics, obstetric (uterotonics), vaccines.
- **Medicine page:**
  - stock per place and per batch (brand, expiry, VVM)
  - months of stock
  - movements
  - the Rx info card
  - a stock card that prints per place
- **Recall** (started from a batch): quarantine everything held with one tap, tell each ward, list every patient who received the batch with a contact chip, and close only when nothing is left on a shelf and every patient has an outcome.

**Store (`store.js`, `cold.js`)**

- **Receive:**
  - an expected delivery (from an order) opens as one grid of lines
  - per line: "✓ As ordered" or a counted pack number, batch and expiry (scanned or typed), a condition (OK, damaged → quarantine, send back), pack size (10, 25, 50, 100 or custom), and brand from the catalogue
  - **one witness per delivery** if any line is controlled
  - saved as you go; GRN printout
- **Issue:**
  - pick a ward or clinic; quantities are suggested from its levels (level − on hand − on the way)
  - ward requests are honoured
  - brand drop-down with stock
  - one witness for any controlled line
  - stock is **on the way** until the receiver confirms on their device
- **Count:**
  - by shelf or by medicine, saved as you type and resumable
  - blind steppers in packs and loose units
  - "Add found batch"
  - a reason chip per difference (FEWER: damaged, expired, broken in transit, given but not recorded, miscounted last time, other; MORE: found on another shelf, received but not recorded, miscounted last time, other)
  - sent for approval, then the in-charge approves; adjustments post only on approval (fixes C4)
- **Order:**
  - NMS cycle 1, 2 or 3 months, and a safety buffer of 0.5, 1 or 2 months
  - use per month adjusted for stock-outs: AMC × 90 ÷ (90 − days out of stock in the last 90 days)
  - suggested = ceil((adjusted use × (cycle + buffer) − on hand − on order) ÷ pack), with "how it was worked out" on tap
  - VEN class per medicine
  - cost in UGX against the NMS credit line; "Fit to budget" trims Necessary lines, then Essential, and never Vital
  - vaccines are UNEPI and outside the credit line
  - copy the order for the NMS portal
- **Cold chain:**
  - fridge cards: live temperature from the sensor (continuous temperature monitoring device), status, 24 h min/max
  - trend chart for 24 h, 7 d or 30 d, with the 2–8 °C band and the +8 and −0.5 alarm lines
  - indicators: now, min/max, % in range over 30 days, to act on
  - am/pm chart readings, with "Record a reading" (initials, freeze indicator)
  - the **WHO monthly temperature chart** grid (+16 to −5 per am/pm, FI row, >+8 and <−0.5 alarm rows, initials, header and footer fields), printable
  - excursions (outside 2–8 °C for at least 30 min): each needs recorded actions; freeze-sensitive vaccines prompt a shake test
  - **"In this fridge"** list:
    - add a medicine, with an optional move-in
    - take out:
      - move elsewhere (transfer), or discard as unusable (wastage), with a batch choice and a reason (expired, VVM 3–4, froze with a failed shake test, heat exposure, broken, recalled)
      - stop listing; the quantity starts empty

### 6.5 Controls

**Controlled drugs (`cd.js`)**

- A register per medicine per place. Each line has:
  - running number
  - date
  - patient and bed, or from/to
  - prescriber
  - dose and residue
  - in, out, balance
  - signed by
  - witness (name and role)
  - late or corrected marks
- Balance-check rows are interleaved, and the page prints.
- **Record a dose (ward):**
  - patient chips from the ward
  - prescriber from a **staff drop-down**: the place's own team first; only staff allowed to prescribe controlled drugs; medicine-limited prescribers, e.g. a palliative nurse prescriber only for oral morphine; the patient's admitting team pre-fills it
  - dose in mg and route
  - ampoules = ceil(dose ÷ mg per ampoule), and the residue is shown in mg and mL with a "discarded in front of the witness" tick
  - warns when the last dose for that patient was sooner than the minimum gap (morphine 4 h, pethidine 3 h)
- **Oral morphine at OPD:** hand over mL = dose × (24 ÷ every) × days.
- **Witness picker:**
  - choose a role chip (second nurse on shift, nurse in-charge, doctor on duty; pharmacy: technician, second pharmacist, in-charge)
  - the **people on duty now** in that role at that place are shown (name, cadre, "on until 17:00" or "on call")
  - pick one, then send to their phone; they approve with their own sign-in
  - offline: a paper witness with a typed name, flagged for the in-charge
- **Balance check:** blind, then a witness signs. A mismatch opens a discrepancy.
- **To fix** (ordered by seriousness): counts not matching, entries without a witness, residue not recorded, doses sooner than usual, checks due (wards and dispensary daily, store weekly; a handover count counts as a check), paper witnesses.
- **Actions:**
  - add the witness (only someone who saw it; marked "added late")
  - record the disposal (late)
  - review an early dose (reason chips)
  - resolve a count:
    - recounted, matches
    - a dose was given but not entered, with:
      - the time window between the last matching count and this one
      - patient cards: patients who had this medicine there in the window first, then patients on the ward, then a free-text fallback
      - prescriber drop-down and given-by drop-down (the ward's nurses)
      - dose and route; the units must equal the shortfall
      - a datetime within the window
      - saved as a late entry at that time
    - confirmed loss: in-charge only, with an incident number, which adjusts the register
- **Paper witness tab:** the in-charge checks entries against the paper register.

**Shift handover (`handover.js`)**

- Slots are 08:00 and 17:00. A handover within ±2 h of a slot is that shift change; otherwise it is "mid-shift".
- **The user's own station only:**
  - "Your station" card: shift, the items counted, the last handover and its result, the next slot with a countdown, and who is on duty from then
  - **Handing over is fixed to you**
  - taking over: only staff **on duty at that time** (the incoming shift for a slot, the current shift for mid-shift), each shown with "on duty 17:00–08:00"
- **Steps:**
  1. Who.
  2. Blind count of the controlled medicines held there, plus high-risk ward stock (oxytocin, magnesium sulphate, ceftriaxone, gentamicin).
  3. Keys handed over. On wards: emergency tray "seal intact: no." or "opened and resealed" with a new number. Fridge temperature at that moment from the sensor.
  4. Every open item at that place, each tapped "seen": controlled-drug flags, MAR alerts, waiting or owed patients, deliveries and requests, cold-chain excursions, earlier differences.
  5. Notes.

  The incoming person accepts on their phone.

- **Controlled-drug lines** also create a balance check.
- **Flags:**
  - missed handover: no record 2 h after a slot; explained by chips (done on paper, same person covered both shifts, not done and reported, which needs a note)
  - count difference: high-risk items are resolved here, tap-only:
    - recounted, with reason chips
    - given to a patient, not recorded: the window, patient cards (prescribed first), a nurse chip, scheduled dose times or shift chips (approximate, so the shift is named on the line)
    - confirmed loss: in-charge only, with reason chips and an incident number
  - controlled-drug differences go to Controlled drugs
- **In-charge oversight:**
  - KPIs: stations handed over at 08:00 and 17:00, missed in the last 36 h, counts not matching, handovers signed today
  - every other station as a card (ward ones marked "ward tablet"); tap to filter
  - to-act-on list and full log
- Non-in-charge users see only their station's flags and log.

**Investigations (`cases.js`)**

- **Sources** (cases open themselves):
  - controlled-drug checks
  - handover differences
  - store counts (controlled or high-risk medicines, or reason "Other")
  - manual "Report a discrepancy", tap-only: place, medicine, what happened (seal looked tampered with, wrong patient, register entry altered, stock missing, suspected diversion)
- **Severity sets the deadline:** controlled = High, 24 h; high-risk = Medium, 48 h; others Low, 72 h.
- **Status:**
  - stepper: Found → Assigned → Number fixed (or Findings, for manual cases) → Submitted → Signed off
  - statuses: New, Investigating, Sign-off, Closed; overdue when past the deadline
- **Assign** (in-charge): an owner from the pharmacists and ward in-charges, and a deadline of 24 h, 48 h, 72 h or 7 days. Anyone else may "Take this case" if it is unassigned.
- **Number fixed:** the case never edits stock. It links to the source to fix it ("Fix in Controlled drugs / Shift handover / Open the count"), and the fix appears in the timeline.
- **Steps:** chips (checked the charts and MAR, checked the register, spoke to the staff on shift, searched the ward, checked the sharps bin, quarantined the batch, recounted with a witness) plus an optional note.
- **Findings:**
  - cause (given not recorded, miscounted, broken or wasted not recorded, moved without a record, expired and discarded without a record, suspected diversion, unexplained)
  - actions taken (multi-select)
  - prevention (multi-select)
  - "Suspected diversion" shows a warning to report to the medical superintendent and remove the person from controlled-drug duties
- **Submit** needs the number fixed (derived cases), a cause and at least one action.
- **In-charge:** sign off and close, send back with a reason, or escalate to the medical superintendent or the National Drug Authority.
- **KPIs:** open, not assigned, past deadline, average time to close.
- Controlled drugs and handover flags show "investigating: owner (overdue)".

### 6.6 Records

**Audit trail (`audit.js`)**

- **One timeline built from:**
  - ledger movements
  - controlled-drug checks
  - store counts started and approved
  - handovers and missed-handover explanations
  - early-dose reviews
  - late witnesses and residues
  - case events
  - cold-chain actions
  - loss actions
  - prescription check answers and queries
  - paper-witness checks
- **Filters:** period (today, 7 d, 30 d, all), person, kind of action, only flagged (late, no witness, corrected).
- **"Who did what" table:** actions, late entries, no witness, corrections. A person view adds a breakdown by kind.
- **Correct** (shown on correctable movements: hand over, administer, receive, wastage, transfer, vaccinate, emergency, returned; only when the destination balance allows it):
  - reasons: wrong quantity (with the right quantity), wrong batch (pick a batch), entered twice, did not happen, wrong patient or place (reversal only; re-enter at source)
  - creates a `reversal` movement and, if needed, a replacement with `correction_of`
  - controlled → witness
  - the original is struck through with "Corrected <when> by <who>: <reason>"

**Losses (UGX) (`audit.js`)**

- **KPIs:** lost this month (versus last month), expired on the shelf, will expire before it's used (next 6 months), unaccounted for (open cases).
- **Charts:** by cause (expired, opened-vial wastage, cold chain, damaged, unexplained shortfall, recall), by place, and monthly for 6 months. All single-series bars.
- **"Will expire before it's used":** per medicine, earliest expiry first, can-use = AMC × months to expiry − earlier batches. Actions: offer to another facility, ask NMS to swap, use first everywhere; each is recorded with who.
- A full table of the month's losses.
- Prices come from the NMS catalogue.

**Paper sheets:** printed hand-over sheets for long outages, entered back row by row with the real time.

**Reports (`productivity.js` › ReportsView):**

- HMIS 105 essential medicines (tracer items: opening, received, consumed, closing, days out of stock, months of stock)
- HMIS 105 immunisation (doses by antigen, vaccine used, wastage)
- the controlled-drugs monthly return to the National Drug Authority (opening, received, given, destroyed or lost, closing, open cases)
- monthly losses and expiries

Each report:

- is filled from data, with nothing typed
- lists issues: stop items block submission (e.g. an open controlled-drug case); remark items need a reason chip (e.g. "18 days out of stock: Not supplied by NMS this cycle"); info items
- moves Draft → Checked (anyone) → Submitted (in-charge), and the figures are snapshotted at submission
- prints in the official layout

> Map the columns to the official HMIS 105 and NDA forms with the pilot in-charge before go-live.

**Team (`productivity.js` › TeamView):**

- Prescriptions per hour by hour of day, for planning.
- The in-charge sees a table per person and shift: prescriptions, per hour on shift, median wait, owed lines, counts matched, handovers on time, late entries, no witness, cases closed. Red is shown as "something to talk about".
- Everyone else sees only their own numbers.

### 6.7 Set-up (account menu)

- **Going live:** a checklist of readiness conditions, each shown as met or missing, with who fixes it and a link (fixes H5), including the legal answers that gate permissions (S13).
- **Places:** places and fridges.
- **Medicines:** superseded. Build exactly what `MEDICINES-TAB.md` describes (reference: `prototype/medicines-tab.dc.html`).
- **Rules (read-only):**
  - signed values: witness rules, minimum CD gaps, handover slots, case deadlines, count reasons, check rules
  - for a one-person lab, the CSO or medical superintendent can be named as the second signer
- **People:** roster and duty, prescriber list, nurse lists.
- **SMS:** templates and on/off.
- **Labels:** printer.

### 6.8 Cross-cutting

- **Find or scan:** medicine, batch number, patient, ward, delivery note. The result offers its actions (open, recall, count, issue).
- **+ Start a job:** dispense next, receive, issue, count, recall, record a CD dose, hand over, report a discrepancy.
- **Emergency supply:** give it first, record it in two taps (controlled → witness), and finish the prescription within the shift (it shows on Today).
- **Offline:** writes are queued on the device (IndexedDB outbox) with idempotency keys and show a count of changes still to send. Paper is only for when the device is dead. A paper witness is used when the network is down.

## 7. Non-functional

- **Phone:** works at 390 px with no horizontal page scroll, except inside tables with a card fallback. Touch targets are at least 44 px. One gutter.
- **Performance:** a page loads in at most 4 queries. Shared loaders are wrapped in `React.cache`. Only the active tab's data loads. Lists are paginated past 100 rows. The target is p95 under 300 ms on 3G-like latency.
- **Security:** write checks are enforced in SQL (RLS or guard triggers) as well as in TypeScript (fixes M4). Idempotency keys are stored per action and never regenerated on remount (fixes M10).
- **Accessibility:**
  - no axe serious issues
  - identity never shown by colour alone
  - red and green only for clinical state
  - amber only for late, held or overdue
- **Design:** Tide (`DESIGN-medsync.md`) tokens only. **No coloured left or side accent borders anywhere.** No very dark themes. Promote the shared kit to `components/tide` (fixes L3).
- **Copy:** signed content only; new strings are drafts; the lint in S12 applies.

## 8. Out of scope for this build (leave behind flags, do not delete)

Partner network, imports and GS1 seals, reactions and stewardship modules beyond the Rx info card, emergency carts as a separate module, and price management beyond a UGX unit price.

## 9. Open decisions — build the default, keep it switchable

| Decision                                         | Default to build                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Legal Q1: who may hand over without a pharmacist | Gate permissions on the recorded answer; strict until it is recorded                               |
| Who may witness, and may nurses witness          | Pharmacy staff and ward roster roles. Nurse witnessing is behind a Rule, default on for ward doses |
| Quantity chips at dispensing (SU-6)              | Keep typed                                                                                         |
| How long a device may hold CD entries offline    | 12 h, then block new CD entries until synced                                                       |
| Luganda wording                                  | Draft until a native speaker signs                                                                 |
| HMIS 105 / NDA exact columns                     | Simplified layout; map with the pilot in-charge                                                    |

## 10. Acceptance scenarios (end to end; also the demo script)

1. Pharmacist at the OPD dispenses r1: the allergy stop blocks; "Talk to the prescriber" holds amoxicillin; paracetamol is handed over with identity checked; the query appears on Today.
2. A child's paracetamol dose flags 25 mg/kg; "Prescriber aware" is chosen; hand over succeeds; the audit trail shows the check answer.
3. The store receives the expected NMS delivery (10 lines, 1 controlled) with one witness, and on-hand stock rises.
4. Issue to Maternity as suggested: the stock shows as on the way; the ward confirms; the stock moves.
5. A ward nurse records morphine 5 mg IV with a 5 mg residue, a witness on duty and the disposal ticked; the register balance drops by 1.
6. A controlled-drug balance check at Paediatrics comes up 1 short; a case opens (High, 24 h); a late entry resolves it; the in-charge signs off.
7. A 17:00 handover at the OPD to the incoming night technician, with all items seen, creates a balance check. Ward 3's missed 08:00 slot shows to the in-charge only.
8. Correct a hand over of 15 caps to 10: a reversal and a replacement are created, the original is struck through, and the balance is right.
9. The month-end count of 300 batches is resumed after a reload, approved, and adjustments post.
10. Order: Fit to budget trims Necessary and Essential lines, and Vital lines are unchanged.
11. Losses: the October total equals the sum of the loss movements plus the EPI opened-vial wastage. Amlodipine shows as at risk.
12. The HMIS 105 medicines report needs remarks for stock-out days; the controlled-drugs return is blocked while a controlled-drug case is open.
13. Offline: hand over and receive while offline; the outbox count rises; reconnect, and the changes are sent exactly once.
14. At 390 px, every page has no horizontal scroll and the bottom pill navigation works.
