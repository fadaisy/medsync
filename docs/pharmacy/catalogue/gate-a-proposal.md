# Medicines catalogue: GATE A proposal

**Status:** **Signed** by Fadhul (CSO), 27 Oct 2026, as recommended (§15).
**Branch:** `feat/pharmacy-catalogue` (worktree `~/Desktop/medsync-catalogue`), cut from `feat/pharmacy-workspace-v2` 576f6018.
**Numbers:** migrations from **0251**, ADRs from **0456** (free on every branch, checked at STOP 0).
**Reads with:** `PROMPT-PHARMACY-CATALOGUE.md` (the brief), `STOP-REPORTS.md` (what the repo holds today), the canvas in `medicines-catalogue-canvas/`.

Where the repo and the brief disagree, the repo wins and the adaptation is named here (marked **Adapted**). Inputs still missing from the owner are open decisions **O-1 to O-7** (§12); every step that depends on one says so.

---

## 1. What changes and what does not

**Added:** a MedSync-wide catalogue (substances → medicines → products → packs), hospital links to it, barcode links, local products and health supplies, prices and stock value, the billable-lines read model, imports as drafts, and distribution checks (pick by scan, receipt on a phone page, ward use against charts, cart seals, the stock map and the medicine trace).

**Not changed (Law 1):** the movement kinds and `psm_guard`, `psm_pair_check`, FEFO, counts, witnesses, quarantine, recall, month end and ordering arithmetic. No catalogue, price, pick, seal or gap table is read by the ledger's triggers, and none writes a movement. The ledger test files are not edited in any step; every STOP reports them green, by file name and count.

The ledger tests, hashed at Step 2 and checked by hash at every later STOP:
- `tests/pharmacy/stores/`: `ledger`, `issue`, `receiving`, `locations`, `ward-stock`, `carts`, `consumption`, `expiry`, `month-end`, `order`, `recall`, `readiness-stores` (`.test.ts`);
- `tests/emr-db/`: `pharmacy-stock`, `pharmacy-stock-answer`, `pharmacy-controlled`, `pharmacy-stores-data`, `pharmacy-stores-store`, `pharmacy-stores-supply`, `pharmacy-stores-wards`, `pharmacy-supply`, `pharmacy-write` (`.test.ts`).

`tests/pharmacy/stores/scan.test.ts` is extended in Step 5; its existing cases stay byte-for-byte.

---

## 2. Data model, adapted to the repo

### 2.1 The shared catalogue (no `hospital_id`)

As brief §3.1, with these adaptations:

| Table | Adapted |
|---|---|
| `cat_substances` | `kind` `medicine` \| `health_supply` \| `other`. `atc_code` is **omitted** until O-4 is answered (Law 8). `emhslu_class` (text) carries the EMHSLU therapeutic class instead (D-CAT-06). |
| `cat_substance_names` | As brief. Unique (substance, lower(name), type). |
| `cat_dose_forms`, `cat_routes` | `code` (MedSync), `label` (en-GB), `edqm_code` (nullable), `edqm_retrieved_on` (date), `status` `draft` \| `signed`. EDQM columns stay null until O-3 (§4). |
| `cat_medicines` | As brief, plus `emhslu_level`, `emhslu_ven`, `flagged` (carried from the EMHSLU row, Law 7). A health-supply "medicine" is an item: the same table, `kind` taken from its substances. |
| `cat_medicine_ingredients` | `strength_text` is the truth (Law 3). Parsed `amount`, `unit`, `per_amount`, `per_unit`, `basis` are nullable and used for search and grouping only. |
| `cat_medicine_routes` | As brief. |
| `cat_medicine_links` | **Adapted:** the formulary link replaces nothing. `pharmacy_medicine_links` (edition ↔ prescribing id, CSO-confirmed under `pml_guard`) stays as is; `cat_medicine_links` adds medicine ↔ EMHSLU row and medicine ↔ prescribing id, and a medicine is prescribable **only** through a confirmed prescribing link (D-CAT-03). |
| `cat_manufacturers` | As brief. |
| `cat_products` | `nda_state` `registered` \| `lapsed` \| `not_found` \| `unknown`; plus `registration_kind` `registered` \| `notified` \| `listed` (the 2026 Act s.21), nullable; `source_edition_id`, `source_row`. |
| `cat_packs` | `contents` is a whole number of the medicine's issue unit, or null (Law 4). |
| `cat_pack_codes` | As brief. `serial` is never stored here (it belongs to one physical pack). |
| `cat_register_editions` | **Added:** one row per NDA edition applied: file name, SHA-256, edition date, row count, by, at. |
| `cat_pack_photos` | **Added:** pack photo assets with the proposal they support; the upload says "no patient in view" (brief §7). |
| `cat_proposals`, `cat_proposal_reviews` | **Added** `cat_proposal_reviews` (proposal, reviewer, decision, at) so the two-person rule is a constraint (§3). |
| `cat_changes` | Append-only: table, row id, before, after, source, proposal id, by, at. |
| `catalogue_curators` | **Added:** who holds `catalogue.curate` (user, granted by, from, to). The repo has no platform-level right other than the `superadmin` role (STOP 0); this table is that right. |

