# Review findings (condensed from "Pharmacy Workspace Review", 29 Oct 2026)

Code paths are relative to the MedSync repo as reviewed (`feat/pharmacy-stock-up-polish` @ c7b5ae79). Verify before acting; unverified claims are marked.

## C1 · Critical — In production, a normal hospital's pharmacy is view only, and no screen can change that

- **Evidence:** dispensingMap() ( lib/pharmacy/access.ts:69–76 ) returns map v1 whenever VERCEL_ENV is production and the hospital is not on PHARMACY_DEV_HOSPITALS . v1 grants only pharmacy.view . Recording legal answers on Going live does not switch it: legal_answers is read only by readiness and go-live. Legal questions 1–6 are open.
- **Why:** Real dispensing can only happen under the owner's development override, which says of itself that it is "not a legal answer" (ADR 0394). Moving a pilot hospital to real dispensing would need a code deploy on pilot day.
- **Fix:** Gate the map on the recorded interim answer to legal question 1 for each hospital, not on a code constant. Show on Going live which answer is missing. Then retire the dev override for the pilot hospital.

## C2 · Critical — Controlled drugs leave ward and cart stock with no witness and no register entry

- **Evidence:** lib/pharmacy/stores/ward-store.ts:459–525 books a ward count below balance as ward_used with no attestation. cart-store.ts:290 writes cart_used . 0127:20 makes dispensing_point_id NOT NULL on controlled entries. The ledger guard ( 0180:301–340 ) has no controlled-drug check. Resus doses take a typed witness name (catalogue STOP-REPORTS Q10).
- **Why:** A morphine shortfall on a ward is recorded as "used" by one person and never reaches the in-charge or the Controlled drugs page, which is exactly the accountability gap the module exists to close.
- **Fix:** Make the ledger guard refuse a controlled out-movement without witness_attestation_id (downtime excepted and flagged). Give controlled entries a location_id . Raise pharmacy_controlled_differences on any ward or cart shortfall of a controlled drug.

## C3 · Critical — Demo data lives in the production database, and removing it breaks append-only

- **Evidence:** Demo rows go into real tables in a production hospital flagged as demo ( 0250:5–7 ). Real staff dispensed demo prescriptions ( 0262:1–9 ). The demo withdrew a real signed content entry ( 0261 ). Removal hard-deletes with DISABLE TRIGGER on clinical tables shared by every hospital ( 0263:197 ). It took three fix migrations in one day, 29 Oct. No pharmacy page shows a demo marker.
- **Why:** Flag the wrong hospital, or let real work get tangled with demo rows, and real clinical records are deleted with one summary audit row. Disabling triggers in production also takes exclusive locks on tables every hospital uses.
- **Fix:** Run demos in a separate Supabase project, or at least soft-mark demo rows and filter them, and never disable triggers in production. Until then, show the demo band sketched above. Freeze the demo code (about 5,700 lines).

## C4 · Critical — The month-end count cannot be done in a real store

- **Evidence:** store/month-end/body.tsx and month-dialogs.tsx put one required field for every non-zero batch into one dialog, with no partial save. Found stock of a zero-balance batch is filtered out. There is no shelf order, no print, and no Counts tab for cycle counts. Month end has 14 columns in small text with no sticky first column ( body.tsx:198 ).
- **Why:** Month end is a mandatory duty. A 300-batch store is a full day of counting, and with power cuts one dialog that cannot be saved will lose the day's work.
- **Fix:** A persisted count sheet as sketched above: drafts saved as you type, grouped by shelf, printable, resumable, "Add found batch", and approval only when the sheet is complete.

## H1 · High — Development switches turn on provisional rules in production, with nothing on screen to say so

- **Evidence:** PHARMACY_DEV_HOSPITALS gives the v2 permission map in production: technician dispensing and controlled-drug rights for pharmacists ( access.ts:72–83 ), and draft v2 wording ( feature.ts:169 ). DEV_SKIP_MFA reports every session as MFA-passed ( lib/auth.ts:63 ). The SQL helper grants v2 in any environment ( 0122:29–33 ).
- **Why:** These are reasonable for building. Left on, they make a pilot run under rules nobody has answered for legally, and without the second factor that the witness design depends on.
- **Fix:** In production, refuse to start unless a recorded legal answer exists for the hospital. Show a staff-visible band while any override is on. Add both to the go-live checklist as "must be unset".

