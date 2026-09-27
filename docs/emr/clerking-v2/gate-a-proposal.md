# Clerking desk v2 — GATE A proposal

For Fadhul (owner and CSO) to sign before any product code is written (PROMPT-CLERKING-DESK-V2 §11, Phase 1). Branch
`feat/clerking-v2`, cut from `release/emr` at `1f5937c`.

This proposal covers eight things:

1. what Phase 0 found in the repo;
2. how the prototype is ported;
3. the new draft format;
4. where each answer is stored;
5. the colour amendment;
6. the test plan;
7. the sixteen decisions;
8. the catalogue sign-off tables (appendices).

Nothing here is clinically live until it is signed.

---

## 1. Where the prompt and the repo disagree (the repo wins; each is a harmonisation)

| # | Prompt assumes | Repo has | Proposal |
|---|---|---|---|
| H1 | Medicines carry dose as stated, frequency, adherence and source (patient, carer, card, letter, dispensing record) | `medication_statements` has none of dose, frequency or adherence, and `medication_source` is prescribed_here / dispensed_here / patient_reported / external_record | **Migration 0076 (GATED)** adds nullable `dose_text_ciphertext`, `frequency_code`, `adherence` and `informant` columns, each with a CHECK taken from the catalogue lists. `medication_source` keeps its meaning: patient or carer → `patient_reported`; card, letter or dispensing record → `external_record`. The existing write gains the four optional fields. |
| H2 | Allergy reactions from the catalogue | The manifestations CHECK allows rash / urticaria / angioedema / anaphylaxis / bronchospasm / sjs_ten / other | **A mapping; no migration.** Catalogue → record: hives_or_itch → urticaria; swelling_of_face_or_lips → angioedema; wheeze_or_breathing_difficulty → bronchospasm; collapse_anaphylaxis → anaphylaxis; the SJS/TEN reaction → sjs_ten; stomach_upset → other; not_known → no manifestation recorded. Severity and source match the record as they are (records → `record`). |
| H3 | Family history is stored as conditions with `subject_relation` | There is no dedicated writer. `recordProblem` passes `subjectRelation` through, and the CHECK allows self / mother / father / sibling / child / other_first_degree / second_degree | **Reuse `recordProblem`,** with `subjectRelation` set and never `self`, so it never reaches the patient's own problem list. grandparent → second_degree; other_relative → other_first_degree unless the clinician picks second degree. A family condition is a term where the diagnosis terms have one, and text otherwise. |
| H4 | Tobacco, pack-years and alcohol pattern become observations | CFC v1 has `soc.tobacco` (never / former / current_daily / current_non_daily / smokeless_current / unknown) and `soc.alcohol` (none / within_limits / above_limits / unknown). It has **no pack-years concept and no drinking-pattern concept.** | Tobacco status commits as `soc.tobacco` (never → never, former → former, current → current_daily; snuff or chewed only → smokeless_current). Pack-years and the alcohol pattern go into a **CFC v1.2 addendum** (`soc.tobacco_pack_years`, `soc.alcohol_pattern`); until you sign it they live in the note only. `soc.alcohol` is not written, because "within limits" needs units the form does not ask for. |
| H5 | Four restricted classes (hiv, tb, mental_health, sexual_reproductive_health) | Sensitivity is binary (`standard` / `restricted`). No class names appear in lib/ or db/ | **All four map to `restricted`.** The class stays in the catalogue for the lock and the filters. Nothing new in the database. |
| H6 | An `outbreak_mode` hospital setting, set by the IPC focal person and audited | There is no hospital-settings table for the EMR (`lib/emr/settings.ts` says so), and no IPC focal-person role | **Migration 0076** adds `hospital_clinical_settings` (hospital_id PK, `outbreak_mode`, reason, updated_by, updated_at) with RLS and an audit trigger. **Writer:** a hospital-admin action, with a required reason, until an IPC role exists. |
| H7 | Playwright UI tests | No Playwright (O-6 was left for you) | **Vitest + jsdom** interaction tests, plus the scratch CDP harness for screenshots and axe, as in the EMR build. Playwright stays your O-6 decision. |
| H8 | A stepper control | None in components/ | One small `Stepper` (±, labelled buttons, keyboard arrows) in `components/emr/`. |
| H9 | Keys `[` `]` `1`–`0` `y` `n` `d` `/` `?` | The desk binds Ctrl/⌘+Enter, `/`, `?`, `j`/`k` | **Add the v2 keys and keep `j`/`k` as aliases.** `y`, `n` and `d` act only when a yes/no row or a Details button has focus, and nothing fires inside a text field. |
| H10 | Every catalogue symptom maps to the finding vocabulary | `symptom_catalog` (89 tokens) ∪ 35 CFC finding concepts | `catalogue-token-map.csv`: **54 match exactly, 25 map to a broader existing token** (e.g. `sym.loss_of_appetite` → `appetite_change`), and **17 need a new token** (list in §9). Each new token is added once to the shared vocabulary by migration 0076, never as a private copy. The catalogue option ids travel as qualifiers, so a broader token loses no detail. |
| H11 | Minimum-to-sign reads the new answers | The rules are a closed list of checks over v1 sections | A **v2 template** (`tpl.clerking.adult_opd` 2.0.0) with the ten steps and a new check, `history_complaint_present`. The v1 template stays loadable for v1 drafts and signed notes. |
| H12 | The prompt says 95 symptoms in one place and 96 in another | The catalogue has **96** (92 placed in systems; weight gain, hiccups, breathlessness and noisy breathing are complaint-only or associated-only) | 96. |

---

## 2. Phase 0 answers (STOP 0)

