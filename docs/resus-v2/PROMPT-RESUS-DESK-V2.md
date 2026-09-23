# PROMPT — Resus Desk v2: focus UI · ALS arrest console · ROSC / termination · close-out & disposition

> **For Claude Code.** Work at the repo root on a new branch `feat/resus-desk-v2`, cut from the current working branch (the brief says `feat/booking-app`; confirm at STOP 0). First copy three files into `docs/resus-v2/`: this prompt, `resus-desk-v2-clinical-reference.md` (the medicine) and the resus context brief of 23 Sep 2026 (the code as it stood).
>
> **Mode:** gated. Eight phases, each ending in a **STOP**. Documents use Stage 1 (draft → critique against the checklist → revise, max two passes → present → STOP). Code uses Stage 2 (build → run the real checks → fix → re-run until green → report numbers → STOP). Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** Clinical content, clinical rules and any clinical write path need his signature before they ship.

---

## 0. Ground truth and reading order

1. **The brief** in `docs/resus-v2/` (the code map as of 23 Sep 2026). **The repo wins** where they disagree; report every disagreement at STOP 0. Problems marked _screenshot_ in Section 2 were seen on the live test deployment, not in the brief: confirm each one in code.
2. **`docs/resus-v2/resus-desk-v2-clinical-reference.md`**: every clinical rule, number and source, and the CSO decision list (D1–D20). Never invent clinical content; if something clinical is missing, stop and ask.
3. **Design and decisions:** `DESIGN-medsync.md` (authoritative), ADRs 0044–0058 (resus), ADR 0097 if present (plum = place), the existing resus GATE-A proposals (`docs/resus-*-gate-a-proposal.md`), and the CSO catalogs in `docs/clinical/resus-*` and `emergency-crash-cart-drug-catalog.md`.
4. **Code:** `app/nurse/resus/**` (incl. `actions.ts`), `app/doctor/resus/**`, `lib/resus/**` (incl. `arrest.ts`, `action-order.ts`, `mobilise.ts`, `scope.ts`), `lib/prescribing/**`, `db/schema/resus.ts`, migrations `0038_resus_abcde.sql` and `0039`, `tests/resus/**`, `tests/rls/**`.

---

## 1. Laws (non-negotiable)

1. **Engine-first.** No surface reads or writes an engine without real tables, real RLS policies and passing tests. The four resus tables have no RLS tests today: close that gap first (Phase 0).
2. **Decision support only.** The desk records and suggests. It never orders, administers or decides, and never hard-blocks a clinical action. Overrides are recorded with a reason and audited. A data prompt (e.g. "how did the arrest end?" when ending a resus mid-arrest) is not a block.
3. **No remembered numbers.** Every clinical number comes from a CSO-signed reference entry with source URL and verified date. Until signed, v2 entries carry `status: 'pending_cso'` and the UI shows "pending CSO sign-off", never the number. A test fails the build if a v2 entry reachable from the UI is `pending_cso` while the `resusV2Clinical` flag is on. Items that were already pending before v2 (flumazenil verification, the vital plausibility bands) are listed at GATE A as known exceptions, not silently passed.
4. **Signed A–E logic does not change.**
   - Step state stays engine-inferred (worst finding wins).
   - An unassessed step is never treated as safe.
   - The engine-triggered returns (GCS ≤ 8 or falling → A; suspected opioid → naloxone → B) and "Return to A anyway" stay as signed.
   - CSO-signed always-visible items stay visible (E's checklist, D's pinned "check glucose").
   - What v2 changes is _how inputs arrive_: patient-level context, one arrest state, vitals-derived Measure findings. That is new clinical logic, signed at GATE A (D18–D20) and proven by the equivalence suites (Section 7.1).
5. **Red is a safety property.** `#DC2626` is used only for:
   - the arrest state and the ⚠ Arrest / Re-arrest control;
   - a step with an active life threat, and a failed action;
   - critical vital cells, the RESUS tag and the board's arrest dot (all existing);
   - the global Emergency affordance.

   Due, overdue, stale and offline are amber, so the stale-vitals "Re-check" nudge moves from red to amber (E7). Add red-scarcity invariant tests covering every resus component (reuse platform tests if they exist).

6. **The record is append-only.** Corrections supersede via `correctResusEvent`. Entries whose bedside time differs from entry time are labelled with both. Nothing is silently backdated. Closed or cancelled episodes stay read-only, as today.
7. **Children (< 16):** never an adult number, and no vitals-derived findings (the bands use adult cut-offs).
8. **No new dependencies** without stopping to flag, including Playwright and axe if they are not already present. The project must still run from a clean clone with Node 22 + pnpm only.
9. **Stack, as the brief describes it:**
   - Next.js 16 App Router with server actions; Drizzle; Supabase Postgres with RLS; MFA at AAL2.
   - Reception cadres blocked in app and DB.
   - All writes go through the service role inside audited server actions (client-side writes denied).
   - Timeline append-only (trigger + revoked privileges); narrative AES-256-GCM.
   - Writes audited to `sa_audit_log`; name reveals to `clinical_phi_access_log`.
   - TypeScript strict, no `any`; Zod on every server action.
10. **Reuse before adding.** Extend existing actions, components and engines. Add new ones only where nothing existing fits, and say why.
11. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it.

---

## 2. What is wrong today

| #   | Problem                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                    | Severity               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------- |
| P1  | **No way to end a resus.** `concludeResus` exists but has no UI, so episodes never end: the live header reads `2685:36:23` (about 112 days), the board fills with stale episodes, and outcomes are never recorded                                                                                                                                                                             | brief; screenshot           | Safety + data          |
| P2  | **Arrest is a banner, not a mode.** The ALS module is a stub. After ⚠ Arrest the survey panel stays the working surface. The ⚠ Arrest control then hides, and the episode holds a single `arrest_detected_at`, so a re-arrest can't be recorded                                                                                                                                               | brief p4, 9, 17; screenshot | Safety                 |
| P3  | **Vitals never feed step state.** State is inferred only from recorded findings, and Measure chips are tapped by hand. The screenshot shows C "Clear" beside SBP 70, MAP 63, shock index 1.86, and B "Pending" with SpO₂ 67%                                                                                                                                                                  | brief p6; screenshot        | **Safety — fix first** |
| P4  | **Step bar and panel disagree.** A and C read "Clear" (= assessed, no threat) in the step bar while their panels say "Not yet assessed". Root-cause it (previous pass vs current pass?) and add a regression test                                                                                                                                                                             | brief p15; screenshot       | Safety                 |
| P5  | **Choice overload.** On load: ~38 finding chips in A, ~50 in B, ~58 in C, ~28 plus 4 inputs in E. The same context repeats across steps: trauma-type toggles in all five steps, Allergen trigger in A/B/C, Head injury/TBI in C/D, No signs of life in A/B, No pulse in C/D/E. LEMON/MOANS/RODS are always visible. AMPLE sits at the bottom of E although allergies matter at the first drug | brief p7–8; screenshots     | UX                     |
| P6  | **Noisy actions.** Five equal-weight buttons per action card; descriptions repeat titles; E says "temperature not measured" three times (banner, action, footer)                                                                                                                                                                                                                              | screenshots                 | UX                     |
| P7  | **Anaphylaxis bar** sits on A, B, C and E with the IM dose line always visible, and still offers IM adrenaline 500 µg during an arrest                                                                                                                                                                                                                                                        | brief p5; screenshot        | Safety + UX            |
| P8  | **Team panel** always expanded (7 roles). "Leader: You" sits beside "0/3 responding": claiming a role doesn't mark you as responding, and "acknowledged" and "responding" are separate fields                                                                                                                                                                                                 | brief p10, 17; screenshot   | UX                     |
| P9  | **Record** has no dates across days and no T+ offset, prints vitals as field keys (`hr, rr, spo2, systolicBp…`), and has no undo/correct UI although `correctResusEvent` exists                                                                                                                                                                                                               | brief; screenshot           | UX + medico-legal      |
| P10 | **No realtime.** The desk re-reads the server after every write; no tolerance of network drops                                                                                                                                                                                                                                                                                                | brief                       | Reliability            |
| P11 | The floating Emergency button overlaps desk content. Keep the affordance (safety floor); move it                                                                                                                                                                                                                                                                                              | screenshot                  | UX                     |
| P12 | `encounter_id` never set; `handover`/`note` kinds unused; assign-role-to-other unused                                                                                                                                                                                                                                                                                                         | brief                       | Gaps                   |
| P13 | No RLS tests for the four resus tables                                                                                                                                                                                                                                                                                                                                                        | brief                       | Law 1                  |
| P14 | `resus-desk.tsx` is ~1,580 lines with five duplicated action cards                                                                                                                                                                                                                                                                                                                            | brief                       | Maintainability        |