## H2 · High — Sign-off is not independent, and one draft is labelled signed

- **Evidence:** Every signature in the code reads "Fadhul (CSO)" (e.g. data/pharmacy/permission-map.v3.json:5 , lib/pharmacy/controlled.ts:27 ), and the design doc names the owner as Usama Fadhul. ADR 0281 lets the CSO sign alone. lib/pharmacy/downtime-entry.ts:76–80 : the comment says "Draft staff copy (not in Appendix B)" but the object says status: "signed" .
- **Why:** If the CSO and the builder are the same person, no independent pharmacist has checked the clinical wording or the controlled-drug rules. A mislabelled status quietly defeats the signed-copy gate.
- **Fix:** Add a registered pharmacist outside the build as co-signer for pharmacy content and permission maps. Correct the downtime entry's status. Add a test that fails when a "Draft" comment sits on a signed object.

## H3 · High — Window, the main dispensing screen, falls apart below 1280 px

- **Evidence:** See the phone sketch. window/page.tsx:172 splits only at xl . queue-list.tsx:51–112 has no height limit. The copy says "on the left". The same prescription opens in the pane from the queue, but as a full page from Find, Ready and the review queue ( find-actions.ts:174 , window/\_components/views.tsx:24 , review-queue.tsx:415 ).
- **Why:** Most Ugandan pharmacy counters will run on a phone, a tablet or a 1366 px laptop. On all of them, dispensing means scrolling past every waiting patient.
- **Fix:** List or detail below lg , with "‹ Queue" to go back. Split from lg . Use one URL for an open prescription. Merge Save decisions and Hand over into one press.

## H4 · High — Receiving takes a dialog per line and a witness per controlled line

- **Evidence:** See the delivery sketch and step diagram: about 45 clicks and 32 fields for 10 lines ( store/deliveries/[id] , delivery-dialogs.tsx , delivery-scan.tsx ). Without the catalogue flag each line is an unsearchable <select> . A 1D barcode adds one pack per scan. A missing look-ahead refuses every line at receipt ( receiving.ts:132 ).
- **Why:** An NMS delivery is often 40 or more lines, arriving while patients queue. A store keeper will fall back to paper and back-enter later, which is a worse outcome than the current paper system.
- **Fix:** An inline grid, one witness per delivery, a typed pack count after one scan, and the look-ahead checked at set-up.

## H5 · High — A new hospital has no first-run path

- **Evidence:** Going live is read only "by design" and shows only "Not live" ( setup/\_components/going-live.tsx:17 ). It never lists the six conditions in lib/pharmacy/readiness.ts . A point that isn't live gets the title "No data" ( content/pharmacy-workspace-v2-window.ts:51 ). Set-up steps are found by hitting walls: "Add a product to begin", "Add a supplier on Places and suppliers first". An empty Today is a grid of zeros, and its "Where everything went" note talks about old pages a new hospital never saw.
- **Why:** The pilot pharmacist will not know what to do first, and the people they could ask are the developers.
- **Fix:** Make Going live a checklist of the readiness conditions, each shown as met or missing, with who fixes it and a link. Make an empty Today an ordered "Set up this pharmacy" list. Give a not-live point a real sentence.

## H6 · High — Downtime back-entry skips every stock guard, and the promised rebuild does not exist

- **Evidence:** 0180:313 IF NEW.downtime THEN RETURN NEW skips the expired, recalled, quarantine and below-zero checks. 0124 promises pharmacy_rebuild_stockouts , but no migration defines it, so "out since" is wrong after back-entry. A back-entered controlled supply needs only a typed witness name.
- **Why:** Power and network cuts are routine, so this path will be used every week. Combined with H8, the paper sheet becomes the way round the witness rule.
- **Fix:** Limit back-entry to recorded downtime periods. Require a count before the next live supply of an affected batch. Implement the rebuild. Send every controlled back-entry to the in-charge on Needs you.

## H7 · High — Parallel systems doing one job: two catalogues and a formulary, two or three UIs, three permission maps

