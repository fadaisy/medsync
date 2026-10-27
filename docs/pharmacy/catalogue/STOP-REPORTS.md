# Medicines catalogue: stop reports

Branch `feat/pharmacy-catalogue` (worktree `~/Desktop/medsync-catalogue`), cut from `feat/pharmacy-workspace-v2` 576f6018.

## STOP 0: discovery (27 Oct 2026)

No product code changed. Next free numbers on every local and remote branch: **migration 0251**, **ADR 0456**. The unbuilt set-up import proposal (`~/Desktop/medsync-import`) had claimed 0251/ADR 0451. ADR 0451 has since gone to Workspace v2, and catalogue Step 9 supersedes that proposal.

### Q1. The five layers today

| Layer | Table (migration) | What it holds |
|---|---|---|
| Medicine | none: an id from the prescribing list, `data/prescribing/drug-catalogue.v0.json` (192), mirrored in `lib/prescribing/reference/general-formulary.ts` | `medicine_id text ^[a-z0-9_]{2,80}$` on the product |
| Product | `pharmacy_products` (0123:17-34, 0180:138-141) | Per hospital. Holds name, plus free-text manufacturer, strength, pack_size, registration_number and issue_unit. Also `price_ugx numeric(14,2)` (nullable) and `gtin ^[0-9]{14}$`, unique per hospital among active products (`pp_gtin`). |
| Product at a place | `pharmacy_product_points` PK (product, point); `pharmacy_product_locations` PK (product, location) | Reorder level and the place link |
| Batch | `pharmacy_batches` (0124:31-45, 0180:155-162) | Batch number and expiry. Unique `pb_place_batch`, plus the old UNIQUE (point, product, batch). **No cost column.** |
| Movement | `pharmacy_stock_movements` (kinds final in 0230:261-283) | The append-only ledger. `unit_cost` is allowed only on `received` (`psm_cost`). Also `pair_id`, `allocated`, `counterparty_id`. |

- **GTIN:** one per product, per hospital, set only by `setGtin` (`lib/pharmacy/stores/location-store.ts:443`, an UPDATE).
- **Price:** `pharmacy_products.price_ugx`, set only by `setProductPrice` (an UPDATE, no history). It is snapshotted on each supply as `pharmacy_supplies.price_ugx` (0126:79).
- **Unit cost:** on `pharmacy_delivery_lines.unit_cost` (0181:124) and on `received` movements only.

**Write paths that create a product:**
- `newProduct` (`lib/pharmacy/stock/store.ts:407`), called by `addProduct` (:830) and `addBatchFoundOnShelf` (:478).

**Write paths that create a batch:**
- `batchFor` (store.ts:320), from `receiveStock` (:448), `addBatchFoundOnShelf` and `transferStock` (:719).
- `batchAtLocation` (`lib/pharmacy/stores/write.ts:174`), from:
  - `receiveDelivery` (receiving-store.ts:323)
  - `borrowStock` (issue-store.ts:801)
  - `recordStoreCount` (location-store.ts:560)
  - `movePair` (write.ts:331)

No Edge Function touches these tables. Migration 0183 does not exist (released unused).

### Q2. The GS1 parser (`lib/pharmacy/stores/scan.ts`)

**Handles:**
- AIs 01 and 17 (fixed length), 10 (variable) and 21 (variable, read and dropped);
- the GS separator (ASCII 29, or a set substitute);
- the AIM prefixes `]d2` and `]C1` (`^\][A-Za-z]\d`), and the bracketed human-readable form;
- the GTIN mod-10 check (`gtinOk`, :20-24);
- day `00` in an expiry, read as the month's last day (flagged `monthOnly`). Years are always read as 20YY.

**Does not handle:**
- **AI 11** (production date).
- **Any unknown AI:** it fails the whole scan, where Appendix B wants it skipped.
- **8-, 12- or 13-digit GTINs** are not padded to 14, so an EAN-13 or UPC-A pack does not match.

**The serial is dropped.** Appendix D says "the parser keeps serials", so the code disagrees.

**Tests:** `tests/pharmacy/stores/scan.test.ts` (SC-1, SC-2, SC-3). `scan-fill.ts` has none.

**Resolution:**
- `productForGtin` (scan.ts:108) works over the list already loaded in the browser.
- `productByText` (scan-fill.ts:47) matches a unique name substring.
- An unknown GTIN offers `setGtin` (delivery-dialogs.tsx:233, :390).

### Q3. EMHSLU 2023

`data/pharmacy/national-list/emhslu-2023.csv` has 2,721 rows.

| Rows | Count |
|---|---|
| Medicines (Section A) | 802 |
| Health supplies (B 512, C 243, D 1,164) | 1,919 |
| Marked specialist | 249 |
| Flagged "not read with confidence" | 26 (20 medicines, 6 supplies) |
| Fixed-dose combinations | about 69 (63 with "+", 7 with "/"). One "/" row is a name variant (Hartmann's/Ringer's), not a combination. |

There is no ingredient column, so a combination is one free-text name.

**Linked prescribing-list medicines: not readable from the repo.** Links live only in the database (`pharmacy_medicine_links`), written by `confirmLinks` (national-catalogue.ts:179) and ruled by `pml_guard` (0136:47-67). The owner can count them with:

```sql
select count(distinct medicine_id) from pharmacy_medicine_links;
```

Nothing ties a link to one row: `pharmacy_medicine_links` is UNIQUE(edition, medicine) only, with no uniqueness on the row.

### Q4. Sources and licences (checked 27 Oct 2026)

nda.or.ug, edqm.eu and gs1.org refused automated fetches (403 or a bot check). That was not bypassed, so the points marked *unconfirmed* rest on search snippets or secondary sources.