Full answers with file references are in `STOP-REPORTS.md`, STOP 0. In short:

- **Q1 Branch state:** `release/emr` is not merged into `main`. `1f5937c` is live: production's only EMR draft uses the full clerking form. `ab94c92` is live with it.
- **Q2 The desk today:**
  - Route `app/doctor/encounters/[encounterId]`; client `_desk/desk-client.tsx` (860 lines); views in `components/emr/desk/*` (about 4,000 lines).
  - Draft content is `NoteContent {header, sections{narrative, items, fields}}`, AES-GCM encrypted, with revision concurrency.
  - Templates and sign rules are data (`data/emr/note-templates.v1.json`).
- **Q3 Vocabulary:** as H10.
- **Q4 Chroma:** worktree `medsync-chroma` has **299 uncommitted files**. Its `globals.css` carries 152 of the 154 Chroma colour tokens. It is not in `release/emr`.
- **Q5 The record writes:** as H1–H3.
- **Q6 CFC concepts:** as H4.
- **Q7 NEWS2:** `lib/triage/scoring/news2.ts` `scoreNews2` and the bands in `lib/triage/constants.ts` are pure and importable. The desk reuses them.
- **Q8 Flags and settings:** env-var flags per hospital (`EMR_V1` pattern); no settings table (H6).
- **Q9 Restricted items:** the `RestrictedMark` lock and per-item print opt-in (`includeSet`). `toPatientFacing` has no app caller yet.
- **Q10 Test tools:** axe-core 4.x, no Playwright (H7).
- **Q11 Keys:** as H9.
- **Q12 Production data:** 1 EMR draft (Test Hospital-1), 0 signed EMR notes, 10 legacy clerkings, 2 NCD drafts.

**Baseline**

| Measure | v1 today |
|---|---|
| Page length at 1440 wide | **about 4.1 screens** (3,688 CSS px, from your production capture of 27 Sep) |
| Review-of-systems chips shown | 81, all "Not asked", including last menstrual period and menstrual cycle for a man |
| Required keystrokes, Complaint to Social | complaint by search and duration by typing; the other history sections are free text |
| Full negative review of systems | 13 "Mark the rest as absent" taps |
| NEWS2 on the desk | not shown |

**Failing tests** (`tests/clerking/baseline.test.ts`, marked `it.fails`; the suite stays green and each flips when fixed):

- **C2:** the review-of-systems screen takes no sex.
- **C3:** a complaint does not reach the review of systems.
- **C6:** a vital sign scoring 3 is not marked.

---

## 3. Port plan (prototype → app)

The prototype is the design authority. Its canvas runtime is not ported.

- **Engines:** `renderVals()` becomes pure engines in `lib/clerking/**`. All clinical content comes from the catalogue; the prototype's hard-coded lists (`symDef`, `groupsFor`, `rosCat`, `flagsFor`) are dropped.
- **Views:** the markup becomes React components in `components/clerking/**`, built from existing primitives.

| Prototype part | App component | Reuses |
|---|---|---|
| Top bar and safety bar | existing desk header + `SafetyBarView` | the safety bar gains a NEWS2 chip; no flag badges |
| Section bar (2 groups, 22 px circles, connectors, "N of 10 done") | `SectionBar` (new) | `StatusWord` tones; `aria-current="step"` |
| Centre card with Previous / Next footer | `SectionCard` (new) | `Button` |
| Left rail (triage, vitals with NEWS2 marks, results, medicines, problems) | `ContextRailView` extended | `scoreNews2`, `NEWS2_*` bands |
| Complaint cards and property editor | `ComplaintCard`, `PropertyEditor` (new) | `ChoiceChips`, `SegmentedControl`, new `Stepper`, 0–10 `ScaleStrip` (a radio group) |
| Add a complaint (search, quick picks) | `ComplaintSearch` | `components/emr/desk/search.ts` ranking over labels and synonyms |
| History story and "also asked" rows | `HistoryBody` | `YesNoRow` (new, grouped `aria-pressed` buttons) |
| Review of systems rows, "Nothing else", linked answers | `RosList` | `YesNoRow` |
| Details pop-up | `EmrDialog` (ADR 0161, centred, 660 px) | `PropertyEditor` |
| Past history (conditions, operations, transfusions, medicines, allergies) | `PastHistoryBody` | existing medicine and allergy actions; `AllergyEditor` mapping |
| Family and social history | `FamilyBody`, `SocialBody` | `YesNoRow`, `ChoiceChips`, `Stepper` |
| Flags panel | `FlagsPanel` | octagon and triangle icons (lucide) |
| The note (composer, highlight, edit lock) | `NotePane` | the existing sign bar and completion |
| Examination, Summary, Impression, Plan | the v1 section bodies inside `SectionCard` | unchanged (§5.11) |

**Screenshot fixes:**

- no truncated step labels at 1440;
- "Not recorded" on one line beside Consciousness;
- "Code it" on one line.

---

## 4. Draft payload v2