- **Evidence:** 0123 pharmacy*products , pharmacy_medicine_links and national-list rows sit beside 0251 's 18 cat*\* tables, whose gate-a (line 40) says the old link "stays as is". lib/prescribing/formulary.ts reads MS-RX-CAT-001. body.tsx holds the Phase 0 and Phase 1 queues, and v2 Window re-renders QueueBody . Permission maps v1, v2 and v3 plus withStoreAccess . Places are modelled twice: pharmacy_dispensing_points and pharmacy_locations . Signed content is stored twice: pharmacy_signed_sets and pharmacy_content_entries .
- **Why:** Every fix lands twice, three medicine identities have to be kept in step, and nobody can quickly answer "who can do what".
- **Fix:** Make cat\_\* the only catalogue, with the old tables as read-only views. Choose v2 for the pilot and delete the v1 list pages and to-v2.ts straight after. Keep one permission map, gated on recorded answers. Keep locations only. Merge the two signed-content stores.

## H8 · High — The module assumes a second pharmacy person is always present

- **Evidence:** Witnesses must hold pharmacy permissions, so nurses can never witness ( packs.ts witness_list ). Cart confirmations and pack signing need two people. Starting a recall needs pharmacy.manage . Cadres not in the map get no permission (permission-map.v3 notes).
- **Why:** Many district and PNFP pharmacies have one dispenser at night. A rule the night shift cannot follow pushes them to paper or to sharing logins.
- **Fix:** Add "who may witness, by cadre" to the legal questions. Whether a nurse may witness under Ugandan rules is unverified. Let pharmacy.store quarantine a batch at once, with the in-charge confirming the recall later. Show a lone-shift path that records the gap rather than blocking.

## H9 · High — Build codes leak into wording that is already signed

- **Evidence:** "The CSO signs alone (D-PH2-22)" ( content/pharmacy-stores-supply.ts:78 , shown at store/packs/\_components/pack-dialogs.tsx:320 ). "(ADR 0281)" in a field hint ( content/pharmacy-clinical.ts:117 ). "Dispensing points are made on the hub, as Phase 1 does." ( content/pharmacy-stores-store.ts:139 ). Pack names carrying "(Phase 1)" and "(Phase 4)". "CSO" spelled out in some places and left as initials in others.
- **Why:** Staff read these as noise, and they show the product's internals to the hospital. Because the files are signed, each fix costs a re-sign.
- **Fix:** Do one sweep and one re-sign. Add a lint that rejects ADR \d|D-PH|Phase \d|seam in content/pharmacy\* .

## M1 · Medium — Issuing to a ward is a four-screen relay

- **Evidence:** Ward page, then Raise requisition, then the Issues tab, where you hunt the "Waiting" table by time raised, then issues/[id] , where every line is scanned or ticked "by hand" ( pick-cell.tsx ), then the nurse's password and code. "Issue without a requisition" lists only stores and points, not wards ( store-read.ts:572 ).
- **Fix:** Add "Issue to this ward" on the ward page: raise and issue in one action with suggested quantities. Keep the nurse's receipt, and put unconfirmed issues on Needs you.

## M2 · Medium — Starting a recall uses a free-text batch number

- **Evidence:** Eight fields, six required. The batch is free text matched exactly, ignoring case, with no picker. The date is typed YYYY-MM-DD . Only pharmacy.manage can start one. After Start you land back on the list.
- **Fix:** Choose the batch from held batches, or start from Find by batch number. Land on the recall page. A mistyped batch should never match nothing silently.

## M3 · Medium — One witness sign-in can cover many entries for 30 minutes

- **Evidence:** 0127:52–54 and controlled.ts:124–140 : the attestation is valid for 30 minutes and is not single-use. Required counts are matched against all counts made under it ( controlled-store.ts:470–492 ).
- **Fix:** One attestation per hand-over or per delivery (a unique index), and a shorter window.

## M4 · Medium — Permission checks for writes live only in TypeScript

- **Evidence:** Writes run through asClinicalWriter , with the checks in write.ts:122–152 . The 0251 header says RLS does not bind these writes.
- **Fix:** Add SQL-side checks on the ledger and controlled tables, so one missed check in one action cannot write.

## M5 · Medium — The six places have seams

