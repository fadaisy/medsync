# Pharmacy Phase 4: how to use it

Repeats, renewals and refills (Steps 2 to 5). Partner routing (Step 6 onwards) is not built: it waits for the DPO or legal adviser (D-PH4-29).

Everything here is **dark**. The migrations are written but not applied, every flag is off, every pack is unsigned and the wording is draft. Nothing changes for anyone until the owner switches it on. Part 1 gives the order for that.

Contents:

1. Switching it on (owner)
2. Signing the packs (pharmacy in charge, pharmacist reviewer, CSO)
3. The prescriber: the Repeats step, the print, stopping repeats
4. The prescriber: renewal requests
5. The patient: Repeat medicines and asking for a supply
6. The pharmacy: the Refills page, tab by tab and action by action
7. What the system refuses, and what to do
8. The demo catalogue
9. For developers: files, tests, limits

---

## 1. Switching it on (owner)

Nothing goes on until three things are in: the legal answers, the Act record and the verifier's name (owner instruction, 26 Oct 2026). Once they are, go in this order.

**1.1 Apply the migrations** from the worktree that holds them:

```bash
cd ~/Desktop/medsync-network && npm run db:migrate
```

| Migration | What it adds                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0230      | the ten Phase 4 tables (repeat authorisations and their events, renewal requests, refill requests, lines, events and instances, saved collectors, and more) |
| 0231      | the network data rules, including the stock pair check that lets a refill be handed over from a point's "Held refills" place                                |
| 0232      | the five Phase 4 pack kinds on `pharmacy_signed_sets`                                                                                                       |

**1.2 Set the flags**, per hospital (`1` means every hospital, or a comma-separated list of hospital ids). Each flag needs the ones above it:

| Flag                  | Turns on                                                                                                      | Needs                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `PHARMACY_WORKSPACE`  | the pharmacy workspace (Phase 1)                                                                              | already in use                               |
| `PHARMACY_DISPENSING` | Phase 1 dispensing                                                                                            | the workspace                                |
| `PHARMACY_REPEATS`    | the Repeats step in prescribing, Stop repeats, the printed repeats line, Renewal requests, the workspace lane | the workspace                                |
| `PHARMACY_REFILLS`    | the Refills page and nav item, and the patient's Repeat medicines section                                     | `PHARMACY_REPEATS` and `PHARMACY_DISPENSING` |

In production every Phase 4 flag stays off by itself while `PHARMACY_NETWORK_COPY` in `content/pharmacy-network.ts` is `draft`. The CSO and the pharmacist reviewer sign the wording; then set its status to `signed` with the signers and the date.

**1.3 Sign the packs** (Part 2). With the flags on but the packs unsigned, each feature shows its "while unsigned" behaviour: nothing unsafe happens, but nothing much happens either.

**1.4 Deploy.** The owner deploys.

---

## 2. Signing the packs

**Where:** Pharmacy → Store → Packs. Phase 4's five packs are listed there, after Phase 2's. Each one is written as JSON in the pack dialog.

**Who signs:** the person who saves the draft signs first, with their own password and code. A different second signer then confirms with theirs. The CSO may sign alone, by the recorded exception (D-PH4-29, for Steps 2 to 5 only).

| Pack                    | Signers                   | While unsigned                                                                         |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| Repeat rules            | Pharmacist reviewer + CSO | No Repeats step is shown; a line sent with repeats is refused whole                    |
| Refill timing           | Pharmacy in charge + CSO  | Patients can ask at any time; nothing is labelled early or late except by the interval |
| Hold rules              | Pharmacy in charge + CSO  | Refills cannot be set aside                                                            |
| Renewal decline reasons | CSO + Pharmacist reviewer | Renewals are answered only by Renew or Book a visit (Decline is absent)                |
| Routing rules           | Pharmacist reviewer + CSO | Nothing can be routed (routing itself is Step 6, not built)                            |

Hold rules and decline reasons take two signers here, where Appendix D names one. That is stricter, never looser.

**What each pack holds.** Every value is the hospital's own decision. MedSync proposes none, and nothing has a default.

```jsonc
// repeat_rules
{
  "repeatList": ["<medicine id>", "..."],   // medicines that may have repeats
  "neverRepeat": ["<medicine id>", "..."],  // medicines that never may (wins over the repeat list)
  "maxSupplies": 0,      // most further supplies on one line (1 to 99)
  "maxPeriodDays": 0,    // longest a line's repeats may run
  "minIntervalDays": 0,  // fewest days between supplies (at least 1)
  "toleranceDays": 0     // how early a supply may be, in days; less than minIntervalDays
}
// refill_timing
{ "requestWindowDays": 0, "lateWindowDays": 0 }
// hold_rules
{ "holdDays": 0, "extensions": 0, "holdLongerMaxDays": 0, "missThreshold": 0 }  // holdLongerMaxDays ≥ holdDays
// renewal_decline_reasons
{ "items": [{ "code": "lower_snake_case", "words": "What the patient and pharmacy read" }] }
// routing_rules (read by Step 6)
{ "routingList": [], "neverRouted": [], "responseWindowHours": 0 }
```