```ts
interface NoteContentV2 {
  schema: 2;
  catalogueVersion: string;                      // e.g. "1.0.0-draft"
  header: { historian?: HistorianId; language?: string; interpreter?: string };
  history: {
    complaints: {
      key: string;                               // stable local key
      symptom: string | null;                    // "sym.back_pain"; null = uncatalogued free text
      text?: string;                             // only when symptom is null
      duration?: { value: number; unit: "hours" | "days" | "weeks" | "months" | "years" };
      props: Record<string, string | string[] | number>;   // option ids, counts, 0–10
      flags: Record<string, "yes" | "no">;       // red-flag ids
    }[];
    story?: string;
    alsoAsked: Record<string, "yes" | "no">;     // "<symptom>:<askId>"
    ros: Record<string, "yes" | "no">;           // symptom id → answer; absent = not asked
    rosDetail: Record<string, { duration?; props; flags }>;
    past: { conditions: Record<string, { answer: "yes" | "no"; since?: string }>;
            operations: "none" | { text: string; year?: number; where?: string }[];
            transfusions: "none" | { when: string; reaction?: string }[] };
    family: Record<string, { answer: "yes" | "no"; relations?: string[] }>;
    social: { tobacco?; perDay?; years?; otherForms?; quitWhen?; alcohol?; drinks?; substances?;
              living?; activity?; occupation?; travel?; travelDetail?; diet? };
  };
  sections: Record<string, NoteSection>;         // v1 shape, for Examination, Summary, Impression, Plan
  edited: Record<string, string>;                // composer block key → clinician's text (edit lock)
}
```

- **Storage rules:**
  - options are stored as ids, never labels;
  - "not asked" is the absence of a key, so it can never be written as a negative;
  - linked answers are **derived** (never stored), so they cannot disagree with the complaint.
- **v1 drafts** (payload with no `schema`) open in a "Previous format" view with **Continue in the new format**, which copies what maps (historian, language, story) and nothing silently. Signed notes of any version display as signed.
- **At signing:** complaint and system findings commit as CFC finding facts (token map for the concept, option ids as qualifiers) in the note's transaction. The badge list (text, level, rule ids, catalogue version) is written into the canonical content (D-CV-05).

---

## 5. Where each answer goes (one owner per fact)

| Answer | Written | Through |
|---|---|---|
| Complaints, system findings, qualifiers | at signing | `signNote`: CFC finding facts |
| Medicines (add, stop, adherence, source, dose as stated) | at once | `recordMedicationStatements` / `confirmCurrentMedicines` (+ H1 fields) |
| Allergies, NKDA, "still true today" | at once | `recordAllergy`, `assertAllergyStatus` |
| Past-history "yes" | proposal only | a "Confirm" on the problem list → `recordProblem` |
| Family history | at once | `recordProblem` with `subjectRelation` (H3) |
| Tobacco status | at signing | `soc.tobacco` observation (H4) |
| Pack-years, alcohol pattern, the rest of social history | note only | until CFC v1.2 is signed |
| Flags | never stored as facts | snapshot in the signed note |

---

## 6. Law 8 amendment (D-CV-03)

> In the clerking desk's Flags panel only, a badge for an **urgent** flag may use the status-critical tint, always with an octagon icon and an accessible name ending "urgent". Caution badges use the status-caution tint with a triangle icon and the accessible name "needs attention". Everywhere else, red keeps its meaning (critical result values and the Emergency affordance), and the red-scarcity tests are extended to every new component to prove it.

---

## 7. Test plan

| Layer | Tests |
|---|---|
| Catalogue | Zod schema round-trip; every symptom resolves to a non-empty property list; overrides, extras and hidden properties; sex applicability; **adding a symptom to a fixture catalogue needs no code** |
| Answers | each property kind; exclusive options; tapping again clears; duration bounds |
| Linkage | the rules and the red-flag map; removing a complaint restores the prior answer; **property test:** linked and ROS answers never disagree |
| Flags | **75 rules × (one positive + one negative fixture)**; an unsigned reference never fires; merging is idempotent; urgent first; restricted filtering; the NEWS2 bands reused from triage |
| Composer | snapshots for Patient Three-3 and the chest-pain fixture; **property test:** every yes appears, and no not-asked item appears as a negative |
| Status | every status string; monotonic as answers are added |
| Views | render tests per section; the dialog's name, focus trap and return; red scarcity; axe (jsdom plus the browser harness) |
| Lane (PGlite) | 0076 migration and RLS probes; medicines and allergies commit immediately and reach the safety bar and the prescribing check; findings commit at signing; family history never becomes `self` |
| Budgets | tap counts (back-pain complaint ≤ 20, negative review ≤ 13), recompute < 16 ms, route JS ≤ 60 KB gz |

---

## 8. Decisions (you own these; each has a recommendation)

| # | Decision | Recommendation | Sign |
|---|---|---|---|
| D-CV-01 | Design authority | The prototype and screenshots set layout and interaction; the catalogue sets content; the repo wins on mechanics | ☐ |
| D-CV-02 | Section order and grouping | History: Complaint, History, Systems, Past history (with medicines and allergies), Family, Social. Examination and plan: Examination, Summary, Impression, Plan | ☐ |
| D-CV-03 | Red in the Flags panel | Adopt the §6 amendment | ☐ |
| D-CV-04 | Flag levels and rules | Urgent = act this visit; caution = address or plan. Corrections (a)–(g) as the prompt lists them. Each rule is signed in Appendix A | ☐ |
| D-CV-05 | Flags and the record | Derived at read time; snapshotted at signing with rule ids and catalogue version | ☐ |
| D-CV-06 | Outbreak mode | A hospital setting (H6), audited with a reason. Fever plus an exposure is always on | ☐ |
| D-CV-07 | Pop-up trigger | Only the Details button opens it | ☐ |
| D-CV-08 | Linked answers | Read-only in Systems; tapping one opens the complaint | ☐ |
| D-CV-09 | Past-history yes | Proposes a problem-list entry to confirm; never adds one | ☐ |
| D-CV-10 | Medicines and allergies in Past history | Immediate commit through the existing records (plus H1) | ☐ |
| D-CV-11 | Chroma | **Your call** (see below) | ☐ |
| D-CV-12 | Duration units | Hours, days, weeks, months, years | ☐ |
| D-CV-13 | Local-language terms | Supplied and signed by Ugandan clinicians; nothing machine-translated | ☐ |
| D-CV-14 | Obstetric and gynaecological step | Next round | ☐ |
| D-CV-15 | NG12 thresholds for Uganda | Kept as reference entries, **off until you sign each value** (Appendix B) | ☐ |
| D-CV-16 | Composer wording | Sign the composer rules and the two fixture snapshots (at STOP 4) | ☐ |
| H1–H12 | The harmonisations in §1, including migration 0076 | As proposed | ☐ |