- **Evidence:** There are 47 routes, and 7 are in the nav. Most screens have two h1s: the shell's plus PageHeader 's, on 20 embedded bodies. Clinical is a page of cards whose four tabs all point to /pharmacy/clinical ( lib/pharmacy/workspace-v2/places.ts:41–44 ). Find shows "Store › Store" because \_lib/tab-words.ts lacks the map, prices and import tabs, and it cannot reach Going live. "Back" on National list goes to Shelf ( stock/national-list/body.tsx:39 ). Downtime is split between Window and Set-up. Store uses ?tab= where the other places use ?view= . Set-up has 9 tabs and Store 8.
- **Fix:** One href map from tab key to URL, used everywhere. Drop the inner h1 inside the shell. Give Clinical ?view= tabs. Move all downtime work to Window. Split Set-up into "Medicines" and "Places and rules".

## M6 · Medium — Amber marks ordinary workflow states

- **Evidence:** Order statuses "Part received" and "Closed" get a warning triangle ( store/orders/body.tsx:163–169 ). A requisition that is merely "Raised" is amber ( store/issues/body.tsx:114 ). The Needs you pill turns amber at any count above zero ( shell.tsx:195–197 ). There are 95 tone="caution" uses. Tide keeps amber for late, overdue, held or awaiting co-sign.
- **Fix:** Neutral pills for workflow, and amber only when something is genuinely late or held. Counts stay in ink, as Tide's navigation rules say.

## M7 · Medium — On a phone the app's own controls take a third of the screen

- **Evidence:** The rail overflows sideways, the header wraps to three rows, tabs are 32 px, and the More menu and dialog close buttons are size-8 ( \_components/v2/pieces.tsx:61,84 ). The side gutters double up to about 28 px ( store/page.tsx:117 , today/page.tsx:170 ). point-chooser.tsx:42 already does targets right ( min-h-11 sm:min-h-8 ).
- **Fix:** Use the bottom pill for places below 761 px, copy the point chooser's target pattern, and keep one gutter.

## M8 · Medium — Wide tables with no phone layout

- **Evidence:** Ward stock is min-w-[720px] ( ward-stock-view.tsx:241 ). The Today points table is min-w-[520px] at 13 px. Open lines and Supplied have 6–7 columns and no card layout ( open-lines.tsx:98 , supplied.tsx:174 ). The 390 px accessibility pass ran "on empty data only" (catalogue STOP-REPORTS:168).
- **Fix:** Reuse the card pattern from stock-table.tsx:98 , and repeat the 390 px pass with a realistic hospital's data.

## M9 · Medium — "Pack" means two things, and one kind is edited as raw JSON

- **Evidence:** A medicine pack ("New packs stay with the hospital") versus a signed rules bundle ("Signed packs"). Some bundles are a 14-row monospace textarea with the hint "Type it in the shape its reader expects" ( pack-dialogs.tsx:256–262 , content/pharmacy-stores-supply.ts:83 ).
- **Fix:** Rename rule bundles "Hospital rules". Never ask a pharmacist to type JSON: a bundle with no field form is read-only.

## M10 · Medium — A dropped connection mid-hand-over could record a second hand-over (unverified)

- **Evidence:** prescriptions/[key]/handover/\_components/handover-screen.tsx:347–359 awaits the action with no try/catch, and clientKey is created in component state (line 112). A remount regenerates it, so the idempotency key would no longer protect a retry.
- **Fix:** Derive the key from the prescription and the decision version, or store it per prescription. On failure, show "Check whether it saved" with a re-read, not a blank retry.

## M11 · Medium — Gaps against how a Ugandan hospital pharmacy works

- **Evidence:** See the fit table below. There is no NMS kit concept. HMIS 083 is not named anywhere. There is no stock-card print ( print/ holds slip, label, register and dispensing log). Donations are only a registration-exemption reason, with no donor or programme tag. There is no offline queue or service worker. The NMS order schedule is "not established" ( content/pharmacy-stores-supply.ts:193 ).
- **Fix:** For the pilot: print the stock card per product, add a donor or programme tag on receipt, and receive a kit as a template of lines. Confirm with the pilot in-charge which HMIS forms they actually file.

## L1 · Low — Jargon and mixed verbs

- **Evidence:** "Look-back" and "look-ahead" ( content/pharmacy-workspace-v2-today.ts:41 , -store.ts:34 ). "Supplied today", "hand-overs", "Supply now" and "Hand over" all name one act. "Issues" reads as "problems" to anyone outside stores. "Place" means a workspace place, a storage place, a map and a dispensing point.
- **Fix:** Use one verb for giving medicine to a patient ("Hand over"). Write "{n} batches expire in the next {days} days". Rename the map "Stock map" and the Set-up tab "Storage and suppliers".

