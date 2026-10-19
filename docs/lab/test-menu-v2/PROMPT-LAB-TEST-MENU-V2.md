# PROMPT: Lab test menu v2: set up tests, not results (sections inherited, start from your level, catalogue v2 with 291 tests)

> **For Claude Code.** Work at the repo root on a new branch, `feat/lab-test-menu-v2`, cut from `main`.
> - If `feat/lab-workspace-v2` has merged, build the screens inside its shell and field kit.
> - If not, build them as one shared component on the current shell, using tokens only. Lab Workspace v2 will re-house them later.
>
> First copy these into `docs/lab/test-menu-v2/`:
> - this prompt;
> - `lab-catalogue-v2.json` (the catalogue);
> - `LAB-TEST-MENU-V2-RESEARCH.md` (its notes);
> - the canvas boards 13–18, exported from the *Lab Workspace v2* canvas (https://claude.ai/artifact/Dnp6e5PsWzHtfw9MKDHJey) together with its `ws.css`.
>
> **Mode: gated.** Twelve steps, each ending in a **STOP**.
> - **Documents** follow Stage 1: draft, critique, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
>
> **The CSO is Fadhul.** He signs:
> - the catalogue addendum, with the laboratory lead;
> - the restricted-class proposals;
> - the level-guide decisions TM-D03 to TM-D05;
> - every new string, entered in `content/` as `draft` (never edit a `*_COPY_STATUS`).

---

## 0. What we are building, in one paragraph

Today the Diagnostics page (Hospital admin → Departments & services → Diagnostics → Laboratory) lists the 97 rows of `loinc_codes`, one per analyte:
- every row asks for a section, a place, hours and a stated turnaround;
- a full blood count is 27 rows;
- the category reads "Laboratory" for 88 of them;
- C3, C4, ANA and anti-dsDNA do not exist.

The hub's own rule (DX-1) says an offering is **(hospital, catalogue test)**. Version 2 restores that rule:
- the menu lists **orderable tests**;
- each test arrives from the catalogue with its **recommended section**, specimen, tube, codes and results attached;
- **Start from your level** builds a whole menu in one step from the 2017 national standard test menu;
- **Add tests** searches a 291-test catalogue by name, short name or a result inside the test ("ALT" finds LFTs);
- **Hospital profiles** let a hospital order several tests as one line;
- **Ask for a test to be added** replaces free-text tests.

The same screen serves the hospital admin (Diagnostics) and the laboratory lead (lab Set-up → Tests).

**Done when:**
- no hospital ever sets up a result (a concept or LOINC code) on its own;
- every menu row is a catalogue test with a section that is never empty;
- the catalogue v2 addendum is imported and signed;
- a regional referral hospital's menu is built in under 15 interactions;
- every old setting is carried over or reported.

---

## 1. Ground truth and reading order

1. **The repo wins.** Report every disagreement at STOP 0.
2. **This prompt, then the catalogue file:**
   - `tests[]`, `concepts[]`, `sections[]`, `levels[]`;
   - `levelEvidence` (the 2017 national menu extraction);
   - `mergeNotes`, `gaps`, `sources`;
   - and the research notes.
3. **The canvas boards:**
   - **13** Test menu;
   - **14** Start from your level;
   - **15** Add tests;
   - **16** Test detail;
   - **17** Hospital profiles;
   - **18** Set up tests, not results.

   Every count, hour and turnaround on them is an example. **Do not paste canvas markup**; rebuild it as components.
4. **`PROMPT-HOSPITAL-SERVICES-HUB.md`** §5.6, §6.3 (DX-1 to DX-4), D-SVC-10 and D-SVC-14.
5. **Lab Phase 0–2 prompts:**
   - LW-3 (section resolution);
   - TA-3 (turnaround target from the hub);
   - CC-1 to CC-10 (catalogue addendum, restricted classes, test splits);
   - OM-1 to OM-8 (one menu, availability, `offering_code`).
6. **Code to read:**
   - the Diagnostics page and its reads and actions;
   - `loinc_codes` and migrations 0041 and 0158;
   - the hub offering table(s);
   - `test_catalogue` and the concept store;
   - `lib/lab/catalogue*.ts`, `lib/lab/availability.ts` and `lib/lab/worklist.ts`;
   - the ordering search;
   - `content/lab*.ts` and `content/hub*.ts`.

---

## 2. Laws (non-negotiable)

1. **A menu row is a catalogue test.** Never a concept, never a LOINC code.
   - Results inside a test have no section, hours, place or turnaround of their own.
   - `loinc_codes` stays as a code reference. It is never a menu.
2. **Every offered test has a section.** The section is `offering.section_override ?? test.section`.
   - "No section" is impossible for a catalogue test.
   - The LW-3 fallback stays only for legacy rows that are not in the catalogue.
3. **One catalogue, one menu store.**
   - The national menu, level templates and profiles all point at catalogue tests.
   - There is no second list (DX-1).
4. **Nothing becomes orderable unsigned.**
   - Catalogue v2 imports as a draft addendum. Its tests are visible in **Add tests** as "Not yet signed" and cannot be added until the lead and the CSO sign.
   - Restricted classes are signed by the CSO.
5. **Stated turnaround is operational, never a clinical target** (D-SVC-10, OM-5).
   - Templates never pre-fill it.
6. **Restricted classes stay restricted.**
   - Users without access see "Restricted test" in the menu, search, profiles and on bills.
   - A profile's name is checked against the restricted names list: it may not name a restricted condition.
7. **Availability informs, never blocks** (hub law).
   - Turning a test "Not offered" never cancels an order already placed.
8. **Carry over, never lose.**
   - Existing per-LOINC settings are migrated to tests (TM-9). Conflicts are reported, never silently resolved.
   - Old URLs redirect.
9. **Red is reserved** for criticals and Emergency. Nothing in the lab is green.
   - A change from the recommended section is ink text, not a colour.
   - A low-value advisory is ink text with an info icon, not amber.
10. **Stack as found.**
    - Server actions use the house contract: zod with clientKey → getUser → AAL2 → permission → scope → one transaction → audit → `{ok, id, serverTime}`.
    - Tokens only. No new dependencies without flagging them.
    - en-GB.

---

## 3. What is wrong today (confirm each item at Step 0, with a screenshot)

| # | Claim | Fix |
|---|---|---|
| TM-U1 | The Diagnostics page renders `loinc_codes` (97 rows), not catalogue tests | Menu = catalogue tests (Law 1) |
| TM-U2 | Each analyte needs its own section, place, hours and TAT; a full blood count is 27 rows | Settings belong to the test; results inherit |
| TM-U3 | Category reads "Laboratory" for the 88 rows from migration 0158 | `section` on every catalogue test |
| TM-U4 | 67 of 97 rows are "Not set" at Test Hospital-1; no other hospital has any | Start from your level |
| TM-U5 | Missing tests: C3, C4, ANA, anti-dsDNA, ENA, iron studies, blood gas, cultures by specimen, EID, histology and more | Catalogue v2: 291 tests |
| TM-U6 | The lab's Set-up "Test menu" and the hub's Diagnostics tab are two screens for one fact | One component, one store, two entry points |
| TM-U7 | No way to ask for a test that is missing | Ask for a test to be added (TM-11) |

---

## 4. Design direction

**Six rules**
1. **Set up tests, not results.**
2. **Recommended, then refined.** Every test arrives with its section. The lab changes only what differs, and the change shows as "Changed from …".
3. **Start from your level.** One dialog builds the menu from the national standard. Nothing is typed row by row.
4. **Find by any name.** Display, aliases (RFTs, B/S, GXM, Urine R/E) and any result inside the test.
5. **Do it for many at once.** Bulk actions by selection and "Set hours for the section".
6. **Honest states.**
   - A turnaround that has not been set shows "Not set", never a default.
   - Unsigned tests say so.
   - Low-value tests carry their advisory.

**Budgets**

| Measure | Budget |
|---|---|
| Interactions to build an RRH menu from the template, set section hours, and mark 10 tests referred | ≤ 15 (today: about 97 × 4) |
| Menu rows needing a section | 0 |
| Search across 291 tests by alias or result, client-side | p95 < 50 ms |
| Menu table with 300 rows, filter switch | p95 < 100 ms |
| axe serious or critical | 0 |

---

## 5. Interface specification (canvas boards 13–18)

### 5.1 Test menu (board 13)
- **Where it lives:**
  - in the lab: Set-up → Tests, with tabs **Test menu · Hospital profiles · Test catalogue · Analyser profiles**;
  - in the hub: Diagnostics → Laboratory, the same component without the lab rail.
- **Header:**
  - **Start from your level** (secondary);
  - **Add tests** (primary).
- **Summary strip** (real counts only):
  - tests on the menu;
  - in-house;
  - referred;
  - without a section (always 0);
  - changed from the recommended section;
  - the standards comparison link ("Compare with the Regional Referral Hospital guide"), per D-SVC-14.
- **Left list:**
  - sections with counts;
  - Where (In-house, Referred, Not offered) with counts.
- **Table:** one row per test, grouped by its section (the effective section), each group header with **Set hours for the section**.
  - **Columns:** select · Test · Section · Where · Hours · Turnaround · Referred to, or now.
  - **Test cell:**
    - the display name;
    - two aliases;
    - "{n} results", which expands to show the results as chips, with the line *"These come with the test. Units, codes and ranges are set once in Test catalogue; nothing here needs a section of its own."*
  - **Section cell:** the section, with "Recommended" when inherited, or "Changed from {catalogue section}".
  - **Where:** a three-part control (In-house · Referred · Not offered).
  - **Last column:**
    - Referred → the partner;
    - In-house → availability now: "Available", or an amber pill such as "Reagent out" (hub availability, DX-4).
  - **Restricted tests** show a Restricted pill. Users without access see "Restricted test".
  - **Low-value tests** show their advisory under the name.
- **Search:** "Search a test, a short name like LFTs, or a result like ALT". It matches display, aliases and component displays.
- **Filter chips:** All · In-house · Referred · Changed sections.
- **Bulk bar** (navy, at the bottom) when rows are selected: Where · Hours · Stated turnaround · Referred to · Apply. Applied in one action, audited once per row.
- **A row opens Test detail (5.4).** Centred dialog, never a side sheet.

### 5.2 Start from your level (board 14)
- Opens from the empty state, and from the header at any time.
- **Level cards:** Health centre III · Health centre IV · General hospital · Regional referral · National referral · Private laboratory (choose a level, then adjust).
  - The hospital profile's level is preselected.
  - Each card shows its in-house and referred counts.
- **Section table:** a tick per section, with in-house and referred counts and three common examples.
- **Choices:**
  - Hours for in-house tests: 24 h · Working hours · Set later.
  - Referred tests go to: choose per test later. National tests (viral load, EID, TB culture, VHF) are preset to their national lab via the hub.
- **Footer:** *"Stated turnaround starts empty. It is your lab's own figure, never a clinical target."*
- **Primary:** Add {n} tests.
- **Applying a template to a non-empty menu** shows a preview first:
  - {a} new tests to add;
  - {b} already on your menu, kept as you set them;
  - {c} on your menu but not in the template, kept.

  It never removes or overwrites.

### 5.3 Add tests (board 15)
- A centred dialog searching the whole catalogue.
- Section chips filter the list. Results group the exact match first, then **"Often ordered with these"** (from `relatedTests` when present; otherwise the same section and the same specimen).
- **Each result row:**
  - the name, aliases and "{n} results: {first four}";
  - the recommended section;
  - the specimen and tube;
  - **Add**, or "On your menu", or "Not yet signed" (disabled, with that reason).
- **Footer:**
  - "Not in the catalogue? **Ask for a test to be added**" (5.6);
  - "Added tests take their recommended section."

### 5.4 Test detail (board 16)
- **Left (editable):**
  - Where;
  - Section (combobox, with the recommended one marked);
  - Hours;
  - Stated turnaround (with its help line);
  - When it is down, refer to.
- **Right (read-only, from the catalogue):**
  - specimen and tube;
  - order code;
  - results with unit and LOINC;
  - the line *"Results, units and codes belong to the catalogue and are the same at every hospital. Ranges are set by your lab lead in Ranges and cut-offs."*
- **Footer:**
  - Remove from the menu (sets Not offered, with the consequence shown first);
  - Cancel;
  - Save.

### 5.5 Hospital profiles (board 17)
- A card per profile: its name, its tests (each with its section and "{n} results") and its note. Plus **New profile**.
- Rules TM-10.

### 5.6 Ask for a test to be added
- A short centred form:
  - name;
  - what it is for;
  - specimen;
  - where the lab will run it or send it;
  - an optional reference (kit insert, guideline).
- Saved as a catalogue request (TM-11). The requester sees its state in a small list under the form.

### 5.7 Strings
All new strings go in `content/` as `draft` (Appendix A).

---

## 6. Engines and rules (pure where possible; every rule has a test)

- **TM-1 Catalogue v2 import.** `lab-catalogue-v2.json` becomes a **draft addendum** through the CC-1 path.
  - New concepts and tests are added; existing ids are kept.
  - The import is idempotent: a second run does nothing.
  - Concepts with `loinc.status` `unverified` import with `loinc = null` and a verification note. They are listed in the import report.
  - Signing needs the laboratory lead and the CSO, with author ≠ signer. Until it is signed, nothing new is orderable or addable.
- **TM-2 Test fields.** `test_catalogue` gains:
  - `section`, from the eight section keys;
  - `aliases[]`;
  - `specimen`, `container`;
  - `order_loinc`;
  - `min_level`, `level_basis` (jsonb);
  - `usual_route`, `refer_to`;
  - `kit_dependent_ranges`;
  - `advisory`, `offer_by_default`.

  These are catalogue facts, the same for every hospital, and change only through a signed addendum.
- **TM-3 Offering.** `(hospital_id, test_id)` → where (`in_house | referred | not_offered`), `section_override`, hours, `stated_turnaround_minutes`, `referred_to`, plus audit.
  - It replaces any per-LOINC offering.
  - `offering_code` (OM-1) is the test id itself. No linking step remains.
- **TM-4 `sectionFor(offering, test)`** returns `offering.section_override ?? test.section`.
  - Property test: for every catalogue test it is never null.
  - The worklist (LW-3) and Today's section scorecard use it.
- **TM-5 Lab sections are the eight catalogue sections** (aligned with hub Appendix A.3).
  - A hospital may hide a section it does not run. A test whose effective section is hidden stays visible under "Hidden section" with a warning, never dropped.
- **TM-6 `templateFor(level)`**, pure, over the signed catalogue:
  - **skip** tests with `offer_by_default = false`;
  - **in-house** when `levelIndex(min_level) ≤ L` and (`level_basis.basis = national_menu_2017`, or `usual_route = in_house`, or L ≥ NRH);
  - **referred** when `levelIndex(min_level) ≤ L + 1`, or `refer_to ∈ {CPHL, NTRL, UVRI, UBTS}`;
  - otherwise not included.
  - Referred tests with a national `refer_to` get that lab as `referred_to`.
  - Snapshot test of the counts per level against the catalogue file: HC III 33/69, HC IV 61/83, GH 110/69, RRH 151/64, NRH 197/88 (in-house/referred). Re-baseline only with a signed catalogue change.
- **TM-7 `applyTemplate(menu, template)`** adds missing tests only. It never changes or removes an existing offering. It returns the preview counts (5.2).
- **TM-8 Search.**
  - Client-side, over a menu and catalogue snapshot.
  - Matches display, aliases and component displays; case- and accent-insensitive; prefix and token match.
  - Ranks exact alias first, then display prefix, then component match.
  - Restricted names are masked for viewers without access, and masked tests never match by their hidden name.
- **TM-9 Migration of per-LOINC settings.** For each hospital's existing per-LOINC offering:
  - find the catalogue tests whose components carry that LOINC code;
  - a test inherits where, hours and stated turnaround when **all** of its set components agree;
  - if they disagree, the test is set to the most common value and listed in `docs/lab/test-menu-v2/migration-report.md` with the per-component values;
  - LOINC rows that map to no test are listed;
  - the section from the old row becomes `section_override` only when it differs from the catalogue's.
  - Dry run first: report counts for Test Hospital-1 (expected: the 30 set rows collapse into about 8 tests).
- **TM-10 Profiles.**
  - `lab_order_profiles` (hospital, name, note, test ids in order, active), edited by the laboratory lead and the hospital admin.
  - A profile may hold only tests that are on the menu and offered (in-house or referred).
  - Ordering a profile expands into one order line per test at order time. Each line has its own specimen, section, payment state, restricted class and availability snapshot (OM-6).
  - A profile name is checked against the restricted names list (Law 6).
  - Removing a test from the menu flags the profiles that contain it; profiles are never silently changed.
- **TM-11 Catalogue requests.**
  - `lab_catalogue_requests` (hospital, requester, name, purpose, specimen, route, reference, state: `new | in_review | added | declined`, reason, catalogue test id when added).
  - The MedSync catalogue team (superadmin) works the queue.
  - Adding a requested test goes through a signed addendum like any other.
  - The requester is told when it is added or declined, with the reason.
- **TM-12 Ordering.** The doctor's search uses the same search (TM-8) over the offered menu, so "RFTs", "B/S" and "ALT" find their tests.
  - Not offered → not orderable (D-LAB2-16).
  - A low-value test shows its advisory before it is added to the basket. The doctor can still order it.
- **TM-13 Audit.** Every offering change, template application, profile change and request is audited (actor, before and after, time). Bulk actions write one audit row per test.

---

## 7. Data changes (GATE A decides the final shape)

- `test_catalogue`: the columns in TM-2.
- `lab_test_offerings` (or the hub's existing offering table, re-keyed by test id): TM-3.
- `lab_order_profiles` and `lab_order_profile_tests`: TM-10.
- `lab_catalogue_requests`: TM-11.
- **RLS forced on every table:**
  - offerings and profiles: read by the hospital's staff; write by its hospital admin and laboratory lead;
  - requests: read by the requester's hospital and superadmin; write by the requester (create) and superadmin (state).
- Drizzle parity tests and RLS probes for every actor.
- **No change to `loinc_codes`** other than marking it a code reference (a comment and an ADR).

---

## 8. Steps and gates

### Step 0 — Discovery and baseline (no product changes)
- **Q1** Confirm TM-U1 to TM-U7 with screenshots. Find exactly what the Diagnostics page reads and writes, and why it reads `loinc_codes`.
- **Q2** The hub offering table(s), the `test_catalogue` shape, the concept store, and how OM-1 `offering_code` is filled today.
- **Q3** Counts at every hospital: per-LOINC offerings set, and orders referencing them.
- **Q4** Lab sections as stored (hub units) versus the eight catalogue keys.
- **Q5** The ordering search and how it finds tests today.
- **Q6** Whether `feat/lab-workspace-v2` has merged; which field kit and shell to use.
- **Q7** Baseline: interactions to set up an RRH menu today. Use 10 tests as a sample and extrapolate.
- **Q8** Load `lab-catalogue-v2.json` and report:
  - counts;
  - test ids that already exist with different components (expected: troponin, uacr, blood_culture additions and the syphilis narrowing);
  - unknown component ids (expected 0);
  - unverified codes (expected 13).

**STOP 0.**

### Step 1 — GATE A proposal (documents only)
`docs/lab/test-menu-v2/gate-a-proposal.md`:
- the schema diff;
- the migration plan (TM-9) with the Test Hospital-1 dry run;
- annotated wireframes from boards 13–18;
- the template rules and their snapshot counts;
- the profile and request flows;
- the strings (Appendix A) as drafts;
- the decision table (Section 10) with a signature block;
- ADR drafts.

**STOP 1.** Nothing proceeds without Fadhul's signature.

### Step 2 — Data layer
Migrations, RLS probes and parity tests for Section 7.

**STOP 2.** Report the migration diff and the RLS probe table.

### Step 3 — Catalogue v2 import (draft addendum)
Build TM-1 and TM-2.

**Scenarios:**
- **S1** The import counts match Q8. A second import does nothing.
- **S2** Before signing: Add tests shows new tests as "Not yet signed", and nothing new is orderable.
- **S3** After both signatures: the new tests are addable. Existing results are untouched.
- **S4** Unverified codes are imported as null with a note. The import report lists them.

**STOP 3.** Report the import report at `docs/lab/test-menu-v2/import-report.md`.

### Step 4 — Engines
Build TM-4 to TM-8 and TM-12, pure, with tests:
- `sectionFor` property test;
- template snapshot counts per level;
- `applyTemplate` never overwrites (property test);
- search ranking table tests;
- restricted masking.

**STOP 4.** Report test counts and rule coverage.

### Step 5 — Test menu screen (both entry points)
Build 5.1.

**Scenarios:**
- **S5** No row is a concept. The FBC row expands to its results. No result has a section control.
- **S6** Every row shows a section. Overriding one shows "Changed from …"; resetting returns to "Recommended".
- **S7** Bulk-set three referred tests' partner and turnaround in one action. Three audit rows.
- **S8** "Set hours for the section" applies to that section's in-house tests only.
- **S9** The same component in the hub and in lab Set-up. Edits in one appear in the other.
- **S10** A user without access sees "Restricted test", and search does not reveal the name.

**STOP 5.** Report screenshots at 1440 and 1280 against boards 13 and 16, and axe results.

### Step 6 — Start from your level, Add tests, Test detail
Build 5.2 to 5.4.

**Scenarios:**
- **S11** The RRH template on an empty menu adds the snapshot count, and stated turnaround stays empty.
- **S12** Applying it again changes nothing.
- **S13** Applying GH over an edited menu adds only missing tests, with the preview shown.
- **S14** Searching "complement" finds C3+C4, C3, C4 and CH50. "ALT" finds LFTs. "RFTs" finds U&E.
- **S15** Low-value tests are absent from templates and show their advisory in Add tests.
- **S16** The interaction budget is met (Section 4).

**STOP 6.**

### Step 7 — Migration of existing settings
Run TM-9 on all hospitals behind a flag, dry run first.

**Scenarios:**
- **S17** Test Hospital-1's 30 rows become their tests. The report lists conflicts and unmapped codes.
- **S18** No existing order loses its test or its availability snapshot.

**STOP 7.** Report the migration report.

### Step 8 — Hospital profiles and ordering
Build 5.5, TM-10 and TM-12.

**Scenarios:**
- **S19** Ordering the antenatal profile creates one line per test, each in its own section.
- **S20** The restricted line is masked for a cashier.
- **S21** A profile name that names a restricted condition is refused.
- **S22** Removing a test from the menu flags its profiles.

**STOP 8.**

### Step 9 — Ask for a test to be added
Build 5.6 and TM-11.

**Scenarios:**
- **S23** A request reaches the superadmin queue.
- **S24** Adding it via a signed addendum notifies the requester.
- **S25** Declining it requires a reason, which the requester sees.

**STOP 9.**

### Step 10 — Remove the per-LOINC page
- Redirect the old Diagnostics URLs to the new menu, keeping their filters.
- Remove the per-LOINC offering reads and writes.
- Keep `loinc_codes` as a code reference.
- **S26:** no code path writes an offering keyed by LOINC (grep test).

**STOP 10.**

### Step 11 — Hardening
- axe on every new screen;
- red-reserved and no-green tests;
- the budgets;
- visual harness plans for boards 13–18;
- update the Laboratory Handbook (lab lead's set-up: Test menu, Hospital profiles) and the Engineering Guide (catalogue and offering);
- ADRs;
- the final report.

**STOP 11.**

---

## 9. Security, privacy, audit
- RLS forced on every new table, with probes for every actor across two hospitals.
- Search terms are never logged. Restricted names are masked at the read, not only in the UI.
- Requests carry no patient data. The form says so, and a check refuses obvious identifiers (hospital number patterns).

## 10. GATE A decisions (Fadhul owns them)

| # | Decision | Recommendation |
|---|---|---|
| TM-D01 | What a hospital sets up | Orderable tests only |
| TM-D02 | Section | Inherited from the catalogue; override per test, shown as "Changed from …" |
| TM-D03 | Level templates | TM-6 rules; national menu 2017 first, judgement for the rest, labelled |
| TM-D04 | Table versus narrative in the national menu (33 tests) | Use the lower level, show both |
| TM-D05 | Low-value tests (bleeding and clotting time, Widal, typhoid RDT and stool antigen, H. pylori serology) | In the catalogue with an advisory; off by default in templates |
| TM-D06 | New restricted-class proposals | As in the research notes; the CSO signs |
| TM-D07 | Hospital profiles | Allowed, as an ordering shortcut over menu tests |
| TM-D08 | Missing tests | Catalogue requests only; no free-text tests |
| TM-D09 | Who edits the menu | Hospital admin and laboratory lead; no signing; audited |
| TM-D10 | Migration conflicts | Most common value, reported, never silently resolved |
| TM-D11 | Referral values | Add `MAK_PATH` (Makerere/Mulago pathology) to `refer_to` |
| TM-D12 | `obs.tb_xpert_rif` LOINC | Replace TRIAL 89372-7 with ACTIVE 89489-9 in the addendum |

## 11. ADRs
- The menu is per test; results inherit.
- Catalogue v2 and its addendum.
- Level templates from the national standard test menu.
- Hospital profiles.
- Catalogue requests.
- `loinc_codes` as a code reference only.

## 12. Out of scope
- Reference ranges and critical limits for the new tests. Those follow the Phase 2 range drafts.
- Per-antibiotic susceptibility results.
- Prices and billing for profiles beyond the existing payment states.
- Imaging and other tests.
- The Expo app (Gate CG).

## 13. Definition of Done
- [ ] TM-U1 to TM-U7 fixed.
- [ ] The catalogue v2 addendum is imported and signed. Unverified codes are listed.
- [ ] The menu shows tests only, and every one has a section. Both entry points use one component.
- [ ] Start from your level, Add tests, Test detail, Hospital profiles and Ask for a test all work.
- [ ] Old settings are migrated, with a report. The per-LOINC page is removed and its URLs redirect.
- [ ] Every rule ID is covered. RLS probes are green. axe is clean. Budgets are met.
- [ ] Strings are in `content/` as `draft`. The Handbook and Engineering Guide are updated. ADRs and the final report exist.

---

## Appendix A — New strings (all `draft`)

| Key | Text |
|---|---|
| Menu search | Search a test, a short name like LFTs, or a result like ALT |
| Section help | Sections come from the catalogue. Change one only if your lab runs the test elsewhere. |
| Recommended | Recommended |
| Changed from | Changed from {section} |
| Results line | These come with the test. Units, codes and ranges are set once in Test catalogue; nothing here needs a section of its own. |
| Empty menu | No tests on your menu yet. Start from your level to get a full menu in one step, or add tests one at a time. Each test arrives with its section, specimen and tube already set. |
| Level dialog lead | Every test arrives with its recommended section, specimen and tube, and where a hospital at your level usually does it. You change only what is different here. |
| Level source | Levels follow the National Standard Test Menu (MoH, 2017); tests it does not list follow MedSync's guide. |
| Turnaround line | Stated turnaround starts empty. It is your lab's own figure, never a clinical target. |
| Template preview | {a} new tests to add · {b} already on your menu, kept as you set them · {c} on your menu but not in the template, kept |
| Not yet signed | Not yet signed. It can be added once the lab lead and the CSO sign the catalogue update. |
| Added note | Added tests take their recommended section. |
| Ask for a test | Not in the catalogue? Ask for a test to be added |
| Request sent | Sent to the MedSync catalogue team. You will be told when it is added, or why not. |
| Profile note | A profile orders several catalogue tests at once. Each test keeps its own section, results and restricted class. |
| Profile refused name | Choose a name that does not name a condition. Profile names appear on bills and order lists. |
| Low-value advisories | As in the catalogue file's `advisory` field |
