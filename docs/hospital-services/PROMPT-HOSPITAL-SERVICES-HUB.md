# PROMPT: Departments & services — one place for what the hospital runs, where and when (hospital admin)

> **For Claude Code.** Work on a new branch `feat/hospital-services-hub`, cut from the branch that holds the hospital admin shell and the staff feature. First copy this prompt into `docs/hospital-services/`. Before anything else, read the shell's integration contract in `/docs`: this is a feature that drops into it.
>
> **Coordination.**
>
> - This replaces the reserved "Departments & wards" area of the hospital admin shell.
> - It is also the permanent home for everything `PROMPT-ONBOARDING-V2.md` moved out of the hospital application. That prompt's setup checklist links here.
> - Build this prompt's Phases 2–3 before onboarding v2's Phase 6.
>
> **Mode:** gated. Eight phases (0–7), each ending in a **STOP**.
>
> - Documents use Stage 1: draft → critique against the checklist → revise (max two passes) → present → STOP.
> - Code uses Stage 2: build → run the real checks → fix → re-run until green → report numbers → STOP.
> - Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** Four things here touch patient safety or privacy and need his signature at GATE A:
>
> - which capabilities count as emergency-routing, and so need a second person to verify (D-SVC-11);
> - how availability is shown where staff order and book (D-SVC-12);
> - which clinics are confidential by default (D-SVC-08);
> - the level presets, which are reference data (D-SVC-03).

---

## 0. What we are building, in one paragraph

**The gap.** The "Departments & wards" area is a placeholder ("Nothing here yet"), and onboarding v2 took the department and service questions out of the hospital application. Both point to the same gap: MedSync has no permanent, editable record of **what a hospital runs, where, and when**.

**What we build.** A **Departments & services hub** in the hospital admin shell. Admins **select** from catalogues and refine on demand, with no Next buttons. They can start, if they like, from the MoH standard for their facility level. The hub covers:

- departments, their units and their heads;
- wards and beds;
- clinics and their **clinic days**;
- the laboratory test menu, and imaging;
- emergency and support capabilities;
- opening hours, holidays, closures and places.

**The live layer.** On top sits an **availability** layer ("CT down since Tuesday", "HbA1c reagent out"), so that orders, bookings, referrals and emergency directions stop going in blind.

**No parallel stores.** The hub adds nothing that already exists somewhere else:

- clinic days are the booking engine's session templates;
- tests are the ordering catalogue, seen through the facility;
- emergency fields are the emergency pathway's own fields.

What the hub adds is **one editable, audited source**, plus a **capability profile** with no personal data in it that the rest of MedSync reads.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt and the screenshot.
   - The screenshot (26 Sep 2026) shows `/hospital-admin/departments` on Test Hospital 5 (Regional Referral, status `provisioning`).
   - It is the reserved placeholder. Its text reads: "Active departments and HODs, ward roster, bed counts and live occupancy. The data backbone already exists from the hospital-registration upgrade."
   - Confirm every assumption in code and data. Report every difference at STOP 0.
2. **Contracts to reuse:**
   - **The hospital admin shell's integration contract:** the tenant scope accessor, feature registration (sidebar, route, ⌘K, badge), the slide-out panel API, the action pattern and the audit rules.
   - **The hospital registration upgrade:** the setup wizard (departments, wards and beds, admins, go-live gate).
   - **The scheduling/booking engine and its PRD:** services, session templates ("Diabetes Clinic, Tuesdays 08:00, cap 60, split 40/20"), one-off sessions, blackout dates, holidays, confidential service flags, and the cancel-session flow.
   - **The emergency pathway:**
     - `emergency_capability`;
     - `pre_alert_enabled`, which requires a board owner per shift;
     - directions and the emergency SMS number;
     - the ambulance number, stored in `emergency_contacts` and unverified until four-eyes.
   - **The orders/results pipe:** `encounterOrders`, `encounterResults`, and the lab-tech workspace's pipe principle.
   - **Design and decisions:** `PROMPT-ONBOARDING-V2.md`, `DESIGN-medsync.md` and ADR 0097 (plum = place).
3. **Code:**
   - `app/hospital-admin/**`, and the shell's registry and panel modules.
   - The staff feature (affiliations, approvals) and the setup wizard.
   - The scheduling/booking, emergency pathway and encounter-orders modules.
   - The catalogue seeds: departments, IM sub-specialties, clinics, diagnostics, support services.
   - `db/schema/**`, `tests/**`, `tests/rls/**`.

## 2. Laws (non-negotiable)

1. **Engine-first.** No surface reads or writes an engine without real tables, real RLS policies and passing tests. Every new object arrives with RLS probes in the same phase.
2. **One source of truth per fact.** Extend what exists; never fork it.
   - Structure (departments, units, wards, beds, places) lives in the hub's tables, extending what the setup wizard created.
   - Clinic days are the booking engine's session templates.
   - Tests are the ordering catalogue, with a per-facility overlay.
   - Emergency settings are the emergency pathway's own fields.
   - If a store this prompt expects does not exist, **STOP and flag** before creating one.
3. **Select, then refine.**
   - Every tab opens on "what you run", picked from a catalogue. It can be pre-ticked from a signed level preset.
   - Details are added on demand, in a panel.
   - No Next buttons, no wizard. Each item saves on its own.
4. **Nothing disappears.**
   - Archive; never delete.
   - An item in use can't be archived until it is reassigned. "In use" means staff, sessions with bookings, and (later) occupied beds. The UI shows the counts.
   - Every structural change is audited. Where history matters (heads, in-charges), it is dated as well.
5. **Honest numbers.**
   - Counts come only from real rows.
   - No occupancy, utilisation or waiting figures until their engines exist. Show "Arrives with the inpatient module" instead.
   - Presets and standards comparisons come only from signed, sourced reference data.
6. **Availability informs; it never blocks.** An outage shown where staff order, book or triage never prevents a clinical action. It says what's wrong, since when, and when it was last confirmed.
7. **Emergency routing needs two people.** Capabilities and contacts that decide where an emergency goes (D-SVC-11) take effect for signposting only after a second person verifies them.
8. **Privacy.**
   - Confidential services are never named in patient messages.
   - The capability profile carries no personal data.
   - Only items marked public reach patients.
9. **Colour.**
   - Teal = action.
   - Plum = place: the active nav item, and the current tab as an underline. Never a left-edge bar.
   - Red `#DC2626` = the Emergency affordance only.
   - Amber, always with an icon and a word = Unavailable, Limited, Unverified, Unconfirmed.
   - Record states (Live, Not on MedSync yet, Planned, Archived, Available) are neutral chips with words. **Nothing is green.**
   - Extend the red-scarcity tests to every hub route.
10. **Shell contract.**
    - Tenant scope comes from the shell's accessor only.
    - Every mutation follows the shell's action pattern: Zod → auth → role → hospital-scope check → action → PII-redacted log → audit → typed result.
    - Panels use the panel API. ⌘K entries go through feature registration.
    - No decrypted PHI anywhere in the hub.
11. **Stack as found.** No new dependencies without stopping to flag. A clean clone must still run with Node 22 + pnpm.
12. **Verified reference data only.**
    - Presets, the national test menu, holidays and catalogues each carry a source, a date and a signature.
    - The pharmacy regulator is the **Pharmacy Board of Uganda**, never PSU.
13. **Works in every state after approval:** `provisioning` (when setup happens) and `active`.

---

## 3. What is wrong or missing today