A signed pack is in force until a newer version is signed; the old one retires in the same step. To change a pack, save a new draft and sign it.

---

## 3. The prescriber: Repeats, the print and Stop repeats

**Who:** prescribing cadres, in the clerking desk's Plan step (`CLERKING_PLAN_V2`) with `PHARMACY_REPEATS` on and the repeat rules signed.

**3.1 Adding repeats to a line.** In the prescribing dialog, each line on the repeat list has a **Repeats** switch ("No repeats" or "Repeats on"). Turn it on and fill four fields:

| Field                      | Meaning                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| Further supplies (up to N) | how many supplies after the first; N is the signed maximum                  |
| At least … days apart      | the interval between supplies; no less than the signed minimum              |
| Not after                  | the last day a repeat may be supplied (day, month and year boxes)           |
| Review by (optional)       | the date of the next clinical review, from today up to the last repeat date |

Under the fields, the line shows in words what the pharmacy may do. For example: "After the first supply, the pharmacy may supply this 2 more times, at least 28 days apart, until 30 April 2027. You can stop the repeats at any time."

The repeats are authorised when the plan is sent, in the same transaction, under the rule version in force. Out-of-range values are refused, and the whole line goes back. A controlled drug is refused by the backstop whatever the list says.

**3.2 The printed prescription.** Under each line with live repeats, the print adds: "Repeats: N, at least D days apart, not after DATE. Prescriber: NAME, COUNCIL NUMBER." The rest of the printed page is unchanged.

**3.3 Stopping repeats.** The line's repeats tag has **Stop repeats**. Give a reason, then confirm. No further supply is made against these repeats; the line itself is unchanged. The first stop stands, and later stops change nothing. A nurse cannot stop repeats. Cancelling the line also ends its repeats.

---

## 4. The prescriber: renewal requests

**Where:** Doctor → Renewal requests (`/doctor/renewals`), and the workspace's **Renewal requests** lane (key `r`, shown to prescribing cadres with the flag on).

**Why a request arrives:** a patient or the pharmacy asked for a supply the repeats do not cover. Each card's **Why** tag gives the reason:

| Why                          | Meaning                                                |
| ---------------------------- | ------------------------------------------------------ |
| No repeats authorised        | the line never had repeats                             |
| No repeats left              | every further supply has been used                     |
| Repeats past their last date | today is after "Not after"                             |
| Repeats stopped              | a prescriber stopped them                              |
| Held for a clinical review   | a suspected reaction or a stewardship review blocks it |
| Asked before the interval    | asked too early                                        |
| Asked by the pharmacy        | the pharmacist used "Ask the clinic"                   |

Each card also shows the medicine, last supplied, repeats used ("2 of 3"), the review date and any note. Cards are oldest first. A card stays listed until someone answers it; nothing closes by itself.

**Three answers:**

- **Renew** opens the prescribing dialog on the patient's visit, pre-loaded with the medicine. Sending the plan answers the request and links it to the new prescription. If the source visit is closed, the card says "Open a visit for this patient to renew."
- **Book a visit** closes the request as "Visit needed". The patient and the pharmacy are told. Book the visit in scheduling.
- **Decline** asks for a reason from the signed list, plus an optional note. The patient is told to contact the clinic, and the pharmacy is told. While the decline reasons are unsigned, Decline is not shown.

---

## 5. The patient: Repeat medicines

**Where:** Track → Medications (`/patient/track/medications`), in the **Repeat medicines** section. It appears only when `PHARMACY_REFILLS` is set.

**5.1 Reading it.** Each medicine with repeats gets one sentence:

| Sentence                                                | When                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| You can ask for this now.                               | a supply is allowed today                                       |
| Next supply due around DATE.                            | too early today; or the first supply is still open              |
| Your doctor needs to renew this before the next supply. | none left, past the last date, stopped, not authorised, or held |
| Not refilled without seeing a clinician.                | the medicine is on the hospital's never-repeat list             |

Under the sentence, where it applies: "N more supplies allowed until DATE. Next review by DATE." Then the state of the latest request, if there is one: Sent; Ready to collect at PLACE, until DATE; Sent to your clinic to renew; or Not collected in time: ask again when you need it.

**5.2 Asking.** The button matches the medicine's state:

