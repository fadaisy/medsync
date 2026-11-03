# Pharmacy rework: handoff

The living note for the reworked pharmacy workspace (kit: `docs/pharmacy/rework/`). Branch `feat/pharmacy-rework`,
worktree `~/Desktop/medsync-rework`, cut from the stock-up polish branch (fe6f448c).

## Before it can go live (owner)

1. Apply the migrations from this worktree, in order: `cd ~/Desktop/medsync-rework && npm run db:migrate`
   (0264 from the base branch, then 0265 to 0269). All are GATED and additive.
2. Sign the copy. Production shows `/pharmacy` as not found while `PHARMACY_REWORK_COPY` (`content/pharmacy-rework.ts`)
   is draft. Also draft: `content/pharmacy-rework-daily.ts`, and the records swept back to draft for re-signing
   because build codes were removed from them (`PHARMACY_CLINICAL_COPY`, `PHARMACY_NETWORK_COPY`,
   `PHARMACY_STORES_SUPPLY_COPY`, `PHARMACY_STORES_COPY`).
3. Unset `PHARMACY_DEV_HOSPITALS` and `DEV_SKIP_MFA` in production: the app now refuses to boot with either set.
4. Switch on the tiers per hospital: `PHARMACY_CORE`, `PHARMACY_WARDS`, `PHARMACY_EPI`, `PHARMACY_INSIGHTS`
   (`1` or hospital ids). The old flags still work as the fallback for each tier.
5. Record legal question 1 (who may hand over without a pharmacist). Until it is recorded, production uses the strict
   permission map.
