# Lab Phase 2: STOP reports

## STOP 0: Discovery and reconciliation (12 Oct 2026)

Nothing in the product changed at this step. I checked the research file against the live registry
(`lib/facts/catalogue.generated.ts`: 465 concepts), the live test catalogue (`data/emr/test-catalogue.v1.json`
plus the v1.5 additions: 44 tests), the curated units (migration 0103: 28 units) and Phase 1's range code
(`lib/lab/ranges.ts`, migration 0104). The repo wins every disagreement; each one is listed below with what I
propose.

### What the handoff already knew, confirmed

1. **Three "new" concepts already exist and match** (same unit, same value type): `obs.eosinophils_abs`,
   `obs.bicarbonate`, `obs.aptt`. The research has 62 new ids, so 59 remain.
2. **Invalid UCUM in the research:** `copies/mL`, `mL/min/1.73m2`, `count`, `log10 copies/mL`, `1` (urine SG),
   `{INR}`. F-1 and F-2 settle all but one (see A5).
3. **The `text` value type** appears on two concepts only: `obs.blood_culture_gram_stain` and
   `obs.blood_culture_organism`. Both wait for microbiology (F-4).
4. **Dropped components:** `test.glucose_fasting` drops `obs.glucose` for `obs.glucose_fasting` (CD-02);
   `test.troponin` drops `obs.troponin` for the I and T concepts (CD-03). No other test loses a component.
5. **Twelve live tests are not in the research** (ECG, chest X-ray, abdominal ultrasound, capillary glucose,
   OGTT, ketones, blood gas, C-peptide, islet antibodies, B12/folate, retinal photograph, ABI). They stay as
   they are.

### New disagreements (each needs a decision or a fix)

**A1. The research renames answer codes on 18 existing coded concepts. The live codes must stay.**
The live codes are signed, may already be stored on results, and the signed NCD diabetes pack reads them
(`lib/ncd/cfc-map.ts` maps `plus1`, `negative` for urine ketones and protein). Examples:

| Concept                                      | Live                                 | Research                                                              |
| -------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| Urine protein, leucocytes, AFB               | `negative`, `plus1`…`plus3`          | `neg`, `1plus`…`3plus`                                                |
| Urine nitrite, HBsAg, HCV, malaria test, LAM | `positive` / `negative`              | `pos`/`neg`, `reactive`/`non_reactive`, `parasites_seen`…             |
| Urine glucose                                | `negative`, `trace`, `plus1`…`plus4` | concentrations `100`…`2000` (mg/dL)                                   |
| Urine ketones                                | `negative`, `plus1`…`plus3`          | `small`, `moderate`, `large_80`, `large_160`                          |
| Blood culture                                | `no_growth`, `suspected_contaminant` | `no_growth_prelim`, `no_growth_final`, `growth_doubtful_significance` |

Proposal: keep every live code; add only answers that are new in meaning (for example `invalid`, blood
`trace_haemolysed`/`trace_nonhaemolysed`, Xpert semi-quantitative grades); hold the brand-specific wording
(small/moderate/large, mg/dL) in the dipstick brand tables (CD-09) mapped onto the live codes.

**A2. Four existing concepts change meaning, not just spelling.** These need the owner's choice:

- `obs.hiv_test`: live answers are one test's result (`reactive`, `non_reactive`, `indeterminate`); the
  research makes it the algorithm's outcome (`positive`, `negative`, `inconclusive`, `discrepant`) and moves
  per-kit results to new `obs.hiv_rdt_t1..t3`.
- `obs.tb_xpert`: live combines MTB and RIF in one answer; the research splits MTB grade (with "trace") from
  RIF (`obs.tb_xpert_rif`).
- `obs.blood_group`: live holds ABO and Rh together (`a_pos`…`o_neg`); CD-06 splits ABO and RhD, so this
  concept would lose its Rh half.
- `obs.malaria_test`: live `positive`/`negative`; the research uses smear wording.

Proposal: never change an existing concept's meaning. Where the shape changes (HIV outcome, Xpert, blood
group), add new concepts for the new shape and mark the old one legacy for new entry, so old results keep
reading as they were written. This would raise the addendum above 59; I will count it exactly at GATE A.

**A3. Restricted classes.** Live sensitivity is only `restricted`/`standard` per concept; class names
(`hiv`, `tb`, `sexual_reproductive_health`) live on condition relations, not on lab tests. Two differences from
CD-08: CrAg is restricted today but is not on the CD-08 list (proposal: keep it restricted), and the urine
pregnancy test is `standard` today with the under-age rule SR-PREG-MINOR (CD-08 makes it restricted for
everyone). Recording a class per test needs a column; I will put it in the GATE A schema.