- **Ask for my next supply** is shown when a supply is allowed, or when it is almost due (inside the signed request window).
- **Ask my clinic to renew it** is shown when the repeats do not cover the next supply. It sends a renewal request to the prescriber (Part 4).

The dialog asks:

1. **Where:** a live dispensing point at that hospital;
2. **Who will collect:** Me, a saved collector, or Someone else (their name and their relationship to you; they are saved for next time);
3. **Anything the pharmacy should know** (optional).

Tap **Send the request**. While a request is open, the button is hidden. A second ask from another channel (the window, the phone) joins the same supply, so only one repeat is used. A medicine whose first supply is still open is refused with "supply it from the queue".

---

## 6. The pharmacy: the Refills page

**Where:** Pharmacy → **Refills** (`/pharmacy/refills`), after Supplied today. Anyone with `pharmacy.view` sees it. The actions need `pharmacy.dispense` at a live dispensing point. Choose the point in the top bar: each point sees its own refills, plus everything that needs the clinic.

**6.1 The six tabs**, each with its count:

| Tab               | What is in it                                                         |
| ----------------- | --------------------------------------------------------------------- |
| To prepare        | allowed requests waiting to be set aside                              |
| Needs the clinic  | requests the repeats do not cover, or asked early; the clinic decides |
| Prepared, waiting | set aside and held for the collector, within the hold                 |
| Collected today   | handed over today                                                     |
| Not collected     | past the held-until date and still on the held shelf                  |
| With a partner    | routed to a partner pharmacy (Step 6; empty until then)               |

**6.2 Each row** shows the patient (name and record number), the medicine, what the prescription allows ("2 more supplies, at least 28 days apart, until DATE", "None left" or "No repeats authorised"), the last supply ("4 October 2026, asked 8 days before it was due"), where to collect, the collector and any note. The labels on the right:

- **Late: asked well after the refill date** has the caution mark. The patient may have run out, so it is a clinical prompt; ask how they managed.
- **Early: possible from DATE** is a plain tag. The row sits under Needs the clinic, and nothing is prepared early.
- **Held until DATE** is a plain tag on prepared rows.

**6.3 The actions**, one set per row:

**To prepare → Set aside.** Choose the product, then type the quantity as written. The stock moves from this point's shelf to its **Held refills** place, first expiry first, and only from batches that last to the held-until date. Nothing is handed over yet. The patient sees "Ready to collect at PLACE, until DATE". This needs the signed hold rules. **Ask the clinic** is offered here as well.

**Prepared, waiting / Not collected → Hand over.**

1. Ask the collector for the patient's date of birth or phone number, and type it as they say it. MedSync checks it without showing the stored value. A mismatch says how many tries are left today; after the daily limit the typed check closes until the pharmacy in charge reopens it (Phase 1).
2. Record the payment: Paid, Insured, Emergency or Not recorded. Where the hospital requires a payment status, Not recorded is refused.
3. Tap **Hand over**. Each line is checked again first. Nothing is handed over if the refill was released, the prescriber stopped or changed the line, the repeats no longer allow it, or a held batch has expired or been recalled. The refusal says which; release the refill instead.