**RLS.** Every `cat_*` table: RLS enabled and forced, `REVOKE ALL FROM anon, authenticated`, `GRANT SELECT` to `medsync_clinical_reader`, with a policy `private.pharmacy_can('pharmacy.view') OR private.catalogue_can_curate()` (the pattern of 0136). **Adapted:** the brief says "readable by all staff"; the repo has no all-staff helper, and the nurse and prescriber pages that will show catalogue names read through the pharmacy scope on the app connection, as the ward pages do today. A wider reader is added when a page needs one. No client INSERT/UPDATE/DELETE. Writes run only through `runCatalogueWrite` (§3). Append-only tables (`cat_changes`, `cat_proposal_reviews`, `cat_register_editions`) refuse UPDATE and DELETE by trigger, as the other pharmacy logs do.

### 2.2 Per hospital (with `hospital_id`, under RLS by `private.pharmacy_can`)

As brief §3.2, with these adaptations:

| Change | Adapted |
|---|---|
| `pharmacy_products` gains `catalogue_pack_id`, `item_kind`, `local_proposal_id` | `item_kind` `formulary` \| `local_medicine` \| `health_supply`. **`medicine_id` becomes nullable**, with a CHECK that `item_kind = 'formulary'` ⇒ `medicine_id IS NOT NULL` (today it is NOT NULL, 0123:20). Every existing row is `formulary` and keeps its value. A product with no `medicine_id` never reaches a prescribing match. |
| Existing `pharmacy_products.gtin` | Kept. `resolveScan` reads it first, so nothing scanned today stops working. Step 6 copies it into `cat_pack_codes` as a local link once the product is linked to a pack. |
| Existing `pharmacy_products.price_ugx` | Migrated into `pharmacy_product_prices` as payer `cash`, `source = 'typed'`, from its last update date. The column stays readable (supplies snapshot it) until the dispensing read moves to the price in force, in Step 8, then is left unused. Never dropped in this slice. |
| `pharmacy_product_prices` | Integer UGX. A CHECK refuses 0 (Law 11): a price is > 0, or the row is `free`. |
| **Stock value** | **Adapted:** batches have no cost (STOP 0). A batch's unit cost is the quantity-weighted mean of `unit_cost` over that batch's `received` movements. A batch with none (an opening count, a found batch, a transfer-only batch) is **not valued** and named (Law 11). The ledger is read, never changed. |
| `pharmacy_issue_picks`, `pharmacy_seal_events`, `pharmacy_use_gap_reasons` | As brief. Append-only. None is referenced by a movement. |
| `pharmacy_point_charge_modes` | As brief. |
| `pharmacy_point_pay_first` | **Added** for D-CAT-11: per point, outpatients pay before collecting, from a date, by. Defaults from the hospital's `payment_status_required` (0129:113) when Step 8 lands, so nothing changes until someone sets it. |

### 2.3 Migration plan (every one GATED, written here, applied by the owner)