| Source | Finding | Blocks this slice? |
|---|---|---|
| NDA National Drug Register | **Newest PDF found: June 2024.** It is about 1,405 pages, entries keyed `NDA/MAL/HDP/nnnn`. **The web register** is titled "Drug Register (October 2026)" (snippet only). **Reuse terms:** none stated. The 2026 Act s.111 opens registers to inspection "at the prescribed fee", which is not yet prescribed. **Columns and row count: unconfirmed until the owner supplies the file.** Strategic Plan IV cites 5,306 products. | **Yes, until the owner gives the file and clears reuse with the NDA.** |
| RxNorm Current Prescribable Content | **Confirmed:** "without any licensing restrictions", no UMLS login, monthly plus weekly updates. US market only. | No, but it can only be a crosswalk. |
| EDQM Standard Terms | **Access:** needs an EDQM account (free option). **Conditions of use:** in the v2.2.0 guidance (21 Sep 2026), which returned 403; **unread**. The attribution wording in Appendix D is unconfirmed here. | **Yes, until the owner reads that section in a browser.** |
| WHO ATC/DDD (WHOCC) | **Confirmed:** "Copying and distribution for commercial purposes is not allowed", and the material may not be changed. The full files are ordered through the WHOCC portal (price unconfirmed). | **Yes.** MedSync holds no right to embed ATC. Needs written permission from whocc@fhi.no (D-CAT-06). |
| GS1 | **Confirmed:** there is no free GTIN-to-product registry. Verified by GS1 allows 30 lookups a day. GS1 Uganda exists (admitted Dec 2023, prefix 605). | No: GTINs come from packs and suppliers. |
| NDHPA Act 2026 | Act 5 of 2026, assented 29 Apr, gazetted 8 May. It commences on a date the Minister sets by statutory instrument; none found. s.34(1) requires a traceability identifier on labels, its format left to regulations. s.21 adds "listing" beside registration and notification. | No. Registration status should allow registered, notified or listed, and the identifier type stays open. |

### Q5. Scanner hardware: owner input needed

The repo cannot tell. Needed: the pilot site's scanners (USB keyboard wedge? 2D-capable for DataMatrix?), and whether camera scanning on a phone or tablet is wanted. Camera scanning would need a new dependency, which stops for approval.

### Q6. The payment field

- **Who sets it:** `setPaymentStatus` (app/pharmacy/review-actions.ts:68; lib/pharmacy/review/store.ts:577-601). It needs `pharmacy.dispense` at a live point.
- **The values:**
  - `paid`
  - `exempt`: always refused until the exemption reasons are signed
  - `insured`: needs the scheme
  - `emergency`
  - `not_recorded`
- **Where it is kept:** `pharmacy_payment_statuses` (0131, append-only), copied onto `pharmacy_handovers.payment_status`.
- **The gate:** `payment_status_required` (0129:113, default false). Handover passes when the status is emergency, when the setting is off, or when the status is anything but not_recorded (handover.ts:233-234). Refills use the same rule (refill-store.ts:938). Downtime entry bypasses the gate (downtime-entry.ts:415).
- **Disagreements:**
  - There is **no exemption for admitted patients' lines** (supply/store.ts:485), which Law 13 assumes.
  - There is **no payment display on a patient band component**. The status lives on the hand-over, not the band.

### Q7. The demo

- **Products:** 69 products over 70 list entries (lib/pharmacy/demo/medicines.ts:9).
- **Prices, unit costs and GTINs:** none.
- **A second demo hospital:** none. A load covers one hospital. `lab_demo_hospitals` allows many rows, so a second demo hospital is an owner action.
- **Tests:** the PGlite helper makes "Demo national referral" plus a "Real" control hospital. That pair can serve the cross-hospital barcode test.

### Q8. Baselines (counted from the forms, not timed)

| Task | Entries | Identities by hand |
|---|---|---|
| Count a 20-line delivery | About 120: per line, pick the product, then note quantity, accepted, batch, expiry, unit cost | All 20, unless a GTIN was linked earlier through `setGtin` |
| Add 50 products | About 350: seven fields each | All 50 |

Timed runs need the demo deployed and the canvas flow built. They are recorded at Step 12 against these counts.

### Q9. Distribution as built

- **Planned issue.** `planIssue` (issue.ts:72-97) plans FEFO, capped at held stock.
  - The screen gets only held, prefill and first, not the plan's rows (store-read.ts:864-889).
  - `issueStock` re-plans and caps (issue-store.ts:157-168).
  - `issueRequisition` (:303-377) needs a reason for a zero line.
- **Receiver's confirmation.**
  - **At a ward:** `confirmWardIssue` (ward-store.ts:706-718) needs the confirmer's password plus a code (`pharmacy_receipt` attestation, within 15 minutes) and the `ward_confirm` right. That is the nurse in charge, or any ward nurse when `any_nurse_confirms` is set.
  - **At a pharmacy place:** `confirmIssueReceipt` (issue-store.ts:613-638) has no attestation.
  - **A difference** writes `adjusted` with reason `receipt_difference` (:475-601).
  - **Not blind:** the receipt dialog pre-fills arrived = issued (ward-dialogs.tsx:777).
- **Ward use.**
  - Use = balance before − counted (`wardCountMovements`, ward-stock.ts:90-154). It writes `ward_used`, or `adjusted` plus a reason for a surplus.
  - Top-up = max(0, level − last count), only while the count is fresh. Freshness takes the smallest `count_freshness_days` across points.
  - The ward row already shows charted doses as context (ward-read.ts:655-676).
- **Cart checks.** The `cart-store` complete step (:217-491) needs a second person's attestation and auto-confirms the restock issue.
  - **Seal number:** `pharmacy_cart_checks.seal_number` (0181:286) is stored.
  - **Broken seal:** not recorded anywhere.
- **Phase 2 items not built:**
  - **IS-4 (overdue confirmations):** the engine `unconfirmedOverdue` (issue.ts:145-153) is never called. Its window is `ward_rules.confirmationWindowHours` (packs.ts:96-99).
  - **Withdrawing a requisition:** not built.
  - **The cart recall id mismatch:** still there. recall-read.ts:585-600 compares the resus `payload.prescribing.drugId` with the catalogue medicine id and matches carts by typed name.
- **Also found:**
  - **IS-6:** `controlledRefusals` (issue.ts:177-188) is never called.
  - **Reason lists:** not wired to the signed `stores_reason_lists`.

### Q10. Charting and resus

- **The medication administration record exists:** `medication_administration_records` (0031:213-245; 0088 adds `emr_prescription_id`). **Nothing outside demo data writes it.**
- **No dose source.** There is no column for ward stock, patient's own or pharmacy supply. Per the prompt, no source is added: the ward use check shows "Not charted from ward stock".
- **Resus doses** are `resus_timeline_events` of kind drug.
  - **The cart:** free text (app/nurse/resus/actions.ts:1153, stored at :1281). The prescribe dialog never sets it, so it is always null. `emergency_administrations.cart_id` exists but nothing writes it.
  - **No broken-seal field.** The cart signal uses the seal report alone.