**D-CV-11 (Chroma).** The prompt recommends rebasing Chroma onto `release/emr` and merging it first. Chroma is 299 uncommitted files touching the whole app, and it has never run signed-in. That makes it its own reviewed release and delays this build.

- **Alternative:** build v2 on today's tokens. The layout, interaction and behaviour are identical; the display face and the indigo "current step" wait for Chroma, where they arrive as a token swap.
- **Recommendation:** build on today's tokens now, and let Chroma land as its own release.

**Signature:** signed as recommended by Fadhul (owner and CSO), 27 Sep 2026, in session: D-CV-01 to D-CV-16, D-CV-11 as "today's tokens, Chroma later", H1–H12 including migration 0076, and all 75 flag rules and 19 reference values as drafted. Recorded in `data/clerking/catalogue-signoff.v1.json`.

---

## 9. The 17 symptoms needing a new vocabulary token

`sym.hiccups`, `sym.noisy_breathing`, `sym.snoring`, `sym.constipation`, `sym.urine_output_low`, `sym.loin_pain`,
`sym.scrotal`, `sym.pelvic_pain`, `sym.genital_sore`, `sym.bone_pain`, `sym.confusion`, `sym.ear_pain`,
`sym.mouth_ulcers`, `sym.neck_pain`, `sym.face_swelling`, `sym.unusual_experiences`, `sym.self_harm_thoughts`.

Migration 0076 adds them to `symptom_catalog` with the catalogue's label and synonyms. Two of them, `sym.unusual_experiences` and `sym.self_harm_thoughts`, are restricted.

## Appendix A — Flag rules (75), as the catalogue holds them

Sign each row: ✓ as drafted, ✗ off, or an edit. "Source check" is whether the cited source was checked on 27 Sep 2026.