---

## 3. Design direction: the calm cockpit

**Modes.** One page that recomposes itself: **Survey → Arrest → Post-ROSC → Boarding → Closed (read-only)**. Mode switches are client-side (no route change).

**Seven rules:**

1. The loudest thing on screen is what is killing the patient now (ADR 0049 stands).
2. **Overall picture first, detail on demand:** overall-picture chips → key signs → all signs.
3. **Never ask for what the record already knows:** fresh adult vitals become Measure findings; patient context and AMPLE are entered once.
4. **The next action is one tap away:** a cross-step _Do now_ queue.
5. **Say it once:** each message lives in one place (CSO-signed always-visible items excepted).
6. **Logging never waits:** optimistic, queued, idempotent writes with undo.
7. **One truth on every device:** realtime signal + server-anchored clocks.

**Budgets** (measured at Phase 0, met by Phase 4):

- Finding chips visible on load per step (key + context-promoted; overall-picture chips and read-only vitals-derived chips not counted): **≤ 12**.
- Interactive elements in a step's findings area on load (overall-picture chips, finding chips, "More signs", search, Record): **≤ 22**.
- Controls per action row: **≤ 3**.
- Any key sign in ≤ 2 taps; any finding in ≤ 3 taps or one search; every arrest event in **1 tap**.

---

## 4. Phases and gates

### Phase 0 — Discovery, safety net, baseline (tests only; no product changes)

Answer and report:

- **Q1** ORM and migration pattern on this branch. The brief says Drizzle; project notes mention a Prisma/PGlite local-first path. Use what is here, and never add a second ORM.
- **Q2** Is the encounter engine live (flag, tables)?
- **Q3** Does hospital setup already model wards/units?
- **Q4** Where is the triage recommendations layer's pending-intent seam?
- **Q5** What scheduled-job mechanism exists (pg_cron, platform cron, none)?
- **Q6** supabase-js version. Are Realtime private channels available, and does the browser hold the user's Supabase session so it can subscribe?
- **Q7** Which key the server client uses (legacy `service_role` vs `sb_secret_…`).
- **Q8** Design tokens in `DESIGN-medsync.md`: the place colour (plum, ADR 0097), the existing blue "In progress" token, the red tokens, and any platform red-scarcity tests.
- **Q9** Does resus vitals capture record supplemental O₂ (NEWS2 needs it)? How are GCS in vitals and the D pickers reconciled today?
- **Q10** Root cause of P3 and P4.
- **Q11** Are Playwright and axe available? If not, STOP and flag (Law 8).
- **Q12** How are state, disposition, event kind and step stored (Postgres enum vs text + CHECK)? List the exact disposition codes.
- **Q13** Which Measure codes in the signed catalogs carry an explicit numeric threshold? Examples: "SBP ≤ 90 or MAP < 65", "HR > 100", "RR ≥ 25", "SpO₂ < 94% on air", "Shock index ≥ 1.0", "Narrow pulse pressure < 25% of SBP". List each code with its number.
- **Q14** How does a triage rapid-Red "no pulse / arrest" open a resus today?

Then:

- **RLS tests** (reuse the `tests/rls/` harness) for `resus_episodes`, `resus_timeline_events`, `resus_role_assignments` and `resus_mobilisation_alerts`, covering these actors:
  - same-hospital clinical (allow); other hospital (deny); reception cadre (deny); anonymous (deny);
  - patient-self, superadmin and the recorder of an entry (as the policies say);
  - **every client-side INSERT/UPDATE/DELETE denied**.

  They must pass against the current policies, or you report the gap.

- **Failing** regression tests for P3 and P4 (do not fix yet).
- **Baseline** (automated if Q11 allows; otherwise from a component render):
  - counts of chips and interactive elements per step on load;
  - screenshots at 390×844, 834×1194, 1194×834 and 1440×900, in light and dark;
  - tap-to-visible latency for "Done" (p50/p95 over 20 runs);
  - axe results.
- **STOP 0.** Report Q1–Q14, brief-vs-repo differences, the RLS results table, the baseline numbers and the failing tests.

### Phase 1 — GATE A proposal (documents only)

Write `docs/resus-v2-gate-a-proposal.md` (matching the existing `docs/resus-*-gate-a-proposal.md` pattern) containing:

- Annotated wireframes for every mode (start from Section 5; improve, don't bloat).
- **Catalog tiering** per step: overall-picture chips, ≤ 8 key signs, context-promoted signs, search synonyms, and which Measure codes become vitals-derived (Q13 codes only). Map to real catalog codes.
- The **patient-context map** (Section 5.3) with the per-step expressibility proof and the list of toggles that now move together (for D19).
- The consolidated arrest state (D20) and how `arrest.ts` feeds it.
- Every CSO-signed item whose placement changes, plus the known pre-existing pending items (Law 3).
- Specs for the ALS engine, post-ROSC, termination and confirmation of death, close-out, level-of-care rules and idle handling.
- The schema diff, legacy-episode plan, test plan and ADR drafts.
- **CSO catalogs** built from the clinical reference: `docs/clinical/resus-als-clinical-catalog.md`, `resus-post-rosc-clinical-catalog.md` and `resus-closeout-clinical-catalog.md`.
  - **Re-verify every number against its source URL now.**
  - Re-read the Utstein, UG-ALS and ILCOR-LRS full texts (the automated check could reach only abstracts).
  - List any mismatch.
- The decision table: D1–D20 from the clinical reference and E1–E7 (Section 17), each with a recommendation, plus a signature block.
- **STOP 1.** Nothing proceeds without the CSO signature.

### Phase 2 — Data layer

Migrations, value extensions, RLS, triggers, realtime, seeds and legacy flagging (Section 6).

- **STOP 2.** Report:
  - the migration diff;
  - the RLS probe table (every new table × every actor);
  - append-only proofs and the realtime authorisation test;
  - the number of legacy episodes flagged idle.

### Phase 3 — Engines (pure, no UI)

Every module in Section 7 with its tests. Every rule in the clinical reference gets a rule ID and at least one test.

- **STOP 3.** Test counts per module; rule-ID coverage table (no rule without a test); equivalence suite results (Section 7.1).

### Phase 4 — Survey-mode rework

Sections 5.1–5.8. Decompose `resus-desk.tsx` into mode components shared by the nurse and doctor routes.

- **STOP 4.** Report:
  - screenshots (4 viewports × light/dark);
  - budget counts against the baseline;
  - axe (0 serious/critical) and latency p95;
  - the P3 and P4 tests, now green.

### Phase 5 — Arrest console

Section 5.9 and the arrest call (Section 10). Scripted scenarios with a fake clock:

- **S0** Triage rapid-Red "no pulse / arrest": resus opens straight in arrest mode.
- **S1** VF: shocks 1–3 → adrenaline + amiodarone 300 → shock 4 → shock 5 → amiodarone 150 → ROSC.
- **S2** PEA → adrenaline at once → asystole → 20+ min → termination review → stop → confirmation of death.
- **S3** Hypothermic VF at core 28 °C:
  - adrenaline withheld, and further shocks paused after 3;
  - when core reaches 30 °C, adrenaline 1 mg becomes due, then every 6–10 min while 30–35 °C;
  - shocks resume above 30 °C.
- **S4** ROSC, then re-arrest at 8 min: intermittent ROSC, same arrest, counters intact.
- **S4b** Sustained ROSC, then re-arrest at 30 min: arrest #2 opens, per-arrest counters restart, episode drug totals stay visible.
- **S5** Arrest in a 9-year-old: clocks and logging only, no number anywhere.
- **S6** Two devices: cycle timers agree within 1 s; an event logged on one shows on the other within 2 s.
- **STOP 5.** Scenario results; taps per event; timer drift; screenshots.

### Phase 6 — Post-ROSC, termination, close-out, boarding, board

Sections 5.10–5.14, the encounter seam, the Utstein snapshot and the debrief. Scenarios:

- **S7** Stabilised → ward.
- **S8** Post-ROSC comatose → ICU suggested → ICU full → HDU chosen with reason → boarding → leaves resus.
- **S9** Opened in error → cancelled.
- **S10** Legacy idle episode → administrative close.
- **S11** End resus pressed mid-arrest → the sheet asks how the arrest ended (ROSC / stop / leaving with CPR ongoing).
- **STOP 6.** Scenario results; screenshots; a sample handover draft and Utstein snapshot (synthetic patient).

### Phase 7 — Hardening and documentation

- Network-drop test: offline for 60 s mid-arrest, then reconnect, with no lost or duplicated events.
- Realtime reconnect.
- Performance budgets (Section 12).
- Reduced motion and dark mode.
- ADRs and the final report.
- **STOP 7 (final).** The numbers in Section 14, filled in.

---

## 5. Interface specification

### 5.1 Survey mode layout

Desktop / tablet landscape (≥ 1024 px; the Record rail collapses to a drawer below 1280 px). `( Emergency )` is an outline button:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Board  RESUS  Patient Two-2 · 26y M · Step-0 life threat · Bay 2              T+00:47:12   │
│                          Leader You ▾ · 4 responding   [End resus]  [⚠ Arrest]  ( Emergency ) │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ [A ✓ Addressed] [B ▲ Threatened] [C ◆ Active threat · from vitals] [D ○ Pending] [E ○ Pending] ↺ Return to A │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ HR 130↑11 │ BP 70/60 MAP 63 │ SpO₂ 67%↓3 on O₂ │ RR 20↓10 │ T 35.4 │ Glu 5.0 │ +EtCO₂ │ SI 1.86 · PP 10 · qSOFA 2 │ 3 min ago [Record] │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ Context: ✓Allergen trigger · Trauma · Chest trauma · Head injury · Pregnancy · +11   Allergies ⚠ not recorded │
├──────────────────────────┬─────────────────────────────────────────────────┬──────────────────┤
│ DO NOW                   │ C · Circulation       Recorded 17:02 · 2 unsaved │ RECORD   All ▾   │
│ ◆ C Haemorrhage control  │ Overall picture  [Well perfused] [Compensated]  │ ── Wed 23 Sep ── │
│        [Done] [Start] ⋯  │                  [Decompensated ●] [Peri-arrest]│ T+47:02 17:06:41 │
│ ▲ B Assess B · SpO₂ 67%  │ From vitals · 3 min (auto): SBP≤90/MAP<65 ·     │ [C] Vitals HR 130│
│               [Go to B]  │   SI≥1.0 · narrow PP                            │ · BP 70/60 …     │
│ ▲ E Measure core temp    │ Key signs [Cold peripheries] [Cap refill > 2 s] │ T+46:10 …        │
│ + 3 more                 │  [Thready pulse] [Altered consciousness] …(8)   │                  │
│                          │ More signs ▸ Look 12 · Feel 14 · Results 12     │                  │
│ Protocols ▸ Anaphylaxis  │ 🔍 Search signs…                                 │                  │
│                          │ Actions for C (4)                               │                  │
│                          │  ◆ IV access ×2 + fluids   [Done] [Start] ⋯     │                  │
│                          │ [ Record C findings (3) ]  ← sticky             │                  │
└──────────────────────────┴─────────────────────────────────────────────────┴──────────────────┘
```

Phone / tablet portrait:

- One column; the header compacts to two lines.
- The step rail and vitals strip scroll horizontally.
- _Do now_ shows its top item + "N more".
- Record opens as a bottom sheet.
- A sticky bottom bar holds **Record findings** and **Record vitals**.

### 5.2 Findings: progressive disclosure

Catalog items gain presentation metadata: `tier: 'overall' | 'key' | 'more'`, `group: 'look' | 'listen' | 'feel' | 'measure' | 'results'`, `promotedBy?: ContextKey[]`, `synonyms?: string[]`, `derivedFromVitals?: BandRuleRef`. Codes, meanings and engine rules don't change. Tiering decides what is visible, so the CSO signs it at GATE A.

- **Overall picture:** the existing state-gestalt findings (e.g. C: Well perfused / Compensated shock / Decompensated shock / Peri-arrest) shown first as a distinct chip row. They stay multi-select findings with the same codes, and the engine still infers the step state. No user-chosen state is added.
- **From vitals:** read-only chips with the data's age ("3 min") and an "auto" label (5.4).
- **Key signs:** ≤ 8, plus ≤ 4 promoted by active context.
- **More signs:** a collapsed accordion by group, with counts, and search with synonyms (typing "tension" surfaces deviated trachea, unilateral absent breath sounds, hyper-resonance).
- **Selected summary** at the top of the panel, each chip removable. A selected finding is always visible, whatever its tier.
- **Recorded vs draft** in one line ("Recorded 17:02 · 2 unsaved"). This is the likely fix for P4; confirm against Q10.
- **Record button** sticky at the bottom of the findings column, with a count.
- **Difficult-airway screen:** LEMON, MOANS, RODS, physiologically difficult airway and history flags move into a collapsed section inside A. It opens by itself when an advanced-airway action becomes indicated. They stay anticipation prompts, never gates.
- **AMPLE stays stored in step E**, because the prescribing allergy check reads it there and Return to A still auto-saves the E draft. The context bar's "Allergies" chip opens the same E AMPLE editor as a drawer, and E still shows AMPLE. The prescribe dialog keeps its allergy/NKDA prompt.
- **Say it once:** remove duplicate messages only, for example:
  - the per-panel "X not yet assessed — assess X before proceeding" banner (the state chip already says it);
  - E's temperature footer (_Do now_ and the empty temperature field already say it).

  CSO-signed always-visible items (E's checklist, D's pinned "check glucose") stay, and any move is listed for GATE A.

Proposed key signs (CSO confirms; map to real codes):

- **A:** stridor · gurgling · snoring · see-saw movement · foreign body / vomit / blood · swelling of lips/tongue/face · GCS ≤ 8 · drooling / can't swallow / tripod.
  - Promoted by Trauma: facial/mouth/neck trauma. Promoted by burns: facial/neck burns, soot.
- **B:** can't complete sentences · accessory muscles · silent chest · wheeze · crackles · unilateral absent breath sounds · trachea deviated away · exhaustion → drowsiness.
  - Promoted by Chest trauma: flail, open chest wound, surgical emphysema. Promoted by Known asthma: PEF bands, normal/rising PaCO₂.
- **C:** cold peripheries · cap refill > 2 s · thready pulse · altered consciousness · obvious external haemorrhage · raised JVP · flat neck veins · oliguria.
  - Promoted by Trauma / Active bleeding: pelvic instability, long-bone deformity, abdominal distension. By Allergen trigger: urticaria/angioedema. By Pregnancy: β-hCG.
- **D:** keep the GCS pickers and the pinned glucose check first; key signs: pupils, active seizure, focal signs, meningism, posturing.
- **E:** non-blanching rash · urticaria/angioedema · external haemorrhage · mottling/pallor · pain out of proportion / crepitus · transdermal opioid patch · wound / surgical site · core temperature field.

### 5.3 Patient context, entered once

One context bar feeds every step through a pure mapping (`lib/resus/survey/context.ts`). Flags are **independent**: none implies another, so every legacy combination stays expressible for each step. The bar shows active flags first, then the most common, and the rest behind "+N".

| Patient-level flag                                             | Sets these existing per-step toggles                                                                                                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trauma                                                         | A Trauma/C-spine · C Trauma · E Trauma (log-roll)                                                                                                                                                        |
| Chest trauma                                                   | B Chest trauma                                                                                                                                                                                           |
| Spinal injury                                                  | C Spinal injury (D19: should it also set A's Trauma/C-spine?)                                                                                                                                            |
| Head injury / TBI                                              | C Head injury/TBI · D Head injury/TBI                                                                                                                                                                    |
| Active bleeding (any cause, incl. GI and obstetric)            | C Active bleeding                                                                                                                                                                                        |
| Allergen trigger                                               | A, B, C Allergen trigger                                                                                                                                                                                 |
| Pregnancy: possible                                            | C Pregnancy possible                                                                                                                                                                                     |
| Pregnancy: confirmed (+ gestation weeks) or postpartum         | C Pregnancy possible · D Pregnant/postpartum · ALS pregnancy modifier (> 20 weeks)                                                                                                                       |
| Known asthma · COPD / CO₂-retainer risk · Suspected PE         | B (each its own toggle)                                                                                                                                                                                  |
| Opioids suspected · Alcohol / malnourished · Fever + meningism | D (each its own toggle)                                                                                                                                                                                  |
| Serotonergic / neuroleptic · Environmental exposure            | E (each its own toggle)                                                                                                                                                                                  |
| Febrile child (FEAST)                                          | C Febrile child. Stays a toggle: suggested (never auto-set) when age < 16 and a recorded temperature meets the catalog's fever threshold, if one exists; can be set on history alone; never auto-cleared |

- **Step-local toggles that stay where they are:**
  - A Gag/clenched jaw; E Left exposed (re-cover!).
  - D Low RR: suggested from vitals only if Q13 finds a signed number; otherwise manual.
  - D A/B/C abnormal: also set automatically while A, B or C is Threatened or Active threat, and never cleared automatically while that holds.
- **One arrest state (D20).** A/B "No signs of life" and C/D/E "No pulse" become one patient-level arrest state.
  - It is set only through the existing `arrest.ts` multi-sign confirm (responsive? breathing normally? central pulse? yes / no / unknown). Tapping either legacy label opens that confirm.
  - It feeds all five legacy inputs exactly as today, and clears on ROSC.
  - The signed rule "apnoea with a pulse → bag-mask ventilation, not CPR" is unchanged.
- **Storage:** context is its own event kind (`context`), never an `assessment` (re-recording an assessment replaces that step's picture).

### 5.4 Vitals-derived Measure findings (the vitals floor)

- **Which codes:** `deriveMeasureFindings(vitals, annotations, catalog, patient)` returns only codes from the Q13 list, using the numbers already in their signed catalog entries. Codes with no signed number (e.g. "Wide pulse pressure", any glucose band not defined numerically) stay manual until the CSO signs a number.
- **Adults only** (age ≥ 16).
- **Fresh only:** vitals recorded in this episode within the signed window (D18; proposed 15 min). The imported triage reading (up to 24 h old) never drives derivation until re-measured.
- **Worsen only:** the displayed state = engine(recorded ∪ derived findings).
  - Derived findings can make a state worse, never better, and normal bands never produce "Clear".
  - A step nobody has assessed keeps its "not yet assessed" marker, even when vitals push its state to a threat ("Active threat · from vitals · not yet assessed"). _Do now_ then shows "Assess C".
- **Artefact:** any vital can be marked artefact, with a reason. It stays in the record and drops out of derivation, and the linked `clinical_observations` copy carries the same annotation.
- **One GCS:** reconcile GCS in vitals and the D pickers (Q9), so it is captured once and shown in both places.
- **Supplemental O₂ (device, flow):** add it to resus vitals capture if Q9 finds it missing.
- **Manual results:** labs (lactate, PaO₂, pH/PaCO₂, K⁺), ECG, ultrasound and β-hCG stay as manual codes in a collapsed **Results** group until a lab engine exists.

### 5.5 Actions and the Do-now queue

- **Action row:**
  - Title, step badge and an evidence line ("because SBP 70, MAP 63").
  - Primary **Done**; **Start** where the action has a duration; an overflow ⋯ for Failed / Defer / Not indicated.
  - States as today: indicated, in progress (existing blue token), performed, not indicated, deferred, failed.
  - "Why + source" opens on tap. Failed still shows the next-tier escalation inline. Descriptions never repeat the title.
- **Do now:** the top 3 outstanding items across steps from `action-order.ts`, plus system prompts:
  - assess a step whose vitals imply a threat;
  - engine-triggered returns (GCS ≤ 8 or falling → A; opioid → naloxone → B), with their reason;
  - stale vitals after an intervention;
  - measure core temperature; glucose missing;
  - allergies not recorded before a first drug.

  "N more" opens the full list. The polite live region announces the top item (existing).

### 5.6 Vitals strip

- **Cells:** HR · BP (SBP/DBP + MAP) · SpO₂ (+ O₂ status) · RR · Temp · Glucose · GCS/ACVPU. EtCO₂ appears once first recorded ("+ EtCO₂" before that).
- **Derived flags:** compact on the right (SI · PP · qSOFA).
- **Freshness:** the age of the set ("3 min ago") and the re-check nudge, now amber (E7). Critical values stay red (existing).
- **Layout:** tabular numerals; no layout shift.
- **Interaction:** tap a cell for the existing trend graph; the cell menu marks a value as artefact.

### 5.7 Header, team, protocols, emergency affordance

- **Header:** patient + trigger + bay, and the **T+ resus clock**. Mode clocks appear by mode (arrest, ROSC, boarding). An idle episode shows "No activity 2 d 16 h — close or continue?" instead of a runaway clock.
- **Team chip** ("Leader You · 4 responding") opens a popover with the seven roles: claim, take, or assign to someone else (wire `assignResusRoleAction`).
  - Claiming a role marks you as responding. If you hold an alert, it is acknowledged too; if you don't, you are added as a responder with no fake alert row.
  - "Acknowledged" and "responding" stay separate fields.
- **Protocols chip:** the anaphylaxis bar becomes a chip, collapsed by default, that surfaces into _Do now_ when Allergen trigger, urticaria or angioedema is recorded.
  - **In arrest it switches to "In cardiac arrest: follow ALS — adrenaline 1 mg IV" and hides the IM prompt.**
  - The adrenaline look-alike guard (1:1000 IM vs 1:10,000 IV) stays in the prescribe dialog.
- **End resus** (teal outline) is always available. Mid-arrest it opens the close-out sheet at "How did the arrest end?" (ROSC / Stop resuscitation / leaving resus with CPR ongoing, e.g. to theatre or cath lab). This is a data prompt, not a block.
- **⚠ Arrest** stays solid red and one tap. After ROSC it stays on screen as **⚠ Re-arrest** (today it hides once declared).
- **Emergency affordance:** moves from the floating button into the header at the far right, as a red-outline labelled button, so it never competes with the solid-red ⚠ Arrest. Same function; it never overlaps controls.

### 5.8 Record timeline

- **Each entry shows:** the **T+ offset** and bedside clock, step tag, glyph, label, values and who. Vitals render as "HR 130 · BP 70/60 (MAP 63) · SpO₂ 67% on O₂ · RR 20 · T 35.4 · Glu 5.0", never as field keys.
- **Navigation:** day separators; filters (All · Drugs · Actions · Vitals · Arrest · Team); newest first, as today.
- **Undo:** for 10 s after an entry (same user), via `correctResusEvent` with reason "undone".
- **Correct:** after that, from the entry menu (reason required). Superseded entries leave the active view but stay in "show history".
- **Late entries:** labelled when the bedside time differs from the entry time ("entered 17:40 for 17:05").
- **Sync state:** pending / saved / failed per entry (Section 9).

### 5.9 Arrest console (ALS mode)

Any of these declares an arrest: the header ⚠ Arrest, a "No pulse" / "No signs of life" tap, or a triage rapid-Red "no pulse / arrest". Declaring:

- runs the existing `arrest.ts` confirm;
- writes `arrest_detected` + `cpr_started` with the arrest number;
- switches the page to the console. The survey stays reachable as a "Survey (paused)" tab.

Tablet landscape (times prefixed A+ count from the start of this arrest):

```
┌─ ⚠ CARDIAC ARREST #1 · A+06:42 · Cycle 4 · Resus T+00:53:54 ───────── Leader You ▾ [Survey ▸] ─┐
│ ┌──── CYCLE ─────┐  NEXT                                                                        │
│ │ 1:12 ▕▔▔▔▔▁▁▏2:00│ ● Rhythm check in 0:48 · charge now (pre-charge acceptable)               │
│ │ Compressor:     │ ● Adrenaline window opens in 2:00 (last dose 1:00 ago)                     │
│ │ Nurse A · 1:12  │ ● Amiodarone 150 mg: eligible after shock 5                                 │
│ │ [Swap]          │ ● Refractory VF: prepare antero-posterior pads for the next check           │
│ └─────────────────┘                                                                            │
│ RHYTHM  [ VF / pVT ⚡ ] [ PEA ] [ Asystole ] [ Organised: check pulse ]                         │
│ LOG     [⚡ Shock · 150 J ▾] [Adrenaline 1 mg ▾] [Amiodarone 150 · from shock 5] [Airway ▾]     │
│         [Access ▾] [EtCO₂ __ kPa] [Other drug…] [Note]                                        │
│ CAUSES  Hypoxia ✓ · Hypovolaemia ◐ bleeding (C 17:02) · K⁺/metabolic ○ · Hypothermia ○ core?  │
│         Thrombosis ○ · Tension ◐ (B: trachea deviated) · Tamponade ○ · Toxins ○               │
│ SPECIAL none active                                                                           │
│ [ ROSC ✓ ]                                                        [ Stop resuscitation… ]      │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ Log: A+05:42 Adrenaline 1 mg IV (#1) · Amiodarone 300 mg · A+05:30 VF → ⚡150 J (#3) · … [Undo]│
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

Phone (the scribe's own phone is a first-class device on Ugandan wards):

```
┌───────────────────────────┐
│ ⚠ ARREST A+06:42 · Cyc 4  │
│ ┌──── 1:12 / 2:00 ──────┐ │
│ │ Rhythm check in 0:48  │ │
│ └───────────────────────┘ │
│ Next: adrenaline in 2:00  │
│ [VF/pVT ⚡] [PEA] [Asyst.] │
│ [Organised: pulse?]       │
│ [⚡ Shock] [Adrenaline]    │
│ [Amiodarone] [Airway] [IV]│
│ [EtCO₂] [More…]           │
│ Causes ▸ 2 suspected      │
│ [ROSC ✓]      [Stop…]     │
│ Log ▸            [Undo]   │
└───────────────────────────┘
```

Behaviour (each rule cited by ID from clinical reference Sections 3–6):

- **Clocks come from events:** arrest time, CPR time and cycle start (CPR start, or the resume after the last rhythm check/shock).
  - Due at +2:00 (signed). The "prepare" cue at +1:45 and amber overdue after +2:15 are UI defaults the CSO may adjust.
  - Timers survive reload and agree across devices.
- **Rhythm check:** tap the rhythm.
  - VF/pVT primes Shock with the bay profile's energy (no profile → "highest setting").
  - PEA/asystole restarts the cycle; a first non-shockable rhythm with no adrenaline yet puts adrenaline at the top of Next.
  - Asystole shows "check for P waves".
  - Organised asks "Pulse?" [Yes → ROSC] [No → PEA].
  - The first rhythm fills the Utstein field.
- **Shock:**
  - Logs energy (editable) and counts shocks per arrest.
  - Stacked shocks (witnessed + monitored only) count as shock 1.
  - After 3 consecutive shocks with VF persisting, the refractory-VF prompts appear.
  - The shock toast carries the oxygen ≥ 1 m reminder.
- **Adrenaline:** eligibility comes from rhythm history and shock count; the window is 3–5 min after the last dose. Modifiers can withhold or lengthen it, always with a visible reason. Route IV/IO recorded.
- **Antiarrhythmic:** shown only when eligible (≥ 3 shocks: first dose; ≥ 5: second), using the hospital setting (amiodarone default, lidocaine alternative).
- **Airway:** BVM → SGA → ETT.
  - ETT asks "sustained ETCO₂ trace confirmed?" (yes / no / capnography not available) and warns, without blocking, if not.
  - After ETT/SGA, Next says "continuous compressions, ventilate 10/min".
- **Access:** IV attempts counted; after 2 failed IV attempts, an IO prompt.
- **EtCO₂:** fast numeric entry and a sparkline. A sharp rise → "check for ROSC at the next rhythm check; don't stop compressions on this alone".
- **Compressor rotation:** uses the CPR role; prompt at each rhythm check; "Swap to…" from responders; time on chest shown.
- **Reversible causes:** eight tiles, with states per clinical reference Section 4.
  - Survey evidence pre-fills "suspected", with a link to the entry. Nothing is ever auto-"excluded".
  - Tile actions carry only verified numbers (hyper/hypokalaemic arrest); the rest record only.
- **Special modifiers** banner when active (hypothermia, pregnancy > 20 weeks, trauma, LAST, PE-after-lysis clock, toxins, asthma, dialysis). Child → numbers suppressed.
- **Fast-path drug logging (D4):**
  - Tapping a protocol drug runs the existing prescribing safety check synchronously (milliseconds).
  - **If it is clear**, one tap writes the drug event and the emergency-administration row (via the existing `recordEmergencyAdministration` path) with the signed defaults: adrenaline 1 mg IV 1:10,000; amiodarone 300/150 mg IV; lidocaine 100/50 mg IV.
  - **If it returns a block** (allergy to that drug, age < 16, look-alike concentration), the prescribe dialog opens pre-filled and the existing rule applies: an override needs a recorded reason.
  - **Controlled drugs** (e.g. sedation for CPR-induced consciousness) always use the full dialog with a witness, even in an emergency (existing signed rule).
  - A toast "Logged A+06:12 · Undo · Edit" stays for 10 s. "Other drug…" opens the full dialog.
- **Audio / haptics:**
  - A gentle tone when a rhythm check is due (on by default, one-tap mute).
  - An optional metronome at 110 /min via Web Audio, off by default (a UI default inside the signed 100–120 range).
  - Vibration on phones where supported. Audio is never the only cue.
- **Keyboard (console only; off inside text fields):** R rhythm · S shock · A adrenaline · M antiarrhythmic · O ROSC · U undo · ? help.
- **ROSC ✓** (teal) → confirm which signs were present (pulse, BP / arterial waveform, ETCO₂ rise, signs of life) → post-ROSC mode.
- **Stop resuscitation…** (neutral outline, deliberate) → termination review (5.11).

### 5.10 Post-ROSC mode

```
┌ ROSC 03:10 · sustained at 20:00 ▕▔▔▔▁▁▁▏ · Arrest #1 14:22 · 3 shocks · adrenaline ×2 ─ [⚠ Re-arrest] ┐
│ POST-ROSC BUNDLE                                                         Targets (CSO-signed) │
│ A Airway: comatose → ETT by an experienced operator + waveform capnography ☐                 │
│ B O₂ titrate to SpO₂ 94–98% once reliable ☐ · PaCO₂ 4.7–6.0 kPa ☐ · Vt 6–8 mL/kg ☐           │
│   ⓘ Pulse oximetry can overestimate in darker skin tones and low-flow states                │
│ C 12-lead ECG ☐ STEMI? → angiography ≤ 120 min / lysis if no PCI ☐ · MAP ≥ 65, SBP > 100 ☐  │
│ D Obeys commands? [Yes] [No — comatose] · glucose ☐ · seizures ☐                            │
│ E Prevent fever ≤ 37.5 °C ☐ · don't rewarm 32–36 °C · cause work-up (CT / echo) ☐           │
│ Family updated ☐                            Suggested level: ICU (L3) · comatose post-ROSC  │
│ [Continue survey (post-ROSC)]                                    [End resus → destination…] │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Bundle items:** each is done / not indicated / **not available here** (a distinct state).
- **Sustain timer:** marks sustained ROSC at 20:00 (Utstein). Re-arrest is always one tap.
- **Continue survey** returns to A–E with the post-ROSC context flag, which pins each step's post-ROSC target.
- No prognostic statement appears anywhere.

### 5.11 Termination review, confirmation of death, after-death tasks

```
Stop resuscitation?                                          Leader decision · team-based
FACTS    Arrest 32:10 · CPR 31:40 · persistent asystole 20:05 · shocks 0 · adrenaline ×7
         ETT ✓ capnography ✓ · EtCO₂ last 3: 1.2 · 1.1 · 1.0 kPa (strong marker, never alone)
CHECK    Not yet excluded: Thrombosis ○ · Toxins ○        ← review before stopping
CONTINUE none active (hypothermia · toxins/LAST · PE after lysis · shockable · intermittent ROSC)
CRITERIA ERC 2025: persistent asystole ≥ 20 min of ALS, no reversible cause → may be considered (D1)
TEAM     ☐ Team asked — no objection   ☐ Objection: ____   Senior consulted: ____ (in person / phone)
FAMILY   ( present ) ( informed ) ( not reachable )
REASONS  ☐ No response to ALS ☐ Persistent asystole ☐ Known wishes / plan ☐ Irreversible condition ☐ Other
[Cancel]                                                         [Stop resuscitation at 18:04]
```

**Confirmation of death** (clinical reference Section 9, AoMRC 2025):

1. A 5:00 observation from "CPR stopped" of: unconsciousness; apnoea (no chest movement, no breath sounds); absent circulation (no central pulse, no heart sounds). ECG asystole supports it if monitored.
2. Any return of circulatory, respiratory or neurological function → "Signs of life — resume" (back to the console or ROSC). If it stops again, a new 5:00 runs from that point.
3. After 5:00: pupils unreactive to light and no motor response to supraorbital pressure; soon after an arrest, also absent corneal reflexes.
4. **Time of death = when the clinician is satisfied all criteria are met.** The confirming clinician is recorded (who may confirm: D9/D10).

Then close-out (5.12) with outcome "Died".

The **after-death checklist** is its own record (not the episode timeline), editable for 24 h after close (D16):

- family informed; senior informed;
- reportable-death screen (configurable per D10; if reportable → "leave lines and tubes in place");
- last offices; property;
- certificate of cause of death (pending intent to the encounter record);
- mortuary;
- **immediate debrief**; staff welfare check;
- Utstein completion.

**CPR not attempted** (from the arrest confirm; secondary; reason mandatory) goes straight to confirmation of death.

### 5.12 End resus (close-out), boarding, cancel, administrative close

```
End resuscitation                                          1 Outcome  2 Destination  3 Handover  4 Sign
1  ( Stabilised ) ( ROSC — sustained ) ( ROSC — not yet sustained ) ( Died ) ( Transferred out ) ( Opened in error )
2  Suggested: ICU (L3) — post-ROSC, not obeying commands; ETT in situ         [why ▸ rules + sources]
   Also consider: Cath lab — STEMI recorded 17:21
   ● ICU — Mulago ICU        can: ventilation · vasopressors · arterial line
   ○ HDU — Medical HDU       cannot: invasive ventilation
   ○ Ward ○ Theatre ○ Cath lab ○ Labour ward ○ Transfer out ○ Discharge after observation
   Below suggestion → reason: ( No bed ) ( Ceiling of care agreed ) ( Family declined ) ( Transfer arranged ) ( Clinical judgement… )
   Bed: ( Requested ) ( Accepted by ____ ) ( Not available → start boarding )
3  SBAR draft (editable) · lines/tubes/devices · outstanding actions carried forward (3) ☑
4  Leader: You · Receiving: ____ (unit, cadre) · handover time 18:12       [End resus]  or  [Start boarding]
```

- **Reuse `concludeResus`.** It already sets concluded/cancelled, disposition and outcome; extend it with `outcome_code`, `closure_kind`, level, destination and handover.
  - **Cancel** = `concludeResus` to `cancelled`, with a reason.
  - **Administrative close** = `concludeResus` with `closure_kind = 'administrative'`: idle episodes only, in-charge/HOD, reason required. Excluded from clinical statistics; included in data-quality reports.
- **Outcomes:** **Died** routes through 5.11 first. **Opened in error** needs only a reason (state `cancelled`).
- **Suggested level** comes from `level-of-care.ts` (rules R1–R14). Choosing _below_ the suggestion needs a reason; choosing above doesn't.
- **Boarding:**
  - `setResusDisposition` records the decision without ending the episode; phase becomes `boarding`.
  - The resus clock stops and a boarding clock starts. The monitoring cadence prompt follows the NEWS2 response.
  - Vitals and actions still work.
  - **Re-activate resus** returns to the survey in the same episode.
  - **Patient left resus** records the handover and calls `concludeResus`.
- **Encounter seam:**
  - If Q2 finds the encounter engine live: create or link the encounter and write the handover as its note, carrying outstanding actions forward.
  - Otherwise: store the handover in the resus record and set `pending_encounter_handoff`.
  - **Admission request:** emit to the Q4 pending-intent seam if it exists. Build no bed management.
- A closed or cancelled episode is read-only (existing).

### 5.13 Board

Sections, top to bottom:

1. **Arrest in progress** (red tag).
2. **Active** (T+, mode, worst step state, last vitals, leader).
3. **Awaiting bed** (destination + boarding time).
4. **Needs closing** (idle, with Open / Close…).
5. **Red / L1 — open a resus** (existing).
6. **Recently ended, 24 h** (read-only outcome chips).

Keep the existing ad-hoc "open resus" footer. The board updates live via realtime (Section 9).

### 5.14 Idle handling (D14)

`last_activity_at` is kept by trigger.

- **Idle ≥ 2 h:** flagged on the board and in the header.
- **Idle ≥ 12 h:** in-app notification to the opener, current leader and ward in-charges.
- **Idle ≥ 24 h:** administrative close enabled.

**Nothing auto-closes.** The migration flags legacy episodes and alters nothing else.

---

## 6. Data model (additive; next free migration number)

**Existing values stay (from the brief):**

- episode `state`: active | concluded | cancelled;
- trigger kinds: step0_life_threat | triage_red | in_resus_deterioration;
- 14 event kinds: assessment, action, drug, fluid, procedure, vital, decision, role_change, mobilisation, reassessment, arrest_detected, cpr_started, handover, note;
- steps: pre, A–E, arrest;
- action states: indicated | in_progress | performed | not_indicated | deferred | failed;
- the seven roles.

**Adding values** depends on Q12. If these are Postgres enum types, `ALTER TYPE … ADD VALUE` can't be used in the transaction that adds the value, so split migrations. If they are text + CHECK, alter the constraint.

**`resus_episodes`.** `state` stays the lifecycle truth (cancel lives there, nowhere else). `ended_at`, free-text `outcome` and `arrest_detected_at` (= first arrest) stay for legacy readers. Add:

- `phase` (survey | arrest | post_rosc | boarding), meaningful only while active;
- `last_activity_at`; `current_arrest_seq` (int, default 0);
- `outcome_code` (stabilised | rosc_sustained | rosc_not_sustained | died_after_cpr | died_cpr_not_attempted | transferred_out), set only on concluded;
- `closure_kind` (bedside | administrative), set only on concluded; `closed_by`;
- `disposition_decided_at`; `suggested_level` / `chosen_level` (ward | l1 | l2 | l3); `level_mismatch_code` (no_bed | ceiling_of_care | family_declined | transfer_arranged | clinical_judgement);
- `destination_unit_id` (nullable FK); `death_confirmed_at`; `pending_encounter_handoff`.

Disposition: confirm the existing codes at Q12 (the brief lists theatre, ICU, cath lab, ward, mortuary, transferred, deceased), then add hdu, labour_ward and discharged. v2 records a death as `outcome_code` + disposition mortuary; `deceased` stays readable.

**`resus_timeline_events`.**

- Add kinds `context`, `rhythm_check`, `shock`, `rosc`, `resuscitation_stopped` and `death_confirmed`.
- Reuse `arrest_detected` and `cpr_started` for each arrest. Reuse `drug`, `procedure`, `decision`, `note` and `handover` with typed payloads (Zod discriminated unions): disposition, closure and treatment limitation → `decision`; vital annotation → `note`.
- Add step `post`; `arrest_seq` (nullable int); `client_event_id` (uuid) with unique `(episode_id, client_event_id)`; `late_entry` (bool).

**New tables** (RLS on each; writes only through audited server actions via the service role, like today):

- **`hospital_care_units`**, only if Q3 finds no existing model (otherwise extend that one):
  - fields: hospital, name, `unit_type` (ward, hdu, icu, theatre, cath_lab, labour_ward, paeds_ward, picu, nicu, ed_obs), age group, active;
  - capability booleans: continuous_ecg, arterial_line, vasopressors, niv_cpap, invasive_ventilation, rrt;
  - seed Test Hospital-1 and Mulago; superadmin-only writes (the admin UI belongs to the future departments/wards feature).
- **`resus_bay_profiles`:**
  - hospital, bay, model;
  - defibrillator waveform (monophasic · biphasic truncated exponential · rectilinear biphasic · pulsed biphasic · unknown);
  - `energy_sequence_j int[]` (nullable; entered by biomedical engineering, CSO-approved);
  - capnography, ultrasound, mechanical CPR, ECPR (default false);
  - verified by/at.
- **`hospital_resus_settings`:** antiarrhythmic (amiodarone | lidocaine), idle thresholds, audio defaults. No clinical constants here; those live in signed reference files.
- **`resus_arrest_records`:** immutable Utstein snapshot per arrest, inserted once at close. A trigger rejects UPDATE/DELETE; corrections insert a superseding row.
- **`resus_debriefs`:**
  - episode, facilitator, attendee count;
  - structured fields: went well, to improve, actions, equipment issues, welfare check;
  - draft → submitted, immutable after submit; editable up to 24 h after close (D16).
- **`resus_after_death_tasks`:** one row per task per episode, append-only history, editable up to 24 h after close (D16).

**Triggers:** AFTER INSERT on events updates `last_activity_at` and sends the realtime broadcast (Section 9). Append-only triggers on the immutable tables.

**Legacy backfill:** `last_activity_at = max(created_at)`; `phase` from the timeline projection; nothing else altered.

---

## 7. Engines (pure functions in `lib/resus/**`, no I/O)

| Module                                                                                               | Responsibility                                                                                                                                                                                                                                                                      | Tests (min)           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `survey/context.ts`                                                                                  | patient flags + arrest state → exact legacy per-step toggles; derived D toggles                                                                                                                                                                                                     | 30                    |
| `survey/vitals-bands.ts`                                                                             | fresh adult vitals → Q13 Measure codes; artefacts excluded; age of data reported                                                                                                                                                                                                    | 30 (each boundary ±1) |
| `survey/floor.ts`                                                                                    | state = engine(recorded ∪ derived); worsen-only; unassessed never Clear                                                                                                                                                                                                             | 15                    |
| `survey/disclosure.ts`                                                                               | overall / key / promoted / more; selected always visible                                                                                                                                                                                                                            | 15                    |
| `survey/do-now.ts`                                                                                   | cross-step top 3 + system prompts + engine-triggered returns, via `action-order.ts`                                                                                                                                                                                                 | 15                    |
| `als/engine.ts` (+ `timing.ts`, `eligibility.ts`, `modifiers.ts`, `reversible-causes.ts`, `rosc.ts`) | `computeArrestState(events, correctedNow, ctx)` → arrest seq, cycles and due times, rhythm history, shocks, adrenaline window or withhold reason, antiarrhythmic eligibility, refractory VF, airway/access, EtCO₂ trend, modifiers, cause tiles, prompts, ROSC/sustained, durations | 90                    |
| `als/termination.ts`                                                                                 | review facts, continue-flags, criterion display (signed threshold); never a directive                                                                                                                                                                                               | 15                    |
| `death/confirmation.ts`                                                                              | 5-min observation machine; restarts on any returned function                                                                                                                                                                                                                        | 10                    |
| `closeout/lifecycle.ts`                                                                              | allowed transitions on top of `state`; cancel from any phase with reason; admin close only when idle                                                                                                                                                                                | 20                    |
| `closeout/level-of-care.ts`                                                                          | R1–R14 → level, reasons (rule ID + source), extra destinations, required capabilities, unit matching                                                                                                                                                                                | 40                    |
| `closeout/handover.ts`                                                                               | deterministic SBAR draft                                                                                                                                                                                                                                                            | 15 (snapshots)        |
| `closeout/idle.ts`                                                                                   | idle classes                                                                                                                                                                                                                                                                        | 8                     |
| `utstein/project.ts`                                                                                 | arrest-record projection                                                                                                                                                                                                                                                            | 15                    |
| `debrief/metrics.ts`                                                                                 | time to first shock / adrenaline, interval adherence, etc.                                                                                                                                                                                                                          | 12                    |

Reference files: `reference/als-catalog.ts`, `post-rosc-catalog.ts`, `levels-of-care.ts`, `death-confirmation.ts`. Every entry: `{ id, text, value?, unit?, source, url, verifiedOn, confidence, status }`.

### 7.1 Equivalence suites (prove Law 4)

1. All 332 existing tests stay green, unchanged.
2. **Per-step expressibility:** for every existing step fixture, some v2 input (patient flags + arrest state + local toggles) reproduces that step's legacy inputs exactly, and the engine output is identical.
3. **Co-variance list:** toggles that now move together (D19) are enumerated in the test file and must match the signed list.
4. **Worsen-only:** adding derived findings never produces a better state than without them.
5. **Pending stays Pending:** normal derived bands never change an unassessed step's marker or produce "Clear".
6. **Children:** derivation returns nothing for age < 16.

---

## 8. Server actions

**Contract for every write:**

- `'use server'`; Zod input with optional `clientEventId` and bedside `recordedAt`.
- AAL2, scope and cadre checks.
- **One transaction** (event(s) + header update), plus an audit row.
- Returns `{ eventId, serverTime }`. A duplicate `clientEventId` returns the existing row (idempotent).
- Notification failures never throw.

**Extend (backwards compatible) with `clientEventId` + `recordedAt`:** `logResusEvent`, `logResusVitals`, the per-step `record{Airway…Exposure}Findings` and `set{…}ActionState`, `recordResusReturnToA`, `recordResusAllergies`, `recordEmergencyAdministration`, `claimResusRoleAction`, `acknowledgeResusAlertAction`, `assignResusRoleAction`.

**Extend behaviour:**

- `concludeResus`: outcome code, closure kind, level, destination, handover, cancel, admin close.
- `correctResusEvent`: also serves undo.
- `detectResusArrestAction`: arrest seq, re-arrest, arrest call.
- `claimResusRoleAction`: marks the claimer as responding.
- `openResusFromTriage` / `openResusFromIntake`: rapid-Red no-pulse opens in arrest mode.

**New:**

- `setResusContext`, `annotateVital`.
- `recordRhythmCheck`, `recordShock`, `recordArrestDrug` (fast path; writes the drug event + emergency-administration row through the existing path), `recordArrestProcedure`, `setReversibleCause`, `recordCompressorSwap`, `recordRosc`.
- `stopResuscitation`, `confirmDeath`, `recordCprNotAttempted`, `recordTreatmentLimitation`.
- `setResusDisposition`, `startBoarding`, `reactivateResus`.
- `recordAfterDeathTask`, `submitDebrief`.

---

## 9. Sync, clocks, offline

- **Optimistic queue** (the repo's existing state approach; no new dependency):
  - entries render at once as _pending_;
  - retry with backoff (cap 10 s) while online; pause offline; flush in order on reconnect;
  - a `beforeunload` guard while anything is pending;
  - an amber banner "Offline — N entries waiting".

  Until realtime lands, keep the existing server re-read after writes.

- **Persistence across tab close:** E1 (in-memory by default; encrypted IndexedDB only if the CSO accepts the DPPA trade-off).
- **Server clock:**
  - fetch server time on load and every 5 min; take the offset from the round-trip midpoint;
  - `recordedAt = Date.now() + offset`; warn if |offset| > 30 s;
  - timers compute from events + corrected now;
  - only leaf clock components tick (`useNow`), never the whole desk.
- **Realtime (E2):** Supabase **Broadcast from the database** on **private channels**.
  - Every write goes through the service role, so an AFTER INSERT trigger sees every event. It sends `{ eventId, kind, recordedAt }` to topic `resus:<episodeId>`; episode changes send `{ episodeId, state, phase }` to `resus-board:<hospitalId>`.
  - RLS on `realtime.messages` limits listening to active clinical staff of that hospital.
  - **Payloads carry no PHI**; clients fetch the delta through a scoped, audited server action.
  - If Q6 shows the browser can't subscribe, fall back to polling every 10 s.
  - Check function names and setup against the current Supabase docs at build time, not memory:
    - https://supabase.com/docs/guides/realtime/broadcast
    - https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
    - https://supabase.com/docs/guides/realtime/getting_started

---

## 10. Notifications

- **Arrest call:** reuse `mobilise.ts`, which today writes `sa_notifications` rows of kind `clinical_resus_mobilisation`.
  - Add kind `clinical_resus_arrest_call`.
  - Subject "CARDIAC ARREST — <bay/department>", with no patient name (new rule).
  - Recipients: the mobilisation list plus critical care/anaesthesia if configured; one call per arrest.
  - SMS/push stay stubbed.
- **Idle:** kind `clinical_resus_idle` at 12 h, to the opener, the leader and ward in-charges.

---

## 11. Accessibility, motion, colour

- WCAG 2.2 AA in light and dark. Touch targets ≥ 44×44 px; console primary controls ≥ 56 px (gloves).
- Never colour alone: every state has a word and an icon.
- Live regions: polite for _Do now_; assertive only for "arrest declared" and "rhythm check due" (rate-limited).
- Focus moves to the console heading on mode switch, and back on exit.
- Reduced motion: no pulsing ring, stepwise progress, no animated entries.
- **Colour roles:**
  - red per Law 5; amber for due, overdue, stale, offline and threat;
  - teal for actions and done; grey for pending; the existing blue "In progress" token;
  - current step: a teal focus ring today, with a dashed teal outline on the next step (brief). E6 decides whether the current step moves to the place colour (plum, ADR 0097). Keyboard focus-visible stays teal.
- Headings weight 500. No left-edge accent bars.

---

## 12. Performance budgets

Tap-to-visible p95 < 100 ms · mode switch < 150 ms · cross-device timer drift ≤ 1 s · engine recompute for 500 events < 8 ms at 4× CPU throttle · zero layout shift on clock ticks · added JS on the desk route ≤ 60 KB gzipped (report the number).

---

## 13. Security, privacy, audit

- **Access and writes:** AAL2; hospital scope; reception blocked; writes only via the service role in audited actions.
- **Data exposure:** narrative encrypted; realtime payloads PHI-free; notifications carry location, not names; every write and reveal audited.
- **Utstein and debrief data** are identifiable inside the hospital only. Any export is aggregate and de-identified, and sharing with MoH waits for the DPA/MoU (legal placeholder).
- If the server client still reads a legacy `service_role` key, **flag it**: Supabase is replacing the `anon`/`service_role` keys with publishable/secret keys by the end of 2026.

---

## 14. Numbers to report at the final STOP

| Metric                                                 | Baseline    | Target    | Result |
| ------------------------------------------------------ | ----------- | --------- | ------ |
| Finding chips visible on load per step (A/B/C/D/E)     | P0          | ≤ 12      |        |
| Interactive elements in a step's findings area on load | P0          | ≤ 22      |        |
| Controls per action row                                | 5           | ≤ 3       |        |
| Taps per arrest event                                  | —           | 1         |        |
| Tap-to-visible p95                                     | P0          | < 100 ms  |        |
| Timer drift across devices                             | —           | ≤ 1 s     |        |
| Tests: existing / new / equivalence                    | 332 / – / – | all green |        |
| Rule IDs without a test                                | —           | 0         |        |
| RLS probes passed                                      | —           | 100%      |        |
| axe serious/critical                                   | P0          | 0         |        |
| Legacy episodes flagged idle / closed administratively | —           | report    |        |

---

## 15. ADRs (next free numbers; check whether 0097 exists first)

- Focus UI and progressive disclosure.
- Patient context, one arrest state and vitals-derived findings.
- ALS arrest engine and console (incl. fast-path drug logging).
- Post-ROSC mode.
- Termination and confirmation of death.
- Episode lifecycle v2 (boarding, close-out, idle, administrative close).
- Level-of-care recommender and capability-aware disposition.
- Realtime sync and optimistic queue.
- Utstein arrest records and debrief.

---

## 16. Out of scope (leave clean seams)

- **Deliberately unbuilt clinical areas:** peri-arrest arrhythmia algorithms (tachy/brady; unbuilt by design per the brief); the ECLS/ECPR pathway (capability flag only); neuroprognostication; organ donation.
- **Other modules:** inpatient admission and bed management UI; pharmacy reconciliation; paediatric PLS numbers.
- **Tooling:** procedural tooling (RSI checklist, chest drain, pericardiocentesis, thoracotomy); a real SMS/push gateway; hospital-admin UI for care units and bay profiles (seed + superadmin only); voice logging and defibrillator data integration.

---

## 17. Engineering decisions for GATE A (with recommendations)

| #   | Decision                      | Recommendation                                                                                                                    |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Offline persistence           | In-memory queue + unload guard now; encrypted IndexedDB only with CSO sign-off on the DPPA trade-off                              |
| E2  | Realtime transport            | Broadcast from database, private channels, PHI-free payloads; polling fallback                                                    |
| E3  | Event kinds                   | Explicit kinds for Utstein-critical events and for context (so it never overwrites a step's picture); typed payloads for the rest |
| E4  | Where phase lives             | Stored `phase` written in the same transaction, plus a projection-consistency test                                                |
| E5  | Care-unit model               | Reuse any existing wards model; else minimal `hospital_care_units`                                                                |
| E6  | Current-step marker           | Move to the place colour (plum) if ADR 0097 and `DESIGN-medsync.md` confirm; else keep the teal ring                              |
| E7  | Stale-vitals "Re-check" nudge | Amber (stale is caution, not emergency); critical vital cells stay red                                                            |

---

## 18. Definition of Done

- [ ] P1–P14 resolved, or deferred with a reason.
- [ ] RLS tests for all resus tables (old and new) green, including client-write denial; append-only proven; realtime authorisation proven.
- [ ] All six equivalence suites green; the 332 existing tests unchanged and green.
- [ ] Every clinical number traced to a signed reference entry; no v2 `pending_cso` entry reachable with the flag on; pre-existing pending items listed.
- [ ] Budgets met (Section 14); P3 and P4 regression tests green.
- [ ] S0–S11 pass on phone and tablet viewports.
- [ ] A resus can always be ended, cancelled, boarded, re-activated or administratively closed; nothing auto-closes; closed episodes are read-only.
- [ ] Anaphylaxis IM prompt suppressed during arrest (test); look-alike guard intact (test).
- [ ] Controlled-drug witness rule and override-reason rule intact on the fast path (tests).
- [ ] Red-scarcity tests extended and green; axe clean; reduced motion honoured.
- [ ] ADRs written; final report with numbers; reviewable diff on `feat/resus-desk-v2`.

---

## 19. Parallel reminders (flag if touched)

- The CSO signs D1–D20 and E1–E7 before Phase 2.
- ALS doses and energies ship only from the signed catalog. The clinical reference numbers were verified and independently re-checked on 23 Sep 2026; re-verify them at Phase 1.
- Uganda legal points (who confirms death, certification, reportable deaths) stay placeholders until legal review (D10).
- Formulary realities (amiodarone vs lidocaine; calcium chloride vs gluconate) are hospital settings or pending CSO verification, never guesses.
- The monitoring, notifications and encounter engines are still Tier 3 work (the roadmap has Encounter/EMR next). Use their seams here; don't build them.
