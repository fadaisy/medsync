# Pharmacy rework: handoff

The living note for the reworked pharmacy workspace (kit: `docs/pharmacy/rework/`). Branch `feat/pharmacy-rework`,
worktree `~/Desktop/medsync-rework`, cut from the stock-up polish branch (fe6f448c).

## Before it can go live (owner)

1. Apply the migrations from this worktree, in order: `cd ~/Desktop/medsync-rework && npm run db:migrate`
   (0264 from the base branch, then 0265 onwards). All are GATED and additive.
2. Sign the copy. Production shows `/pharmacy` as not found while `PHARMACY_REWORK_COPY` (`content/pharmacy-rework.ts`)
   is draft. Also draft: `content/pharmacy-rework-daily.ts`, and the records swept back to draft for re-signing
   because build codes were removed from them (`PHARMACY_CLINICAL_COPY`, `PHARMACY_NETWORK_COPY`,
   `PHARMACY_STORES_SUPPLY_COPY`, `PHARMACY_STORES_COPY`).
3. Unset `PHARMACY_DEV_HOSPITALS` and `DEV_SKIP_MFA` in production: the app now refuses to boot with either set.
4. Switch on the tiers per hospital: `PHARMACY_CORE`, `PHARMACY_WARDS`, `PHARMACY_EPI`, `PHARMACY_INSIGHTS`
   (`1` or hospital ids). The old flags still work as the fallback for each tier.
5. Record legal question 1 (who may hand over without a pharmacist). Until it is recorded, production uses the strict
   permission map.
6. Fill the duty roster (Set-up › People and roster). With no roster rows anyone on the signed witness list may
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
  cuts Vital lines); Medicines and recall.

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

## Still open

- Luganda wording: draft until a native speaker signs.
- HMIS 105 and NDA return columns: simplified layout; map with the pilot in-charge.
- How long a device may hold controlled-drug entries offline: 12 h default (PRD §9).