| # | Rule | Level | Badge | Applies to | Reason | Source | Source check | Restricted | Sign |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `FLAG-CP-ACS` | urgent | Chest pain | sym.chest_pain | Chest pain with features of acute coronary syndrome, current or within 12 hours: emergency assessment | NICE-CG95 | verified |  | ☐ |
| 2 | `FLAG-CP-ACS-RECENT` | caution | Chest pain | sym.chest_pain | Chest pain with ACS features 12 to 72 hours ago: same-day assessment | NICE-CG95 | verified |  | ☐ |
| 3 | `FLAG-CP-DISSECTION` | urgent | Sudden chest pain | sym.chest_pain | Sudden tearing or sharp chest pain, or pain going through to the back: exclude aortic dissection | CLINICAL-METHODS | unverified |  | ☐ |
| 4 | `FLAG-PE-CHEST` | urgent | Pleuritic chest pain | sym.chest_pain | Chest pain worse on breathing in, with breathlessness or coughing blood: consider pulmonary embolism | CLINICAL-METHODS | unverified |  | ☐ |
| 5 | `FLAG-PE-BREATHLESS` | urgent | Sudden breathlessness | sym.breathlessness | Sudden-onset breathlessness: consider pulmonary embolism | CLINICAL-METHODS | unverified |  | ☐ |
| 6 | `FLAG-PE-LEG` | urgent | Swollen leg and breathless | sym.leg_swelling | One swollen painful leg with breathlessness: consider pulmonary embolism | NICE-NG158 | unverified |  | ☐ |
| 7 | `FLAG-FEVER-DANGER` | urgent | Fever | sym.fever | Fever with a danger sign: assess for severe malaria, sepsis or meningitis now | UCG-2023, WHO-MALARIA | unverified |  | ☐ |
| 8 | `FLAG-ACUTE-ABDO` | urgent | Abdominal pain | sym.abdominal_pain | Abdominal pain with features of an acute abdomen or bleeding | CLINICAL-METHODS | unverified |  | ☐ |
| 9 | `FLAG-VOMIT-BLOOD` | urgent | Vomiting blood | sym.nausea_vomiting | Vomit containing blood or coffee grounds: upper gastrointestinal bleeding | NICE-CG141 | unverified |  | ☐ |
| 10 | `FLAG-VOMIT-FAECULENT` | urgent | Faeculent vomiting | sym.nausea_vomiting | Faeculent vomiting: bowel obstruction | CLINICAL-METHODS | unverified |  | ☐ |
| 11 | `FLAG-RECTAL-HEAVY` | urgent | Heavy rectal bleeding | sym.rectal_bleeding | Black tarry stools or heavy rectal bleeding | NICE-CG141 | unverified |  | ☐ |
| 12 | `FLAG-ANAPHYLAXIS` | urgent | Face swelling | sym.face_swelling | Swelling of lips, tongue or face with breathing difficulty, wheeze, hoarseness or collapse: possible anaphylaxis | RESUS-UK-ANAPHYLAXIS | unverified |  | ☐ |
| 13 | `FLAG-ANGIOEDEMA` | caution | Face swelling | sym.face_swelling | Swelling of lips, tongue or face without airway features | RESUS-UK-ANAPHYLAXIS | unverified |  | ☐ |
| 14 | `FLAG-HA-RED` | urgent | Headache | sym.headache | Headache with a red-flag feature | NICE-CG150 | unverified |  | ☐ |
| 15 | `FLAG-BP-CES` | urgent | Cauda equina symptoms | sym.back_pain | Back pain with a cauda equina red flag | NICE-CKS-CES | verified |  | ☐ |
| 16 | `FLAG-TLOC-CARDIAC` | urgent | Blackout | sym.fainting | Blackout with a cardiac red flag: urgent cardiovascular assessment | NICE-CG109 | verified |  | ☐ |
| 17 | `FLAG-STROKE` | urgent | Sudden weakness | sym.focal_weakness, sym.speech_change, sym.numbness | Sudden weakness, numbness or speech change: possible stroke | NICE-NG128 | unverified |  | ☐ |
| 18 | `FLAG-TIA` | urgent | Resolved weakness | sym.focal_weakness, sym.speech_change, sym.numbness | Sudden weakness, numbness or speech change that has resolved: possible TIA, assess today | NICE-NG128 | unverified |  | ☐ |
| 19 | `FLAG-GI-BLEED-UPPER` | urgent | Vomiting blood | sym.vomiting_blood | Upper gastrointestinal bleeding | NICE-CG141 | unverified |  | ☐ |
| 20 | `FLAG-GI-MELAENA` | urgent | Black stools | sym.black_stools | Black, tarry stools: possible upper gastrointestinal bleeding | NICE-CG141 | unverified |  | ☐ |
| 21 | `FLAG-HAEMOPTYSIS-LARGE` | urgent | Coughing blood | sym.coughing_blood | Large-volume haemoptysis | CLINICAL-METHODS | unverified |  | ☐ |
| 22 | `FLAG-VHF-EXPOSURE` | urgent | Fever and exposure | sym.fever | Fever with an exposure: screen for viral haemorrhagic fever and isolate | WHO-EVD-CASEDEF, CDC-MMWR-BDBV-2026 | verified |  | ☐ |
| 23 | `FLAG-VHF-OUTBREAK` | urgent | Fever, outbreak screen | sym.fever | Fever with at least three case-definition symptoms during a declared outbreak | WHO-EVD-CASEDEF | verified |  | ☐ |
| 24 | `FLAG-VHF-BLEEDING` | urgent | Unexplained bleeding | sym.bleeding_tendency | Unexplained bleeding during a declared outbreak: screen for viral haemorrhagic fever | WHO-EVD-CASEDEF | verified |  | ☐ |
| 25 | `FLAG-SELF-HARM` | urgent | Thoughts of self-harm | sym.self_harm_thoughts | Thoughts of self-harm: assess safety today | CLINICAL-METHODS | unverified | yes | ☐ |
| 26 | `FLAG-HYPERGLYCAEMIC` | urgent | Polyuria with vomiting | sym.polyuria | Polyuria with vomiting, abdominal pain, drowsiness or fast breathing: possible hyperglycaemic emergency; check glucose and ketones | HYPERGLYCAEMIC-CRISIS | unverified |  | ☐ |
| 27 | `FLAG-TORSION` | urgent | Sudden scrotal pain | sym.scrotal | Sudden scrotal pain: possible torsion | CLINICAL-METHODS | unverified |  | ☐ |
| 28 | `FLAG-RED-EYE` | urgent | Red eye | sym.red_eye | Red eye with vision change, light sensitivity or an injury | CLINICAL-METHODS | unverified |  | ☐ |
| 29 | `FLAG-THROAT-AIRWAY` | urgent | Sore throat, drooling | sym.sore_throat | Sore throat with drooling or noisy breathing: airway risk | CLINICAL-METHODS | unverified |  | ☐ |
| 30 | `FLAG-BREATHLESS-REST` | urgent | Breathless at rest | sym.breathlessness, sym.breathless_exertion | Breathless at rest or speaking in words only | CLINICAL-METHODS | unverified |  | ☐ |
| 31 | `FLAG-CONFUSION-NEW` | urgent | New confusion | sym.confusion | New or worsening confusion (scores 3 in NEWS2) | RCP-NEWS2 | verified |  | ☐ |
| 32 | `FLAG-EARLY-PREGNANCY` | urgent | Pain with missed period | sym.pelvic_pain, sym.vaginal_bleeding, sym.abdominal_pain | Pain or bleeding with a missed period or possible pregnancy: exclude ectopic pregnancy | CLINICAL-METHODS | unverified | yes | ☐ |
| 33 | `FLAG-PREG-BLEEDING` | urgent | Bleeding in pregnancy | sym.vaginal_bleeding | Vaginal bleeding in known pregnancy: assess for miscarriage or antepartum haemorrhage | CLINICAL-METHODS | unverified | yes | ☐ |
| 34 | `FLAG-RASH-NONBLANCH` | urgent | Non-fading rash | sym.rash | Purple rash that does not fade | CLINICAL-METHODS | unverified |  | ☐ |
| 35 | `FLAG-RASH-SJS` | urgent | Rash with blisters or mouth sores | sym.rash | Rash with mucosal involvement, or blistering or peeling after a new medicine: exclude SJS/TEN | CLINICAL-METHODS | unverified |  | ☐ |
| 36 | `FLAG-RETENTION` | urgent | Cannot pass urine | sym.voiding_symptoms | Urinary retention | CLINICAL-METHODS | unverified |  | ☐ |
| 37 | `FLAG-ANURIA` | urgent | No urine | sym.urine_output_low | No urine in 12 hours: retention or acute kidney injury | CLINICAL-METHODS | unverified |  | ☐ |
| 38 | `FLAG-SEIZURE-LONG` | urgent | Prolonged fit | sym.fits | Fit lasting over 5 minutes | CLINICAL-METHODS | unverified |  | ☐ |
| 39 | `FLAG-HOT-JOINT` | urgent | Hot swollen joint | sym.joint_pain, sym.joint_swelling | Hot, swollen joint: exclude septic arthritis | CLINICAL-METHODS | unverified |  | ☐ |
| 40 | `FLAG-DVT` | urgent | One swollen leg | sym.leg_swelling | One swollen, painful leg: consider deep vein thrombosis | NICE-NG158 | unverified |  | ☐ |
| 41 | `FLAG-PAIN-SEVERE` | caution | {symptom} {severity}/10 | family:pain | Severe pain | OPERATIONAL | unverified |  | ☐ |
| 42 | `FLAG-RED-FLAG-ITEM` | caution | {red_flag} | any | A danger-sign answer of yes | CLINICAL-METHODS | unverified |  | ☐ |
| 43 | `FLAG-TB-PRESUMPTIVE` | caution | Cough {duration} | sym.cough | Presumptive TB: request sputum testing | UG-TB-MANUAL, WHO-TB-SCREEN-2021 | unverified |  | ☐ |
| 44 | `FLAG-HAEMOPTYSIS` | caution | Coughing blood | sym.coughing_blood | Haemoptysis: test for TB | UG-TB-MANUAL | unverified |  | ☐ |
| 45 | `FLAG-HAEMOPTYSIS-AGE` | caution | Coughing blood | sym.coughing_blood | Haemoptysis at or above the NG12 age: suspected lung cancer pathway | NICE-NG12 | verified |  | ☐ |
| 46 | `FLAG-DYSPHAGIA` | caution | Difficulty swallowing | sym.difficulty_swallowing | Dysphagia: urgent upper GI endoscopy (within 2 weeks) in NG12 | NICE-NG12 | verified |  | ☐ |
| 47 | `FLAG-WEIGHT-LOSS` | caution | Weight loss | sym.weight_loss | Unintentional weight loss | NICE-NG12 | verified |  | ☐ |
| 48 | `FLAG-HAEMATURIA` | caution | Blood in urine | sym.haematuria | Visible haematuria: consider schistosomiasis, infection and stones | CLINICAL-METHODS | unverified |  | ☐ |
| 49 | `FLAG-HAEMATURIA-AGE` | caution | Blood in urine | sym.haematuria | Visible haematuria at or above the NG12 age: suspected bladder or kidney cancer pathway | NICE-NG12 | verified |  | ☐ |
| 50 | `FLAG-PMB` | caution | Bleeding after menopause | sym.vaginal_bleeding | Postmenopausal bleeding: suspected cancer pathway at or above the NG12 age, consider below it | NICE-NG12 | verified | yes | ☐ |
| 51 | `FLAG-RECTAL-BLEED` | caution | Rectal bleeding | sym.rectal_bleeding | Rectal bleeding at or above the NG12 age, or with weight loss or abdominal pain: faecal immunochemical testing | NICE-NG12 | verified |  | ☐ |
| 52 | `FLAG-BOWEL-CHANGE` | caution | Change in bowel habit | sym.bowel_change | Change in bowel habit: faecal immunochemical testing in NG12 | NICE-NG12 | verified |  | ☐ |
| 53 | `FLAG-BREAST-LUMP` | caution | Breast lump | sym.breast_lump | Breast lump at or above REF age: suspected cancer pathway | NICE-NG12 | verified |  | ☐ |
| 54 | `FLAG-HOARSE` | caution | Hoarse voice | sym.hoarse_voice | Persistent hoarseness at or above REF age | NICE-NG12 | verified |  | ☐ |
| 55 | `FLAG-JAUNDICE` | caution | Yellow eyes | sym.jaundice | Jaundice needs assessment | CLINICAL-METHODS | unverified |  | ☐ |
| 56 | `FLAG-JAUNDICE-AGE` | caution | Yellow eyes | sym.jaundice | Jaundice at or above the NG12 age: suspected pancreatic cancer pathway | NICE-NG12 | verified |  | ☐ |
| 57 | `FLAG-JAUNDICE-SEVERE` | urgent | Yellow eyes | sym.jaundice | Jaundice with confusion or bleeding: acute liver failure or severe malaria | CLINICAL-METHODS | unverified |  | ☐ |
| 58 | `FLAG-JAUNDICE-TBDRUGS` | urgent | Yellow eyes | sym.jaundice | Jaundice on TB treatment: possible drug-induced liver injury | CLINICAL-METHODS | unverified | yes | ☐ |
| 59 | `FLAG-DYSPEPSIA-AGE` | caution | Indigestion with weight loss | sym.heartburn | Upper abdominal symptoms with weight loss at or above the NG12 age: urgent upper GI endoscopy | NICE-NG12 | verified |  | ☐ |
| 60 | `FLAG-LYMPH` | caution | Enlarged glands | sym.lumps_lymph | Lymphadenopathy: consider TB, HIV and lymphoma | NICE-NG12 | verified |  | ☐ |
| 61 | `FLAG-MOUTH-ULCER` | caution | Mouth ulcer | sym.mouth_ulcers | Mouth ulcer lasting more than 3 weeks | NICE-NG12 | verified |  | ☐ |
| 62 | `FLAG-FIRST-FIT` | caution | First fit | sym.fits | First seizure: specialist assessment | CLINICAL-METHODS | unverified |  | ☐ |
| 63 | `FLAG-FIT-TODAY` | caution | Fit today | sym.fits | Seizure today | CLINICAL-METHODS | unverified |  | ☐ |
| 64 | `FLAG-FALLS` | caution | Falls | sym.falls | Recurrent falls | OPERATIONAL | unverified |  | ☐ |
| 65 | `FLAG-DIABETIC-FOOT` | caution | Foot wound | sym.skin_lesion | Foot wound in a person with diabetes | CLINICAL-METHODS | unverified |  | ☐ |
| 66 | `FLAG-NON-HEALING` | caution | Non-healing wound | sym.skin_lesion | Wound or lesion not healing for over 6 weeks | CLINICAL-METHODS | unverified |  | ☐ |
| 67 | `FLAG-DEHYDRATION-RISK` | caution | Not keeping fluids down | sym.nausea_vomiting | Vomiting and unable to keep fluids down | CLINICAL-METHODS | unverified |  | ☐ |
| 68 | `FLAG-BLOODY-DIARRHOEA` | caution | Bloody diarrhoea | sym.diarrhoea | Diarrhoea with blood | CLINICAL-METHODS | unverified |  | ☐ |
| 69 | `FLAG-RICE-WATER` | urgent | Rice-water stools | sym.diarrhoea | Rice-water stools: consider cholera (notifiable) | CLINICAL-METHODS | unverified |  | ☐ |
| 70 | `FLAG-MED-ADHERENCE` | caution | {verb} {medicine} | medicines | Medicine missed or stopped | OPERATIONAL | unverified |  | ☐ |
| 71 | `FLAG-ALLERGY-HIGH` | caution | {substance} allergy | allergies | Allergy with a high-risk reaction (airway, breathing or circulation) | CLINICAL-METHODS | unverified |  | ☐ |
| 72 | `FLAG-ALLERGY-UNRECORDED` | caution | Allergies not recorded | allergies | Allergy status not recorded | CLINICAL-METHODS | unverified |  | ☐ |
| 73 | `FLAG-VITALS-3` | urgent | {vital} {value} | vital_signs | A vital sign scoring 3 in NEWS2 | RCP-NEWS2 | verified |  | ☐ |
| 74 | `FLAG-VITALS-AGG` | urgent | NEWS2 {total} | vital_signs | NEWS2 at the urgent response threshold | RCP-NEWS2 | verified |  | ☐ |
| 75 | `FLAG-VITALS-EMERGENCY` | urgent | NEWS2 {total} | vital_signs | NEWS2 at the emergency response threshold: continuous monitoring and senior review | RCP-NEWS2 | verified |  | ☐ |

