# PROMPT: Pharmacy Phase 0 — the front door (pharmacy access, landing, workspace shell, read-only queue, emergency doses, the limits notice)

> **For Claude Code.** Work at the repo root on a new branch `feat/pharmacy-front-door`, cut from `main` **after** the access step of `feat/lab-front-door` (lab Phase 0) has merged. If it has not merged, **STOP at Step 0**: this slice reuses its permission model, landing resolver, navigation registry, notice and flag. First copy this prompt into `docs/pharmacy/phase-0/`.
>
> **Mode:** gated. Six steps (0–5), each ending in a **STOP**. They are called steps because "Phase 0" already names this slice of the pharmacy roadmap.
>
> - Documents use Stage 1: draft → critique against the checklist → revise (max two passes) → present → STOP.
> - Code uses Stage 2: build → run the real checks → fix → re-run until green → report numbers → STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing is built.** Section 3 lists what earlier reads claimed. Treat every line as a claim to verify. Build what Step 0 proves is missing; reuse what it proves exists.
>
> **The CSO is Fadhul.** Four things here need his signature at GATE A:
>
> - who gets pharmacy access, and the rule that a technician is never called a pharmacist (D-PH0-02, D-PH0-03);
> - what pharmacy staff may read from a patient's record (D-PH0-05, D-PH0-06);
> - the wording of the notice that says what the pharmacy is not doing (D-PH0-07);
> - how a prescription awaiting co-signature, cancelled, or changed since printing is shown (D-PH0-10, D-PH0-11).

---

## 0. What we are building, in one paragraph

A pharmacist or pharmacy technician can sign up to MedSync today and lands on the availability page. There is no pharmacy route, nothing links to one, and approving a pharmacy cadre grants no pharmacy access. Every prescription the Encounter Plan writes for a discharged or outpatient reaches the pharmacy only as paper. This slice opens the front door and nothing more. It settles **who may see prescriptions in the pharmacy**, grants that access **automatically and audited** when a hospital admin approves a pharmacy professional, **lands pharmacy staff on `/pharmacy`** at sign-in, gives the pharmacy a **workspace shell**, shows **every prescription written today in one read-only queue** with the checks the prescriber answered, lists **emergency doses by cart**, and makes every pharmacy screen **say plainly what MedSync is not doing**. It adds **no clinical write path**. Prescribing, the stock answer the prescriber sees, the administration record and printing stay exactly as they are.