## L2 · Low — Type rules bypassed

- **Evidence:** 20 headings carry font-medium , overriding the token's weight (e.g. controlled/body.tsx:115 , review-screen.tsx:358 ), and there are 35 raw text-[Npx] sizes. The overline dot uses tide-area-lab , not area-medicines ( shell.tsx:167 ). The acting point's dot is lagoon, where Tide makes a point plum ( shell.tsx:296 ).
- **Fix:** One pass with the type tokens and the area token.

## L3 · Low — Pharmacy borrows the lab's private kit

- **Evidence:** 26 pharmacy files import @/app/lab/\_components/v2 , which is route-private. The pharmacy shell is a near-copy of the lab shell, including the amber Needs you rule.
- **Fix:** Promote the kit to components/tide so a fix to one shell reaches both.

## L4 · Low — Following one medicine is capped and hard to start

- **Evidence:** An unsearchable <select> of every product ( store/map/body.tsx ). Nothing older than 90 days, and no date range. The trace is per product, so two packs need two traces. With the catalogue flag off, there is only "Today's movements".
- **Fix:** A searchable picker, a date range, and a trace by medicine across packs.

## L5 · Low — 21 flags and a large paper trail

- **Evidence:** 21 env flags, many nested ( pharmacyRefillsLiveFor needs three others). docs/pharmacy has 86 files and about 29,000 lines, and 69 ADRs name pharmacy, some for one setting (0379, 0380). The live hand-over note exists only uncommitted in the main folder.
- **Fix:** Group the flags into about four pilot tiers. Keep one committed living docs/pharmacy/HANDOFF.md , and stop writing ADRs for copy and single settings.

## L6 · Low — Issued stock shows on the ward before it arrives

- **Evidence:** Stock moves at issue, before the ward confirms ( issue-store.ts:470–476 ).
- **Fix:** Hold it "in transit" until receipt, or at least label it so on the ward page.
  Built dark versus usable on pilot day

## Fit with a Ugandan hospital pharmacy (● supported · ◐ partial · ○ missing)

- NMS / JMS delivery notes Supported Note number, deliverer, vehicle and witness ( 0181:85–106 ). Rejected stock is quarantined or returned. NMS and JMS pack codes in cat_pack_codes .
- NMS push kits Missing No kit concept anywhere.
- Order cycle and quantification Partial Configurable cycle, VEN trimming, stock-out-adjusted consumption ( stores/order.ts:199–229 ). NMS schedule "not established". Prints HMIS 085/084B.
- HMIS forms Partial Column maps for 016, 084B, 085, 087, 088 and 105 §6, each unconfirmed until the in-charge checks it. 083 not named.
- Paper stock card Partial The ledger is effectively the stock card, but it cannot be printed as one.
- EMHSLU and VEN Supported The EMHSLU class is in the catalogue ( 0251:19–20 ), and VEN drives order trimming.
- Narcotics register Partial A witnessed record kept beside the paper ( 0127 ). Wards and carts are a gap ( C2 ). Legal questions 2–4 are open.
- Power and network cuts Partial Printed sheets with back-entry later ( downtime-entry.ts:48–70 ). No offline queue. Guards are skipped on back-entry ( H6 ).
- Shared phones Partial The witness types their own credentials on the actor's screen. No pharmacy idle lock found (unverified).
- One store keeper doing everything Weak Many steps need two pharmacy people ( H8 ).
- Generics, brands, partial packs Supported Substance → medicine → product → pack ( 0251:6 ). Stock is held in issue units. A strength-difference check on supply.
- Donations Partial Only a registration-exemption reason. The donor is just a "supplier". No programme tag.
- How big it is

## Size today

- app/pharmacy (47 pages) 193 32,065
- lib/pharmacy ( stores/ alone 12,920) 144 46,413
- content/pharmacy\*.ts 25 5,129
- data/pharmacy (maps, catalogue, national list) 9 8,323
- Other app routes (admin, patient, hospital-admin) 17 3,085
- db/schema pharmacy 12 1,994
- Migrations named pharmacy (48 touch it) 40 6,749
- Tests (38 PGlite) 121 36,482
- docs/pharmacy 86 28,970
- Tables ( pharmacy*\* + cat*\* ) · ADRs naming pharmacy · flags 118 · 69 · 21
- The top five, in one line each