### Q11. Staff phone surface

- The Expo app is patient-only.
- The nurse web workspace is responsive (nurse-shell.tsx:112-118). Receipt is confirmed at `/nurse/ward-stock?location=` (`confirmWardReceipt`, app/nurse/ward-stock/actions.ts:84-86), reusing `ReceiptDialog` (ward-dialogs.tsx:716-807).
- At 390 px the dialog stacks to one column, but the stock table is `min-w-[720px]` and scrolls sideways.
- axe at 390 px passed on empty data only.

**Board 12 (phone confirm) is therefore web at 390 px, not the app.**

### Disagreements: repo vs prompt

1. **Barcodes:** one GTIN per product, unique per hospital. The prompt wants local links first, then shared links after review. Step 1 needs a link table.
2. **Batches have no cost.** Cost is on received movements and delivery lines, so stock value must come from those.
3. **The parser** lacks AI 11 and 8/12/13-digit padding, fails on unknown AIs, and drops serials. Appendix D says it keeps them.
4. **No admitted-patient payment exemption** (Law 13), and no payment display on the patient band.
5. **The receipt is not blind,** and IS-6 is unused.
6. **The administration record has no dose source and no writer.** The resus cart is always null, and no broken seal is recorded.
7. **A medicine must be a prescribing-list id** (192). Local products and health supplies have nowhere to live yet.
8. **Price has no history** (an UPDATE in place), and there is no payer.
9. **The demo has no prices, costs or GTINs,** and there is no second demo hospital.
10. **Appendix D's EDQM attribution terms** could not be confirmed (403), and **ATC embedding is forbidden** as published.

### Needed from the owner before Step 1 is signed

- The NDA register edition as a file (latest), and whether reuse is cleared.
- The pilot's scanner hardware, and yes or no on camera scanning.
- ATC (D-CAT-06): written WHOCC permission, or no ATC codes in this slice. Recommended: none for now.
- The EDQM conditions-of-use section, read in a browser.
- A second demo hospital in `lab_demo_hospitals` for the cross-hospital barcode test (optional; PGlite covers it).
- The count of linked prescribing-list medicines (the SQL above).

## STOP 1: GATE A proposal (27 Oct 2026)

`gate-a-proposal.md` is drafted, checked against the Step 1 list and revised once:
- Fixes from the check:
  - the ledger test list was made exact;
  - RLS was matched to the 0136 pattern;
  - the source and attribution table and the screen map were added;
  - the serial storage and the payer on the supply snapshot were settled;
  - store function names were corrected.
- Awaiting Fadhul's signature: 17 GATE A decisions, 6 adaptations and the §4/§5 lists.
- 7 owner inputs (O-1 to O-7) stay open, each with the recommended fallback.

Nothing from Step 2 is built.

GATE A **signed** by Fadhul, 27 Oct 2026, as recommended, no amendments. Fallbacks apply to O-1 to O-7.

## STOP 2: catalogue schema and seed from EMHSLU (27 Oct 2026)

Built dark; nothing is applied or switched on.
- **Migrations (GATED, owner-applied, in order):**
  - `0251_pharmacy_catalogue.sql`: the five shared layers, proposals and reviews, curators, register editions, pack codes and photos, `cat_changes`;
  - `0252_pharmacy_catalogue_forms_routes.sql`: the 40 signed forms and 15 routes, with no EDQM codes (O-3).
- **Guards live in the database**, because curator writes run as the owner:
  - a fact row needs an applied proposal (`cat_from_applied`);
  - medicine-level kinds need two confirmations (`cp_two_person`);
  - nobody reviews their own proposal, and only a curator reviews (`cat_review_guard`);
  - a decided proposal never changes (`cat_proposal_guard`).
- **Append-only:** reviews, changes, register editions and pack photos.
- **The seed** is `npm run pharmacy:seed-catalogue -- <csv> --edition "EMHSLU 2023" [--apply --actor <uuid>]`. It writes proposals only, and the report goes to `docs/pharmacy/catalogue/seed-report.md`.

| On the real EMHSLU 2023 file | Count |
|---|---|
| Medicines proposed | 714 |
| Health supplies proposed | 1,911 |
| Rows merged into an identical earlier row (same item, another section) | 96 |
| Rows refused | 0 |
| Multi-ingredient medicines | 64 |
| Combinations whose strengths could not be split (kept as printed, noted) | 6 |
| Medicines with no signed form (a curator sets it; the map never guesses) | 252 |
| Medicines with no route known | 308 |
| Substances | 2,115 |

**Scenarios:**
- **S1:** every row is a medicine's line or refused with its reason (dry run and apply).
- **S2:** a fixed-dose combination is one medicine with two ingredients and its strengths as printed.
- **S3:** a re-run proposes nothing.
- **S4:** no hospital user or client role writes a catalogue table; pharmacy viewers read.

`tests/emr-db/pharmacy-catalogue.test.ts` covers all four, plus the two-person rule, rejection, self-review and from-applied.

**Fadhul, please confirm:**
- **Merged duplicates.** The same item printed in two sections becomes one medicine with both rows linked. Level and VEN are kept only where the rows agree; otherwise the curator gets a note.
- **Asides.** A printed aside that is not a synonym (for example "(with dextrose)") stays part of the identity and gets a curator note, so two different products never merge.

## STOP 3: names and search (27 Oct 2026)

- **Migration `0253_pharmacy_catalogue_search.sql` (GATED):**
  - `pg_trgm` and `unaccent`;
  - `private.cat_fold`;
  - stored `name_fold` columns with GIN trigram indexes;
  - `cat_medicine_names` for a combination's or a class's abbreviation (AL, TLD, RHZE, ACT, ARVs).
- **Names load:** `npm run pharmacy:catalogue-names [--apply --actor <uuid>]` turns `names.v1.json` (GATE A §5) into `new_name` proposals that need one curator. A re-run adds nothing, and a name that fits nothing is reported, never forced onto the nearest thing.
- **`catalogueSearch`** (`lib/pharmacy/shared-catalogue/search.ts`):
  - exact codes first: GTIN (8, 12, 13 or 14 digits, padded), registration number, NMS, JMS or supplier code;
  - then names: preferred, other names, the medicine's own names, display names, brands, makers, the hospital's own products;
  - each hit says why it matched;
  - a term under 4 letters matches whole names only.