## Appendix B — Reference entries (19). A rule whose reference is unsigned does not fire.

| Entry | Proposed value | Unit | Meaning | Source | Status | Signed value |
|---|---|---|---|---|---|---|
| `REF-FLAG-PAIN-SEVERE` | 7 | score (0-10) | Pain score at or above which 'severe pain' is flagged | OPERATIONAL | draft | ☐ |
| `REF-FLAG-ACS-EPISODE` | over_15_min, hours, constant | options | Chest pain episode lengths suggesting ACS (longer than 15 minutes) | NICE-CG95 | draft-verified-source | ☐ |
| `REF-FLAG-ACS-WINDOW` | now, within_12h | options | Last episode within which suspected ACS is an emergency referral; 12 to 72 hours is same-day assessment | NICE-CG95 | draft-verified-source | ☐ |
| `REF-FLAG-NEWS2-PARAM` | 3 | NEWS2 parameter score | A single parameter at this score triggers urgent review | RCP-NEWS2 | draft-verified-source | ☐ |
| `REF-FLAG-NEWS2-URGENT` | 5 | NEWS2 total | Urgent response threshold | RCP-NEWS2 | draft-verified-source | ☐ |
| `REF-FLAG-NEWS2-EMERGENCY` | 7 | NEWS2 total | Emergency response threshold | RCP-NEWS2 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-HAEMOPTYSIS-AGE` | 40 | years |  | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-HAEMATURIA-AGE` | 45 | years |  | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-PMB-AGE` | 55 | years | Postmenopausal bleeding: refer at or above; consider below | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-RECTAL-BLEED-AGE` | 50 | years | At or above this age NG12 offers quantitative faecal immunochemical testing (FIT); it is not a direct suspected-cancer referral | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-BREAST-LUMP-AGE` | 30 | years |  | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-HOARSE-AGE` | 45 | years |  | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-JAUNDICE-AGE` | 40 | years |  | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-NG12-UPPER-ABDO-AGE` | 55 | years |  | NICE-NG12 | draft-verified-source | ☐ |
| `REF-FLAG-TB-COUGH-WEEKS` | 2 | weeks | Cough duration defining presumptive TB (any duration in people living with HIV) | UG-TB-MANUAL | draft-unverified | ☐ |
| `REF-FLAG-HOARSE-WEEKS` | 3 | weeks | Duration MedSync proposes to call hoarseness 'persistent' (NG12 gives no duration) | OPERATIONAL | draft | ☐ |
| `REF-FLAG-ULCER-WEEKS` | 3 | weeks | Mouth ulceration lasting MORE than this (strictly greater) prompts referral | NICE-NG12 | draft-unverified | ☐ |
| `REF-FLAG-FALLS-COUNT` | 2 | falls a year |  | OPERATIONAL | draft | ☐ |
| `REF-FLAG-EVD-SYMPTOM-COUNT` | 3 | symptoms | Fever plus at least this many listed symptoms (outbreak mode only) | WHO-EVD-CASEDEF | draft-verified-source | ☐ |