| # | Step | What | Notes |
|---|---|---|---|
| 0251 | 2 | Catalogue tables (§2.1), RLS, append-only triggers, `catalogue_curators`, the two-person trigger | No hospital data touched |
| 0252 | 2 | The signed forms and routes as rows | Only after the CSO signs §4 |
| 0253 | 3 | `pg_trgm` and `unaccent` extensions, trigram indexes on names, brands, makers | **New extensions:** not used anywhere in the repo yet. Supabase provides both; PGlite support is confirmed in Step 3 before the migration is offered |
| 0254 | 5 | GTIN uniqueness and conflict indexes on `cat_pack_codes`; `pharmacy_delivery_lines.serials` | Delivery lines are not ledger rows |
| 0255 | 6 | `pharmacy_products` columns and the `medicine_id` relaxation | Existing rows unchanged |
| 0256 | 8 | Payers, charge modes, pay-first, price rules, prices (with the migration of `price_ugx`), price lists | |
| 0257 | 9 | Import drafts and rows | |
| 0258 | 10 | Picks, seal events, gap reasons | |

The EMHSLU seed, the names and the NDA edition are **not** migrations: they are idempotent scripts run by the owner (`--apply`), each writing proposals that are confirmed in batches, as `load-national-list.ts` does today.

---

### 2.4 Sources: what is stored and how it is attributed

| Source | Stored | Attribution and terms | State |
|---|---|---|---|
| EMHSLU 2023 (MoH) | Substances, medicines, strength as printed, form, level, VEN, class, health supplies; row and page on each | "Uganda Ministry of Health, EMHSLU 2023, p. {page}" on the medicine page | Ready (already loaded) |
| NDA register | Brand, maker, country, registration number, state, edition and row | "National Drug Authority, National Drug Register, {edition date}" on every brand | **Waits on O-1**: no reuse terms published; newest PDF June 2024 |
| RxNorm prescribable subset | Other names only (type USAN or other), with the release date | Public domain; "RxNorm, US National Library of Medicine, {release}" | Ready |
| EDQM Standard Terms | `edqm_code` and retrieval date beside MedSync's own form and route labels; terms unmodified | As EDQM's conditions require | **Waits on O-3** |
| WHO ATC/DDD | Nothing | Commercial copying forbidden as published | **Waits on O-4**; EMHSLU class used instead |
| GS1 | Nothing loaded; codes come from scans and supplier lists | Public standard | Ready |
| Supplier price lists | Each hospital's own upload, hospital-scoped | The supplier and edition date on each line | Ready |
| Pack photos | Assets, hospital proposer, no patient in view | Evidence only | Ready |

Search terms are not logged (brief §7). Every catalogue change is in `cat_changes`; every price change, link and import commit records who and when.

### 2.5 Where the screens live (Workspace v2)

- **Set-up** (`/pharmacy/setup?view=`): new views `catalogue` (4.5), `prices` (4.6), `import` (4.7).
- **Store** (`/pharmacy/store?tab=`): a new tab `map` (4.10); Issues (4.11), Wards (4.13) and Carts (4.14) gain their checks in place; the trace (4.15) is a detail page `/pharmacy/store/trace/[id]`, opened from Find.
- **Nurse**: the receipt page (4.12) under `/nurse/ward-stock`.
- **MedSync**: the catalogue team's queue (4.8) at `/admin/pharmacy-catalogue`, beside today's national-list linking.
- Every pop-up is the centred `EditorDialog`; nothing slides in.

## 3. Governance

- **Who curates.** `catalogue.curate` = an open row in `catalogue_curators`, granted by a superadmin with a fresh second factor. Recommended first holders: Fadhul plus one MedSync pharmacist. Every curate write needs aal2 and a fresh second factor (`secondFactorFresh`, as `/admin/pharmacy-catalogue` does today).
- **The write contract.** `runCatalogueWrite`, the sibling of `runPharmacyWrite` with the same shape: Zod → actor (curator, `NO_HOSPITAL`) → transaction → point check → write → `{ id, serverTime }`, writing `cat_changes` in the same transaction (Law 15).
- **The two-person rule (Law 6).** A proposal that changes a medicine's substance, strength, form or route, or merges two medicines, applies only when **two different curators**, neither the proposer, have confirmed it. Enforced in the database: `cat_proposal_reviews` refuses a reviewer equal to the proposer, and the apply trigger counts distinct confirmations. Other proposals (a name, a brand, a pack, a barcode, a register change) need one curator who is not the proposer.
- **Lists the CSO signs.** Forms and routes (§4), other names and abbreviations (§5): signed as lists, the signature recorded with the list's hash, as the clinical packs are.
- **Conflicts are surfaced, never resolved by MedSync.**
  - The same barcode linked to two packs (at one hospital, or local at two hospitals, or local against shared): every link involved shows `conflict` to each hospital that holds one, and the queue lists it. At the hospital, a scan of a conflicted code resolves to nothing and asks the person to pick.
  - The same brand and pack with two registration numbers: one `correction` proposal holds both, with their sources.