- **The picker (4.2):** `app/pharmacy/_components/catalogue-picker.tsx`, a centred `EditorDialog` (`wide`):
  - results are grouped as medicines, brands and your products, with form and route chips;
  - choosing one shows its names and its packs, barcoded packs first and "Unbranded · loose" last;
  - "The pack that came is not here" is handed to the caller (4.4 arrives in Step 6).
- **Set-up › Catalogue** (`/pharmacy/setup?view=catalogue`, 4.5): the picker plus one medicine's names, facts and brands and packs.
  - It sits behind a new flag, **`PHARMACY_CATALOGUE`** (`1` or hospital ids), inside the workspace. It needs 0251–0253, and in production it stays off while the wording is draft (CS-5).
  - Report a mistake, your products, your prices and the history arrive with Steps 5, 6 and 8.
- **Strings:** Appendix A, the GATE A §11 strings and the picker and page words are in `content/pharmacy-catalogue.ts` as `CATALOGUE` with `CATALOGUE_COPY: draft`. The signed `NATIONAL_LIST` strings are untouched.

**Scenarios (PGlite, the whole seed confirmed: 2,624 medicines):**
- **S5:** each search finds the right medicine and says why:
  - "acetaminophen" gives "Also called acetaminophen";
  - "PCM";
  - a misspelling ("paracetmol");
  - "lignocaine";
  - "AL";
  - a brand, and a maker ("Made by …");
  - a registration number;
  - a 13- and a 14-digit GTIN.
- **S6:** p95 is **95–104 ms over 60 searches** across runs, against the 150 ms budget. The index plan is printed by the test. This was measured on PGlite (WASM, single-threaded); the budget is for real Postgres, where it should be faster. Step 12 re-measures there.
- **S7:** a health supply never appears in a prescribing search or in a medicines-only one.
- **4.2:** names, then packs in order, with the loose choice last.

**Checks:**

| Check | Result |
|---|---|
| Typecheck | Clean |
| ESLint, new and changed files | Clean |
| `tests/pharmacy` (unit) | 1,159 of 1,159 pass |
| Catalogue PGlite lane | 16 of 16 pass |
| Drizzle parity | The catalogue tables match. 2 failures predate this slice: `location_shares` and `appointment_attachments` (0185 interval format) |
| Ledger test files | 21 files, hashes unchanged against 576f6018 |

Pre-existing, not from this slice:
- `tests/patient-web/{care,help}` fail to transform because `mobile/` has no tsconfig in this worktree;
- `pharmacy-golive` S83 calls `cookies` outside a request (the Workspace v2 base).

Two Law 2 source rules now name the catalogue explicitly:
- `engines.test.ts`: the catalogue store writes `cat_*` reference tables only;
- `ui.test.ts`: `catalogue-actions.ts` is reads only.

**Notes for Fadhul:**
- **§5 slip.** As drafted, §5 read "adrenaline / epinephrine (USAN)". The data follows D-CAT-05 instead: epinephrine is the INN and adrenaline the BAN, and the same for norepinephrine and noradrenaline. Please confirm.
- **PCM** is stored as a *local* name, as signed, not as an abbreviation.
- **RxNorm-derived names are not loaded.** They would need their own signed list; deferred.
- **Ctrl K.** In Workspace v2, Ctrl K opens Find everywhere, while board 1 gives Ctrl K to the picker on Count a delivery. Step 7 lets the delivery page take Ctrl K while it is open; Find stays on Ctrl K everywhere else.

## STOP 4: NDA register import — deferred (O-1)

No NDA register file has been supplied, so Step 4 waits, as the O-1 fallback says.
- Brands, makers and registration numbers come only from that file or from a hospital's local proposal (Step 6). None are invented.
- Brands show "not recorded" wherever no state is known.
- S8–S10 run once the file arrives.

## STOP 5: barcodes (27 Oct 2026)

- **Parser** (`lib/pharmacy/stores/scan.ts`, Appendix B):
  - reads AIs 01, 17, 10, 21 and **11** (production date: shown, not used);
  - steps over any other element by its GS1 length and names it ("Part of this code was not read: …");
  - pads a plain EAN-8, UPC-A, EAN-13 or ITF-14 to GTIN-14 (`plain`: the pack only);
  - keeps the serial;
  - refuses a wrong check digit **in words** (`reason: "check_digit"`). `readScan` gives the store screens a new `refused` outcome that fills nothing. The two receiving dialogs that treated every non-GS1 read as text now check for text explicitly.
- **Migration `0254_pharmacy_catalogue_barcodes.sql` (GATED):**
  - one shared link per code, and one local link per code per hospital;
  - a definer trigger marks every link of a code `conflict` once it points at two packs;
  - **RLS narrowed:** a hospital now reads only the shared links and its own, plus its own proposals and photos. In 0251 every pharmacy viewer could see every hospital's local links;
  - `pharmacy_delivery_lines.serials text[]`, kept on the line and read by nothing.
- **Code:**
  - `resolveScan` (`lib/pharmacy/shared-catalogue/scan.ts`): the hospital's own product, then its local link, then the shared link, else unknown or text. A conflict resolves to nothing;
  - `linkBarcode`, `applyNewBarcode` and `resolveCodeConflict` (`store.ts`);
  - `linkBarcodeAction` goes through `runPharmacyWrite` (`pharmacy.stock` or `pharmacy.store`).
- **The new-barcode dialog** (4.3, `app/pharmacy/_components/new-barcode-dialog.tsx`, centred `EditorDialog` `medium`):
  - shows what was read;
  - proposes the order's uncounted lines (wired in Step 7), then search;
  - never chooses;
  - says "MedSync does not guess";
  - "Link and fill the line".
- **The catalogue team's queue** (4.8, `/admin/pharmacy-catalogue`, below the national list): barcodes to check, conflicts to settle (keep one pack, with a note), and open proposals by source with **Confirm the next 200**.
  - Curator, AAL2 and a fresh second factor; the database refuses self-review.
  - It shows only where `PHARMACY_CATALOGUE` is set.
- **ADR 0458.**

**Scenarios:**
- **S11:** a DataMatrix with and without GS separators parses identically (unit).
- **S12:** a wrong check digit is refused, with words (unit and PGlite).
- **S13:** `YYMM00` is the last day of the month (unit).
- **S14:** a link made at hospital A resolves at A at once and at B only after confirmation. B sees neither A's link nor A's proposal (PGlite).
- **S15:** the same GTIN linked to two packs is a conflict at both hospitals and in the queue. Confirming it is refused until a curator settles it; a pharmacist cannot settle it; once settled, A resolves its pack and B's link is withdrawn (PGlite).
- **S16:** a curator who proposed a link cannot confirm it (PGlite).