**A4. `{copies}/mL` is not in the curated unit list.** The registry uses it but migration 0103 never added it,
so no hospital can set up a numeric viral load today. Add it in the F-3 unit migration, with ng/L,
mg/L{FEU}, mg/L{DDU}, [pH], d and {count}.

**A5. Log10 viral load has no valid UCUM spelling in the research** (`log10 copies/mL`). LOINC uses
`{log_copies}/mL`. Proposal: use that, and since CD-04 forbids silent conversion, the log value is computed for
display from the copies value, never typed separately.

**A6. Decision bands are not structured.** The research's decision bands carry the scheme as a first author
("Khurana R", "Apple FS"), the category sometimes in `label` and sometimes in `context`, and inclusivity as
free text ("low exclusive (>1000)"). They cannot be imported by machine without guessing. Proposal: at GATE A
I write one curated scheme file (scheme id, guideline name, category labels, inclusive side, context code) for
the schemes the decisions keep, for the owner to sign; the importer reads that, never the free text.

**A7. The anaemia scheme leaves gaps between categories.** WHO bands are written as 11.0–11.9, 8.0–10.9 and so
on, so a value like 11.95 falls in no category. Proposal: each category's lower limit is inclusive and the next
category starts exactly there (no gaps). Two related points for the CSO: does the altitude adjustment shift
every severity cut-off or only the "no anaemia" one, and the adjustment table is in g/L while haemoglobin is
recorded in g/dL (8 g/L = 0.8 g/dL; the signed table must state its unit). Elevations below 1 m or from
5,000 m have no row.

**A8. Mixed schemes inside one range set.** Fasting glucose mixes WHO and ADA; lipids mix ATP III and the
ESC (Mach); HbA1c mixes WHO and ADA; viral load mixes WHO 2023, Uganda MoH and ASLM. The decisions pick one
each (WHO; ATP III; ≥6.5 % by WHO; WHO 2023), so the importer brings only the chosen scheme. The MoH rule's
band is kept only as the source text shown beside every viral-load result (LD-05).

**A9. Bands the decisions say never to import:** INR targets (4 bands, LD-09), troponin, D-dimer and thyroid
(LD-08: the lab types its kit insert). MedSync has no anticoagulation plan to hold INR targets, so LD-09 means
no INR range at all in this phase; building the plan is out of scope.

**A10. Children's bands that straddle LD-06's ages.** Lugada's 1–6-year band crosses 18 months; importing it
"from 18 months" would cut a published band. Separately, LD-06 says "nothing for 0–27 days", but 32 chemistry
and other bands (Friščić, Tiruneh, neonatal TSH and others) start before day 28. Question: does LD-06 cover
haematology only, or every test?

**A11. Ranges belong to a test and a concept, not just a concept.** Phase 1 keys a range on (hospital, test,
concept). eGFR sits in both U&E and creatinine, glucose in several tests, so the import makes one draft per
pair. The "one signed version" index must also include the range kind, so a reference interval and a decision
scheme can both be signed for the same concept.

**A12. Repointing fasting glucose and retiring `obs.troponin`** leaves any existing measure, range or critical
limit on (fasting test, `obs.glucose`) or (troponin, `obs.troponin`) without a component. Phase 1's trial
hospital may have some. Proposal: the migration leaves them in place, superseded, and set-up asks the lab to
re-enter them on the new concept. Nothing is converted or copied silently.

**A13. Pregnancy context.** The anaemia and thyroid schemes need trimester. The registry has
`preg.gestational_age` and `preg.status`, so the context can come from the patient's latest recorded fact at
collection; with none recorded, the non-pregnant scheme applies and the screen says so.

**A14. Coded results and Phase 1's rule FL-7** (coded results are never auto-flagged). The `abnormal` answer
flag (Step 6) changes that, so it needs its own rule id and test.

### Gaps in the research that block signing (not building)

As listed in the prompt §7, plus: the eight bands marked `verification` are all Lugada CD4 absolute counts;
WHO anaemia cut-offs stop at 65 years; and where Eller has no band for a concept, the import offers the
research's other sources for that concept (Eller is the default wherever it has one).

### Numbers used

None yet. Migrations 0107–0119 and ADRs 0251–0259 are free on this branch and on `origin/main` (00a37cf6).

### Questions for the owner

1. A1: keep every live answer code and map brand wording onto it? (recommended)
2. A2: new concepts for the HIV algorithm outcome, Xpert and ABO/RhD, with the old ones kept for history?
   (recommended)
3. A3: keep CrAg restricted, and make the pregnancy test restricted for all ages (CD-08) or keep the
   under-age rule only?