| #   | Problem                                                                                                                                                                                                         | Evidence                  | Severity            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------- |
| H1  | **The Departments area is a placeholder.** After setup, nobody can see or change departments, heads, wards or beds                                                                                              | screenshot                | Operations          |
| H2  | **Moved data needs a home.** Onboarding v2 moved departments and services out of the application. Without a permanent home they have nowhere to live and can't be changed later                                 | onboarding v2 §5.10       | Product             |
| H3  | **Services exist only on the application.** Clinics, diagnostics and support services are arrays on the application record: not per hospital, not editable, and without days, hours, places or status           | extraction §7             | Data                |
| H4  | **Clinic days aren't anchored.** The booking engine has session templates, but nothing ties a clinic to its department, place, hours or holiday rules from the hospital's side                                  | booking PRD; to confirm   | Operations          |
| H5  | **No lab test menu.** Ordering can't tell in-house tests from referred-out ones. The gap against the national standard menu is invisible (nationally, 31.9 % of the menu was met in DHIS2, July 2022–June 2023) | UNIPH (App. C)            | Clinical operations |
| H6  | **No live availability.** Reagent stock-outs, equipment downtime and closed wards are recorded nowhere that clinicians, patients or emergency directions can see                                                | —                         | Safety, referrals   |
| H7  | **Emergency settings are scattered.** Emergency capability and pre-alert settings are "minimal fields in the existing hospital profile/setup area". Only the ambulance number is four-eyes verified             | emergency pathway prompt  | Safety              |
| H8  | **Departments have no kinds.** They're a flat, Internal-Medicine-shaped list, so reception staff must pick a clinical department at sign-up                                                                     | seed; onboarding v2       | Data                |
| H9  | **No heads or in-charges.** There's no head-of-department or ward in-charge assignment, and no history                                                                                                          | placeholder "coming next" | Governance          |
| H10 | **Occupancy would be fabricated.** The placeholder promises "live occupancy", but no admission engine exists yet                                                                                                | roadmap Tier 4            | Honesty law         |
| H11 | **No hospital-level holidays or closures** (to confirm against the booking engine's blackout dates)                                                                                                             | —                         | Operations          |
| H12 | **No places or directions** ("Block C, Room 12, first floor") for patients or for SMS                                                                                                                           | —                         | Patient experience  |

---

## 4. Design direction

**Seven rules**

1. **Select, then refine** (Law 3).
2. **Start from your level.** A signed MoH preset for the facility level pre-ticks the usual departments, clinics, tests and services as _Planned_. The admin unticks what they don't run.
3. **See the week.** Clinic days show as the hospital's timetable (the one pinned on the notice board), and it can be printed.
4. **Say what's down.** One "Availability now" list, plus an amber count in the hub header when anything is out.
5. **Everything has a place and an owner.**
   - A department has a head.
   - A ward has an in-charge.
   - A clinic has a place and days.
   - A test has a section and hours.
6. **One tap to the right panel.** Every list row opens its detail panel. Nothing needs a separate page.
7. **Show the consequence first.** Archiving, closing or cancelling shows who and what is affected before you confirm.

**Budgets**

- Next or Continue buttons anywhere in the hub: **0**.
- Configuring a General Hospital from its preset (departments, clinics with days, test menu, emergency and support) takes **≥ 70 % fewer interactions** than from scratch. Measure both in Phase 7.
- Any item's detail panel is **1 tap** from its row.
- Tab switch **< 100 ms** p95.

---

## 5. Interface specification

### 5.1 Frame

**Navigation**

- The nav item is renamed **Departments & services**.
- The route stays `/hospital-admin/departments`, with a sub-route per tab. The old URL keeps working.

**Header**

- Title and a one-line lead: _"What your hospital runs, where and when. Staff sign-up, booking, ordering and emergency directions all read from here."_
- An amber availability count when anything is out ("2 services unavailable · View").
- A summary strip with real counts only.

**Tabs** (URL state; a plum underline marks the current tab)

- Departments · Wards & beds · Clinics · Diagnostics · Emergency & support · Availability · Hours & places.

**Panels**

- Each list row opens a slide-out panel (shell panel API) with the item's details, owner, history (audit) and actions.

**Phone**

- Tabs become a select, and panels become full-height sheets.
- Desktop-first, and unbroken on phone (shell contract).

```
┌───────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ MedSync       │ TEST HOSPITAL 5 · REGIONAL REFERRAL · PROVISIONING          ⌕ Jump to…  ⌘K     │
│ TEST HOSP. 5  ├──────────────────────────────────────────────────────────────────────────────┤
│ Overview      │ Departments & services                     ▲ 2 services unavailable · View   │
│ Staff         │ What your hospital runs, where and when. Staff sign-up, booking, ordering and │
│ Departments & │ emergency directions all read from here.                                      │
│  services     │ 9 departments (4 live) · 11 wards · 214 beds · 7 clinics · 58 tests in-house  │
│  (plum = here)│ Departments  Wards & beds  Clinics  Diagnostics  Emergency & support  …       │
│ Scheduling    │ ▔▔▔▔▔▔▔▔▔▔▔  (plum underline = current tab)                                    │
│ Intake        ├──────────────────────────────────────────────────────────────────────────────┤
│ Reports       │                                   [ Start from ▾ ]   [ + Add departments ]    │
│ Admins        │ CLINICAL                                                                      │
│ Audit         │  Internal Medicine    Live · start dept   Head: Dr …    6 units · 3 wards  ›  │
│ Hospital      │  Surgery              Not on MedSync yet  Head: —       2 wards            ›  │
│  profile      │  Paediatrics          Not on MedSync yet  Head: Dr …    1 ward · 2 clinics ›  │
│               │ DIAGNOSTIC                                                                    │
│               │  Laboratory           Live                In-charge: …  6 sections         ›  │
│               │  Radiology & imaging  Not on MedSync yet                4 services         ›  │
│               │ SUPPORT                                                                       │
│               │  Pharmacy · Nutrition & dietetics                                          ›  │
│               │ ADMINISTRATIVE                                                                │
│               │  Records & health information   Live                                       ›  │
└───────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 First run

An empty hub (nothing beyond the seed) offers three ways in, side by side:

1. **Start from the MoH standard for your level** (a Regional Referral Hospital, for Test Hospital 5).
   - Shown only once that level's preset is signed (D-SVC-03).
   - A preview lists what will be ticked.
   - Applying marks every item **Planned**: not live, not public.
2. **Bring in what you told us when you applied.**
   - Only for hospitals that applied through the old form (legacy application arrays; mapping in Appendix B).
   - Offered once, and afterwards kept under "Start from ▾".
3. **Pick from the catalogue.**

### 5.3 Departments

**The list**

- Grouped by kind: Clinical · Diagnostic · Support · Administrative.
- Each row: name · MedSync status (Live / Not on MedSync yet) · start-department marker · head · counts (units, wards, clinics, services) · ›.
- **+ Add departments** opens a grouped checklist from the catalogue (Appendix A.1), with search. IM sub-specialties nest under Internal Medicine as units. "Other" takes free text.

```
┌ Internal Medicine ─────────────────────────────────────── ✕ ┐
│ Clinical · Start department                                  │
│ Live on MedSync        (● On) ( Off)                         │
│ Head of department     Dr …  since …          [ Change ]     │
│ Acting head            —                      [ Add ]        │
│ Units   Wards   Clinics   Services   Staff   History         │
│ ─────                                                        │
│ Cardiology · Nephrology · Endocrinology · Gastroenterology … │
│ [ + Add unit ]                                               │
│                                                              │
│ Archive department: not possible while it's in use.          │
│ 23 staff · 4 weekly sessions · 3 wards. Reassign first.      │
└──────────────────────────────────────────────────────────────┘
```

**The department panel**

- **Live on MedSync** (D-SVC-02).
  - Live departments appear in staff sign-up, triage queues and booking.
  - Switching it off hides the department from _new_ sign-ups and bookings only. Existing staff and bookings are untouched, and the counts show before you confirm.
- **Start department.** One per hospital. Taken from the application's primary department where there is one.
- **Head of department.**
  - Picked from approved staff affiliated to this department.
  - "Acting" is allowed, with dates.
  - The history is kept (effective dated) and audited. The previous head's end date is set automatically.
- **Units** (sub-specialties or sections): add, rename, archive.
- **Panel tabs:** Units · Wards · Clinics · Services · Staff (a count, and a link to Staff) · History.
- **Archive** stays disabled, with counts, while the department is in use.

### 5.4 Wards & beds

**The list:** ward · department · type · sex/age · beds (open/closed) · in-charge · status.

**The ward panel**

- **Name** and **owning department**.
- **Type** (Appendix A.5): general, HDU, ICU, NICU, maternity, labour suite, isolation, paediatric, surgical, emergency observation, private.
- **Sex** (female / male / mixed) and **age group** (adult / paediatric / neonatal / all).
- **Place** and **in-charge** (approved nursing staff, effective dated).
- **Bed count.**
- **Optional bed register:** "Generate Bed 1–30", rename beds, mark a bed closed with a reason.
- **Status:** open · temporarily closed (with reason and expected reopening; this feeds Availability) · archived.

**Occupancy** gets one honest line: _"Occupancy arrives with the inpatient module."_ No numbers.

**Derived counts** for Emergency & support (CAP-3): ICU beds, HDU beds, isolation beds, NICU cots.

### 5.5 Clinics and clinic days

Two views: **Timetable** (a week grid) and **List**.

```
Clinics  ·  [Timetable] [List]                          [ + Add clinics ]  [ Print timetable ]
Week of Mon 28 Sep 2026  ‹ ›        Next holiday: Fri 9 Oct, Independence Day · 2 sessions skip
┌──────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│      │ Mon             │ Tue             │ Wed             │ Thu             │ Fri             │
├──────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ AM   │ Medical OPD     │ Diabetes        │ Medical OPD     │ Diabetes        │ Renal           │
│      │ 08:00–13:00     │ 08:00–13:00     │ 08:00–13:00     │ 08:00–13:00     │ 09:00–12:00     │
│      │ Block A, Rm 2   │ Block C, Rm 12  │ Block A, Rm 2   │ Block C, Rm 12  │ Block B, Rm 3   │
│      │ 80 · 50/30      │ 60 · 40/20      │ 80 · 50/30      │ 60 · 40/20      │ 25 · booked     │
├──────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ PM   │ Hypertension    │ Sickle cell     │ ART clinic      │ Epilepsy        │                 │
│      │ 14:00–17:00     │ 14:00–16:00     │ (confidential)  │ 1st Thu monthly │                 │
└──────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

**+ Add clinics** opens a catalogue checklist (Appendix A.2), with each type's confidentiality default shown.

**The clinic panel.** The clinic _is_ the booking engine's bookable service (E-SVC-02).

- **Name** (from the catalogue, or custom).
- **Department** (and unit) and **place**.
- **Who can book:** patients directly · referral only · staff only.
- **Confidential:** on by default for the types marked in A.2, with a one-line note: _"Patient messages won't name this clinic."_
- **Clinic days** = session templates:
  - repeat weekly on chosen days, every N weeks, or on the nth weekday of the month;
  - start and end time;
  - place;
  - capacity, and the booked/walk-in split;
  - clinicians (optional);
  - "runs on public holidays" (off by default);
  - effective from and to.
- **Add a one-off session** (an outreach day, a screening day).
- **Upcoming exceptions:** holidays that skip sessions and closures, each with its number of affected bookings.
- **Cancel or close sessions** through the booking engine's cancel-session flow. It is a sensitive action: counts first, a reason, mass notification, rebooking offers.

**Print timetable**

- Print CSS only: one A4 landscape page per week, grouped by department, with places.
- No PDF library (E-SVC-06).

**Public directory**

- Published clinics (where "who can book" is patients) appear in the patient booking directory, with their days, hours and places.

### 5.6 Diagnostics

Two sub-tabs: **Laboratory** · **Imaging & other tests**.

**Laboratory**

- **Sections** are units of the Laboratory department (Appendix A.3). Each has an in-charge and hours. Sections route the lab-tech worklist (seam).
- **The test menu table:**

| Column            | Holds                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Test              | The test name                                                               |
| Section           | The bench it runs on                                                        |
| Where             | In-house · Referred out · Not offered                                       |
| Hours             | 24 h, or scheduled                                                          |
| Stated turnaround | The facility's own operational figure. **Not a clinical target**            |
| Referred to       | The national sample transport hub, CPHL, a named facility, or a private lab |
| Now               | Current availability                                                        |

- **Filters, search and bulk edit** (e.g. "Mark all Haematology tests 24 h").
- **+ Add tests / Start from ▾:**
  - the national standard test menu for the facility's level (a signed import);
  - tests outside the national menu, added from the ordering catalogue.
- **Standards comparison:** _"You offer 58 of the 146 tests on the national menu for a Regional Referral Hospital · See the gaps"_. The gap list shows tests that are neither offered nor referred.

```
Laboratory · 6 sections · 58 in-house · 14 referred           [ + Add tests ]  [ Start from ▾ ]
You offer 58 of the 146 tests on the national menu for a Regional Referral Hospital · See the gaps ›
[ All sections ▾ ] [ Where ▾ ] [ Hours ▾ ]   ⌕ Search tests                    [ Bulk edit ]
┌──────────────────────┬─────────────┬───────────────────────┬──────────┬───────────┬───────────────┐
│ Test                 │ Section     │ Where                 │ Hours    │ Stated TAT│ Now           │
├──────────────────────┼─────────────┼───────────────────────┼──────────┼───────────┼───────────────┤
│ Full blood count     │ Haematology │ In-house              │ 24 h     │ 2 h       │ Available     │
│ HbA1c                │ Chemistry   │ In-house              │ Mon–Fri  │ 1 day     │ ▲ Unavailable │
│                      │             │                       │          │           │ reagent out   │
│ HIV viral load       │ Molecular   │ Referred · CPHL (hub) │ —        │ —         │ —             │
└──────────────────────┴─────────────┴───────────────────────┴──────────┴───────────┴───────────────┘
```

**Imaging & other tests**

- The catalogue (Appendix A.4): X-ray, ultrasound, CT, MRI, mammography, fluoroscopy, ECG, echocardiography, endoscopy, EEG, spirometry (confirm the list).
- Each item: where (in-house / referred / not offered) · machines (count) · hours · referred to · now (availability).

### 5.7 Emergency & support

- One page with numbered sections and no Next (Law 3).
- Values that route emergencies are marked **Emergency routing** and show their verification state.

```
[01] EMERGENCY DEPARTMENT                                              Emergency routing
 Open 24 hours               (● Yes) ( No)        Verified · Dr … · 26 Sep
 Triage system               [ SATS           ▾ ]
 Resuscitation bays          [ 2 ]                ▲ Change pending · needs a second admin
 Accept ambulance pre-alerts (● Yes) ( No)        Board owner per shift [ Reception lead ▾ ]
 Emergency SMS number        [+256][          ]   Ambulance line [+256][          ] ▲ Unverified
 Directions for ambulances   [ Enter by the casualty gate on …  (≤ 140 characters)          ]
[02] THEATRES        Theatres [ 3 ]    Emergency theatre 24 h (● Yes) ( No)
[03] CRITICAL CARE   ICU beds 4 · HDU beds 6 · Isolation beds 8 · NICU cots 10  (from Wards & beds)
                     Ventilators [ 3 ]
[04] BLOOD           Source (● On-site blood bank) ( From a regional blood bank ) ( None )
                     Blood available 24 h (● Yes) ( No)
[05] OXYGEN          [✓] Plant [✓] Cylinders [ ] Concentrators · Piped to wards (● Yes) ( No) · 24 h
[06] PHARMACY  [07] DIALYSIS  [08] AMBULANCE  [09] MORTUARY  …
```

| Section                   | Holds                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01] Emergency department | Open 24 h · triage system · resuscitation bays · accepts pre-alerts (with a board owner per shift) · emergency SMS number · ambulance line · directions for arriving ambulances. All reuse the emergency pathway's fields |
| [02] Theatres             | Number of theatres · emergency theatre 24 h                                                                                                                                                                               |
| [03] Critical care        | ICU, HDU and isolation beds and NICU cots, all derived from Wards & beds · number of ventilators                                                                                                                          |
| [04] Blood                | Source: on-site blood bank / issued from a regional blood bank / none · blood available 24 h                                                                                                                              |
| [05] Oxygen               | Plant, cylinders, concentrators · piped to wards · 24 h                                                                                                                                                                   |
| [06] Pharmacy             | Dispensing points and their hours · 24 h                                                                                                                                                                                  |
| [07] Dialysis             | Machines · sessions per week                                                                                                                                                                                              |
| [08] Ambulance            | Vehicles · 24 h                                                                                                                                                                                                           |
| [09] Mortuary             | Yes / no · capacity                                                                                                                                                                                                       |