**Checks:**

| Check | Result |
|---|---|
| Typecheck | Clean |
| ESLint, changed files | Clean |
| `tests/pharmacy` | 1,165 of 1,165 pass |
| Catalogue PGlite lane | 21 of 21 pass, search p95 89 ms |
| Ledger PGlite lanes | 9 files, all pass |
| Drizzle parity | Only the 2 pre-existing failures |
| Ledger hashes | Unchanged |

Two non-ledger test files changed on purpose:
- `tests/pharmacy/stores/scan.test.ts`: new fields, and an AI of unknown length replaces "unknown AI fails";
- `tests/pharmacy/stores-store/scan-fill.test.ts`: a wrong check digit is now `refused`, not text (S12).

**Not built:**
- **Camera scanning** (O-2 fallback: USB wedge only).
- **The pack photo upload** on 4.3. It needs the asset store with the "no patient in view" notice; it is built with Step 7's field kit.

**Found while testing:** the board's sample EAN `6009880123457` fails its own check digit, so it was not used in the tests.

## STOP 6: the hospital's products and the catalogue (27 Oct 2026)

**Owner answers recorded (Fadhul, CSO, 27 Oct 2026):**
- **A-1 amended to "Catalogue key".** `medicine_id` stays NOT NULL. A trial that made it nullable broke 49 places in 17 files and was reverted. A product that is not on the prescribing list takes `cat_` plus 32 hex digits, so no prescription, dose rule or controlled class ever matches it.
- **D-CAT-18 "Refuse for now".** Local medicines are refused until the CSO decides how their controlled status is set. Health supplies and pack links are built, and form 4.4 offers health supplies only.

- **Migration `0255_pharmacy_products_catalogue.sql` (GATED):**
  - adds `item_kind` (formulary, local_medicine, health_supply), `catalogue_pack_id`, `catalogue_medicine_id` and `local_proposal_id`;
  - `pp_kind_key`: a formulary product never takes a `cat_` key, and any other product always does;
  - `pp_no_local_medicine`: D-CAT-18 in the database;
  - a definer trigger fills the medicine from the pack, and refuses a medicine's product on a supply or a supply's product on a medicine.
  - Existing rows are unchanged; every one stays `formulary`.
- **Code:**
  - `productLinkRows` (`products.ts`): suggestions only from signed links (the prescribing medicine's catalogue link, or the national-list row's), never by name;
  - `linkProducts`: changes only the catalogue columns;
  - `proposeLocalProduct`, and `applyNewProduct` on confirmation: brand, maker, pack and confirmed barcode join the catalogue, and the product links to that pack;
  - `addHealthSupply` (`stock/store.ts`): through the stock store's own `newProduct`, so the product is placed at the point like any other.
  - Count, reorder-level and request inputs now accept a catalogue key. Creating a formulary product still does not.
- **UI:** Set-up › Catalogue › Your products lists every unlinked product with its candidates and why.
  - Products with one match link together ("Link the n with one match").
  - Products with several matches are chosen; products with none are picked from the catalogue.
  - "Add a health supply" (4.4) is a centred `EditorDialog` `medium`. "No registration number on the pack" is a recorded answer.
  - Actions `addHealthSupplyAction` and `linkProductsAction` go through `runPharmacyWrite` with `pharmacy.stock` at a point, behind `PHARMACY_CATALOGUE`.
- **ADR 0459.** CHANGELOG entry now reads "Steps 2–6".

**Scenarios (PGlite, `tests/emr-db/pharmacy-catalogue-products.test.ts`, on the demo lane):**
- **S17:** a demo product with one signed match links. Its medicine id, issue unit, batch count, movement count and balance are identical before and after. Another hospital cannot link it, and it cannot link to a supply.
- **S18:** a health supply is added, then received (40), counted, moved to the inpatient point (10), quarantined (5) and written off with a witness. It ends with opd 25, inpatient 10 and quarantine 0. Its `new_product` proposal records `none_on_pack`. Once a second person confirms it, the brand, pack and barcode are in the catalogue and the product is linked to the pack.
- **S19:** never prescribed. Its key is not a prescribing-list medicine, `ProductInput` refuses it, and the database refuses a formulary product with it (`pp_kind_key`).
- **D-CAT-18:** a local medicine is refused in words with nothing written, and refused by `pp_no_local_medicine`.

**Checks:**

| Check | Result |
|---|---|
| Typecheck | Clean |
| ESLint (pharmacy app, lib, content, new test) | Clean |
| `tests/pharmacy` unit | 1,169 of 1,169 |
| Catalogue PGlite (`pharmacy-catalogue.test.ts`) | 21 of 21 |
| Products PGlite (new) | 2 of 2 |
| Drizzle parity | Only the 2 failures already on the branch (location_shares, appointment_attachments) |
| Ledger test files (sha256) | 21 of 21 OK |

**Open:**
- Migration 0255 waits for the owner, after 0251–0254.
- Prices on products remain Step 8.

## STOP 7: receiving with the catalogue (27 Oct 2026)

**Adaptation A-7:** GATE A planned no migration for Step 7, but Law 9 needs the coded reason kept on the line the in-charge reads. `0256_pharmacy_delivery_catalogue.sql` (GATED) adds it, so prices move to **0257**, imports to **0258** and distribution to **0259**.

- **Migration 0256** adds to `pharmacy_delivery_lines`:
  - `packs` and `pack_contents`, with `pdl_packs_whole`: accepted = packs × contents;
  - `identity_source` (scan, catalogue, typed);
  - `registration_reason` (draft codes: donated, no registered alternative, renewal pending, other) and `registration_note`, with "other" needing text.
- **Engine** (`shared-catalogue/receive.ts`, pure): `packsToUnits`, `rescanTarget`, `registrationState`.
  - An unknown register state asks nothing (O-1).