## Appendix C — Sources (19; 7 verified on 27 Sep 2026)

| Id | Title | Checked | Verified | Note |
|---|---|---|---|---|
| NICE-NG12 | NICE NG12 Suspected cancer: recognition and referral (recommendations organised by symptom) | 2026-09-27 | yes | UK primary-care thresholds. Adapt for Uganda at sign-off: younger population, and TB and schistosomiasis are commoner explanations for several of these symptoms. |
| NICE-CG95 | NICE CG95 Recent-onset chest pain of suspected cardiac origin (via NCBI Bookshelf NBK553650) | 2026-09-27 | yes |  |
| NICE-CG109 | NICE CG109 Transient loss of consciousness ('blackouts') in over 16s | 2026-09-27 | yes |  |
| NICE-CKS-CES | NICE CKS cauda equina syndrome red flags (as reported by GPonline) | 2026-09-27 | yes | Confirm against the live CKS topic at sign-off. |
| WHO-EVD-CASEDEF | WHO suggested Ebola/Marburg outbreak case definitions (Ebola outbreak data collection toolbox) | 2026-09-27 | yes | Use the current Uganda MoH case definition at sign-off; it may be adapted per outbreak. |
| CDC-MMWR-BDBV-2026 | MMWR: Clinical characteristics of Bundibugyo virus disease, Uganda 2026 | 2026-09-27 | yes | Fever 100%, headache 83%, myalgia 78%, arthralgia 72%, fatigue 67%; bleeding in 3 of 18 admitted patients. A rule that waits for bleeding misses most cases. |
| RCP-NEWS2 | Royal College of Physicians, National Early Warning Score (NEWS) 2, 2017 | 2026-09-27 | yes |  |
| NICE-CG150 | NICE CG150 Headaches in over 12s |  | no |  |
| NICE-NG128 | NICE NG128 Stroke and transient ischaemic attack in over 16s |  | no |  |
| NICE-CG141 | NICE CG141 Acute upper gastrointestinal bleeding in over 16s |  | no |  |
| NICE-NG158 | NICE NG158 Venous thromboembolic diseases |  | no |  |
| WHO-TB-SCREEN-2021 | WHO consolidated guidelines on tuberculosis, Module 2: screening (2021) |  | no |  |
| UG-TB-MANUAL | Uganda National Tuberculosis and Leprosy Programme manual (presumptive TB definition) |  | no |  |
| HYPERGLYCAEMIC-CRISIS | Hyperglycaemic crises in adults with diabetes: consensus report (ADA, EASD, JBDS, AACE, DTS), 2024 |  | no |  |
| UCG-2023 | Uganda Clinical Guidelines 2023 (danger signs, severe malaria, sepsis, meningitis) |  | no |  |
| WHO-MALARIA | WHO guidelines for malaria (severe malaria clinical features) |  | no |  |
| RESUS-UK-ANAPHYLAXIS | Resuscitation Council UK, Emergency treatment of anaphylaxis (2021) |  | no |  |
| CLINICAL-METHODS | Standard history-taking structure (SOCRATES and system review) as taught in clinical-methods texts; to be matched to the texts the CSO attaches |  | no |  |
| OPERATIONAL | Operational convention proposed by MedSync, not a guideline value |  | no |  |