- Every routing-relevant value shows either "Verified by … · date" or, in amber, "Needs a second admin" (CAP-5).
- Designating isolation or treatment units for highly infectious diseases is MoH's decision, not the hospital's. The hub shows isolation beds only.

### 5.8 Availability now

```
Availability now · 2 problems                                               [ Report a problem ]
┌──────────────────────┬───────────────┬───────────────────┬────────┬───────────────┬────────────────────┐
│ Service              │ State         │ Reason            │ Since  │ Expected back │ Last confirmed     │
├──────────────────────┼───────────────┼───────────────────┼────────┼───────────────┼────────────────────┤
│ HbA1c · Laboratory   │ ▲ Unavailable │ Reagent stock-out │ 24 Sep │ 30 Sep        │ 26 Sep 09:10 · …   │
│ CT · Imaging         │ ▲ Unavailable │ Equipment down    │ 22 Sep │ 25 Sep passed │ ▲ Unconfirmed ·    │
│                      │               │                   │        │               │ check  [ Confirm ] │
└──────────────────────┴───────────────┴───────────────────┴────────┴───────────────┴────────────────────┘
History (90 days) ▸
```

**Report a problem**

1. Pick any item: a department, ward, clinic session, test, section, imaging service or capability.
2. Choose Unavailable or Limited.
3. Pick a reason (Appendix A.6).
4. Optionally add an expected-back date, and a note.