- **Store** (`receiving-store.ts`):
  - `scanIntoDelivery`. A pack resolves only to the one product linked to it here. A new line takes its batch and expiry from the 2D code and counts one pack; the same product and batch again adds one pack.
  - `pickIntoDelivery` (Ctrl K) and `orderCandidates`, the order's uncounted lines for 4.3.
  - `productCatalogueFacts`: pack contents and registration, behind `PHARMACY_CATALOGUE`.
  - `saveDeliveryLine` checks packs to units and the reason, and `receiveDelivery` checks the reason again, because a scanned line skips the dialog.
  - `registrationList`: lines received with a reason, for the in-charge.
- **UI:**
  - **Delivery:** the scan field at the top (`delivery-scan.tsx`) is always listening. Ctrl K is taken from Find on this page, there is a "Pick from the catalogue" button, and an unknown code opens 4.3 with the order's candidates. A status line counts lines typed by hand.
  - **Line dialog:** a Packs field when the pack's contents are known, with "{units} {unit} into stock ({packs} packs × {contents})" shown before saving and the units made read-only; the registration reason and note when needed.
  - **Rows** show packs × contents and the reason.
  - **Deliveries page:** "Received without a current registration", for the in-charge.
  - **Other scan fields** (store opening count, issues) fall back to the catalogue when no product here carries the code, under the same one-product rule.
  - **Add a product:** "Pick from the catalogue" fills the fields and links the pack. The server refuses a pack not linked to the chosen prescribing medicine.
- **ADR 0467** (not in the GATE A list, which keeps 0460–0466 for later steps). CHANGELOG entry now reads "Steps 2–7".

**Scenarios:**
- **S20:** a 20-line delivery: 18 lines from 18 scans, a 19th scan adding a pack, and 2 typed identities. It received 2,000 units in one transaction, in 125–141 ms on PGlite. Q8 counted about 120 entries and 20 typed identities by hand. Timing on real hardware waits for Step 12's pilot.
- **S21:** 20 packs × 100 gives 2,000. A mismatch is refused, a pack with unknown contents is refused in words, and the database refuses a change to the units (`pdl_packs_whole`).
- **S22:** a rescan of the same pack and batch says "+1 pack · 2 counted", and the line holds 200 units.
- **S23:** a lapsed product is refused at the line without a reason, and "other" without text is refused. A scanned line is refused at receipt until the reason is saved. Once received, it is on the in-charge's list.
- **S24:** a scanned controlled product is refused at receipt without its witness.
- **S25:** the 21 ledger test files are unchanged (sha256 OK) and pass in the full pharmacy lane run.
- Also tested: an unknown code, a wrong check digit and plain text write nothing; Add a product refuses a pack of another medicine and links the right one.

**Checks:**

| Check | Result |
|---|---|
| Typecheck | Clean |
| ESLint (pharmacy app, lib, content, new tests) | Clean |
| `tests/pharmacy` unit | 1,173 of 1,173 |
| All `tests/emr-db/pharmacy-*` lanes + parity | 1,070 of 1,073. The 3 failures were already on the branch: parity location_shares and appointment_attachments, and golive S83 (`cookies` outside a request) |
| Step 7 PGlite (new) | 6 of 6 |
| Ledger test files (sha256) | 21 of 21 OK |

**Open:**
- The pack photo (4.3) is not built: it needs the asset store and a storage decision.
- Cart restock lines are fixed by the cart template, so scanning a batch there is not wired.
- Found-on-shelf with a new product does not yet offer the picker.
- The registration reason codes are draft until the legal answers (D-CAT-08).
- 0256 waits for the owner, after 0255. The code needs 0251–0256 applied before it is deployed.

## STOP 8: prices, stock value and billable lines (27 Oct 2026)

- **Migration 0257** (GATED, after 0256):
  - `pharmacy_payers` (a `cash` payer for each hospital with products), `pharmacy_point_charge_modes`, `pharmacy_point_pay_first`, `pharmacy_price_rules`, `pharmacy_product_prices` (`ppp_price_or_free`: a price above 0, or free), `pharmacy_price_lists` and `_lines` (filled by Step 9);
  - `pharmacy_supplies` gains `payer_id` and `price_kind`;
  - RLS select for `pharmacy.view` at the hospital, audit triggers, append-only on modes, pay-first, rules and prices;
  - each `price_ugx` above 0 is copied as a cash, typed price from its update date (Kampala); a zero is not copied; re-runnable.
- **Engine** (`lib/pharmacy/prices/engine.ts`, pure): `proposePrice` with its arithmetic, `priceInForce`, `chargeFor` (free point → free; no price → `price_not_set`, never 0), `modeOn`, `stockValue`.
- **Store** (`lib/pharmacy/prices/store.ts`): `priceFacts` (the supply snapshot), `payFirstOn`, `billableLines` (ADR 0461), `stockValueOf`, `ruleOn`, `lastUnitCosts`, `pricesPage`; writes `setPriceRule`, `addPayer`, `setChargeMode`, `setPayFirst`, `setPrice` (accept re-works the proposal on the server and keeps its steps; typed > 0; free). Every change runs from today or later.
- **Supply:** with `PHARMACY_CATALOGUE` on, the hand-over snapshots the cash price in force at the point and records `price_kind` and `payer_id`; the point's pay-first overrides the hospital setting; `paymentPasses` gains the admitted-patient exemption (Law 13). The old price edit also writes a cash price from today. With the flag off nothing changes.
- **UI:** Set-up › Prices (4.6): figures (stock value, priced, free, price not set), the rule, payers, each point's charge mode and pay-first, "Needs a price" with the proposal's arithmetic, Accept / Type a price / Mark free, and the history. Controls only for `pharmacy.manage`; every write re-checks it. Pop-ups are centred `EditorDialog`s.
- **ADRs 0460, 0461.** CHANGELOG entry now reads "Steps 2–8".

**Scenarios:**
- **S26:** 130 × 1.25 = 162.5, rounded up to 200 with its steps; × 0.8 for staff gives 150. Nothing is written until Accept, and Accept re-works it on the server.
- **S27:** the latest row from on or before the date; a later entry wins a same-day tie; nothing before the first row.
- **S28, S29:** on the demo dispensing day, every supply from today carries the cash price in force for priced products, `free` at the free emergency point, and `price_not_set` with no price otherwise; earlier supplies (before any price was in force) are `price_not_set`; no supply holds 0.
- **S30:** a later price of 999,999 leaves the bill unchanged; a reversal takes the line off and changes the version.
- **S31:** stock value equals a hand SQL sum of balance × each batch's mean received cost over the demo; batches with stock and no cost are named.
- **S32:** read as the other hospital, prices, payers, the page's payers and history are empty.
- **S33:** with pay-first on at the inpatient and emergency points, today's demo hand-overs went through there; a ready ward line handed over with no payment recorded passes; a window line at the same point is refused for payment. Emergency always passes. Downtime entry never checked payment.
- **0257 copy-in:** 1,250.40 becomes a cash price of 1,250 from its update date; a second run adds nothing.