6. Add the environment values: `PHARMACY_SMS_INBOUND_KEY` (the SMS provider's inbound callback, `?key=`) beside the
   Africa's Talking values already used; the daily SMS cron (`/api/pharmacy/sms/daily`, 08:00 Kampala) is in
   `vercel.json` and uses `CRON_SECRET`.
7. Fill the duty roster (Set-up › People and roster). With no roster rows anyone on the signed witness list may
   witness and anyone with `pharmacy.manage` may approve a count; Going live lists the roster as missing.

## What is built

- **Foundations (0265):** the ledger guard refuses negative, expired, recalled and quarantined stock out; a controlled
  movement out needs one witness approval, used once, at most 10 minutes old, from someone else on duty there; a
  downtime entry is allowed (a controlled one names its paper witness) and the batch then needs a count before its
  next live movement out; a reversal mirrors its movement exactly, once; one idempotency key writes once; a line
  entered more than 30 minutes late is marked late. Demo removal is frozen (demos belong in a separate project).
- **Shell:** six sections, sub-tabs, one h1 per page, bottom pill under 761 px, Find (Ctrl K), Start, station chip,
  network pill, Emergency. One href map (`lib/pharmacy/ia.ts`) drives the nav, Find and redirects for every old URL.
- **Witness:** the actor picks a person on duty; the witness approves on their own signed-in screen. Offline, a paper
  witness's name is recorded.
- **Daily work (0266):** Today ranked by role; Dispense (Waiting, Ready, Owed, Handed over) with the checks panel;
  the hand-over is refused while a check on a given line is unanswered; Store with Receive (one witness per
  delivery), Issue, Count (resumable blind sheet, posts only on the in-charge's approval), Order (Fit to budget never
  cuts Vital lines); Medicines and recall. An approved count opens a case for a controlled medicine's difference
  (High) or one explained only as "other" (Low).
- **Controls (0267):** Controlled drugs (register from the ledger plus dose detail, balance checks, To fix), Shift
  handover (own station only unless in-charge; accepting writes the CD check and opens cases), Cases (24/48/72 h by
  severity, sign-off by the in-charge, self sign-off flagged when there is one in-charge). Nurses record ward CD
  doses at `/nurse/cd-dose` with a witness on the roster.
- **Patients and cold chain (0268):** Inpatients (ward picks, MAR alerts), Outpatients (refills, pill counts,
  check-ins), Immunisation (a dose takes one dose off the clinic's stock; VVM 3, expired and full vials refused in
  SQL; opened-vial wastage booked), Reminders (SMS rules; an opted-out number is never sent to), Cold chain in the
  Store (sensor readings by per-fridge key, excursions, discards booked as wastage).
- **Records and Set-up (0269):** Audit with corrections (reversal then replacement, once, own entries unless
  in-charge), Losses from the ledger only, Reports (HMIS 105 and NDA return; stop items block submit, only the
  in-charge submits, the snapshot is frozen), Team, paper Sheets. Set-up: Going live, Places, Medicines, Rules,
  People and roster, SMS.

- **Old pages removed:** every old page whose URL redirects (window, shelf, the store lists, controlled, downtime,
  needs-you, open lines, supplied, refills, the clinical cards) and the code only they used. Kept with their URLs,
  because the new pages open them: prescription review and hand-over, labels, slip, recall, the controlled register
  copy, a reaction report and a medicines reconciliation. Delivery, issue and ward detail open inside Stock › Store.
  Emergency carts as their own module went with their pages (PRD: out of scope).
- **Not removed yet (TECH-SPEC §9):** the second dispensing-points model, the second signed-content store, the
  lab `v2` component imports and the JSON-edited signed packs. Each touches live tables or other workspaces; they
  need their own change.

## Defaults taken (PRD §9 and judgement calls)

- **Checks panel rules:** the prototype's dose and kidney thresholds are marked "sample rules, not a clinical
  reference", so they were not ported. The panel shows the prescriber's signed checks stored on each line
  (`lib/prescribing/plan-checks.ts` at prescribing time) and the pharmacist answers each. Re-running the checks against
  fresh patient facts at the window is a follow-up for the CSO.
- **"Talk to the prescriber"** holds the line; the query itself is sent through the existing query flow.
- **Quantity at dispensing** stays typed (SU-6).
- **Order cycle and buffer:** the proposal still uses the signed maximum months (= cycle + buffer). Chips to choose
  them per order are not built.
- **Issue "on the way":** the store posts both legs when it issues (IS-2) and the ward confirms or records a
  difference (IS-3); stock is not held in a transit place.
- **Emergency supply** is the red Emergency button in the shell (hospital emergency); Start lists the jobs.
- **Nurse witnessing** on wards: allowed through the roster roles.
- **Offline:** count lines are kept on the device (IndexedDB) and sent when the network is back; the network pill
  shows how many wait. A hand-over needs the server's identifier check, so offline it goes on the paper downtime sheet
  (Records › Sheets) and is entered late, marked late. Controlled entries offline use the paper witness.

- **Missed handovers** count only from a place's first recorded handover: on the first day nothing is "missed",
  each place shows its next handover as due.
- **Count cases:** the PRD names counts as a case source but not when; an explained, non-controlled difference
  closes with the approval.
- **Clinical defaults, all draft for the CSO:** controls (`CONTROLS_RULES`: strengths, minimum dose gaps,
  high-risk names, check intervals); immunisation (`RULES` in the patients copy: excursion 2–8 °C for 30 min,
  BCG/MR vials 6 h and others 28 days, defaulter at 7 days, 28 days between doses, the UNEPI schedule unconfirmed);
  refills due within 5 days, check-in every 2 days, adherence bands 80 % and 95 %; SMS on by default, English only.
- **Reports:** simplified HMIS 105 and NDA layout; tracer list = every product moved or held that month.

## Set-up › Medicines (3 Nov 2026, branch `feat/pharmacy-medicines`, ADR 0471)

Before it goes live (owner):

1. Apply GATED 0270 from the main folder: `cd ~/Desktop/medsync && npm run db:migrate`. Until then Set-up › Medicines
   says it needs the update and Stock › Medicines keeps the old table.
2. Sign the copy: `PHARMACY_MEDICINES_COPY` (`content/pharmacy-medicines.ts`) is draft. The prescription-check dose
   lines (`RX_CHECKS`) need the CSO's sign-off.
3. Confirm the national controlled list (`data/pharmacy/national-list/controlled.v1.json`, `unconfirmed`) and the
   starter brands against the NDA register.
4. Decide who the second rule signer is. Today it is anyone with `pharmacy.view` other than the first signer.

Checks: `tests/emr-db/pharmacy-medicines.test.ts` (PGlite: identity index, local line, national lock, two signatures,
bulk history, top-up and Undo), `tests/pharmacy/medicines-derive.test.ts`, `tests/pharmacy/medicines-source.test.ts`.

## Set-up › People and roster (3 Nov 2026, branch `feat/pharmacy-roster`)

Spec: `docs/pharmacy/rework/PEOPLE-ROSTER.md`; map: `RECON-ROSTER.md`. Before it goes live (owner):

1. Apply GATED 0273 (after 0271, 0272) from this branch's folder: `cd ~/Desktop/medsync && npm run db:migrate`.
   Until then the tab says it needs the update. The strict duty rules switch on per hospital once it lists its people.
2. Sign the copy: `PHARMACY_ROSTER_COPY` is draft (`content/pharmacy-roster*.ts`). Wording added beyond the spec:
   the unlock dialog, "n could not be copied without breaking a rule", "Signed in.", the swap form's "no shifts" line,
   "Everyone at this hospital is already on the roster", and the licence-number field on Record renewal.
3. Confirm the rules the roster enforces: 2 per shift, 6 day/night shifts a week, 10 and 15 minutes, 30 days, 7 days
   (each a signed number in Rules), and that PSU (pharmacists) and AHPC (technicians, dispensers) are the bodies.
4. Confirm the Eid dates: the dev seed stores 2027 estimates as `confirmed = false`; the gazette replaces them.
5. Decide the sign-in device: sign-in is a button on On duty now; no attendance device is linked.

Not built, no source yet: ward rosters (the Doctors and nurses view shows its empty state), in-app staff messaging
(the contact card has Call and SMS only), and the prescriptions/doses lists on that card. On duty now re-reads every
30 s (no realtime channel). Swap and leave states use ink chips, not green, because green is the patient's state only.

Checks: `tests/emr-db/pharmacy-roster.test.ts` (database rules), `tests/emr-db/pharmacy-roster-actions.test.ts`
(actions on the demo lane), `tests/pharmacy/roster-derive.test.ts`. Visual: `/styleguide/pharmacy-roster` (dev only).

## Still open

- Luganda wording: draft until a native speaker signs.
- HMIS 105 and NDA return columns: simplified layout; map with the pilot in-charge.
- How long a device may hold controlled-drug entries offline: 12 h default (PRD §9). Not enforced in the app:
  controlled entries are never queued offline (they go on paper), so there is nothing to hold.
- Ward "return unused": the store's return refuses a ward as the source, so a ward return shows as unaccounted in
  Track until the ward is counted.
- Refills still list a stopped repeat until 30 days after its end date.
- Immunisation coverage against target and RED/REC: no catchment population exists yet.
- Privacy: an EPI client's name is stored in plain text (the phone is encrypted); the SMS queue decrypts first
  names directly rather than through the audited identity reveal. Both need a decision before go-live.
- Not built: OPD oral-morphine take-home in the hand-over, fridge temperature at shift handover, "dose sooner than
  usual" inside the nurse dialog (it is flagged afterwards in To fix), Team median wait and owed lines.
- Set-up has no screens yet to add fridges, EPI clinics and vaccines; only the dev seed creates them.
- Dev seed: `PHARMACY_SEED_OK=1 DATABASE_URL=… npx tsx scripts/seed-pharmacy-dev.ts <hospital-id>` (test
  hospitals only).