**When the expected-back time passes without an update**

- The item shows **"Unconfirmed — check"** in amber, and the reporter is nudged (notification seam).
- It **never** silently turns back to Available.

**History:** the last 90 days, filterable. This is also the seam for a downtime report (days down per service).

**Who can report:** hospital admins and heads of department now. Section and ward in-charges will report from their own workspaces later (seam).

### 5.9 Hours & places

| Section              | Holds                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01] Opening hours   | OPD hours by weekday. Emergency hours come from Emergency & support                                                                                                                                                       |
| [02] Public holidays | The national list for the year, from a verified source. Movable dates are maintained yearly, and Eid dates are added when the government announces them. _"Clinics skip public holidays unless a clinic says otherwise."_ |
| [03] Closures        | Scope (the whole hospital, a department, a ward or a clinic), dates and a reason. Affected sessions and bookings are shown first; the closure then runs through the booking engine's cancel flow                          |
| [04] Places          | Building, floor, room, and patient directions (≤ 140 characters, to fit an SMS). Used by clinics, wards, lab sections and imaging                                                                                         |

### 5.10 Where this data shows up

| Consumer                                                            | What it reads                                                                                                        | In this prompt                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Staff sign-up (onboarding v2)                                       | Live departments of every kind                                                                                       | The department list's source changes to live departments                             |
| Triage and intake queues                                            | Live departments                                                                                                     | Read only                                                                            |
| Booking (patient app and Desk)                                      | Public clinics, sessions, places, holidays, confidentiality                                                          | The same records                                                                     |
| Ordering (EMR)                                                      | Test menu, imaging, current availability                                                                             | Contract `getOrderingAvailability` (seam). The EMR decides the display, within Law 6 |
| Lab-tech workspace                                                  | Sections                                                                                                             | Worklist routing (seam)                                                              |
| Emergency pathway                                                   | Verified emergency capabilities, contacts, directions and pre-alert status, plus coordinates (from Hospital profile) | Through the capability profile                                                       |
| Admin Overview                                                      | Bed counts (the occupancy denominator)                                                                               | Read; occupancy comes later                                                          |
| Referral, and Cardiometabolic Centre partner analysis (both future) | Capability profile and standards comparison                                                                          | Seam                                                                                 |
| Superadmin                                                          | Cross-tenant aggregates, no PHI                                                                                      | Seam                                                                                 |

### 5.11 ⌘K and registration

- **Nav entry:** "Departments & services".
- **Entities:** departments, wards, clinics, tests.
- **Actions:** "Add a clinic", "Report a problem", "Print clinic timetable", "Assign a head of department".
- **Badge:** the availability count on the nav item, in amber, shown only when it's above zero.

---

## 6. Engines (every rule has an ID and at least one test)

### 6.1 Structure (`lib/services/structure/**`)

- **STR-1** A department has:
  - a kind: clinical | diagnostic | support | administrative;
  - an optional parent (which makes it a unit);
  - an archive date and a MedSync live date.
- **STR-2** Exactly one start department per hospital, once any department is live.
- **STR-3** Heads of department and ward in-charges are effective-dated.
  - One current per department or ward, plus at most one acting.
  - Heads must be approved staff affiliated to that department.
  - Ward in-charges must be approved nursing staff at the hospital.
  - Every change is audited.
- **STR-4** Archiving is blocked while an item is referenced: active affiliations, future sessions with bookings, and (later) occupied beds. The block lists the counts. Unarchiving restores the item.
- **STR-5** A ward belongs to one department. Its bed count is at least the number of beds in its register. Closed beds reduce open beds, not the total.
- **STR-6** Legacy data from the setup wizard is read as-is and classified.
  - Existing departments, IM sub-specialties and wards are kept.
  - IM sub-specialties become units of Internal Medicine **with their ids unchanged**, so existing affiliations keep working.

### 6.2 Clinics and calendar (`lib/services/clinics/**`, over the booking engine)

- **CLN-1** A clinic is the booking engine's service record. If department, unit, place, audience or the confidential flag are missing from it, they are added (GATE A decides where those columns live).
- **CLN-2** Clinic days are the booking engine's session templates. The hub never stores sessions itself.
- **CLN-3** Recurrence: weekly on chosen days; every N weeks; the nth weekday of the month; one-off. All with effective dates.
- **CLN-4** A session on a public holiday or inside a closure is skipped, unless the clinic runs on public holidays. **Closures always win.**
- **CLN-5** For a confidential clinic, the booking engine's message rendering never includes the clinic's name or type. Test this with the SMS renderer.
- **CLN-6** Cancelling or closing uses the booking engine's cancel-session flow. The hub adds only the entry point.