**Checks:**

| Check | Result |
|---|---|
| Typecheck | Clean |
| ESLint (pharmacy app, lib, content, new tests) | Clean |
| `tests/pharmacy` unit | 1,185 of 1,185 |
| All `tests/emr-db/pharmacy-*` lanes + parity | 1,084 of 1,087. The 3 failures were already on the branch: parity location_shares and appointment_attachments, and golive S83 |
| Step 8 PGlite (new) | 6 of 6 |
| Ledger test files (sha256) | 21 of 21 OK |

**Open:**
- The supply snapshot uses the cash payer; choosing a scheme or staff payer at the hand-over belongs to the payment slice.
- The admitted exemption applies only where the flag is on.
- 0257 waits for the owner, after 0256.

## STOP 9: imports as drafts (27 Oct 2026)

- **Migration 0258** (GATED, after 0257): `pharmacy_import_drafts` (kind, file, rows, the store or the supplier and edition, commit) and `pharmacy_import_rows` (raw line, match, why, proposal, decision, chosen, what commit made). RLS select for `pharmacy.view`; audit triggers.
- **Engine** (`lib/pharmacy/imports/engine.ts`, pure): RFC 4180 CSV with a BOM and CRLF, the column names of GATE A §8, 2 MB and 5,000 rows; `judgeProduct`, `judgeOpening`, `judgePriceLine`, `expiryOfText`.
- **Store** (`lib/pharmacy/imports/store.ts`): `createDraft` (the catalogue index is read once per file), `decideRows`, `commitDraft` through `addProduct`, `addHealthSupply`, `placeAt` and the price-list tables; `importPage`.
- **UI:** Set-up › Import (4.7): the upload card (kind, store or supplier and edition, the CSV file, its columns in words), recent imports, and a draft grouped as matched, check, not in the catalogue and cannot be read, each with why; Accept, Choose, Add as a health supply, Skip; "Accept the {n} matched rows"; "Commit {n} accepted rows".
- **Adapted (ADR 0462):** GATE A §8 named `recordStoreCount` "opening" for opening stock, but that call is the blind opening count and the go-live condition counts any count line at the store. Opening stock therefore places the products at the store and writes no count or movement; the figures stay on the draft.
- **O-5:** CSV only; no dependency added.
- **ADR 0462.** CHANGELOG entry now reads "Steps 2–9".

**Scenarios:**
- **S34:** a 600-row products file made a draft in 134 ms on PGlite (limit 10 s) with no product written; after four decisions, commit wrote exactly the 3 accepted rows (a catalogue product with its pack, two health supplies) and a second commit is refused. The lane's catalogue is small; with the full 2,624-medicine seed the index is read once per file, not per row.
- **S35:** a barcode of the 250 mg pack on a 500 mg row is "check" with no proposal ("A different strength is never proposed"); a 125 mg row found only by name in other strengths is "not in the catalogue"; a row with no proposal cannot be accepted.
- **S36:** opening stock for a store not yet live placed both products there, wrote no count and no movement, and the store's `opening_count` condition is still not met; a row for another place cannot be read; a live store is refused.
- **S37:** a line matched by barcode; in the next edition, the same supplier code matched it again; a line found by name only was "check" and needed a choice; an unknown line was kept with no pack.
- Also tested (unit): quoted fields, a missing column named, 5,001 rows refused, a wrong check digit, month-only expiry, a product already held or off the prescribing list sent to "check".

**Checks:**

| Check | Result |
|---|---|
| Typecheck | Clean, after typing each committed row through the store's own schema (`valid()`) |
| ESLint | Clean, after `parseCsv` was rewritten without comma expressions |
| `tests/pharmacy` unit | 1,198 of 1,198 (imports engine 5 of 5) |
| All `tests/emr-db/pharmacy-*` lanes + parity | 1,088 of 1,092. The 3 known failures, plus S6 (catalogue search p95), which ran beside a typecheck and took 5.9 s; alone it passes at p95 60.9 ms |
| Step 9 PGlite (new) | 3 of 3 |
| Ledger test files (sha256) | 21 of 21 OK |

**Open:**
- Opening stock still needs its blind opening count before the store goes live (S36).
- Excel files wait for a dependency decision (O-5); CSV only.
- 0258 waits for the owner, after 0257.

## STOP 10: distribution checks (27 Oct 2026)

- **Migration 0259** (GATED, after 0258):
  - `pharmacy_issue_picks` (scan with its code, or by hand; the later-batch reason);
  - `pharmacy_use_gap_reasons` (once per count and product);
  - `pharmacy_seal_events` (applied needs a seal number and its cart check);
  - all with RLS select for `pharmacy.view`, audit and append-only. No table here writes or reads stock (S43).
- **Engine** (`lib/pharmacy/distribution/engine.ts`, pure):
  - `pickCheck` and `pickProblems`;
  - `wardUseCheck`, `cartSignals` and `explainCartGaps`;
  - words come from `content/pharmacy-catalogue.ts` (draft).
- **Store** (`lib/pharmacy/distribution/store.ts`):
  - `recordPick` (the scan resolved through `resolveScan`, the planned batches through `planIssue`) and `assertPicked`;
  - `recordGapReason` and `reportSealBroken` (the ward write path, `Who`);
  - `sealApplied`, called when a cart check completes with a seal number;
  - reads `pickedLines`, `gapReasonsOf` and `sealsOf`.
- **Wired in:**
  - **Issues:** with the flag on, `issueRequisition` refuses unpicked lines. `getRequisition` sends each line's planned batches, its pick, and `controlledRefusals` (IS-6).
  - **Ward stock:** the ward page reads `useCheck`.
  - **Carts:** the carts page reads each cart's signal; the cart page reads its seals.
  - **Demo:** it ticks its lines by hand before each issue, so the demo runs with the flag on.
  - **Flag off:** nothing changes.