**Done when:** every approved pharmacy professional lands on `/pharmacy` at sign-in, every access grant leaves an audit row, and every prescription written today appears in exactly one queue row.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, over the roadmap and over the design canvas. Report every disagreement at STOP 0.
2. **The plan this slice comes from:** the _MedSync Pharmacy Roadmap_, as republished on 10 Oct 2026, "Phase 0: Open the front door" and "The floor: seven conditions" (https://claude.ai/artifact/WfJbaaKpAKVdYvu1Tmpxkn).
3. **The UI reference:** the design canvas _Pharmacy UI Preview_ (https://claude.ai/artifact/QWr8hAaEyDhmEdiCbYUBTT).
   - Artboards **0.1 Queue, read-only**, **0.2 Prescription, read-only**, **0.3 Emergency doses by cart** and **0.4 Hospital admin: dispensing points** are this slice.
   - Artboards 1.1 onward preview later phases. **Build nothing from them.**
   - The canvas is drawn in MedSync Chroma. Build with the design system in force on this branch (Law 14).
   - Every patient, medicine, strength, count and time on the canvas is an example. The canvas shows directions as `[placeholders]` because no unsigned dose may appear in a design. The product shows each dose **exactly as the prescriber wrote it** (Law 5).
   - Where this prompt and the canvas differ, this prompt wins. Known differences are in 5.11.
4. **Design and decisions:** `DESIGN-medsync.md` (authoritative), ADR 0097 (plum = place), ADR 0052 (prescriptions and emergency administrations), ADR 0190 (the pharmacy availability seam), and the lab Phase 0 ADRs (access model, landing resolver, the "says what it is not doing" notice).
5. **Prompts this builds on** (read the copies under `docs/`):
   - `PROMPT-LAB-PHASE-0.md`: the permission model (6.1), `resolveLanding` (6.2), the navigation registry (6.5), the notice and its signed-wording rule (5.6, CF-3), the per-hospital flag;
   - `PROMPT-HOSPITAL-SERVICES-HUB.md` §5.3 (departments, units, heads), §5.7 section [06] Pharmacy, Appendix A.1 and A.7 (`pharmacy_dispensing_points`, `pharmacy_24h`), CAP-3 (derived capabilities);
   - `PROMPT-ONBOARDING-V2.md` Appendix B (profession → council, cadre, role) and §5.9 (staff approval);
   - `PROMPT-DOCTOR-WORKSPACE-UNIFIED.md` §5.6 and §5.7 (the shared page header, the registry pattern);
   - `PROMPT-RESUS-DESK-V2.md` decision D4 and `recordEmergencyAdministration` (controlled drugs always carry a witness);
   - the Encounter Plan guide for clerking step 10 (https://claude.ai/artifact/X8toWLjPX8G5jgHn8jcWoD), for the prescription states and the checks at prescribing.
6. **Code:** `app/(auth)/sign-in/**`, the staff approval and `assign-role` functions, the role and permission model (as lab Phase 0 left it), `lib/auth/landing.ts`, `lib/lab/access.ts` and `lib/lab/nav.ts` (to reuse or generalise), `lib/prescribing/**`, the prescription tables and their RLS, `emergency_administrations`, `crash_carts`, the print actions for prescriptions, the identity module and its reveal logging, the hub's department and unit tables, the feature-flag module, `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** This slice is access plus read surfaces over the existing prescribing engine. If Step 0 finds that engine missing or unable to answer Section 6, **STOP and report**. Do not build prescribing, dispensing or stock here.
2. **No clinical write.** Nothing under `/pharmacy` writes to a prescription, an order, an administration, a chart or a stock figure. The only writes in this slice are access grants, audit rows, read logs, and the hub's dispensing-point units. A test enumerates every action reachable from `/pharmacy` and proves it.
3. **Least privilege, granted once, audited always.** A pharmacy permission is granted only inside an audited server-side function, in the same transaction as the approval that justifies it. Never from the client. Every grant and revocation writes an audit row. A non-pharmacy cadre never receives a pharmacy permission.
4. **A technician is never called a pharmacist.** "Pharmacist" on any screen, export or audit line names only a person approved in the Pharmacist cadre. Everywhere else the cadre's own name is shown. No role name is ever shown to a user as a title.
5. **As written.** A dose, route, frequency, duration or instruction is displayed exactly as stored, character for character. The pharmacy never reformats, converts, rounds, recomputes or completes one. A changed pre-set dose shows the original struck through, as the Encounter Plan does.
6. **No second check engine.** The pharmacy shows the outcome of each prescribing check as it was stored at prescribing. It never re-runs a check and never shows a check result that was not stored.
7. **Nothing disappears.** Every prescription written in the chosen period appears in the list, including cancelled ones. Filters hide rows; they never drop them. The "All" count is always visible.
8. **No remembered numbers.** No dose, limit, level or count in code, seeds or copy. Counts on screen come from real rows. Test fixtures use invented medicines and doses, named as fixtures.
9. **Honest time.** Every elapsed time is computed against the server clock.
10. **Red is a safety property.** This slice adds **no red**. Cautions are **amber**, with an icon and a word. States are neutral chips with words. Nothing is green. Extend the red-scarcity invariant tests to every `/pharmacy` route.
11. **Two identifiers on every row.** Follow the existing identity module and its reveal logging. No PHI in tooltips, aria-labels beyond what the row shows, URLs, logs or analytics.
12. **Informs, never blocks.** Chips, order and the notice inform. Nothing in this slice prevents a clinician prescribing or a pharmacist dispensing from the signed paper.
13. **Say what the system is not doing.** While MedSync records no dispensing, checks no interactions and holds few signed dose references, every pharmacy screen that shows a prescription says so, in signed wording, and the notice cannot be dismissed.
14. **Behind a flag, stack as found.** `pharmacyWorkspace`, per hospital, off by default. With it off, sign-in and `/clinician` behave exactly as today and `/pharmacy` returns the standard not-found page. Use the ORM, package manager, flag mechanism and design tokens already on the branch. TypeScript strict, no `any`. Zod on every action. AAL2 for clinical roles, which includes pharmacy staff. No new dependencies without stopping to flag. A clean clone must still run with Node 22 + pnpm. **Tokens only, no hex.** Chroma arrives through its own branch; do not import it here.
15. en-GB throughout. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it.

---

## 3. What earlier reads claimed (verify every line at Step 0)

Lines marked **(June)** were read directly from a clone at `4fbab0c`, 3 June 2026. That clone is four months behind `main`, so they describe a starting point and may be out of date. The rest come from the Role Map, the Workspace Coverage review (`origin/main` 4087e4c) and the Encounter Plan guide, all dated 10 Oct 2026.

| #   | Claim                                                                                                                                                                                                                                                                                                                                  | Where                                                    | Severity                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------- |
| P1  | `user_roles` allows `pharmacist`, and the role requires MFA                                                                                                                                                                                                                                                                            | `db/schema/user-roles.ts`, `lib/auth.ts`                 | Access                           |
| P2  | Pharmacist and Pharmacy technician can be chosen at sign-up. The profession map places both under the Pharmacy Board of Uganda                                                                                                                                                                                                         | `lib/onboarding/profession.ts`, onboarding v2 Appendix B | Access, **regulatory**           |
| P3  | Sign-in sends both cadres to `/clinician`, the availability page                                                                                                                                                                                                                                                                       | `app/(auth)/sign-in/landing.ts`                          | Access                           |
| P4  | No `/pharmacy` route exists, and nothing links to one                                                                                                                                                                                                                                                                                  | `app/`                                                   | Access                           |
| P5  | Approving a pharmacy cadre grants nothing. `assign-role` accepts `pharmacist` **(June)**                                                                                                                                                                                                                                               | approval function, `assign-role`                         | Access, governance               |
| P6  | `PharmacyAvailability` always returns `not_linked`, so the prescribing dialog shows "Pharmacy not linked yet"                                                                                                                                                                                                                          | `lib/prescribing/pharmacy.ts`, ADR 0190                  | Context: unchanged in this slice |
| P7  | `prescriptions` is the shared anchor. **(June)** it was one row per medicine: `dose` as text, `route`, `indication`, `controlled`, `is_emergency` defaulting to true, and states `active`, `administered`, `completed`, `cancelled`. It had no frequency, duration or quantity, and nothing grouped rows into one printed prescription | migration 0039, ADR 0052                                 | **Shape of the queue**           |
| P8  | The Encounter Plan now shows **In basket**, **Prescribed** and **Awaiting co-sign**, places a basket all-or-nothing, and stores each check's answer and override reason beside the prescription                                                                                                                                        | Encounter Plan guide                                     | Shape of the queue               |
| P9  | The doctor prints prescriptions. Discharge and outpatient prescriptions reach the pharmacy only on paper                                                                                                                                                                                                                               | doctor workspace                                         | **The gap**                      |
| P10 | `emergency_administrations` is append-only: medicine, dose, amount, cart, giver, witness for controlled drugs, time. **(June)** `crash_carts` and `crash_cart_stock` (`on_hand`, `par_level`, `expires_at`) existed as "notional inventory", readable by any approved staff member of the hospital                                     | migration 0039                                           | Emergency doses page             |
| P11 | Only three emergency entries carry a signed dose (glucose 10%, glucagon, crystalloid bolus). Drug interactions are not checked                                                                                                                                                                                                         | Encounter Plan guide                                     | **The notice**                   |
| P12 | Lab Phase 0 is on `feat/lab-front-door`, stopped at STOP 0 on 10 Oct 2026. Its permission model, `resolveLanding`, navigation registry, notice and flag are not on `main`                                                                                                                                                              | lab Phase 0                                              | **Dependency**                   |
| P13 | The services hub lists Pharmacy as a support department and holds `pharmacy_dispensing_points` and `pharmacy_24h` as typed capability keys. Whether the hub is built is unknown                                                                                                                                                        | hub prompt A.1, A.7                                      | Dispensing points                |
| P14 | The nurse records doses at `/nurse/mar`; the patient tracks medicines at `/patient/track/medications`                                                                                                                                                                                                                                  | Role Map                                                 | Context: untouched               |
| P15 | Two contradictions carried from the handoff: dental officers are counted among doctor cadres by the Role Map and land on the availability page by the Coverage review; imaging is orderable from the encounter by the Coverage review and not an order type on the plan step by the guide                                              | the handoff                                              | Report only                      |

---

## 4. Design direction

**Six rules**

1. **Land where you work.** A pharmacy professional signs in and sees the queue.
2. **The paper is still the prescription.** Until MedSync records a supply, the signed paper authorises it. The screen helps you read and check that paper; it says so.
3. **The checks travel with the prescription.** Show what the prescriber was warned about and what they answered, first.
4. **Mark what makes the paper wrong.** Not yet co-signed, cancelled, changed since it was printed: each in words, never colour alone.
5. **Say what the system is not doing** (Law 13).
6. **Navigation shows only what exists.** Two items. No "SOON" items.

**Budgets** (measured at Step 0, met by Step 5)

- Navigations between a successful sign-in and the queue: **0**.
- Sidebar items in this slice: **2**.
- Visible controls per queue row: **1**.
- Lane or state switch: **< 100 ms** p95, with no refetch.
- From typing a prescription number to seeing that prescription: **≤ 2** interactions.
- Pharmacy staff who must be told the URL: **0**.
- Clinical write actions added: **0**.

---

## 5. Interface specification

### 5.1 Landing and access

- A user whose only staff workspace is the pharmacy lands on `/pharmacy` after sign-in and AAL2.
- A valid deep link (`next`) inside the allowed paths wins over the default landing.
- A pharmacy-only user who reaches `/clinician` is redirected to `/pharmacy` (307, while the flag exists).
- A user without `pharmacy.view` who requests `/pharmacy` gets the standard not-authorised page.
- A pharmacy applicant who is not yet approved sees the pending page, as today.

### 5.2 The workspace shell

- **Sidebar, two items:** **Queue** · **Emergency doses**. Each shows a neutral count: prescriptions written today under "All", and emergency doses in the last 7 days.
- Above them, **Find a prescription** (5.7).
- Items come from the navigation registry (6.5). Later phases register Open lines, Supplied today, Stock, Controlled drugs and Downtime entry. Until an item's page exists, it is not rendered.
- **Active item** uses the place colour of the design system in force (plum, ADR 0097). If Chroma tokens are present on the branch, use the pharmacy hue's tint, edge and text tokens (grape). Never a left-edge bar.
- **Page header:** reuse the shared page header component: eyebrow (hospital · Pharmacy), H1, right-hand slot.
- **Top-right:** the viewer's cadre and dispensing point ("Pharmacy technician · Outpatient pharmacy"). The cadre is the approved cadre's name (Law 4). With no dispensing point: the cadre alone.

### 5.3 The queue (artboard 0.1)

```
┌───────────────┬────────────────────────────────────────────────────────────────────────────────────────┐
│ TEST HOSP-1   │ Pharmacy / Queue                                    Pharmacist · Outpatient pharmacy   │
│ ⌕ Find a      ├────────────────────────────────────────────────────────────────────────────────────────┤
│   prescription│ Prescriptions written today                                 Updated 10:42  [Refresh]   │
│ PHARMACY      │ ▲ MedSync does not record dispensing yet. Dispense from the signed prescription as     │
│ ▣ Queue     21│   you do today. MedSync does not check drug interactions at this hospital, and 3 of    │
│ ∿ Emergency   │   the 212 medicines on its list have a signed dose reference. Check each prescription  │
│   doses      7│   yourself.                                                                            │
│               │ [For the window 9][On the wards 12][All 21]    [All states][Prescribed 7][Awaiting 2]  │
│               │                                          [All wards and clinics ▾]  [Today ▾]          │
│               ├─────────────────┬──────────────────┬───────────────┬──────────────┬──────────┬─────────┤
│               │ Patient         │ Medicines        │ From          │ State        │ Checks   │ Written │
│               ├─────────────────┼──────────────────┼───────────────┼──────────────┼──────────┼─────────┤
│               │ Patient Nine-9  │ Metformin,       │ Diabetes      │ Prescribed   │ ▲ 1 stop │ 09:52 · │
│               │ MS-2026-00009   │ Amlodipine,      │ clinic · MO   │              │ overrid. │ 50 min  │ [Open]
│               │                 │ Amoxicillin      │               │              │          │         │
│               │ Patient Four-4  │ Amoxicillin      │ Outpatients · │ ▲ Awaiting   │ Child    │ 10:05 · │
│               │ MS-2026-00021   │                  │ CO            │   co-sign    │ under 16 │ 37 min  │ [Open]
│               ├─────────────────┴──────────────────┴───────────────┴──────────────┴──────────┴─────────┤
│               │ 9 of 21 prescriptions written today, for the window. Oldest first. This list is        │
│               │ read-only: a prescription stays here until the end of the day.                         │
└───────────────┴────────────────────────────────────────────────────────────────────────────────────────┘
```

- **One row is one prescription**: the unit the prescriber placed and the patient carries (PQ-1).
- **Lane tabs.** For the window · On the wards · All (PQ-3). Each carries its count. Counts are computed before the lane filter, so they always add up to "All". The default lane follows the viewer's dispensing point (DP-4); with none, "All".
- **State filter.** All states · Prescribed · Awaiting co-sign · Cancelled. Counts are within the current lane.
- **Ward or clinic filter.** Where the prescription was written.
- **Period.** Today (hospital-local) · Yesterday · Last 7 days.
- **Columns.** Patient (two identifiers) · Medicines · From (ward or clinic, and the prescriber's cadre) · State · Checks at prescribing · Written (clock time and elapsed) · one control: **Open**.
- **Medicines cell.** Names in the order written, as stored. More than three: the first two, then "+n".
- **State cell.**

| Stored state                          | The cell shows                                    |
| ------------------------------------- | ------------------------------------------------- |
| Prescribed                            | neutral chip `Prescribed`                         |
| Awaiting co-sign                      | amber chip with a clock icon: `Awaiting co-sign`  |
| Cancelled                             | amber chip with an icon: `Cancelled 10:20`        |
| Any line changed after the last print | amber chip added: `Changed since printing` (PQ-7) |
| Any other state Step 0 finds          | its own words, neutral, after GATE A names them   |

- **Checks cell.** Built only from stored outcomes (Law 6), most serious first, at most two chips and then "+n":

| Stored outcome                      | Chip                                     |
| ----------------------------------- | ---------------------------------------- |
| A stop the prescriber overrode      | amber, with an icon: `1 stop overridden` |
| A controlled drug                   | neutral: `Controlled drug, witnessed`    |
| The child-under-16 check fired      | neutral: `Child under 16`                |
| A renal check was answered          | neutral: `Renal check answered`          |
| A dose typed with no signed regimen | neutral: `Typed dose`                    |
| Nothing stored                      | muted text: `No flags`                   |

- **Order of rows:** oldest first within the period. The viewer may re-sort by any column; the default returns on reload.
- **Refresh.** A Refresh button and an "Updated hh:mm" stamp. Elapsed cells tick every 30 seconds from the server time, pause while the tab is hidden, and never trigger a fetch. No realtime in this slice.
- **URL state.** `?lane=&state=&from=&period=&sort=`. Ids only, never names. Back, forward and reload restore the view.
- **Empty states.** Nothing in my lane: _"Nothing for the window yet today. 12 on the wards."_ with **Show all**. Nothing at all: _"No prescriptions have been written today."_
- **Footer line** under the table, always: the "n of N" count, the order, and that the list is read-only.

### 5.4 The prescription, read-only (artboard 0.2)

- **Head:** "Prescription", the lane and the ward or clinic as tags, the state chip, and the number if one exists (PQ-2).
- **Identity strip:** two identifiers, sex, age; then the facts D-PH0-05 allows, each with its date: weight, latest creatinine, allergies. If a fact was stored with the prescription at prescribing, show that value and say "at prescribing". Otherwise show the current value and its date. Never show one without its date.
- **The notice** (5.6).
- **Lines,** in the order written. For each: the medicine, form and strength as stored; the directions **as written** (Law 5); the problem it is for (D-PH0-06); the dose source ("From a signed regimen" or "Typed by the prescriber"); and, where a stop was overridden, a block naming the check, what triggered it, and the reason the prescriber gave, verbatim.
- **A cancelled line** stays in place, struck through, with who cancelled it (cadre) and when.
- **Side column:**
  - _Prescriber:_ cadre and department, when it was written, the co-signature state and, once signed, the co-signer's cadre and time; when it was last printed and how many copies, if prints are recorded.
  - _What MedSync checked at prescribing:_ each stored check with its level (Stop, Check, Note) and its answer.
  - _Not checked:_ drug interactions; stock.
- **Awaiting co-sign:** an amber line above the lines: _"Not yet co-signed. A senior has not signed this prescription."_ (wording signed, Appendix B). Nothing is disabled: there is nothing to disable.
- **No control changes anything.** The only link is back to the queue. A controlled drug shows its chip and nothing more. Footer: _"Read-only. To change this prescription, speak to the prescriber."_
- Opening this view writes a read-log row (6.4, RV-6).

### 5.5 Emergency doses (artboard 0.3)

- **What it is:** doses given from an emergency cart, as recorded on the resus desk. A read-only list over existing records.
- **Cart tabs:** All carts, then each cart with rows in the period, each with its count; "No cart" for doses recorded without one.
- **Period:** Today · Last 7 days · Last 30 days. Default: last 7 days.
- **Columns:** Given (date and time) · Patient (two identifiers, or _"Unidentified patient"_ with the episode reference) · Medicine · Amount, **as recorded** · Cart · Given by (cadre) · Episode. A controlled drug adds the witness's cadre.
- **Notice,** neutral, not dismissible: _"Cart restocking is not recorded in MedSync yet. Use this list beside the cart's own checklist when you restock."_
- **No stock figure is shown.** Any `on_hand` or `par_level` the cart tables hold stays off this page until an engine counts it (D-PH0-13).

### 5.6 The notice that says what the pharmacy is not doing

- **Where:** at the top of the queue and of every prescription view, above the content.
- **When:** whenever `pharmacyChecksState(hospital)` reports anything not done (6.6). In this slice that is always, but the notice is wired to the function, never hard-coded on.
- **Form:** the caution notice of the design system in force: amber tint, a triangle icon, a bold first sentence. `role="status"`. It has no close button.
- **Wording:** Appendix B, from copy entries with a status. The counts in it come from data (CS-3). **Unsigned wording cannot be enabled in production** (CS-5).

### 5.7 Find a prescription

- One field in the sidebar. It accepts a prescription number or a patient number (MRN), exact match only, searched on the server.
- A prescription number opens that prescription. A patient number lists that patient's prescriptions at this hospital within the look-back period (D-PH0-09), newest first, in the queue's table.
- No match: _"No prescription with that number at this hospital."_ The message is the same whether the number is unknown or belongs to another hospital.
- There is no search by name in this slice.
- If Step 0 finds that prescriptions carry no number a person can read off the paper, the field takes the patient number only, and the gap is reported at STOP 0.

### 5.8 Dispensing points (artboard 0.4)

Only if the services hub is on the branch (Q10). Otherwise skip this section, record the seam, and every viewer opens on "All".

- In the hub, under Departments → Pharmacy, a **Dispensing points** list: the units of the Pharmacy department.
- **Each point:** name · serves (Outpatients, clinics and discharges · Wards · Emergency unit · Everything) · hours · place · in charge · staff count. Hours, place and in-charge reuse the hub's unit fields.
- **Serves** decides only which lane that point's staff open on. It routes nothing and hides nothing.
- **Derived values.** Where at least one dispensing point exists, the hub's "dispensing points" count and "pharmacy open 24 hours" are worked out from the points and are no longer typed (CAP-3 pattern). With none, the typed values stay as they are.
- A neutral note on the panel: _"A dispensing point names where pharmacy staff work and which prescriptions their queue shows first. It holds no stock and records no dispensing yet."_
- Pharmacy staff are assigned to a point through the staff affiliation's unit, as lab staff are to sections.

### 5.9 Phone and tablet

Desktop-first; unbroken at 390 px and 834 px. Tabs scroll horizontally. A queue row becomes three lines: identifiers; medicines and source; state, checks, time and Open. Touch targets are at least 44 px. No mobile (Expo) work.

### 5.10 Flag and redirects

- `pharmacyWorkspace` on: everything in 5.1–5.9.
- `pharmacyWorkspace` off: today's behaviour, byte for byte. `/pharmacy` is not found.
- In production the flag cannot be switched on for a hospital while the notice wording is `draft` (CS-5).

### 5.11 Known differences from the canvas, where this prompt wins

- The canvas shows directions as `[placeholders]`. The product shows them as written.
- The canvas shows a prescription number (`Rx-000731`). Use the real number format if one exists; otherwise none.
- The canvas counts "3 of the 212 medicines". The product counts from data.
- The canvas row for the hospital admin shows a "Live on MedSync" chip and an Archive button. Both belong to the hub and are built only if the hub already has them.
- Emergency-dose amounts on the canvas are examples. The product shows the stored text.
- The canvas state filter has no "Cancelled" option. The product has one (5.3).
- The canvas footer reads "7 of 9 shown" because the artboard draws seven rows. The product uses the footer in Appendix B.
- The canvas abbreviates nothing in "From". The wireframe in 5.3 abbreviates cadres only to fit; the product writes them in full.

---

## 6. Engines (pure, no I/O; every rule has an ID and at least one test)

### 6.1 Pharmacy access (extend the access engine lab Phase 0 built)

- **PA-1** Pharmacy access is a set of **permissions**. This slice defines six names and grants one: `pharmacy.view`. The other five (`pharmacy.review`, `pharmacy.dispense`, `pharmacy.stock`, `pharmacy.controlled`, `pharmacy.manage`) are reserved names with no grant and no check behind them until the phase that uses them.
- **PA-2** `pharmacy.view` derives from **approved cadre** only: Pharmacist and Pharmacy technician (Appendix A, signed at GATE A). The map is data, versioned and signed.
- **PA-3** `pharmacy.view` is required for every `/pharmacy` route and every pharmacy read.
- **PA-4** Doctors, clinical officers and nurses keep the prescription reads they have today. They never receive `pharmacy.view`.
- **PA-5** Lab staff, reception cadres, hospital admins and superadmins hold no pharmacy permission. Hospital admins configure dispensing points through the hub, which carries no PHI.
- **PA-6** Permission checks happen in the server action or loader and in RLS. The UI hides what the server would refuse; it is never the only guard.
- **PA-7** Deactivating a staff member, ending their affiliation or changing their cadre revokes pharmacy permissions in the same transaction, audited.
- **PA-8** The engine is the lab's, extended. If `lib/lab/access.ts` is lab-specific, Step 1 proposes moving the shared part to a workspace-neutral module with the lab re-exporting it, and a regression test proves every lab permission result is unchanged. Do not write a second access engine.

### 6.2 Landing (`lib/auth/landing.ts`, from lab Phase 0)

- **LD-P1** `resolveLanding` gains the pharmacy. Every existing landing keeps its result; extend the table test to prove it.
- **LD-P2** A user whose only staff workspace is the pharmacy lands on `/pharmacy`.
- **LD-P3** A user with several staff workspaces follows the lab's rule (last used, else the primary affiliation's cadre).
- **LD-P4** A pharmacy-only user requesting `/clinician` resolves to `/pharmacy`.
- **LD-P5** `next` is honoured only if it is a same-origin path the user may open.

### 6.3 Queue projection (`lib/pharmacy/queue.ts`)

```ts
computeQueue(input: {
  prescriptions,   // rows or headers with lines, hospital-scoped, written in the period
  checks,          // stored check outcomes and override reasons per line
  prints,          // print events, if recorded
  encounters,      // only: id, kind, disposition at placement, ordering ward or clinic
  viewer: { userId, permissions, dispensingPoint },
  filters: { lane, state, from, period, sort },
  serverNow,
}): { rows: QueueRow[], laneCounts, stateCounts, total }
```

- **PQ-1** One row per **prescription**: the set of lines placed together for one patient by one prescriber. Use the grouping the repo has (a header row, a placement or basket id). If none exists, **STOP at Step 0 and report**: GATE A chooses between adding a grouping key and grouping by encounter and placement time (D-PH0-08). Never group by a guess.
- **PQ-2** A prescription's number is whatever the printed prescription carries. None is invented.
- **PQ-3** Lane. `window` when the encounter's disposition at placement is Discharge or Refer, or the encounter is an outpatient visit with no admission. `ward` when it is Admit or Observe, or the patient has an open admission. If the data cannot tell them apart, every row is in one lane, the lane tabs are not rendered, and the footer says so.
- **PQ-4** Emergency rows (the resus fast path) are not prescriptions for the queue. They appear under Emergency doses only. In June `is_emergency` defaulted to true, so Step 0 confirms how an Encounter Plan prescription is told from an emergency row today (Q3). If the data cannot tell them apart, **STOP and report**.
- **PQ-5** State is the stored state, mapped to words at GATE A. A prescription whose lines are in different states shows the one that GATE A's order ranks first (proposed: Awaiting co-sign, then Prescribed; Cancelled only when every line is cancelled). The view shows each line's own state.
- **PQ-6** Cancelled prescriptions and lines stay in the projection.
- **PQ-7** _Changed since printing_ is true when any line was edited, added or cancelled after the last print event. If prints are not recorded, the chip is never shown and the row shows "Changed hh:mm" in neutral text when a change exists.
- **PQ-8** The checks summary is derived only from stored outcomes, ordered: overridden stop, controlled, child under 16, renal answered, typed dose.
- **PQ-9** Lane counts ignore the lane filter. State counts respect it.
- **PQ-10** Default order: oldest first by the time written. The sort is stable.
- **PQ-11** Rows from another hospital never appear. Prove it with a fixture holding two hospitals.
- **PQ-12** Every row carries two identifiers through the identity module. Reveal logging is batched per page load, in the existing pattern.
- **PQ-13** A property test: for random inputs, every prescription written in the period appears exactly once under "All", and the lane counts sum to the total.

### 6.4 The prescription read model (`lib/pharmacy/prescription-view.ts`)

- **RV-1** The read model returns exactly the fields GATE A signs (D-PH0-05) and nothing else from the chart: the lines as stored, the indication per line, stored check outcomes and override reasons, the prescriber's cadre and department, co-signature state, print events, and for the patient: two identifiers, sex, age, allergies, weight and latest creatinine, each with its date.
- **RV-2** Text fields are passed through unchanged (Law 5). A test feeds awkward strings (mixed units, trailing spaces, a decimal comma) and asserts byte equality on screen.
- **RV-3** A value stored with the prescription at prescribing is labelled "at prescribing". A current value is labelled with its own date. The two are never merged.
- **RV-4** The indication of a restricted-class problem follows D-PH0-06.
- **RV-5** A check outcome that was not stored is absent. Nothing is recomputed (Law 6).
- **RV-6** Each open of the view writes one read-log row: actor, prescription, hospital, time. Reloads within the same minute do not add rows.
- **RV-7** Pharmacy staff get the read model from a server-side function with an explicit field list. They receive **no** general read of encounters, notes, results or observations. RLS probes prove it.

### 6.5 Navigation (reuse the lab's registry)

- **NV-P1** The pharmacy registers Queue and Emergency doses, and nothing else.
- **NV-P2** If `lib/lab/nav.ts` is lab-specific, generalise it once with the lab's behaviour proved unchanged (as PA-8). Do not copy it.

### 6.6 Check state (`lib/pharmacy/check-state.ts`)

- **CS-1** `pharmacyChecksState(hospitalId)` returns `{ dispensingRecorded, interactionsChecked, doseReferences: { signed, total } | null }`.
- **CS-2** `dispensingRecorded` and `interactionsChecked` are `false` in this slice, returned by the function and never hard-coded at a call site. Later phases replace the body, not the callers.
- **CS-3** `doseReferences` counts medicines on the hospital's prescribing list and those with a signed regimen. If either cannot be counted from real rows, it is `null` and the notice uses the wording without numbers.
- **CS-4** The notice renders on every pharmacy prescription surface while any part is not done, and cannot be dismissed.
- **CS-5** Each notice string is a copy entry with a status (`draft` | `signed`). In production, `pharmacyWorkspace` cannot be switched on for a hospital while any is `draft`. Enforce it on the server and test it.

### 6.7 Emergency doses (`lib/pharmacy/emergency-doses.ts`)

- **ED-1** One row per `emergency_administrations` row in the period, hospital-scoped, newest first.
- **ED-2** The cart is the stored cart, else "No cart". The amount is the stored text.
- **ED-3** A row with no patient shows "Unidentified patient" and its episode reference.
- **ED-4** Cart counts sum to the total. Prove it with the property test pattern of PQ-13.
- **ED-5** No stock figure is read or returned.

### 6.8 Dispensing points (`lib/pharmacy/dispensing-points.ts`, only with the hub)

- **DP-1** A dispensing point is a unit of the Pharmacy department with one extra field, `serves`: `window` | `wards` | `emergency` | `all`.
- **DP-2** With one or more points, `pharmacy_dispensing_points` is their count and `pharmacy_24h` is true when any point is open 24 hours. With none, the typed values are returned unchanged.
- **DP-3** Archiving follows the hub's rule: blocked while staff are assigned.
- **DP-4** The viewer's default lane: `window` → For the window; `wards` or `emergency` → On the wards; `all` or no point → All.

---

## 7. Data changes (only what GATE A approves; additive; numbers from the ledger)

- **Numbers.** Before writing any migration or ADR, claim a block in `docs/NUMBERS.md`: 20 migration numbers and 15 ADR numbers above the highest on `main` and on every open branch. Create the ledger if it does not exist, and list the lab's blocks in it.
- **Permissions.** The six pharmacy permission names, in the model lab Phase 0 built. One is granted.
- **The cadre → permission map** as signed, versioned reference data.
- **Read log.** Reuse the audit log with a kind `pharmacy_prescription_viewed` if it can carry reads at this volume; otherwise the existing PHI read-log store. No new table if one fits.
- **Access audit kinds:** `pharmacy_access_granted`, `pharmacy_access_revoked`.
- **Dispensing points** (only with the hub): `serves` on the unit, or a 1:1 extension row if units are shared with other departments.
- **Backfill.** A script that lists approved pharmacy staff who hold no pharmacy access, with a dry run. It applies only after GATE A sees the list.
- **The flag** `pharmacyWorkspace`, through the existing mechanism.
- **RLS.** New SELECT paths for holders of `pharmacy.view`, same hospital only: prescriptions and their lines, stored check outcomes, print events and `emergency_administrations`. Carts keep their existing read if Step 0 confirms pharmacy staff already have it; the read returns labels only (ED-5). Pharmacy staff get **no** table grant on encounters or patients: the queue's encounter fields (kind, disposition at placement, ordering ward or clinic), the two identifiers (through the identity module) and the patient facts in RV-1 come through server-side functions with explicit field lists (RV-7).
- **Indexes** only with `EXPLAIN` evidence from Step 0.
- **No change** to prescriptions, orders, administrations, the catalogue or any stock table.

**RLS probes** for every new or changed object:

| Actor                                                                        | Access                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Pharmacy staff, same hospital, with `pharmacy.view`                          | Read, as Section 7 lists                                              |
| Approved pharmacy cadre before the grant, or after revocation                | Denied                                                                |
| Pharmacy staff: encounters, notes, results, observations, other chart tables | Denied                                                                |
| Doctor, clinical officer, nurse, same hospital                               | Their existing prescription reads unchanged; `/pharmacy` lists denied |
| Lab staff, reception, hospital admin                                         | Denied                                                                |
| Staff of another hospital                                                    | Denied                                                                |
| Superadmin, without break-glass                                              | Denied                                                                |
| Anonymous                                                                    | Denied                                                                |
| Any client, direct INSERT, UPDATE or DELETE on any object above              | Denied                                                                |

## 8. Server actions and reads

Reuse, don't duplicate. Prescribing, co-signing, cancelling, printing and administration are **not touched**.

- **Staff approval** (existing function): on approving a Pharmacist or Pharmacy technician cadre, grant the mapped permission in the same transaction and write the audit row. Idempotent. The existing blocks stay (no approval without a licence on file).
- **Deactivation, affiliation end, cadre change** (existing): revoke in the same transaction (PA-7).
- **`backfillPharmacyAccess({ dryRun })`**: owner-run. Lists first, applies on confirmation, audits each grant.
- **Reads** (server components or loaders): `getPharmacyQueue`, `getPharmacyPrescription`, `findPrescription`, `getEmergencyDoses`. A fixed number of round trips each. Each returns `serverNow`.
- **`logPrescriptionViewed`**: the one write a pharmacy user triggers. House contract.
- **Hub** (only with the hub): `upsertDispensingPoint`, through the hub's own action pattern.

The house contract applies to every write: Zod → auth (`getUser()`, never `getSession()`) → AAL2 → permission → hospital-scope check → one transaction → PII-redacted log → audit row → typed result `{ id, serverTime }`.

---

## 9. Steps and gates

### Step 0: Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** Has the access step of `feat/lab-front-door` merged? Are the permission model, `resolveLanding`, the navigation registry, the notice component and the flag on `main`? **If not, STOP.** Report which of them are lab-specific and which are already workspace-neutral.
- **Q2** P1–P15: confirm or correct each, with file and line.
- **Q3** The prescription model as it stands: a header with lines, or one row per medicine? Every column. Every state and what moves a row between them. What ties the lines of one placement together. **If nothing groups them, STOP and report** (PQ-1). What `is_emergency` means today, and what an Encounter Plan prescription sets it to (PQ-4).
- **Q4** Is there a number on the printed prescription a person can read? Its format and uniqueness.
- **Q5** Where each prescribing check's outcome, answer and override reason is stored, per line. Which of the eleven checks leave a stored trace and which do not.
- **Q6** Are print events recorded (who, when, which version)? Can a line be edited after printing, and what records the change?
- **Q7** How a discharge or outpatient prescription can be told from an inpatient one: disposition at placement, encounter kind, admission state. How often each is missing in the test data.
- **Q8** `emergency_administrations`, `crash_carts`, `crash_cart_stock`: columns, who can read them, and what, if anything, updates `on_hand`.
- **Q9** The staff approval function and `assign-role`: inputs, checks, audit rows. Which pharmacy cadres exist in the catalogue, with their codes, and the council the profession map gives each. Is a pharmacy intern cadre seeded?
- **Q10** Is the services hub on this branch? The Pharmacy department, units, heads, places, hours, `pharmacy_dispensing_points`, `pharmacy_24h`, and whether a staff affiliation can hold a unit.
- **Q11** The sign-in landing table as `resolveLanding` has it: every role and cadre → path.
- **Q12** Where patient weight, latest creatinine and allergies come from, and whether the prescription stores a snapshot of any of them at prescribing.
- **Q13** Restricted classes on diagnoses and medicines: how they are tagged and filtered today.
- **Q14** How lists identify patients today: masked with an audited reveal, or shown? The identity module's contract. Where PHI reads are logged.
- **Q15** Where signed dose regimens live, how a medicine on the prescribing list is counted, and whether both can be counted per hospital (CS-3).
- **Q16** The feature-flag mechanism and the state of the prescribing flags per hospital.
- **Q17** The shared page header and sidebar components, and the design tokens on the branch (place colour, the amber caution pair, the neutral chip). Are any Chroma tokens present?
- **Q18** Are Playwright and axe available? If not, STOP and flag.
- **Q19** The highest migration and ADR numbers on `main` and on every open branch, for the ledger.
- **Q20** Whether the server client still reads a legacy `service_role` key. If so, flag it.

**Baseline:**

- Screenshots: sign-in as a pharmacist and as a pharmacy technician, and where each lands; `/clinician` as each. At 390×844, 834×1194 and 1440×900.
- Counts for the test hospital: approved pharmacy staff; prescriptions written in the last 7 days by state and by lane; lines with a stored override; emergency administrations by cart; medicines on the list and with a signed regimen.
- **Failing tests** that reproduce P3 (wrong landing), P4 (no route) and P5 (no grant on approval). Do not fix them yet.

**STOP 0.** Report Q1–Q20, the prompt-versus-repo differences, the failing tests and the baseline.

### Step 1: GATE A proposal (documents only)

Write `docs/pharmacy/phase-0/gate-a-proposal.md`:

- the access model: the six names, the one grant, the cadre map (Appendix A, corrected against the repo), where each check runs, and what is generalised from the lab with the proof plan;
- the landing table, before and after;
- annotated wireframes of the shell, the queue (desktop and phone), the prescription view, emergency doses and, if the hub is present, dispensing points, starting from Section 5 and the canvas;
- the queue rules as tables, each with one worked example from the test data, including a cancelled prescription and one changed since printing;
- **the read list**: every field a pharmacy user will be able to read, where it comes from, and why it is needed (D-PH0-05);
- the schema diff, the backfill list (dry run) and the RLS probe plan;
- every string in Appendix B, with its status;
- the test plan and the ADR drafts;
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions.

### Step 2: Access

The permission names, the cadre map, the grant in the approval transaction, revocation, the backfill script (dry run only until told), the landing extension, the flag, the RLS paths and the probes. Any generalisation of the lab's modules lands here, with the lab's tests unchanged and green.

**STOP 2.** The migration diff; the RLS probe table (every object × every actor); the landing table test; the lab regression results; the backfill dry-run list; audit rows for one grant and one revocation.

### Step 3: Engines (pure, no UI)

`queue.ts`, `prescription-view.ts`, `check-state.ts`, `emergency-doses.ts`, the navigation registration and the four reads, with tests:

- every PA, LD-P, PQ, RV, NV-P, CS, ED and DP rule ID covered;
- the two-hospital fixture (PQ-11) and the property tests (PQ-13, ED-4);
- the byte-equality test for text as written (RV-2);
- the wrong-clock test for elapsed time;
- the query budget asserted with a query counter;
- the no-clinical-write test (Law 2).

**STOP 3.** Test counts, the rule coverage table, the property-test results and the query counts.

### Step 4: Shell, queue, prescription view, emergency doses and the notice

The layout, the navigation, the page header, the queue with its filters and URL state, find a prescription, the read-only view with its read log, the emergency doses page, and the notice on both prescription surfaces.

**STOP 4.** Screenshots against artboards 0.1, 0.2 and 0.3 (three viewports); the budget counts; axe (0 serious or critical); red-scarcity tests green; flag-off screenshots identical to the baseline.

### Step 5: Dispensing points, scenarios, hardening and documentation

Dispensing points if the hub is present (5.8, 6.8). Then run the scenarios (Playwright if present, otherwise scripted integration tests):

- **S1** A hospital admin approves a Pharmacist with a licence on file. `pharmacy.view` is granted in that transaction, with an audit row. The pharmacist signs in and lands on `/pharmacy`.
- **S2** The same for a Pharmacy technician. Their top-right label and every audit line say "Pharmacy technician".
- **S3** An approved pharmacist who held no access before: after the backfill, they land on `/pharmacy`.
- **S4** A nurse is approved. No pharmacy permission is granted. `/pharmacy` is refused.
- **S5** A doctor places three medicines for an outpatient. One queue row appears under "For the window" with three medicines. The doctor's own screens are unchanged.
- **S6** A prescription with an overridden allergy stop: the row shows "1 stop overridden"; the view shows the check, the trigger and the reason verbatim.
- **S7** A clinical officer's prescription awaits co-signature: the amber chip on the row and the amber line on the view. After the senior signs, both clear on refresh.
- **S8** The doctor cancels one of three lines after printing: the row keeps its state and gains "Changed since printing"; the line is struck through in the view. The doctor cancels the other two: the row shows "Cancelled". Nothing left the list.
- **S9** A dose typed as an awkward string displays byte for byte.
- **S10** An admitted patient's prescription appears under "On the wards", not "For the window".
- **S11** Find a prescription: by number, it opens; by patient number, it lists; a number from another hospital returns the same "no prescription" message as an unknown one.
- **S12** Opening a prescription writes one read-log row. Reloading within a minute writes no second row.
- **S13** A pharmacist requests a patient's notes, results and observations directly: each is refused in the database.
- **S14** An emergency dose recorded on the resus desk appears under its cart within one refresh, with the amount as stored. A controlled dose shows the witness's cadre. No stock figure appears anywhere.
- **S15** The notice shows on the queue and the view, with counts from data. With counts unavailable, the wording without numbers shows. With the wording at `draft`, production refuses to enable `pharmacyWorkspace`.
- **S16** Reception is refused. Staff of another hospital are refused. A pharmacist of hospital A sees no prescription of hospital B.
- **S17** A pharmacist is deactivated: access is revoked in that transaction, audited, and the next request is refused.
- **S18** The device clock is 3 hours wrong: every elapsed time still matches the server.
- **S19** `pharmacyWorkspace` off: sign-in and `/clinician` behave as in the baseline, and `/pharmacy` is not found.
- **S20** With the hub: a point that serves the wards opens its staff on "On the wards"; "All" is one tap away. The hub shows the derived count and 24-hour value.
- **S21** Every lab scenario from lab Phase 0 that touches access, landing or navigation still passes.
- **S22** Phone viewport: S5 and S6 end to end.

Then: reduced motion, the performance budgets, the ADRs and the final report.

**STOP 5 (final).** The table in Section 13, filled in.

---

## 10. Accessibility, motion, colour

- WCAG 2.2 AA. Targets at least 44×44 px on touch.
- Lane and state filters are `tablist`s with counts in their accessible names ("For the window, 9").
- The queue is a table with real headers. The action column has a visually hidden header. Each Open control's accessible name includes the patient and the first medicine.
- Every chip carries a word. Amber chips carry an icon. Colour is never the only signal.
- Struck-through text is also announced: a cancelled line reads "Cancelled:" before its content.
- The clock tick is not announced. A polite live region announces only the result of Refresh.
- The notice is `role="status"`, not an alert: it is standing information.
- Reduced motion: no row animation.
- Plum (or the pharmacy hue's tint) marks the active navigation item only. Buttons and focus are teal. Amber is caution. No red. No green. No left-edge bars.

## 11. Performance budgets

| Measure                                               | Budget                              |
| ----------------------------------------------------- | ----------------------------------- |
| `/pharmacy` TTFB with 500 prescriptions in the period | p95 < 400 ms                        |
| Lane or state switch                                  | p95 < 100 ms, no refetch            |
| Prescription view TTFB                                | p95 < 400 ms                        |
| Round trips per render                                | fixed, regardless of row count      |
| Layout shift on a clock tick                          | 0                                   |
| Added JS on `/pharmacy`                               | ≤ 30 KB gzipped (report the number) |

## 12. Security, privacy, audit

- AAL2 on every `/pharmacy` route. Hospital scope on every read. Reception blocked in the app and in the database.
- This slice **widens who can read prescriptions**. That is its purpose and its main risk. The read list is signed (D-PH0-05), enforced by the server function and RLS, and every open of a prescription is logged.
- Writes only through audited server-side functions. No client write to any role or permission object.
- Every grant, revocation and backfilled grant is audited with the actor, the basis (cadre, council, approval reference) and the hospital.
- Logs, analytics and URLs carry no PHI. Filters in the URL are ids. A prescription number in a URL is allowed only if it identifies no patient by itself; otherwise use the row id.
- Data Protection and Privacy Act 2019: pharmacy staff read the minimum needed to supply a medicine safely. Record the basis in the ADR.
- The governance gap stays documented: Fadhul holds superadmin, CSO and audit-reviewer roles at once.

---

## 13. Numbers to report at the final STOP

| Metric                                                              | Baseline | Target                | Result |
| ------------------------------------------------------------------- | -------- | --------------------- | ------ |
| Approved pharmacy staff who land on `/pharmacy` at sign-in          | S0       | 100 %                 |        |
| Approved pharmacy staff with no pharmacy access                     | S0       | 0                     |        |
| Pharmacy access grants without an audit row                         | none     | 0                     |        |
| Non-pharmacy cadres holding a pharmacy permission                   | S0       | 0                     |        |
| Screens that call a pharmacy technician a pharmacist                | none     | 0                     |        |
| Navigations between sign-in and the queue                           | S0       | 0                     |        |
| Sidebar items rendered that have no page                            | none     | 0                     |        |
| Prescriptions written in the period and missing from "All"          | none     | 0                     |        |
| Queue rows with fewer than two identifiers                          | none     | 0                     |        |
| Doses displayed differently from how they are stored                | none     | 0                     |        |
| Check results shown that were not stored at prescribing             | none     | 0                     |        |
| Chart tables readable by pharmacy staff beyond the signed read list | none     | 0                     |        |
| Prescription opens without a read-log row                           | none     | 0                     |        |
| Clinical write actions reachable from `/pharmacy`                   | none     | 0                     |        |
| Stock figures shown                                                 | none     | 0                     |        |
| Pharmacy prescription screens without the notice                    | all      | 0                     |        |
| Lab access, landing and navigation tests changed or failing         | none     | 0                     |        |
| Rule IDs without a test                                             | none     | 0                     |        |
| RLS probes passed                                                   | none     | 100 %                 |        |
| axe serious or critical                                             | S0       | 0                     |        |
| Red on `/pharmacy` routes added by this slice                       | none     | 0                     |        |
| Lane switch p95 / added JS                                          | none     | < 100 ms / ≤ 30 KB gz |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #        | Decision                                                 | Recommendation                                                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-PH0-01 | The pharmacy access model                                | Six permission names, one granted now: `pharmacy.view`. Review, dispense, stock, controlled and manage are granted in the phase that uses them, after the legal reading of who may do each                                                                                                                      |
| D-PH0-02 | The carrier role and the title (CSO)                     | Permissions derive from the approved cadre. If a workspace role is needed as a carrier, it is never shown as a title. A pharmacy technician is never labelled "pharmacist" anywhere. If the only carrier is the role `pharmacist`, add a neutral value such as `pharmacy_staff`                                 |
| D-PH0-03 | Who gets access                                          | Pharmacist and Pharmacy technician, on approval with a licence on file. Pharmacy interns: no row until the onboarding decision is made. The technician's registering body is unconfirmed (Appendix C): confirm it before the map is signed                                                                      |
| D-PH0-04 | Pharmacy management                                      | Recorded through the hub: the head of the Pharmacy department and each dispensing point's in-charge. It grants nothing in this slice                                                                                                                                                                            |
| D-PH0-05 | What pharmacy staff may read (CSO, data protection)      | The prescription as written; the problem each medicine is for; stored check outcomes and override reasons; the prescriber's cadre and department; co-signature and print state; and for the patient: two identifiers, sex, age, allergies, weight and latest creatinine with dates. Nothing else from the chart |
| D-PH0-06 | The indication when the problem is in a restricted class | Show it. The medicine already reveals the class, the pharmacist needs the indication to check the prescription, and every open is logged. The alternative is "Restricted" in place of the problem name                                                                                                          |
| D-PH0-07 | The notice wording (CSO)                                 | Appendix B. Sign it before any production hospital is switched on                                                                                                                                                                                                                                               |
| D-PH0-08 | What one queue row is                                    | One placed prescription. If the repo has no grouping key, add one to new placements and group older rows by encounter and placement time, marked "grouped by time"                                                                                                                                              |
| D-PH0-09 | Finding a prescription                                   | By prescription number or patient number, exact match, this hospital only. Patient number looks back 30 days (an operational setting). No search by name                                                                                                                                                        |
| D-PH0-10 | Awaiting co-sign                                         | Shown in amber on the row and the view, in words. MedSync gates nothing in this slice; the hospital's own rule governs the paper                                                                                                                                                                                |
| D-PH0-11 | Cancelled, and changed since printing                    | Both stay in the list, marked in amber with words. "Changed since printing" needs print events; without them, show the time of the last change in neutral text                                                                                                                                                  |
| D-PH0-12 | Period and order                                         | Today by default, oldest first. Yesterday and the last 7 days one tap away                                                                                                                                                                                                                                      |
| D-PH0-13 | Emergency doses                                          | A read-only list by cart. No stock figure from the cart tables is shown until a counted stock engine exists                                                                                                                                                                                                     |
| D-PH0-14 | Dispensing points                                        | Units of the Pharmacy department, with "serves" deciding the default lane only. The hub's count and 24-hour value are derived once a point exists                                                                                                                                                               |
| D-PH0-15 | Patient names on pharmacy lists                          | Name and patient number on every row, with batched reveal logging, as the lab and doctor workspaces do. If lists are masked today, keep the mask and the reveal                                                                                                                                                 |
| D-PH0-16 | Backfill of existing pharmacy staff                      | Review the dry-run list, then apply. Every grant audited                                                                                                                                                                                                                                                        |
| D-PH0-17 | Rollout                                                  | `pharmacyWorkspace` per hospital, test hospital first. It requires signed notice wording in production                                                                                                                                                                                                          |
| E-PH0-01 | Access, landing and navigation                           | Extend the lab's three modules, generalised once with the lab's results proved unchanged. No second engine                                                                                                                                                                                                      |
| E-PH0-02 | The queue                                                | A projection over existing rows. No queue table, no copied prescription data                                                                                                                                                                                                                                    |
| E-PH0-03 | The read model                                           | A server function with an explicit field list, not a broad RLS grant on chart tables                                                                                                                                                                                                                            |
| E-PH0-04 | The check state                                          | One function, `pharmacyChecksState`, whose body later phases replace                                                                                                                                                                                                                                            |
| E-PH0-05 | Numbers                                                  | The ledger at `docs/NUMBERS.md`; a block of 20 migrations and 15 ADRs claimed at Step 0                                                                                                                                                                                                                         |
| E-PH0-06 | The clock                                                | Server time plus a 30-second client tick. No polling and no realtime                                                                                                                                                                                                                                            |

## 15. Out of scope (leave clean seams)

**Pharmacy Phase 1, at the window.** Recording a review or a supply · the two review lanes · a query to the prescriber · batch stock at the dispensing point · the stock answer in the prescribing dialog · outcomes for a medicine not on the shelf · labels and counselling · the patient's medicine list and refill date · the controlled-drug record · price and payment status · the dispensing log and downtime. This slice leaves `pharmacyChecksState`, the navigation registry, the permission names and the dispensing-point unit ready for them.

**Pharmacy Phase 2 and later.** Stores, ward stock, cart reconciliation, ordering, monthly reports, recall · interaction checks, reconciliation at discharge, stewardship, reaction reports · refills, partner pharmacies, the e-pharmacy.

**Not here at all.** Any change to prescribing, co-signing, cancelling, printing or the administration record · `PharmacyAvailability` · search by patient name · a mobile (Expo) pharmacy workspace · SMS or push · any stock figure.

## 16. ADRs (numbers from the ledger)

- The pharmacy access model: six names, one grant, derived from cadre; the title rule.
- Pharmacy access is granted at approval and revoked at deactivation, in the same transaction.
- Access, landing and navigation as workspace-neutral modules shared by the lab and the pharmacy.
- The pharmacy queue as a projection: what one row is, lanes, and "nothing disappears".
- What pharmacy staff may read, the server-side read model, and the read log.
- "As written" and "no second check engine".
- The check-state seam and the notice.
- Dispensing points as units of the Pharmacy department, and derived capability values.
- The numbers ledger.

## 17. Definition of Done

- [ ] P1–P5 and P9 resolved. P6 and P10's stock tables recorded as untouched, with their phases.
- [ ] Every approved pharmacy professional lands on `/pharmacy`. Every grant and revocation has an audit row. No non-pharmacy cadre holds a pharmacy permission.
- [ ] No screen, export or audit line calls a pharmacy technician a pharmacist.
- [ ] The queue shows every prescription written in the period, once. Cancelled and changed prescriptions are marked, not removed.
- [ ] Every dose displays exactly as stored. No check result appears that was not stored.
- [ ] Pharmacy staff can read the signed list and nothing else from the chart. Every open is logged.
- [ ] Every pharmacy prescription screen shows the signed notice.
- [ ] No clinical write path was added or changed. No stock figure is shown.
- [ ] The lab's access, landing and navigation behave exactly as before.
- [ ] Every rule ID has a test. RLS probes are green, and client writes are denied.
- [ ] axe is clean. Red-scarcity tests are green on every `/pharmacy` route. Reduced motion is honoured.
- [ ] S1–S22 pass. With the flag off, behaviour matches the baseline.
- [ ] ADRs written. The final report has its numbers. The diff on `feat/pharmacy-front-door` is reviewable.

---

## Appendix A: Proposed permission map (for signature at GATE A)

| Who                                                           | view                                      | review                    | dispense    | stock       | controlled  | manage                |
| ------------------------------------------------------------- | ----------------------------------------- | ------------------------- | ----------- | ----------- | ----------- | --------------------- |
| Pharmacist                                                    | yes                                       | not granted in this slice | not granted | not granted | not granted | not granted           |
| Pharmacy technician                                           | yes                                       | not granted               | not granted | not granted | not granted | not granted           |
| Head of Pharmacy, dispensing-point in-charge (hub assignment) | by cadre                                  | not granted               | not granted | not granted | not granted | recorded, not granted |
| Doctor, clinical officer, nurse                               | no; existing prescription reads unchanged | no                        | no          | no          | no          | no                    |
| Lab staff, reception, hospital admin, superadmin              | no                                        | no                        | no          | no          | no          | no                    |

Any other pharmacy cadre found in the catalogue at Step 0, pharmacy interns included, gets no row until Fadhul adds one.

## Appendix B: Copy (draft; the notice and the cautions need the CSO's signature)

| Key                           | Text                                                                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notice, first sentence (bold) | MedSync does not record dispensing yet.                                                                                                                                                                                             |
| Notice, body, with counts     | Dispense from the signed prescription as you do today. MedSync does not check drug interactions at this hospital, and {signed} of the {total} medicines on its list have a signed dose reference. Check each prescription yourself. |
| Notice, body, without counts  | Dispense from the signed prescription as you do today. MedSync does not check drug interactions at this hospital, and its dose references are still being signed. Check each prescription yourself.                                 |
| Awaiting co-sign, on the view | Not yet co-signed. A senior has not signed this prescription.                                                                                                                                                                       |
| Cancelled, on the row         | Cancelled {time}                                                                                                                                                                                                                    |
| Cancelled, on the view        | Cancelled {time} by {cadre}                                                                                                                                                                                                         |
| Changed since printing        | Changed since printing                                                                                                                                                                                                              |
| Changed, no print record      | Changed {time}                                                                                                                                                                                                                      |
| Override block                | {check} stop, overridden by the prescriber. {trigger}. Reason given: "{reason}".                                                                                                                                                    |
| Not checked                   | Drug interactions. · Stock. The prescriber saw "Pharmacy not linked yet".                                                                                                                                                           |
| View footer                   | Read-only. To change this prescription, speak to the prescriber.                                                                                                                                                                    |
| Queue footer                  | {n} of {N} prescriptions written {period}, {lane}. Oldest first. This list is read-only: a prescription stays here until the end of the day.                                                                                        |
| One lane only                 | MedSync cannot yet tell window prescriptions from ward prescriptions at this hospital, so all are shown together.                                                                                                                   |
| Empty, my lane                | Nothing {lane} yet today. {n} {other lane}.                                                                                                                                                                                         |
| Empty, all                    | No prescriptions have been written today.                                                                                                                                                                                           |
| Find, no match                | No prescription with that number at this hospital.                                                                                                                                                                                  |
| Emergency doses, notice       | Cart restocking is not recorded in MedSync yet. Use this list beside the cart's own checklist when you restock.                                                                                                                     |
| Unidentified                  | Unidentified patient                                                                                                                                                                                                                |
| Dispensing point note         | A dispensing point names where pharmacy staff work and which prescriptions their queue shows first. It holds no stock and records no dispensing yet.                                                                                |
| Refused                       | You do not have access to the pharmacy workspace. Ask your hospital admin.                                                                                                                                                          |

## Appendix C: Sources checked (10 Oct 2026; re-verify at build time)

- **Who regulates and licenses pharmacists.** A Ministry of Health letter of 18 Sept 2026, reported by the Daily Monitor on 22 Sept 2026, states that regulatory, registration and licensing powers are "legally vested in the Pharmacy Board and the Registrar" under the Pharmacy and Drugs Act (cited there as Cap. 309), and directs the Pharmaceutical Society of Uganda to stop issuing annual practising licences. https://www.monitor.co.ug/uganda/news/national/ministry-of-health-psu-clash-over-authority-to-licence-pharmacists-5605298
- **The Pharmacy and Drugs Act,** text as at 31 Dec 2000 on ULII: establishes the Pharmacy Board (s. 1) and makes the chief pharmacist its registrar (s. 3); a person who is not a pharmacist may not describe themselves as one, and premises may not trade as a pharmacy unless a pharmacist is on the premises supervising (s. 11). **The text read does not mention pharmacy technicians.** Section numbers are from that older text; the chapter number has since changed. https://media.ulii.org/media/legislation/18219/source_file/8c085527ea806337/1970-39.pdf
- **The National Drug Policy and Authority Act,** consolidated text as at 31 Dec 2023 on ULII, read through a summary: only a registered pharmacist, medical practitioner, dentist, veterinary surgeon or licensed person may supply or dispense a restricted drug (s. 13(1)); a licensed retail business operates under the immediate supervision of a pharmacist (s. 14(1)(b)). This is not a legal reading. https://ulii.org/en/akn/ug/act/statute/1993/13/eng@2023-12-31
- **Not confirmed:** which body registers pharmacy technicians, and what a technician may do without a pharmacist present. MedSync's profession map places them under the Pharmacy Board of Uganda. Fadhul confirms this from a primary source before Appendix A is signed (D-PH0-03); Step 0 reports only what the profession map says (Q9). This is why the slice grants only `pharmacy.view`.
- **The repo.** Lines marked (June) in Section 3 were read from a clone at `4fbab0c` (3 June 2026). The current `main` was not read for this prompt.