**Rules resting only on unverified sources (51):** `FLAG-CP-DISSECTION`, `FLAG-PE-CHEST`, `FLAG-PE-BREATHLESS`, `FLAG-PE-LEG`, `FLAG-FEVER-DANGER`, `FLAG-ACUTE-ABDO`, `FLAG-VOMIT-BLOOD`, `FLAG-VOMIT-FAECULENT`, `FLAG-RECTAL-HEAVY`, `FLAG-ANAPHYLAXIS`, `FLAG-ANGIOEDEMA`, `FLAG-HA-RED`, `FLAG-STROKE`, `FLAG-TIA`, `FLAG-GI-BLEED-UPPER`, `FLAG-GI-MELAENA`, `FLAG-HAEMOPTYSIS-LARGE`, `FLAG-SELF-HARM`, `FLAG-HYPERGLYCAEMIC`, `FLAG-TORSION`, `FLAG-RED-EYE`, `FLAG-THROAT-AIRWAY`, `FLAG-BREATHLESS-REST`, `FLAG-EARLY-PREGNANCY`, `FLAG-PREG-BLEEDING`, `FLAG-RASH-NONBLANCH`, `FLAG-RASH-SJS`, `FLAG-RETENTION`, `FLAG-ANURIA`, `FLAG-SEIZURE-LONG`, `FLAG-HOT-JOINT`, `FLAG-DVT`, `FLAG-PAIN-SEVERE`, `FLAG-RED-FLAG-ITEM`, `FLAG-TB-PRESUMPTIVE`, `FLAG-HAEMOPTYSIS`, `FLAG-HAEMATURIA`, `FLAG-JAUNDICE`, `FLAG-JAUNDICE-SEVERE`, `FLAG-JAUNDICE-TBDRUGS`, `FLAG-FIRST-FIT`, `FLAG-FIT-TODAY`, `FLAG-FALLS`, `FLAG-DIABETIC-FOOT`, `FLAG-NON-HEALING`, `FLAG-DEHYDRATION-RISK`, `FLAG-BLOODY-DIARRHOEA`, `FLAG-RICE-WATER`, `FLAG-MED-ADHERENCE`, `FLAG-ALLERGY-HIGH`, `FLAG-ALLERGY-UNRECORDED`. They ship with their reference entries unsigned unless you sign them; CLINICAL-METHODS and OPERATIONAL rows rely on your clinical judgement rather than a checked guideline.