- **UI:**
  - **Issue form:** a Pick column (wedge scan with Enter, or Tick by hand; a later batch asks for the coded reason). Issue stays disabled with each line's reason.
  - **Ward stock** (pharmacy and nurse pages): "Use against the charts", and Give the reason in a centred dialog.
  - **Receipt dialog:** says the numbers are filled in as listed.
  - **Carts list:** "Check due: seal broken".
  - **Cart page:** the seal state, and Report a broken seal.
- **Actions:**
  - `recordPick` (`pharmacy.store` or `pharmacy.dispense`);
  - `reportCartSealBroken` (`pharmacy.stock`);
  - nurse-side `recordGapReason` and `reportSealBroken` (`ward_act`).
  - The action inventory test lists them.
- **ADRs 0463, 0464, 0465.** The CHANGELOG entry reads "Steps 2–11" and "0251–0259".

**Adapted:**
- **Later-batch reasons:** a pick offers `first_not_found` and `first_unfit` from the existing `BATCH_CHOICE_REASONS`. "Other" is left out because a pick carries no text.
- **IS-6:** issue and receipt already enforced the controlled witness and the second factor. `controlledRefusals` now states the need on the screen.
- **Ward use:** as GATE A said, the administration record names no ward-stock source. `charted` is null on real data and every row reads "Not charted from ward stock". The gap and the nurse-in-charge item are computed and tested on the fixture. The item is not delivered, because nurses have no Needs you list yet.
- **Resus doses:** none from carts on real data (the resus desk's cart is always null), so the seal report drives the signal alone.

**Scenarios:**
- **S38:** a scan of another product's GTIN is refused: "This is {it}. The line asks for {line}." Issuing the unpicked line is refused. A scan of the right pack is recorded, and `getRequisition` shows the pick and the planned batches. Unit tests cover another strength, a code no product carries, and the pick problems.
- **S39:** a scan carrying a later batch than the planned first-to-expire is refused ("{batch} expires {date}; {first} expires first…"). With `first_unfit` it is recorded as a scan with that reason, and the issue then goes through.
- **S40:** the receipt keeps its rule (own password and code, `ward_confirm`). The existing S23 lane covers it.
- **S41:**
  - unit, board 11–15: ceftriaxone 22/22 "Matches the charts"; tramadol 15/8 "7 not on any chart" with one notify item; a supply never charted reads "Not charted from ward stock"; with a reason it reads "7 more used than charted" and notifies nobody;
  - lane: every demo row reads "Not charted from ward stock". A gap reason is written once, a second is refused, and no movement is written.
- **S42:**
  - lane: every demo cart check with a seal number has its `applied` event; a broken seal puts the cart on the carts page as due (`seal_broken`), with no movement;
  - unit: a seal applied after the break clears it, and a resus dose explains the matching gap.
- **S43:** the movement count is unchanged across picks, a gap reason and a seal report.
- **S44:** every line of every demo requisition reads `witness_needed` exactly when it is controlled.

**Checks:**

| Check | Result |
|---|---|
| Typecheck | Clean |
| ESLint (pharmacy app, nurse ward stock, lib, content, tests) | Clean |
| `tests/pharmacy` unit | 1,208 of 1,208 (distribution engine 9 of 9) |
| All `tests/emr-db/pharmacy-*` lanes + parity | 1,100 of 1,103. The 3 failures are the known ones (parity location_shares and appointment_attachments, golive S83) |
| Steps 10–11 PGlite (new) | 8 of 8 |
| Ledger test files (sha256) | 21 of 21 OK |

**Open:**
- 0259 waits for the owner, after 0258.
- A dose source on the administration record (a later slice) turns the ward check on. Nurses need a Needs you list to receive the gap item.
- The nurse's ward-stock page does not list the unit's carts yet, so a nurse reports a broken seal through the action only. The pharmacy cart page has the button.
- The receipt is not yet a 390 px page of its own. The existing dialog stacks to one column at that width; this is not checked in a browser here.

## STOP 11: the stock map and Follow one medicine (27 Oct 2026)

- **No migration.** `placeValues` (prices store) values every place from one ledger read and shares its arithmetic with `stockValueOf`; S31 still passes.
- **`hospitalStockMap`** and **`medicineTrace`** (`lib/pharmacy/distribution/map.ts`).
  - Next steps come from a fixed list (`nextStep`, pure).
  - The movement filters (`groupOf`) are pure as well.
  - `confirmationWindowHours` reads the signed ward rules.
- **UI:**
  - **Store › Every place** (`?tab=map`, a Workspace v2 store tab after the others, so the store still opens on its first tab):
    - the figures;
    - one table per kind of place, saying how its stock is known;
    - stale counts, broken seals and overdue issues in amber with an icon and words;
    - one next step and Open;
    - Follow one medicine, a native select.
  - **The trace** (`&product=`):
    - the figures, and where it is now with a bar;
    - batches with state, and "Who received {batch}" for a recalled one;
    - every movement in 90 days with filters.
  - **Links in:** each product on a stock page; the hospital's products on a catalogue medicine page.
- **ADR 0466.** CHANGELOG updated.

**Adapted:**
- **One product:** the trace follows one product, and the catalogue page lists each product of the medicine.
- **Who received:** offered for a recalled batch only, because the existing trace is keyed by a recall.
- **Find (Ctrl K):** does not open the trace yet.
- **Workspace v2 only:** the map is reachable inside Workspace v2 only.

**Scenarios:**
- **S45:** the lane walks every place on the demo. Every row exists, holdings equal a SQL sum of positive balances, each value equals `stockValueOf` for that place, and the figure equals the rows' sum.
- **S46:** every next step is from the fixed list. The cart with a broken seal (S42) reads "Check and restock the cart, then seal it" first. Unit tests cover the order.
- **S47:** each issue-only ward has no value and no units, and reads "Not counted: issues only".
- **S48:** the trace of the S38 product has the same total by place, by batch and in the figures. It equals the SQL sum of its movements.
- **S49:** after a recall is started for one of its batches, that batch carries the recall's id, which links to `/pharmacy/store/expiry/recalls/{id}`. Movements run newest first.
- **S50:** 20 places on the demo; p95 37 ms over 6 loads on PGlite (limit 1.5 s).

**Checks:** as STOP 10 (one run covers both steps).

**Open:**
- Find opens the trace in a later step.
- The map uses one ledger read per load. `loadLedger` carries a ponytail note to narrow it when a hospital grows.
- The pages are not checked in a browser here: they need the flag, Workspace v2 and a signed-in pharmacy user.