- **A register edition.** The owner supplies the file (O-1). `load-nda-register.ts` dry-runs by default, reports counts (matched, proposed, rejected with a reason, summing to the file's rows: S8), and with `--apply` records `cat_register_editions` and writes proposals. Exact matches (generic name, strength as printed, form) are confirmed in batches; everything else goes to the queue. A brand missing from a newer edition gets a `register change` proposal to `lapsed`, never a direct update (S9).

---

## 4. Forms and routes (draft for signature, D-CAT-04)

Plain en-GB labels. **EDQM codes are not filled in:** the EDQM account and its conditions of use are open (O-3). When they are cleared, each label is mapped to an EDQM term retrieved on a recorded date, used unmodified, with the attribution EDQM requires; until then `edqm_code` is null and nothing claims EDQM.

**Forms (40).** Tablet · Film-coated tablet · Chewable tablet · Dispersible tablet · Effervescent tablet · Modified-release tablet · Sublingual tablet · Capsule · Modified-release capsule · Oral solution · Oral suspension · Syrup · Oral drops · Powder for oral solution · Powder for oral suspension · Oral powder in sachet · Oral gel · Injection solution · Injection suspension · Powder for injection · Powder and solvent for injection · Concentrate for infusion · Infusion solution · Cream · Ointment · Gel · Lotion · Paste · Eye drops · Eye ointment · Ear drops · Nasal drops · Nasal spray · Inhaler (pressurised) · Nebuliser solution · Suppository · Pessary · Vaginal cream · Transdermal patch · Medicated dressing.

**Routes (15).** Oral · Sublingual · Buccal · Intravenous · Intramuscular · Subcutaneous · Intradermal · Intraosseous · Topical (skin) · Eye · Ear · Nose · Inhaled · Rectal · Vaginal.

Health supplies take no form or route; their unit is the item kind (piece, pair, roll, box, kit).

Mapping EMHSLU's `form` column to this list is a Step 2 report: every distinct value with its proposed form, and the rows that map to none (S1 reports them with the reason).

---

## 5. Other names and abbreviations (drafts for signature)

Stored as `cat_substance_names` with a type. Search-only: no name changes a medicine. The RxNorm-derived names come at Step 3 from the prescribable subset only (Law 8) and are listed for signature then.

**BAN, former and US names (draft).** adrenaline / epinephrine (USAN) · noradrenaline / norepinephrine (USAN) · paracetamol / acetaminophen (USAN) · salbutamol / albuterol (USAN) · glibenclamide / glyburide (USAN) · pethidine / meperidine (USAN) · rifampicin / rifampin (USAN) · ciclosporin / cyclosporine (USAN) · levothyroxine / thyroxine (former) · furosemide / frusemide (former) · lidocaine / lignocaine (former) · amoxicillin / amoxycillin (former) · cefalexin / cephalexin (former) · sulfamethoxazole / sulphamethoxazole (former) · chlorphenamine / chlorpheniramine (former) · bendroflumethiazide / bendrofluazide (former) · phenobarbital / phenobarbitone (former) · estradiol / oestradiol (former) · isoprenaline / isoproterenol (USAN).

**Ugandan abbreviations (draft; Fadhul to strike or add).**

| Abbreviation | Points to | Type |
|---|---|---|
| PCM | paracetamol | local abbreviation |
| ORS | oral rehydration salts | abbreviation |
| GV | gentian violet (methylrosanilinium chloride) | local abbreviation |
| TEO | tetracycline eye ointment | local abbreviation |
| AL | artemether + lumefantrine | abbreviation |
| SP | sulfadoxine + pyrimethamine | abbreviation |
| CTX | co-trimoxazole | abbreviation |
| TLD | tenofovir + lamivudine + dolutegravir | abbreviation |
| INH | isoniazid | abbreviation |
| RHZE | rifampicin + isoniazid + pyrazinamide + ethambutol | abbreviation |
| MgSO4 | magnesium sulfate | abbreviation |
| KCl | potassium chloride | abbreviation |
| NS | sodium chloride 0.9% | local abbreviation |
| RL | Ringer's lactate (compound sodium lactate) | local abbreviation |
| ACT | every artemisinin-based combination | class abbreviation, on each member |
| ARVs | every antiretroviral | class abbreviation, on each member |

A class abbreviation (ACT, ARVs) is stored on each member substance, so a search for it lists the class. "D5", "D10", "D50" (glucose strengths) are **not** proposed: an abbreviation that encodes a strength would let a search blur strengths (Law 3).

---

## 6. Scan, pick and type on every receiving surface

**One field kit**, built once and used by: Count a delivery, the store opening count, Add a product, Add a batch found on the shelf, and cart restock (brief §4.1, S20–S24).

1. **Scan.** A keyboard-wedge scanner types into the always-listening field. `resolveScan`:
   - parses GS1 (Appendix B): AIs 01, 17, 10, 21, and 11 (shown, not used); GS/FNC1 or none; `]d2`/`]C1` stripped; check digit verified; **unknown AIs are skipped and named**, not fatal; 8-, 12- and 13-digit codes padded to GTIN-14. (**Adapted:** today's parser fails on unknown AIs, lacks AI 11 and padding, and drops the serial.)
   - resolves: the product's own `gtin` → the hospital's local link → the shared link → `unknown`. A conflicted code resolves to nothing.
   - a non-GS1 code is looked up as an NMS, JMS or supplier code.
   - **The serial** is kept on the receipt line only: `pharmacy_delivery_lines.serials text[]` (nullable, migration 0254), one per scanned pack. Nothing reads or reports it (brief §10).
2. **Pick.** Ctrl K opens the centred picker (EditorDialog `wide`, 4.2). Results grouped medicines / brands / your products, each with why it matched.
3. **Type.** "The pack that came is not here" opens the not-in-catalogue form (4.4), which creates a local product and a `new product` proposal.

**Rules on every surface.** A DataMatrix fills batch and expiry; a plain EAN/UPC fills the pack only. Rescanning adds one pack to the open line and says so (D-CAT-09). Packs × whole contents → units, both shown before saving; non-whole contents → the line is counted in issue units (Law 4). Every value shows its source tag. Nothing moves until the count is finished, as today. A lapsed or unregistered product needs a coded reason and lands on the in-charge's list (Law 9, D-CAT-08, pending the legal answers). A controlled product keeps its witness.

**A new barcode** (4.3): proposes the delivery order's uncounted lines, then search; never picks. "Link and fill the line" writes a hospital-scoped link (works at once here) and a proposal (shared only after review, S14).

**Camera scanning** is open (O-2). If wanted, Step 5 proposes the browser's `BarcodeDetector` (no dependency; not in iOS Safari) and, separately, a fallback library, and stops for approval before adding either.

---

## 7. Prices, billable lines and the payment boundary

**Model.** Payers (cash, each scheme, staff, others), per-point charge mode (`charged` \| `free`, from a date), price rules (markup multiplier, rounding step, payer adjustment, from a date; **no default shipped**, D-CAT-10), prices per product × payer per issue unit (integer UGX, or `free` at product level), append-only, from a date, by, source `rule_accepted` \| `typed` \| `import`.

- `proposePrice` = last unit cost × multiplier, adjusted by payer, rounded **up** to the step; the arithmetic is returned for the screen. It writes nothing (S26).
- The price in force on a date is the latest row from on or before that date (S27).
- **Three kinds of nothing (Law 11):** `free` (a decision), `price_not_set` (amber, icon and words), and never UGX 0.

**`billableLines(prescriptionKey)` — the contract with Accounts.** One row per line the pharmacist has settled for supply: product, quantity in issue units, payer, `unit_price` (snapshot at supply) \| `free` \| `price_not_set`, `line_total` (null unless priced), plus a `bill_version` that changes when any line changes (S30). Readable by pharmacy staff now; the accounts role and the patient (own bill only) are a later grant. It writes nothing about payment. **Adapted:** the price snapshot already exists as `pharmacy_supplies.price_ugx` (0126:79); Step 8 reads the snapshot from there and fills it from the price in force instead of the product column; 0256 adds the snapshot's `payer_id` and `price_kind` (`priced` \| `free` \| `price_not_set`) beside it, so a supply records which of the three it was.

**Payment never holds up care (Law 13). Adapted:** today's gate (`handover.ts:233-234`) exempts emergencies and downtime entry but **not admitted patients** (STOP 0). Step 8 adds the admitted-patient exemption to `paymentPasses` (a prescription from an admission passes), with S33 covering emergency, resus, admitted and downtime. Pay-before-collect becomes per point (D-CAT-11), off by default.

**Boundary.** MedSync holds no money (Law 14). Out of this slice: taking payment, the phone bill, the Accounts dashboard, claims, taxes. The existing payment field (`setPaymentStatus`, values paid / exempt / insured / emergency / not_recorded) stays the only source of "Paid".

---

## 8. Import formats (Step 9)

**CSV (UTF-8, comma, header row) is supported. Excel is open (O-5):** reading `.xlsx` needs a dependency; recommended CSV first ("Save as CSV" from Excel).

| File | Columns (required in bold) |
|---|---|
| Products | **medicine or item name**, **strength as printed**, **form**, brand, manufacturer, NDA number, pack description, contents, **issue unit**, GTIN, supplier code |
| Opening stock | **place**, **product (name, GTIN or MedSync product id)**, **batch**, **expiry** (`2027-03-31` or `2027-03`), **quantity in issue units**, unit cost |
| Supplier price list | **supplier**, **edition date**, **item text**, pack price, supplier code, GTIN |

Every file becomes a **draft** (`pharmacy_import_drafts`, rows with the proposed match and why: matched / check / not in the catalogue). One decision per row by a person. **Commit {n} matched rows** writes only accepted rows, through the existing stores (`addProduct` / `newProduct` in `stock/store.ts`, `recordStoreCount` step "opening" in `stores/location-store.ts`). Never a different strength (S35). Opening stock still needs its blind count before go-live (S36). A live place is refused. Limits: 2 MB, 5,000 rows; a 600-row draft in under 10 s.

---

## 9. Distribution checks (Step 10)

- **Pick by scan (4.11).** `pickCheck` refuses a different product or strength in words; a later batch needs the existing coded reason; a pack with no barcode is ticked by hand and the record says so (D-CAT-15). `pharmacy_issue_picks` records verification only. **Issue {n} lines** stays disabled, with its reason, while a pick problem is open. The plan's rows (today not sent to the screen, store-read.ts:864-889) are sent. **Adapted:** `controlledRefusals` (IS-6), written but never called, is wired into pick, issue and confirmation (S44).
- **Receipt on the phone (4.12).** A responsive page at 390 px under `/nurse/ward-stock` (no Expo work; the nurse workspace is the staff phone surface, STOP 0 Q11). Confirmation keeps today's rule: the receiver's own password and code (`pharmacy_receipt` attestation) and the `ward_confirm` right; nobody confirms for another (S40). **Adapted:** the dialog pre-fills arrived = issued, which board 12's "Everything arrived as listed" keeps; it is not a blind count, as built. A difference writes the existing `adjusted` with `receipt_difference`.
- **Overdue confirmations (IS-4).** `unconfirmedOverdue` (built, never called) feeds the stock map and Needs you, with the window from the signed ward rules; while unsigned, the list says so.
- **Ward use check (4.13).** `wardUseCheck` compares counted use with doses charted from ward stock. **Adapted, and the largest gap:** the administration record has **no dose source and no writer outside demo data** (STOP 0 Q10). Per the brief, no source is added here, so on real data every product reads **"Not charted from ward stock"**. The pure engine is built and tested on the board 11–15 fixture (S41) so the check turns on the day a dose source exists. Gap reasons come from the signed list (D-CAT-14).
- **Cart seals and signals (4.14).** `pharmacy_seal_events`: applied (at "Restock and seal") or reported broken. **Adapted:** the resus desk stores the cart as free text that is always null, and has no broken-seal field; per the brief no field is added there. A broken seal is reported from the cart page and from the ward-stock page by the unit's nurse; `cartSignals` uses the seal report alone on real data, and resus-dose matching (by catalogue medicine, which also fixes the recall id mismatch) is built and tested on the fixture.
- **Not built here:** withdrawing a requisition (Phase 2 item); it stays listed as open.

---

## 10. Stock map and medicine trace (Step 11)

As brief 4.10 and 4.15 with `hospitalStockMap` and `medicineTrace`. Values use the batch cost of §2.2. Totals equal the ledger's sums place by place (S45, a test walking every place on the demo). Next steps come from a fixed list of draft strings. An issue-only ward shows no balance.

---

## 11. Strings

All of Appendix A goes into `content/pharmacy-catalogue.ts` as `draft`. No `*_COPY_STATUS` is touched. Strings this proposal adds, also `draft`:

| Key | Text |
|---|---|
| Unknown element | Part of this code was not read: {ai}. The rest is filled. |
| Code conflict | This barcode is linked to more than one pack. Pick the pack that came. |
| Not prescribable | Stocked here; not on the prescribing list. |
| Not valued reason | No recorded cost: received before costs were kept, counted at opening, or found on the shelf. |
| Pay not needed | No payment needed before supply: {reason}. |
| Overdue window unsigned | The confirmation window is not signed yet, so overdue issues are not listed. |
| Seal report | Report a broken seal |
| Import draft | Nothing is saved until you commit. |
| EDQM pending | Forms and routes are MedSync's own list. EDQM codes are added once their terms are cleared. |

---

## 12. Decisions

### 12.1 GATE A decisions (brief §8)

| # | Decision | Recommendation | Fadhul |
|---|---|---|---|
| D-CAT-01 | One shared catalogue | Yes: four shared layers; the hospital's product is the fifth | ✔ signed |
| D-CAT-02 | Who curates | `catalogue_curators` (§3); two people for medicine-level changes; the CSO signs lists | ✔ signed |
| D-CAT-03 | Stock beyond the prescribing list | Yes: local products and health supplies; only formulary-linked medicines prescribable | ✔ signed |
| D-CAT-04 | Forms and routes | §4 as MedSync's list; EDQM mapping after O-3 | ✔ signed |
| D-CAT-05 | Preferred name | WHO INN where one exists; others "also called" | ✔ signed |
| D-CAT-06 | ATC codes | Not loaded (O-4); EMHSLU therapeutic class instead | ✔ signed |
| D-CAT-07 | Shared barcodes | Local at once; shared after one curator confirms | ✔ signed |
| D-CAT-08 | Unregistered or lapsed | Receivable with a coded reason, listed for the in-charge; never blocks quarantine or recall; confirm with the legal answers | ✔ signed |
| D-CAT-09 | Rescanning a pack | Adds one pack to the open line, and says so | ✔ signed |
| D-CAT-10 | Price rule default | None shipped | ✔ signed |
| D-CAT-11 | Pay before collecting | Per point, off by default; never for emergency, resus, admitted or downtime | ✔ signed |
| D-CAT-12 | Phone payment | A separate slice with a licensed provider | ✔ signed |
| D-CAT-13 | Charted doses vs counted use | Yes, a check only; on real data "Not charted from ward stock" until a dose source exists | ✔ signed |
| D-CAT-14 | Ward gap reasons | Given and not charted · broken or spilt · moved to another ward · returned not recorded · counted wrongly last time · cannot explain · other, with text | ✔ signed |
| D-CAT-15 | Pick by scan | Required for barcoded packs; by hand with the reason otherwise | ✔ signed |
| D-CAT-16 | Cart signals | Yes; from the seal report on real data (the resus desk records no cart) | ✔ signed |
| D-CAT-17 | Receipt on the phone | Yes, at 390 px under the nurse workspace, with today's password-and-code attestation | ✔ signed |

### 12.2 Adaptations needing a yes (from STOP 0)

| # | Adaptation | Recommendation | Fadhul |
|---|---|---|---|
| A-1 | `pharmacy_products.medicine_id` becomes nullable for local and health-supply products | Yes, with the CHECK in §2.2 | ✔ signed |
| A-2 | Batch cost derived from `received` movements; unvalued batches named | Yes (no ledger change) | ✔ signed |
| A-3 | Admitted patients exempt from the payment gate | Yes (Law 13) | ✔ signed |
| A-4 | `pg_trgm` and `unaccent` enabled | Yes, after the PGlite check | ✔ signed |
| A-5 | Receipt pre-filled as issued (not blind), as built | Keep | ✔ signed |
| A-6 | No ward-use or resus-cart source added in this slice | Keep, per the brief | ✔ signed |

### 12.3 Open inputs (owner)

| # | Needed | Blocks | Recommendation until answered |
|---|---|---|---|
| O-1 | The latest NDA register edition as a file, and reuse cleared with the NDA | Step 4 | Build the loader against the June 2024 PDF's layout only when the file arrives; Steps 2–3 and 5–11 go ahead |
| O-2 | Pilot scanners (USB wedge? 2D?) and camera scanning yes/no | Step 5 camera part; Step 12 | Build for a USB wedge; no camera dependency |
| O-3 | EDQM account and its conditions of use, read in a browser | The EDQM columns | MedSync's own list, `edqm_code` null |
| O-4 | WHOCC written permission for ATC | ATC column | No ATC in this slice |
| O-5 | Excel import yes/no (a dependency) | Step 9 `.xlsx` | CSV only |
| O-6 | A second demo hospital in `lab_demo_hospitals` | Cross-hospital test on the demo | PGlite's "Real" control hospital covers S14 |
| O-7 | The count of linked prescribing-list medicines (`select count(distinct medicine_id) from pharmacy_medicine_links;`) | Step 2 report | Report as unknown |

---

## 13. Test plan

| Step | Scenarios | Lane |
|---|---|---|
| 2 | S1–S4 | PGlite (`tests/emr-db/pharmacy-catalogue*`); seed script dry run on the real CSV |
| 3 | S5–S7 | PGlite + a timed query report (p95 < 150 ms, `EXPLAIN` attached) |
| 4 | S8–S10 | Unit (parser over a fixture of the supplied edition) + PGlite |
| 5 | S11–S16 | Unit (`tests/pharmacy/stores/scan.test.ts` extended; existing cases unchanged) + PGlite with the demo and "Real" hospitals |
| 6 | S17–S19 | PGlite |
| 7 | S20–S25 | PGlite + component; S20 timed against Q8 |
| 8 | S26–S33 | Unit (pure price and value engines) + PGlite (RLS, gate) |
| 9 | S34–S37 | Unit + PGlite |
| 10 | S38–S44 | Unit on the board 11–15 fixture + PGlite |
| 11 | S45–S50 | PGlite (ledger sums on the demo) + timing |
| 12 | axe on every new screen at desk width and 390 px; red-reserved and no-green tests; budgets | Browser + Vitest |

**At every STOP:** `npm run typecheck && npm run lint && npm run test`, the PGlite pharmacy lane, and the ledger test files unchanged (by hash) and green. `npm run build` before shipping.

---

## 14. ADR drafts

| ADR | Title | Decides |
|---|---|---|
| 0456 | The shared medicines catalogue and its layers | D-CAT-01, -02, -03; §2.1; `catalogue_curators` |
| 0457 | Strength as printed, with a parse for search only | Law 3; the ingredient columns |
| 0458 | Barcode links: local first, shared after review | D-CAT-07; conflicts; the parser's extension |
| 0459 | Local products and health supplies in stock | A-1; `item_kind` |
| 0460 | Prices: payers, rules that propose, history, the three kinds of nothing | D-CAT-10, -11; A-3 |
| 0461 | Billable lines as the contract with Accounts | §7 |
| 0462 | Imports as reviewed drafts | §8; O-5 |
| 0463 | Picking by scan: verification without moving stock | D-CAT-15; IS-6 wired |
| 0464 | Charted doses as a check on counted ward use | D-CAT-13, -14; A-6 |
| 0465 | Cart seals and resus signals | D-CAT-16 |
| 0466 | The hospital stock map and the medicine trace | §10; A-2; IS-4 |

Each is written at the step that builds it, and mirrored in `CHANGELOG.md`.

---

## 15. Signature

I have read this proposal and sign the decisions ticked above, the lists in §4 and §5 as amended, and the data model and licence position in §2 and STOP 0 Q4.

| | |
|---|---|
| Name | Fadhul, Clinical Safety Officer |
| Decisions signed | D-CAT-01 to D-CAT-17 and A-1 to A-6, as recommended; §4 and §5 lists as drafted; O-1 to O-7 take the fallbacks in §12.3 |
| Amendments | None |
| Date | 27 Oct 2026 |
| Signature | Signed in the Claude Code session by Fadhul (CSO): "I, Fadhul (CSO), sign GATE A as recommended: D-CAT-01 to 17, adaptations A-1 to A-6, and the §4 and §5 lists as drafted. Use the fallbacks for O-1 to O-7." |

**STOP 1.** Nothing from Step 2 onward is built until this block is filled in.