The hand-over is recorded as a normal supply (Phase 1's hand-over, supplies and stock movements), out of the Held refills place. It uses one repeat, even when it spans two batches.

**Prepared, waiting / Not collected → Release to the shelf.** Choose why: not collected in time, the patient asked, the prescription changed, or a problem with the stock. Every held unit goes back to this point's shelf. The patient may ask again.

**Prepared, waiting / Not collected → Hold longer.** Give a new date (YYYY-MM-DD) and why (the patient called, or the collector is delayed). The signed hold rules cap the number of extensions and the longest hold.

**Needs the clinic → Ask the clinic.** Add an optional note for the clinic. A renewal request goes to the prescribers (reason "Asked by the pharmacy"), and the patient is told. Pharmacists with `pharmacy.dispense` or `pharmacy.review` can do this without a point.

**Recording a request at the window or by phone:** the server action (`requestRefillAtWindow`) is built and tested, but the board has no dialog for it yet. For now the patient asks from their own page.

---

## 7. Refusals, and what to do

| You see                                                                          | Do                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Refills cannot be set aside until the hold rules are signed.                     | sign the hold rules (Part 2)                           |
| Not enough stock here lasts to the held-until date.                              | receive or move stock, or set aside a smaller quantity |
| The quantity is a whole number above zero.                                       | retype the quantity                                    |
| Choose a product of this medicine.                                               | pick a product from the list                           |
| This refill is for another dispensing point.                                     | switch to that point in the top bar                    |
| This refill is not waiting to be prepared.                                       | someone else acted first; the page refreshes           |
| The first supply of this medicine is still open: supply it from the queue.       | supply it from the Queue (Phase 1)                     |
| Check the date of birth or phone number first.                                   | type the identifier in the Hand over dialog            |
| Record the payment status.                                                       | choose a payment status other than Not recorded        |
| Hand over the lines of one request at a time.                                    | hand each request over separately                      |
| No more extensions are allowed. / That is past the longest a refill may be held. | release the refill; the patient can ask again          |
| The repeats no longer allow a supply now. Ask the clinic.                        | use Ask the clinic                                     |
| That medicine is not on this patient's record.                                   | check the patient; the line belongs to someone else    |

---

## 8. The demo catalogue

A full set of demo rows for every screen, rendered by the real views. There is no database behind it, no signatures and no flags. Every save answers **"Demo: nothing is saved."**

**Run it locally:**

```bash
cd ~/Desktop/medsync-network && MEDSYNC_FIXTURES=1 npx next dev --webpack -p 3107
```

(Webpack, because the worktree's `node_modules` is a symlink that Turbopack refuses. Without `.env.local`, also set `SKIP_ENV_VALIDATION=1` and a placeholder `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`.)

| Screen                                           | What it shows                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/styleguide/pharmacy-network/refills`           | the Refills board: 44 rows over five tabs, every label, channel and collector kind, with all actions |
| `/styleguide/pharmacy-network/refills-view-only` | the same board for a viewer without `pharmacy.dispense` (no buttons)                                 |
| `/styleguide/pharmacy-network/patient-repeats`   | one patient's 12 repeat medicines: every sentence, every request state, both ask buttons             |
| `/styleguide/pharmacy-network/renewals`          | 21 renewal requests: every reason, with and without a visit, with demo decline reasons               |
| `/styleguide/pharmacy-network/renewals-unsigned` | the same list while the decline reasons are unsigned (no Decline)                                    |

**What the demo is not:**

- Patients are record numbers only (`MS-DEMO-0001`). Collectors are "Collector NN".
- Medicines are names only: no strengths and no doses.
- The repeat counts and intervals only fill the sentences. They are not a proposal for any pack.
- The decline reasons say "Demo reason: …" so they are never taken for the signed list.
- Nothing is loaded into any database. A database demo, like the lab's, would need signed packs with demo values in demo hospitals. That is the owner's decision, the same one taken for the lab on 18 Oct.

The catalogue is `lib/pharmacy/network-demo.ts`; `tests/pharmacy/network/demo.test.ts` keeps it complete and keeps it to these rules.

---

## 9. For developers

| Area                 | Files                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flags                | `lib/pharmacy/feature.ts` (`pharmacyRepeatsLiveFor`, `pharmacyRefillsLiveFor`)                                                                        |
| Packs                | `lib/pharmacy/network-packs.ts` (schemas, `networkPack`), shown on the Packs page through `lib/pharmacy/stores/packs.ts`                              |
| Repeats (prescriber) | `lib/prescribing/repeats.ts` (pure), `lib/emr/write/repeats.ts`, `lib/emr/actions/repeats.ts`, `components/clerking/plan/repeats.tsx`                 |
| Renewals             | `lib/emr/read/renewals.ts`, `app/doctor/renewals/` (`renewals-list.tsx` is the view)                                                                  |
| Refills              | `lib/pharmacy/refill-store.ts` (writes), `lib/pharmacy/refill-read.ts` (board and patient), `app/pharmacy/refills/`, `app/pharmacy/refill-actions.ts` |
| Patient              | `app/patient/track/medications/refill-actions.ts`, `_components/patient-refills.tsx`                                                                  |
| Copy                 | `content/pharmacy-network.ts` (draft)                                                                                                                 |
| Demo                 | `lib/pharmacy/network-demo.ts`, `app/styleguide/pharmacy-network/[screen]/page.tsx`                                                                   |

**Tests:**

```bash
SKIP_ENV_VALIDATION=1 npx vitest run tests/pharmacy
```

```bash
SKIP_ENV_VALIDATION=1 EMR_PGLITE=1 npx vitest run tests/emr-db/pharmacy-refills.test.ts
```

```bash
SKIP_ENV_VALIDATION=1 EMR_PGLITE=1 npx vitest run tests/emr-db/pharmacy-repeats.test.ts
```

Run the PGlite lanes one at a time. Scenarios S10 to S24 are listed in `STOP-REPORTS.md`.

**Known limits** (also in STOP 5):

- one medicine per patient request from the app;
- no withdraw;
- no "don't save this collector" choice;
- no window or phone dialog on the board;
- releasing a held batch that has since been recalled may be refused by the stock guard;
- the Partner tab waits for Step 6;
- the plural in "1 more supply" and "once more" was corrected in the draft copy (26 Oct), so the CSO signs the corrected wording.