### 6.3 Diagnostics (`lib/services/diagnostics/**`)

- **DX-1** A test offering is (hospital, catalogue test) → where (in-house | referred | not offered), section, hours, stated turnaround, referred-to.
  - The catalogue test comes from the ordering side's catalogue.
  - The national standard test menu is imported **into that catalogue**, with level membership. Never a second list.
- **DX-2** Lab sections are units of the Laboratory department.
- **DX-3** Imaging and other tests: (hospital, catalogue item) → where, machines, hours, referred-to.
- **DX-4** `getOrderingAvailability(hospitalId, code)` returns where, hours, stated turnaround, referred-to, and current availability with its since and last-confirmed times. No personal data. Pure over its inputs.

### 6.4 Capabilities (`lib/services/capabilities/**`)

- **CAP-1** A typed, versioned key catalogue (Appendix A.7). Each key's values are validated with Zod.
- **CAP-2** Where emergency pathway fields already exist, they are read and written through that pathway's own records. The hub is their editor, not a second store.
- **CAP-3** Derived capabilities (ICU, HDU and isolation beds, NICU cots, total beds) are computed from Wards & beds. They are never typed in.
- **CAP-4** Every key carries a `routing_relevant` flag, taken from the signed catalogue.
- **CAP-5** A change to a routing-relevant value stays **pending** until a second person verifies it.
  - The second person is another hospital admin, or a superadmin.
  - The author can't verify their own change.
  - Until then, the capability profile carries the previous verified value marked "change pending", or "unverified" if there was none.

### 6.5 Availability (`lib/services/availability/**`)

- **AV-1** Availability is a stream of append-only events (reported, updated, resolved, confirmed). The current state is a projection over them.
- **AV-2** Once the expected-back time passes with no update, the state becomes "unconfirmed", never "available".
- **AV-3** A closed ward, a closure and a cancelled session feed the same projection, so there is one "Availability now".
- **AV-4** The projection informs; nothing blocks on it. Test that ordering, booking by staff and triage actions ignore it.

### 6.6 Presets and standards (`lib/services/presets/**`)

- **PS-1** A preset records: facility level, version, source document, page references, items, who signed it and when. Unsigned presets are invisible.
- **PS-2** Applying a preset:
  - only adds items, as Planned (not live, not public);
  - never removes or overwrites an existing item;
  - reports what it added and what it skipped.
- **PS-3** The standards comparison is pure: the facility's offerings against the signed preset for its level, giving offered, referred and gaps.

### 6.7 Capability profile (`lib/services/profile.ts`)

- **PRF-1** `computeCapabilityProfile(hospitalId, audience)` returns a versioned document with no personal data. It contains: departments (live, with kinds), clinics (public ones only for the `public` audience), diagnostics, verified capabilities, availability now, hours, places and holidays.
- **PRF-2** There are three audiences:
  - `internal`: staff of that hospital;
  - `network`: other MedSync surfaces, such as the emergency pathway and referral;
  - `public`: patients, and only items marked public.
- **PRF-3** A schema test proves there are no personal-data fields, and there are snapshot tests per audience.

---

## 7. Data changes

Reuse and extend. Phase 0 maps what exists. Use the next free migration number, and keep every change additive.

**Structure**

- On departments: `kind`, `parent_department_id`, `catalogue_code`, `medsync_live_at`, `archived_at`, `is_start`, place.
- `department_heads` and `ward_in_charges` (department or ward, user, acting, from, to, assigned_by), unless the staff feature already models them (Q7).
- On wards: type, sex, age group, place, status, and closed reason / expected reopening.
- `beds`: ward, label, type, closed reason.
- `places`: building, floor, room, directions (≤ 140 characters).

**Clinics**

- Department, unit, place, audience and confidential go either as columns on the booking engine's service table or in a 1:1 extension table (E-SVC-02).

**Diagnostics**

- `test_offerings` and `diagnostic_offerings`.
- Catalogue imports: the national test menu with level membership, and the imaging catalogue.

**Capabilities**

- `capability_values`: hospital, key, value, author, verified_by / verified_at, pending value.
- Keys that belong to the emergency pathway stay in that pathway's columns (CAP-2).

**Availability**

- `availability_events`.

**Calendar**

- `holidays` (year, date, name, source), unless the booking engine already has one.
- `closures` (scope, dates, reason), unless the booking engine's blackout dates already cover this.

**Presets**

- `service_presets` and their items, plus an import script that records source and page references.

**RLS probes**

| Actor                          | Access                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| Hospital admin (same hospital) | Read and write                                               |
| Head of department             | Read all; write own department (actions ready now, UI later) |
| Staff of that hospital         | Read the internal view                                       |
| Other hospitals                | Denied                                                       |
| Anonymous                      | The public profile only, through the profile action          |
| Superadmin                     | Aggregates only                                              |
| Any client, direct write       | Denied everywhere                                            |

## 8. Server actions

All follow the shell's action pattern.