4. A7: does the altitude adjustment shift every anaemia severity cut-off, or only the anaemia threshold?
5. A10: does "nothing for 0–27 days" apply to every test or to haematology only; and is Lugada's 1–6-year
   band imported whole, cut at 18 months, or left out?

## STOP 0 (continued): the one-menu prompt, Q1–Q20 (12 Oct 2026)

The owner asked to run both Phase 2 prompts together (`PROMPT-LAB-PHASE-2.md`, the catalogue, and
`PROMPT-LAB-PHASE-2-ONE-MENU.md`, one menu and one record) on one branch, `feat/lab-one-menu` (the catalogue
branch renamed; it already holds the research and the first STOP 0), using Claude's recommendations at every
gate. Where the two prompts differ, the one-menu prompt is newer and wins, except where the repo or a
recommendation in the first STOP 0 says otherwise (each case is in the GATE A proposal, §1).

**Q1 Phase 1.** Merged (PR #227, ff4be162 on `origin/main`, 00a37cf6 is this branch's base). Present: units and
measures (`lib/lab/{catalogue,units,measures-setup}.ts`, migration 0103), ranges and limits (`ranges.ts`,
`flags.ts`, `limits.ts`, 0104), snapshots (`lab_result_snapshots`), criticals (`lib/lab/criticals/**`, 0102,
0106), downtime and cut-over (0105), flags `LAB_WORKSPACE`, `LAB_CRITICALS`, `LAB_UNITS_RANGES`,
`LAB_DOWNTIME` (`lib/lab/feature.ts`).

**Q2 The claims G1–G13.**

| #   | Verdict                | Evidence                                                                                                                                                                                                              |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Confirmed              | Doctors order from `test_catalogue` (`lib/emr/read/orders.ts:151` `buildTestMenu`); `diagnostic_offerings` (0080:182) is read only by the worklist, by LOINC (`lib/lab/read.ts:94`). `getOrderingAvailability` (`lib/services/data.ts:841`) has no caller |
| G2  | Confirmed              | `docs/emr/HARMONISATION.md:180-183`                                                                                                                                                                                   |
| G3  | Confirmed              | No payment table or column. Only booking fees (`service_lines.fee_ugx`, 0058)                                                                                                                                         |
| G4  | **Worse than claimed** | No label number is ever generated: `specimens.label_no` is written only if a caller passes it, and none does (`components/emr/orders/model.ts:297-311`). No check, no void                                           |
| G5  | Confirmed              | `chart:<patient>` and `workspace:<hospital>` (0073, 0069), `user:<id>` (0106). The worklist refreshes on action                                                                                                      |
| G6  | Corrected              | The working diagnosis is the encounter's primary `conditions` row (`lib/emr/diagnoses.ts:86`). The fever-with-bleeding rules (`FLAG-EX-FEVER-BLEEDING`, `FLAG-VHF-*`) are evaluated live and never stored; `outbreak_mode` is per hospital (`hospital_clinical_settings`, 0076) |
| G7  | Confirmed              | HbA1c is typed (`app/ncd/visit/[visitId]/_components/clinician-part.tsx:350`); the NCD registry never reads lab results. The diabetes pack does (`lib/ncd/pack/from-clerking.ts:724`)                                  |
| G8  | Corrected              | A path exists: nurses enter point-of-care results for `capillary_direct` tests (`lib/emr/write/results.ts:92-100,487`), with no device, lot or operator record                                                       |
| G9  | Confirmed              | `encounter_orders.intent_source = 'resus_handover'` (`db/schema/encounter.ts:239`)                                                                                                                                  |
| G10 | Confirmed              | See Q1                                                                                                                                                                                                                |
| G11 | Confirmed              | Collectors are ordering cadres, nurses and lab (`lib/emr/write/orders.ts:48`)                                                                                                                                         |
| G12 | Corrected              | `pregnancy_episodes` holds state and LNMP; gestation is derived (`lib/facts/project/pregnancy.ts:30`), read with `loadFactSnapshot` as of a time                                                                      |
| G13 | Confirmed              | No elevation anywhere; `hospitals` has latitude and longitude                                                                                                                                                         |

**Q3 The hub.** `diagnostic_offerings` (hospital, kind lab/imaging, code; `provision` in_house, referred or
not_offered; `hours` 24h or scheduled; `stated_tat`; `referred_to`; `confirmed_at` NULL means planned). Lab
codes are LOINC; imaging codes are words (`xray`, `ultrasound`, `ecg`). Machine down is an
`availability_events` row (state unavailable or limited, reason `equipment_down`, `expected_back_at`), projected
by ADR 0157. No hub realtime. About 9 of the 44 tests have a plausible offering match today; no test has a
link.

**Q4 Ordering.** All three surfaces end in one function, `placeOrders` (`lib/emr/write/orders.ts:245`): the
order sheet (`components/emr/orders/order-sheet-view.tsx`, menu from `buildTestMenu`), the Plan basket
(`lib/emr/write/plan.ts:501`; its list is the catalogue JSON) and resus (`lib/emr/write/handoff.ts:224`,
proposed orders). One availability check inside `placeOrders` covers all three; each list needs the
availability shown.

**Q5 Orders.** `encounter_orders` is one row per test, immutable once on the events lifecycle (0071:413);
state is derived from `encounter_order_events`. Priority `routine|urgent|immediate|emergency`. Free text: the
encrypted `reason_text_ciphertext` (500 chars), already shown as the order's reason. Proposal: it *is* the
clinical question (no second field).

**Q6 Collection.** `collectSpecimen` (`lib/emr/write/specimens.ts:74`) from the doctor and nurse order panels;
`specimens` is insert-only with `identifiers_confirmed`. Labels print per specimen after collection. No
number, no void.

**Q7 Receive.** `receiveSpecimen` (`specimens.ts:148`), `lab.receive`, idempotent per client key; the worklist
sends a fresh key per click, so a second click fails on state. Rejection writes a `specimen_events` row.

**Q8 Realtime.** Private broadcast via `realtime.send` from triggers and a `realtime.messages` SELECT policy.
A `lab:{hospitalId}` topic fits the same pattern with a lab-staff predicate (the `workspace:` predicate needs a
clinical cadre, which lab cadres are not).

**Q9 Clerking.** Working diagnosis as G6. Reveal audit: `clinical_phi_access_log` (surface, basis); reuse it
with a new surface. Restricted classes `hiv`, `tb`, `mental_health`, `sexual_reproductive_health`; per-user
classes do not exist yet (every clinician holds all: `lib/emr/write/relations.ts:68`).

**Q10 Pregnancy.** As G12. How often it is recorded for women of 15–49 with lab orders needs the production
database (the owner can run the query in the GATE A proposal, §9).

**Q11 NCD.** Lab fields: HbA1c (visit), fasting glucose with method and original unit (nurse part), and
creatinine, ACR and lipids in the annual review (`ncd_review.data` jsonb); eGFR derived in the registry
(`lib/ncdreg/standard/calculations.ts:98`). The "before" count of hand-typed HbA1c needs production data.

**Q12 Catalogue.** As the first STOP 0, plus: `obs.glucose` is the fasting test's component; D-dimer is
`mg/L` today; result counts for D-dimer, troponin and blood group need production data.

**Q13 Cashier.** Nothing exists. Reception is a non-clinical cadre (`RECEPTION`) with its own scope.

**Q14 Nurses.** `/nurse/patients/[patientId]` with the order panel; nurse cadres NURSE, MIDWIFE,
SPECIALIST_NURSE.

**Q15 Devices.** A `devices` table exists (0071:113: glucometer, ketone meter, HbA1c analyser, BP monitor)
with no writer and no UI. Bedside devices reuse it.

**Q16 Settings.** `lab_settings` (0102) for the procedure link and payment; elevation needs the CSO's
signature, so it lives in the signed configuration (GATE A §2).

**Q17 Research file.** 119 concepts, 33 tests, 64 range sets, 497 bands, 38 gaps, 21 decisions: matches. The
Zod check is written at Step 3 with the importer. Ids the repo does not know: the 59 new concepts and the 4 new
tests; no others.

**Q18 Print.** Label `components/emr/orders/specimen-label.tsx` (`LABEL_CSS`, 60 × 30 mm); request form
`components/emr/print-views.tsx:152` with `printCss()`; downtime form `app/lab/downtime/print/page.tsx`.

**Q19 Test tools.** No Playwright: Phase 1's owner decision (D-LAB0-19, harness instead) stands, so this is not
a stop. axe-core is installed and the harness runs it (`~/Desktop/lab0-harness/cdp.mjs`); vitest fake timers
exist. A keyboard-wedge scan is typed text plus Enter in a harness plan step.

**Q20 Tokens.** Amber is `status-caution-*` (no `amber-*` token); teal `teal-{solid,tint,edge,text,icon}`; sky
`sky-{tint,edge,text,icon}`; neutral `slate-*`; `Pill` tones `caution`, `active`, `info`, `neutral`.

**Baseline.** Screenshots and the scripted HbA1c run need the harness with a production build; I will take the
"before" shots at Step 4 from the same harness run so the comparison is like for like. The three failing tests
(G1, G4, G7) are written with the fixes they prove (Steps 5, 6, 9), each first run red against the old code.