| Group        | Actions                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure    | `addDepartments`, `updateDepartment`, `setDepartmentLive`, `setStartDepartment`, `assignHead`, `endHead`, `addUnit`, `archive`, `unarchive`, `upsertWard`, `generateBeds`, `closeBed`, `assignWardInCharge`, `upsertPlace` |
| Clinics      | `addClinics`, `updateClinic`. Session templates are created, updated and ended through the booking engine's own actions: extend them if a field is missing; don't wrap them in a copy                                      |
| Diagnostics  | `upsertTestOfferings` (bulk), `upsertDiagnosticOffering`                                                                                                                                                                   |
| Capabilities | `setCapability`, `verifyCapability`, `rejectCapability`                                                                                                                                                                    |
| Availability | `reportProblem`, `updateProblem`, `resolveProblem`, `confirmStillDown`                                                                                                                                                     |
| Calendar     | `addClosure` (preview counts → confirm → the booking engine's cancel flow). The holiday import is reference data, for superadmins only                                                                                     |
| Presets      | `previewPreset`, `applyPreset`, `importLegacyApplication` (once per hospital, idempotent)                                                                                                                                  |
| Reads        | `getOrderingAvailability`, `computeCapabilityProfile`, `computeStandardsComparison`                                                                                                                                        |

---

## 9. Phases and gates

### Phase 0 — Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** The shell contract document: the scope accessor, registration, panel API and action pattern. Is it Edge Functions or server actions on this branch?
- **Q2** ORM and database, locally and in production (as onboarding v2 Q1).
- **Q3** What the registration upgrade built: departments, units, wards, beds, the primary/start flag, and the setup wizard's state. Include screenshots of the wizard.
- **Q4** The booking engine: services, session-template fields, capacity splits, blackout dates, holidays, confidential flags and the cancel-session flow. Is it built, or still only a PRD?
- **Q5** The emergency pathway: which fields exist, and where (`emergency_capability`, `pre_alert_enabled`, the board owner, directions, the SMS number, `emergency_contacts` and its four-eyes).
- **Q6** The orders pipe: `encounterOrders` and `encounterResults`, the orderables catalogue and its codes (LOINC?), and the lab-tech workspace's sections and worklists.
- **Q7** The staff model: affiliations, any head or in-charge flags, roles. Which cadres count as nursing for ward in-charge?
- **Q8** The legacy application arrays: their fields, and each hospital's values (Test Hospital 5 included).
- **Q9** Where sign-up, triage and booking read their department lists from today.
- **Q10** The existing four-eyes mechanism, to reuse for CAP-5.
- **Q11** Notifications: can the system nudge for unconfirmed availability and announce head assignments?
- **Q12** The feature-flag mechanism. Are Playwright and axe present? If not, STOP and flag (Law 11).
- **Q13** Design tokens for chips (neutral, amber), tabs, panels and print styles.
- **Q14** Which datasets are to hand: the MoH Service Standards (2016), the national standard test menu (2017 revision), and the holiday list.

**Baseline:**

- Screenshots of the placeholder and of the setup wizard.
- The number of interactions it takes to configure a General Hospital today.
- Failing tests for:
  - H3: services can't be edited;
  - H8: reception staff must pick a clinical department;
  - H10: a guard proving no occupancy number is shown.

**STOP 0.** Report Q1–Q14, every difference between this prompt and the repo, the failing tests and the baseline.

### Phase 1 — GATE A proposal (documents only)

Write `docs/hospital-services/gate-a-proposal.md`:

- **Annotated wireframes** of every tab and panel, desktop and phone. Start from Section 5; improve it, don't bloat it.
- **The reuse map:** every fact → its single store.
- **The schema diff** (Section 7).
- **The catalogues:** Appendix A, corrected against the repo.
- **Preset extraction tables** from the MoH sources, with page references.
- **The legacy mapping** (Appendix B).
- **The consumer contracts** (5.10).
- **The decision table** (Section 13) with a signature block, and the ADR drafts.

**STOP 1.** Nothing proceeds without Fadhul's signature.

### Phase 2 — Engines and data

Build the Section 6 engines and the Section 7 changes, with the catalogue imports, RLS probes and rule tests.

**STOP 2.** Report:

- rule coverage (every rule ID → its tests);
- the RLS probe table;
- the import reports: catalogue counts, preset items with sources, and a dry run of the legacy mapping for Test Hospital 5;
- the profile schema test.

### Phase 3 — Hub frame, Departments, Wards & beds

- The frame and tabs, first run, applying presets, and the legacy import.
- Departments: panel, live switch, start department, heads, units, archive.
- Wards & beds, and minimal places.
- ⌘K, and the nav rename with its redirect.

**STOP 3.** S1–S6, screenshots (desktop and phone), and interaction counts.

### Phase 4 — Clinics, calendar, hours & places

- Clinics: timetable, list, panel, session templates through the booking engine, one-off sessions.
- The confidential flag.
- Holidays, closures and hours.
- Places, completed.
- The printable timetable, and the public directory hook.

**STOP 4.** S7–S10, and a screenshot of the printed timetable.

### Phase 5 — Diagnostics and availability

- Lab sections and the test menu (import, bulk edit, filters).
- Imaging & other tests.
- The standards comparison.
- Availability: report, update, resolve, unconfirmed, history.
- The ordering contract, and the lab worklist seam.

**STOP 5.** S11–S12, and table performance.

### Phase 6 — Emergency & support, the profile, onboarding link-up

- The capabilities page, with emergency pathway fields going through CAP-2.
- Four-eyes verification.
- The capability profile, for all three audiences.
- Consumers wired: sign-up lists live departments; the emergency pathway reads the profile.
- Onboarding v2's setup-checklist links. If onboarding v2 hasn't landed yet, the link targets are ready and documented.

**STOP 6.** S13–S15 and S17.

### Phase 7 — Verification and hardening

- All scenarios.
- Timing a General Hospital configuration from its preset against from scratch.
- Accessibility, performance, ADRs, final report.

**STOP 7 (final).** Section 12, filled in.

### Scenarios

- **S1** First run on a Regional Referral Hospital with a signed preset:
  - applying it adds departments, clinics, tests and services as Planned (not live, not public);
  - the interactions are counted.
- **S2** Legacy import for Test Hospital 5:
  - its application data is offered once, and accepting maps it per Appendix B;
  - routing-relevant values arrive unverified;
  - if declined, it isn't offered again, but stays under "Start from ▾".
- **S3** Surgery set live: it appears in clinician sign-up and triage queues. Set not live: it's hidden from new sign-ups, and existing staff are unaffected.
- **S4** Head of department:
  - assigning an approved Internal Medicine clinician is audited, and the history shows the previous head;
  - an acting head with dates works;
  - a user not affiliated to the department is rejected.
- **S5** Archiving a department with staff is blocked, with counts. After reassignment, archiving succeeds. Nothing is deleted, and the history is intact.
- **S6** Wards:
  - "Female medical" (Internal Medicine, 30 beds, labels generated);
  - an ICU with 4 beds makes "ICU beds = 4" appear, derived, in Emergency & support.
- **S7** The Diabetes clinic (Tue and Thu, 08:00–13:00, Block C Room 12, capacity 60 split 40/20):
  - it exists as session templates in the booking engine (the same rows the Desk and Scheduling read);
  - patient booking shows it, if it's public.
- **S8** Independence Day (Fri 9 Oct 2026): Friday sessions are skipped, except for a clinic marked "runs on public holidays".
- **S9** Closing the Renal clinic for 12–16 Oct:
  - the affected sessions and bookings show first;
  - the booking engine's cancel flow then runs, as a sensitive action.
- **S10** A confidential ART clinic: the booking engine's SMS body names neither the clinic nor its type.
- **S11** The General Hospital national menu is applied:
  - HbA1c: in-house, Mon–Fri, stated turnaround 1 day;
  - HIV viral load: referred via the hub;
  - the comparison shows "N of 85";
  - `getOrderingAvailability` returns the right answer for three sample tests.
- **S12** HbA1c is reported unavailable (reagent stock-out, back 30 Sep):
  - the header count shows 1;
  - the ordering contract returns the since and last-confirmed times;
  - after the date passes, the state is "unconfirmed";
  - resolving it keeps the history;
  - an order for HbA1c still goes through.
- **S13** Admin A sets "Emergency department open 24 h":
  - the value is pending;
  - admin A can't verify their own change;
  - admin B verifies it, and the profile updates.
- **S14** The capability profile:
  - the schema has no personal-data fields;
  - the `public` audience shows published items only;
  - it is versioned.
- **S15** Permissions:
  - department-scoped actions work only for the current head, on their own department;
  - staff can only read;
  - other hospitals are denied;
  - anonymous callers get the public profile only.
- **S16** Print timetable: one A4 landscape page per week, legible in black and white.
- **S17** Onboarding v2's checklist links land on the right tabs. "Departments" is done once a start department is live.

---

## 10. Accessibility, motion, colour

- **Standard:** WCAG 2.2 AA.
- **Tabs** are a `tablist`.
- **The timetable** is a table with day and AM/PM headers. Each session is a button with a full accessible name, e.g. "Diabetes clinic, Tuesday 08:00 to 13:00, Block C Room 12, 60 places".
- **Checklists** are fieldsets with a legend per group, and their counts are announced.
- **Chips** always carry a word. Amber always has an icon. Nothing is green.
- **Reduced motion:** panels open without sliding.
- **Print:** the timetable is legible in black and white.

## 11. Performance budgets

| Measure                        | Budget                              |
| ------------------------------ | ----------------------------------- |
| Hub TTFB                       | p95 < 400 ms                        |
| Tab switch (prefetched)        | p95 < 100 ms                        |
| Panel open                     | < 150 ms                            |
| Test-menu filter over 300 rows | < 50 ms                             |
| Preset preview                 | < 1 s                               |
| Added JS for the hub           | ≤ 60 KB gzipped (report the number) |

## 12. Numbers to report at the final STOP

| Metric                                                                    | Baseline | Target                       | Result |
| ------------------------------------------------------------------------- | -------- | ---------------------------- | ------ |
| Next/Continue buttons in the hub                                          | —        | 0                            |        |
| Interactions to configure a General Hospital, from preset vs from scratch | P0       | ≥ 70 % fewer with the preset |        |
| Stores for sessions or clinics outside the booking engine                 | —        | 0                            |        |
| Departments, wards, clinics or tests an admin can't edit after setup      | all      | 0                            |        |
| Structural changes without an audit row                                   | —        | 0                            |        |
| Routing-relevant changes live without a second person                     | —        | 0                            |        |
| Numbers shown without a backing engine (e.g. occupancy)                   | P0       | 0                            |        |
| Personal-data fields in the capability profile                            | —        | 0                            |        |
| Rule IDs without a test                                                   | —        | 0                            |        |
| RLS probes passed                                                         | —        | 100 %                        |        |
| axe serious/critical                                                      | P0       | 0                            |        |
| Tab switch p95 / test-menu filter p95                                     | —        | < 100 ms / < 50 ms           |        |
| Red outside the Emergency affordance on hub routes                        | —        | 0                            |        |

## 13. GATE A decisions (Fadhul owns; recommendations given)

| #        | Decision                       | Recommendation                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-SVC-01 | Name and place                 | Rename the nav item "Departments & services". Keep the route. Seven tabs                                                                                                                                                                                                       |
| D-SVC-02 | MedSync status per department  | A "Live on MedSync" switch. Only live departments appear in staff sign-up, triage queues and booking. Switching it off affects new sign-ups and bookings only                                                                                                                  |
| D-SVC-03 | Level presets                  | Build them from the MoH Service Standards and Service Delivery Standards (2016) and the national standard test menu (2017 revision), with page references. Fadhul signs each level before it shows. Applying one adds items as Planned only                                    |
| D-SVC-04 | Department kinds and additions | Four kinds: clinical, diagnostic, support, administrative. Add Laboratory, Radiology & imaging, Pharmacy, Nutrition & dietetics, Mortuary, Records & health information, and Reception & front desk (A.1). This gives reception and records staff a real department at sign-up |
| D-SVC-05 | Heads and in-charges           | Effective-dated, and acting is allowed. Heads come from approved staff affiliated to the department; ward in-charges from approved nursing staff                                                                                                                               |
| D-SVC-06 | Beds                           | Bed count required; the register is optional, with generated labels. Special bed types are derived into capabilities. No occupancy until the inpatient module                                                                                                                  |
| D-SVC-07 | Clinics and clinic days        | One record: the booking engine's service plus its session templates. The hub is an editor                                                                                                                                                                                      |
| D-SVC-08 | Confidential clinics           | On by default for HIV/ART, TB, mental health, family planning, and sexual & reproductive health. Fadhul (as CSO) and the lawyer sign the list                                                                                                                                  |
| D-SVC-09 | Holidays and closures          | National holidays are seeded each year from a verified source, with Eid dates added when announced. Clinics skip holidays unless marked otherwise. Closures always win, and run through the booking engine's cancel flow                                                       |
| D-SVC-10 | Lab test menu                  | A per-hospital overlay on the ordering catalogue. Import the national standard test menu with level membership. Stated turnaround is operational, never a clinical target                                                                                                      |
| D-SVC-11 | Emergency-routing capabilities | The keys marked R in A.7 need a second person: another hospital admin, or a superadmin. Authors can't verify their own changes. Unverified values reach signposting only as "unverified"                                                                                       |
| D-SVC-12 | Availability                   | Admins and heads report it now; in-charges later, from their own workspaces. After the expected-back date it becomes "unconfirmed". It never blocks a clinical action, and the last-confirmed time is always shown                                                             |
| D-SVC-13 | Capability profile             | Three audiences (internal, network, public). No personal data. Items reach the public only if marked public                                                                                                                                                                    |
| D-SVC-14 | Standards comparison           | Visible to the hospital's own admins. Superadmins see cross-tenant aggregates only. Nothing leaves MedSync (to MoH or partners) without the hospital's agreement                                                                                                               |
| D-SVC-15 | Legacy application data        | Offer a one-time import to hospitals that applied through the old form (Appendix B)                                                                                                                                                                                            |
| D-SVC-16 | Head-of-department editing     | Server actions accept department-scoped edits by the current head now. The heads' own interface comes with the HOD surfaces                                                                                                                                                    |
| D-SVC-17 | Onboarding v2                  | Its setup checklist links here for departments, wards, clinics, diagnostics, and emergency & support. Location, contacts and infrastructure go to the Hospital profile area. The Departments task is done when a start department is live                                      |
| E-SVC-01 | Reuse map                      | Extend what Phase 0 finds: the setup-wizard tables, the booking engine, the emergency pathway, the orders catalogue. New tables only where nothing exists                                                                                                                      |
| E-SVC-02 | Clinic columns                 | A 1:1 extension table on the booking engine's service record if MedSync Desk shares that schema; plain columns otherwise                                                                                                                                                       |
| E-SVC-03 | Capability storage             | A typed key catalogue plus one values table, so new keys need no migration. Emergency pathway keys stay in their own columns (CAP-2)                                                                                                                                           |
| E-SVC-04 | Availability storage           | Append-only events, plus a projection                                                                                                                                                                                                                                          |
| E-SVC-05 | Presets                        | Versioned data files, plus an import script that records sources and page references. The signature is stored                                                                                                                                                                  |
| E-SVC-06 | Print                          | Print CSS only; no PDF dependency                                                                                                                                                                                                                                              |

## 14. Out of scope (leave clean seams)

**Waits for another engine**

- **Live bed occupancy, admissions and bed assignment:** the inpatient module.
- **The heads' own interface:** the actions are ready now. In-charges reporting availability from ward and lab workspaces is a seam.

**Not built here**

- **Referral routing between facilities, and sharing the profile outside MedSync** (MoH, partners).
- **Prices, billing and insurance.**
- **Analyser/LIS integration, reference ranges and specimen rules.**
- **Staff duty rosters.**
- **An equipment asset register and maintenance tickets.** The hub keeps counts and availability only.

**Someone else's decision**

- **Designating isolation or treatment units for outbreaks.** That is MoH's decision.

**Reads this data later**

- **The Cardiometabolic Centre partner analysis** will read the profile and the standards comparison.
- **The Hospital profile area** (location pin, contacts, infrastructure). Onboarding v2 builds its first slice.

## 15. ADRs (next free numbers)

- The Departments & services hub as the single editor of hospital structure and services.
- The reuse map: one store per fact.
- Department kinds, and MedSync live status per department.
- Effective-dated heads and in-charges.
- Clinics as booking services; clinic days as session templates.
- Confidential clinics in patient messages.
- The test menu as a facility overlay on the ordering catalogue, and the national menu import.
- Availability as append-only events: the "unconfirmed" rule, and "informs, never blocks".
- Four-eyes for emergency-routing capabilities.
- The capability profile and its audiences.
- Level presets from MoH sources.

## 16. Definition of Done

- [ ] H1–H12 resolved, or deferred with a reason.
- [ ] Every department, ward, clinic, test and capability can be selected and edited from the hub. There are no Next buttons.
- [ ] Clinic days are the booking engine's session templates, with no second store. Tests are an overlay on the ordering catalogue.
- [ ] Every rule ID has a test. RLS probes are green, and client writes are denied.
- [ ] No occupancy or other number is shown without a backing engine. Presets are visible only once signed.
- [ ] Routing-relevant capabilities need a second person. The capability profile carries no personal data.
- [ ] Availability never blocks a clinical action (proved by tests).
- [ ] axe is clean. Red-scarcity tests are green on every hub route. Reduced motion is honoured. The timetable prints legibly.
- [ ] S1–S17 pass. Onboarding v2's checklist links resolve.
- [ ] ADRs written. The final report has its numbers. The diff on `feat/hospital-services-hub` is reviewable.

---

## Appendix A — Catalogues to confirm at GATE A

**A.1 Departments**

- Keep the existing 23 departments, with the IM sub-specialties as units of Internal Medicine.
- Add, by kind (D-SVC-04):
  - **Diagnostic:** Laboratory; Radiology & imaging.
  - **Support:** Pharmacy; Nutrition & dietetics; Mortuary.
  - **Administrative:** Records & health information; Reception & front desk.

**A.2 Clinics** (C = confidential by default; the list is for Fadhul and the lawyer to sign)

- **Existing:** Diabetes · Hypertension / cardiac · Renal / dialysis · Oncology · HIV / ART (C) · TB (C) · Antenatal / maternal · Asthma / COPD · Mental health (C).
- **Proposed:** General medical outpatients · Surgical outpatients · Paediatric outpatients · Sickle cell · Epilepsy / neurology · Family planning (C) · Sexual & reproductive health (C) · Immunisation / young child · Nutrition · Eye · ENT · Dental · Orthopaedic · Skin · Physiotherapy · Palliative care · Postnatal · Gynaecology.

**A.3 Laboratory sections**
Clinical chemistry · Haematology · Microbiology · Parasitology · Serology / immunology · Molecular (PCR, GeneXpert) · Blood transfusion / blood bank · Histopathology & cytology. Align these with the sections used in the national standard test menu.

**A.4 Imaging & other tests**

- **Existing:** X-ray · Ultrasound · CT · MRI · Mammography · ECG · Echocardiography · Endoscopy.
- **Proposed:** Fluoroscopy · EEG · Spirometry.

**A.5 Ward types**
General · HDU · ICU · NICU · Maternity · Labour suite · Isolation · Paediatric · Surgical · Emergency observation · Private.

**A.6 Availability reasons**
Equipment down · Reagent or supplies stock-out · Staff not available · Power or water outage · Maintenance or repair · Building works · Other (with a note).

**A.7 Capability keys**
R = routing-relevant (proposed; Fadhul signs as CSO). \* = derived from Wards & beds.

| Group                | Keys                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emergency department | `ed_open_24h` (R) · `triage_system` · `resus_bays` (R) · `accepts_pre_alerts` (R, with board owner) · `emergency_sms_number` (R) · `ambulance_line` (R) · `arrival_directions` (R) |
| Theatres             | `theatres_count` · `emergency_theatre_24h` (R)                                                                                                                                     |
| Critical care        | `icu_beds`\* (R) · `hdu_beds`\* (R) · `isolation_beds`\* · `nicu_cots`\* (R) · `ventilators_count` (R)                                                                             |
| Blood                | `blood_source` (R) · `blood_24h` (R)                                                                                                                                               |
| Oxygen               | `oxygen_sources` (R) · `oxygen_piped` · `oxygen_24h` (R)                                                                                                                           |
| Pharmacy             | `pharmacy_dispensing_points` · `pharmacy_24h`                                                                                                                                      |
| Dialysis             | `dialysis_machines` · `dialysis_sessions_per_week`                                                                                                                                 |
| Ambulance            | `ambulances_count` · `ambulance_24h` (R)                                                                                                                                           |
| Mortuary             | `mortuary` · `mortuary_capacity`                                                                                                                                                   |

## Appendix B — Legacy application → hub (one-time import)

| Application field                                              | Lands in the hub as                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `departments`                                                  | Departments (Planned, with the kind from the catalogue)                                                                                                                            |
| `im_subspecialties`                                            | Units of Internal Medicine                                                                                                                                                         |
| `primary_department`                                           | Start department                                                                                                                                                                   |
| `departments_other`, `specialised_clinics_other`               | Custom departments and clinics, flagged for review                                                                                                                                 |
| `specialised_clinics`                                          | Clinics (Planned, no days yet)                                                                                                                                                     |
| `diagnostic_services`, "Lab — …"                               | Laboratory sections                                                                                                                                                                |
| `diagnostic_services`, imaging / ECG / echo / endoscopy        | Imaging & other tests (In-house; machine count unknown)                                                                                                                            |
| `support_services`                                             | **Pharmacy** → dispensing. **Blood bank** → blood source: on-site. **Operating theatres** → theatres, count unknown. **Mortuary** → yes. **Ambulance** → ambulances, count unknown |
| `has_onsite_pharmacy`                                          | Pharmacy department and capability                                                                                                                                                 |
| `services_offered`                                             | **OPD** → Hours. **Emergency 24/7** → `ed_open_24h`. **Day-care / Referral** → capability keys. **Inpatient** → noted, pending wards                                               |
| `bed_capacity_band`, `clinical_staff_band`, `daily_opd_band`   | Not imported: real counts come from wards, staff and usage                                                                                                                         |
| `internet_connectivity`, `power_backup`, `existing_emr(_name)` | Hospital profile (infrastructure)                                                                                                                                                  |

Every imported value that is routing-relevant arrives **unverified** (CAP-5).

## Appendix C — Sources checked (26 Sep 2026; re-verify at build time)

**National standard test menu**

- The _Uganda National standard test menu, techniques, and supplies list for laboratories_ (MoH, National Health Laboratory and Diagnostic Services): launched 2011, revised 2013 and 2017.
- Tests per level: Regional Referral Hospital 146 · General Hospital 85 · HC IV 57 · HC III 31.
- Menu fulfilment in DHIS2 was 31.9 % (July 2022–June 2023).
- Source: https://uniph.go.ug/a-31-9-laboratory-test-menu-fulfillment-rate-in-district-health-information-system-version-2-dhis-2-july-2022-june-2023-uganda/

**Service standards**

- MoH _Service Standards and Service Delivery Standards for the Health Sector_ (2016), the source for the level presets: https://library.health.go.ug/sites/default/files/resources/Health%20Sector%20Service%20Standards%20&%20Service%20Delivery%20Standards_2016.pdf

**Laboratory network**

- Uganda National Health Laboratory Services: hub guidelines and test menu (CPHL). Obtain these through MoH: https://www.cphl.go.ug/

**Public holidays in Uganda**

- **Fixed dates:** 1 Jan · 26 Jan · 16 Feb · 8 Mar · 1 May · 3 Jun · 9 Jun · 9 Oct · 25 Dec · 26 Dec.
- **Movable:** Good Friday · Easter Monday · Eid al-Fitr · Eid al-Adha.
- Verify against the government's announcement each year. Source: https://en.wikipedia.org/wiki/Public_holidays_in_Uganda

**MedSync prompts this builds on**

- The hospital admin shell contract.
- The hospital registration upgrade (setup wizard).
- The booking PRD (session templates, blackout dates, confidential service flags, cancel-session flow).
- The emergency pathway prompt (pre-alert fields; four-eyes on the ambulance number).
- The lab-tech workspace (the pipe principle).
- The Encounter/EMR prompt (orders and results).
- `PROMPT-ONBOARDING-V2.md`.
