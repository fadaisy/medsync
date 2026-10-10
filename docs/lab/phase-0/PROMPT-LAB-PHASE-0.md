# PROMPT: Lab Phase 0 — the front door (lab roles, landing, workspace shell, section worklist, turnaround clock)

> **For Claude Code.** Work at the repo root on a new branch `feat/lab-front-door`. Cut it from the branch that serves `/lab` on the EMR path (the code behind `EMR_V1`). Confirm which branch that is at STOP 0. First copy this prompt into `docs/lab/phase-0/`.
>
> **Mode:** gated. Six steps (0–5), each ending in a **STOP**. They are called steps because "Phase 0" already names this slice of the lab roadmap.
>
> - Documents use Stage 1: draft → critique against the checklist → revise (max two passes) → present → STOP.
> - Code uses Stage 2: build → run the real checks → fix → re-run until green → report numbers → STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing is built.** Section 3 lists what an earlier code read (origin/main @ 9d863bd, 9 Oct 2026) claimed. Treat every line as a claim to verify. Build what Step 0 proves is missing; reuse what it proves exists.
>
> **The CSO is Fadhul.** Three things here need his signature at GATE A:
>
> - the wording of the "automatic critical flagging is off" notice (D-LAB0-11);
> - which lab cadres may release a final result (D-LAB0-02);
> - anything that colours a waiting time (D-LAB0-07, D-LAB0-08).

---

## 0. What we are building, in one paragraph

The lab can receive specimens, enter results and release them, but lab staff cannot get to it. Sign-in sends a laboratory technician to the clinician home, nothing links to `/lab`, and approving a lab cadre grants no lab role. This slice opens the front door and nothing more. It settles **who may do what in the lab**, grants that access **automatically and audited** when a hospital admin approves a lab professional, **lands lab staff on `/lab`** at sign-in, gives the lab a **real workspace shell**, makes the worklist show **my bench first** with a **turnaround clock**, and makes the result screen **say plainly that MedSync is not flagging critical values**. It adds **no clinical write path**. Receiving, result entry and release stay exactly as they are.

**Done when:** every approved lab staff member lands on `/lab` at sign-in, and every role grant leaves an audit row.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, over the roadmap and over the design canvas. Report every disagreement at STOP 0.
2. **The plan this slice comes from:** the _MedSync Laboratory Roadmap_, version 2, section "Phase 0: Open the front door" (https://claude.ai/artifact/SQPdW66RcaAnu3QWQTYVTw).
3. **The UI reference:** the design canvas _Lab Phase 1 UI Preview_ (https://claude.ai/artifact/HUw8JeHp5qin66iZ8hC3Kv).
   - Artboard **"0 Worklist (Phase 0)"**: the shell, the section and stage filters, the row and the turnaround cell.
   - Artboard **"1 Result entry, flagging off"**: the placement and tone of the notice. Its wording is the Phase 1 wording; use Appendix B for this slice.
   - The canvas is drawn in MedSync Chroma. Build with the design system in force on this branch (Law 12).
   - Every patient, range, limit and time on the canvas is an example.
4. **Design and decisions:** `DESIGN-medsync.md` (authoritative), ADR 0097 (plum = place), ADR 0077 (two-step validation and its open follow-up), HARMONISATION §9 (the offering code on `test_catalogue`), Owner Runbook §8 (emptying the legacy `/lab` list).
5. **Prompts this builds on** (read the copies under `docs/`):
   - the lab-tech workspace prompt (the pipe principle);
   - `PROMPT-HOSPITAL-SERVICES-HUB.md` §5.6 and §6.3 (lab sections are units of the Laboratory department; "Sections route the lab-tech worklist (seam)"; stated turnaround);
   - `PROMPT-ONBOARDING-V2.md` Appendix B (profession → council, cadre, role) and §5.9 (staff approval);
   - `PROMPT-DOCTOR-WORKSPACE-UNIFIED.md` §5.6 and §5.7 (the shared page header, hidden "SOON" items, the registry pattern).
6. **Code:** `app/lab/**`, `app/(auth)/sign-in/actions.ts`, the staff approval and `assign-role` Edge Functions, the role and permission model, `lib/emr/**` (orders, specimens, `diagnostic_reports`), `test_catalogue`, the hub's diagnostics tables (sections, test offerings), the feature-flag module, `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** This slice is access plus read surfaces over the existing order, specimen and report engine. If Step 0 finds that engine missing or incomplete, **STOP and report**. Do not build receive, result entry or release here.
2. **Least privilege, granted once, audited always.** A lab permission is granted only inside an audited server-side function, in the same transaction as the approval that justifies it. Never from the client. Every grant and every revocation writes an audit row. A non-lab cadre never receives a lab permission.
3. **Identity is anchored to the council register.** Approval of an AHPC-registered lab professional is the only source of lab access. Nobody selects a lab role for themselves.
4. **Nothing disappears.** A specimen leaves the worklist only through a recorded action: received, rejected, released or cancelled. Filters hide rows; they never drop them. The "All sections" count is always visible.
5. **No remembered numbers.** A turnaround figure comes only from data: the facility's stated turnaround or the catalogue's target. With no figure, the cell shows elapsed time and nothing is coloured. No figure is derived, halved, defaulted or hard-coded.
6. **Honest time.** Every elapsed time is computed against the server clock. The device clock is never trusted.
7. **Red is a safety property.** This slice adds **no red**. Late is **amber**, with an icon and a word. Stages and record states are neutral chips with words. Extend the red-scarcity invariant tests to every `/lab` route.
8. **Two identifiers on every row.** Follow the existing identity module and its reveal logging. No new PHI in tooltips, aria-labels, URLs, logs or analytics.
9. **Informs, never blocks.** The Late label, the sort order and the notice inform. None of them prevents a clinical action.
10. **Say what the system is not doing.** While MedSync is not flagging critical values, the result screens say so, in signed wording, and the notice cannot be dismissed.
11. **Behind a flag.** `labWorkspace`, per hospital, off by default. With it off, sign-in, `/lab` and `/clinician` behave exactly as today.
12. **Stack as found.** Use the ORM, package manager, flag mechanism and design tokens already on the branch. TypeScript strict, no `any`. Zod on every action. AAL2 for clinical roles, which includes lab staff. No new dependencies without stopping to flag. A clean clone must still run with Node 22 + pnpm. **Tokens only, no hex.** Chroma arrives through its own branch (D-CV-11); do not import it here.
13. en-GB throughout. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it.

---

## 3. What the earlier code read claimed (verify every line at Step 0)

| #   | Claim                                                                                                                               | Where                            | Severity                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------- |
| L1  | Sign-in sends a lab technician to `/clinician`, not `/lab`                                                                          | `app/(auth)/sign-in/actions.ts`  | Access                                |
| L2  | Nothing in the app links to `/lab`. The lab has no navigation                                                                       | `app/lab/layout.tsx`             | Access                                |
| L3  | Approving a lab cadre does not grant `lab_tech`. Only `assign-role` does                                                            | approval function, `assign-role` | Access, governance                    |
| L4  | One role, `lab_tech`, covers every lab job. No phlebotomy role exists. The same person can save a preliminary and release the final | role model, ADR 0077             | Governance                            |
| L5  | The worklist ignores sections and department, although the hub defines 8 lab sections and the scope carries `departmentId`          | `/lab` worklist query            | Usability                             |
| L6  | The worklist shows only "waiting". Each test has `turnaround_target_minutes`, and the hub holds a separate stated turnaround        | worklist, `test_catalogue`, hub  | Operations                            |
| L7  | Critical limits are unsigned, so nothing flags, and the notification fan-out is a TODO. The result screen says nothing about this   | `app/lab/actions.ts:219`         | **Safety: fails silently**            |
| L8  | A stale "write workflow lands next" comment remains                                                                                 | `app/lab/layout.tsx`             | Hygiene                               |
| L9  | With `EMR_V1` off, `/lab` falls back to an older one-value-per-order table                                                          | `/lab`                           | Context: retired in lab Phase 1       |
| L10 | The worklist refreshes on action only                                                                                               | `/lab`                           | Context: live updates are lab Phase 2 |

---

## 4. Design direction

**Six rules**

1. **Land where you work.** A lab professional signs in and sees the worklist.
2. **My bench first, everything one tap away.** The worklist opens on the viewer's section. "All sections" is always one tap away and always shows its count.
3. **The row says what it is and what to do next:** two identifiers, the test, where it came from, priority, stage, time, one button.
4. **Time is shown; lateness is said in words.** Elapsed time against the lab's own promise. "Late by 25 min", never colour alone.
5. **Say what the system is not doing** (Law 10).
6. **Navigation shows only what exists.** No "SOON" items.

**Budgets** (measured at Step 0, met by Step 5)

- Navigations between a successful sign-in and the worklist: **0**.
- Sidebar items in this slice: **3**.
- Visible controls per worklist row: **1**.
- Section or stage switch: **< 100 ms** p95, with no refetch.
- Lab staff who must be told the URL: **0**.

---

## 5. Interface specification

### 5.1 Landing and access

- A user whose staff access is the lab lands on `/lab` after sign-in and AAL2.
- A valid deep link (`next`) inside the allowed paths wins over the default landing.
- A lab-only user who reaches `/clinician` is redirected to `/lab` (307, while the flag exists). They never see an empty clinician page.
- A user without `lab.view` who requests `/lab` gets the standard not-authorised page.
- A lab applicant who is not yet approved sees the pending page, as today.

### 5.2 The workspace shell

- **Sidebar, three items:** **Worklist** · **Released today** · **Rejected**. Each shows a neutral count.
- Items come from a **navigation registry** (6.5). Later phases register Criticals, Downtime entry, Set-up, QC and Reports. Until an item's page exists, it is not rendered.
- **Active item** uses the place colour of the design system in force (plum, ADR 0097). If the Chroma tokens are present on the branch, use the lab hue's tint, edge and text tokens. Never a left-edge bar.
- **Page header:** reuse the shared page header component (doctor workspace §5.6): eyebrow (hospital · Laboratory), H1, right-hand slot. If that component is not on the branch, build the header to the same contract and flag it.
- **Top-right:** the viewer's cadre and section ("Laboratory technologist · Clinical chemistry").
- Remove the stale comment (L8).

### 5.3 The worklist

```
┌──────────────┬────────────────────────────────────────────────────────────────────────────────────┐
│ TEST HOSP-1  │ Laboratory / Worklist                         Laboratory technologist · Clin. chem │
│              ├────────────────────────────────────────────────────────────────────────────────────┤
│ LABORATORY   │ Worklist                                                 Updated 10:42  [Refresh]  │
│ ▣ Worklist 14│ [Clinical chemistry 6][All sections 14][Haematology 4][Parasitology 2][Micro 1]…   │
│ ✓ Released 37│ [All stages][To receive 1][To result 4][Preliminary 1]   [All wards and depts ▾]   │
│ ⊘ Rejected  2├──────────────────┬─────────────────┬──────────┬──────────┬────────────┬────────────┤
│              │ Patient          │ Test            │ From     │ Priority │ Stage      │ Waiting    │
│              ├──────────────────┼─────────────────┼──────────┼──────────┼────────────┼────────────┤
│              │ Patient Nine-9   │ Glucose         │ Emergency│ Immediate│ To result  │ 6 min ·    │
│              │ MS-2026-00009    │                 │          │          │            │ target 30  │ [Enter results]
│              │ Patient Seven-7  │ Urea and        │ Ward 4A  │ Urgent   │ To result  │ 24 min ·   │
│              │ MS-2026-00007    │ electrolytes    │          │          │            │ target 1 h │ [Enter results]
│              │ Patient Three-3  │ Liver function  │ Ward 4A  │ Routine  │ To result  │ ▲ Late by  │
│              │ MS-2026-00004    │ tests           │          │          │            │ 25 min     │ [Enter results]
│              │ Patient Eight-8  │ HbA1c           │ Diabetes │ Routine  │ To result  │ 40 min ·   │
│              │ MS-2026-00015    │                 │ clinic   │          │            │ no target  │ [Enter results]
│              │ Patient One-1    │ Creatinine      │ Diabetes │ Routine  │ To receive │ Collected  │
│              │ MS-2026-00001    │                 │ clinic   │          │            │ 35 min ago │ [Receive]
│              ├──────────────────┴─────────────────┴──────────┴──────────┴────────────┴────────────┤
│              │ 6 of 14 specimens, in Clinical chemistry. The clock starts when the lab receives   │
│              │ the specimen. "Late" means past this lab's stated turnaround for the test.         │
└──────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

- **Section tabs.** The viewer's own section first, then "All sections", then the other sections that have rows. Each tab carries its count. The counts are computed before the section filter is applied, so they always add up to "All sections".
- **Stage filter.** All stages · To receive · To result · Preliminary. Counts are within the current section.
- **Ward or department filter.** The department or ward that ordered the test.
- **Columns.** Patient (two identifiers) · Test · From · Priority · Stage · Waiting · one primary button.
- **Priority** is a word: Immediate, Urgent or Routine. "Immediate" is set in the heavier weight. No colour (D-LAB0-09).
- **Primary button by stage:** Receive · Enter results · Continue. Each calls the existing route or action. A viewer who lacks the permission sees the row without a button. The top row's button uses the primary style; the rest use the secondary style.
- **Order of rows:** priority first. Within a priority: late rows (largest overrun first), then received rows by longest elapsed, then rows not yet received by longest since collection. The viewer may re-sort by any column; the default returns on reload.
- **Refresh.** A Refresh button and an "Updated hh:mm" stamp. Clock cells tick every 30 seconds from the server time, pause while the tab is hidden, and never trigger a fetch. No realtime in this slice (L10).
- **URL state.** `?section=&stage=&dept=&sort=`. Back, forward and reload restore the view.
- **Empty states.**
  - Nothing in my section: _"Nothing waiting in Clinical chemistry. 8 in other sections."_ with **Show all sections**.
  - Nothing at all: _"No specimens are waiting."_
  - The viewer has no section: the worklist opens on "All sections" and says so once.
- **Footer line** under the table, always: the "n of N" count, where the clock starts, and what Late means.

### 5.4 The turnaround cell

| State                             | The cell shows                                                    |
| --------------------------------- | ----------------------------------------------------------------- |
| Collected, not received           | `Collected 35 min ago · not received`, muted, no label            |
| Received, target known, not late  | `24 min · target 1 h`                                             |
| Received, target known, late      | amber chip with a clock icon: `Late by 25 min`, then `target 2 h` |
| Received, no target               | `40 min · no target set`                                          |
| Target from the catalogue default | as above, with `default` after the target                         |

Durations: `24 min`, `1 h 10 min`, `2 d 3 h`. Tabular figures and a fixed cell width, so a tick never shifts the layout.

### 5.5 Released today and Rejected

Both reuse the worklist's table, filters and identity rules. Both are read-only lists over existing records.

- **Released today:** final reports released since 00:00 hospital-local time. Columns: Patient · Test · Released (time, by cadre) · Turnaround (`52 min · target 1 h`, or `Late by 12 min`) · State (Final, Amended). The row opens the existing report view. Amendment stays where it is today.
- **Rejected:** specimens rejected in the last 7 days. Columns: Patient · Test · Rejected (time, by cadre) · Reason (the coded reason) · Now (`Awaiting re-collection`, or `Re-collected 11:20`). No action here: the order has already gone back to "to collect".

### 5.6 The "automatic critical flagging is off" notice

- **Where:** at the top of every result entry screen and every result review screen under `/lab`, above the results table.
- **When:** whenever `criticalFlaggingActive(hospital)` is false (6.6). In this slice that is always, but the notice is wired to the function, never hard-coded on.
- **Form:** the caution notice of the design system in force: amber tint, a triangle icon, a bold first sentence. `role="status"`. It has no close button.
- **Wording:** Appendix B, from a copy entry with a status. **Unsigned wording cannot be enabled in production** (CF-3).

### 5.7 Phone and tablet

Desktop-first; unbroken at 390 px and 834 px. Tabs scroll horizontally. A row becomes three lines: identifiers, then test and source, then stage, time and the button. Touch targets are at least 44 px. No mobile (Expo) work.

### 5.8 Flag and redirects

- `labWorkspace` on: everything in 5.1–5.7.
- `labWorkspace` off: today's behaviour, byte for byte.
- `labWorkspace` on and `EMR_V1` off: the shell, the landing and the navigation apply. The list content is the legacy list, unchanged, with one neutral line: _"This hospital is still on the old lab list."_ No section filter and no clock on legacy rows (LW-10).

---

## 6. Engines (pure, no I/O; every rule has an ID and at least one test)

### 6.1 Lab access (`lib/lab/access.ts`)

- **LA-1** Lab access is a set of **permissions**: `lab.view`, `lab.collect`, `lab.receive`, `lab.result.enter`, `lab.result.release`, `lab.manage`. The workspace role (`lab_tech`, or whatever Step 0 finds) is kept as the carrier, so nothing that reads roles today breaks.
- **LA-2** Permissions derive from **approved cadre** and **in-charge assignment** only. The map is data, versioned and signed at GATE A (Appendix A).
- **LA-3** `lab.view` is required for every `/lab` route and every lab read.
- **LA-4** Collection by nurses and doctors stays as it is today. They never receive `lab.view`.
- **LA-5** The Laboratory head and section in-charges (the hub's effective-dated assignments) hold `lab.manage`: whole lab for the head, own section for an in-charge. If the hub's assignments are not on the branch, `lab.manage` is granted to nobody and the gap is reported.
- **LA-6** Reception cadres, hospital admins and superadmins hold no lab permission. Hospital admins configure the lab through the hub, which carries no PHI.
- **LA-7** Permission checks happen in the server action and in RLS. The UI hides what the server would refuse; it is never the only guard.
- **LA-8** Deactivating a staff member, ending their affiliation or changing their cadre revokes lab permissions in the same transaction, audited.

### 6.2 Landing (`lib/auth/landing.ts`)

- **LD-1** `resolveLanding({ roles, permissions, cadre, lastWorkspace, next })` is one pure function that replaces the inline branching in the sign-in action. Every existing landing keeps its current result; prove this with a table test over every role and cadre found at Step 0.
- **LD-2** A user whose only staff workspace is the lab lands on `/lab`.
- **LD-3** A user with several staff workspaces follows D-LAB0-05.
- **LD-4** `next` is honoured only if it is a same-origin path the user may open. Otherwise it is ignored and the attempt is logged without PHI.
- **LD-5** A lab-only user requesting `/clinician` resolves to `/lab`.
- **LD-6** The patient/staff dual-role rule is not changed here.

### 6.3 Worklist projection (`lib/lab/worklist.ts`)

```ts
computeWorklist(input: {
  rows,            // open order lines with specimen and report state, hospital-scoped
  offerings,       // hub: test → section, stated turnaround (if present)
  catalogue,       // test → section, turnaround_target_minutes (if present)
  viewer: { userId, permissions, sectionIds },
  filters: { section, stage, dept, sort },
  serverNow,
}): { rows: WorklistRow[], sectionCounts, stageCounts, total }
```

- **LW-1** One row per unit the lab results as one report. A panel is one row.
- **LW-2** Stages: **To receive** (collected, not received) · **To result** (received, no report) · **Preliminary** (preliminary saved, not final). Released, rejected and cancelled items never appear.
- **LW-3** A row's section is the facility offering's section, else the catalogue's, else **No section**. "No section" rows appear under "All sections" and under their own tab. They are never hidden.
- **LW-4** The default section is the viewer's own. A viewer in several sections gets them combined as "My sections". A viewer in none gets "All sections".
- **LW-5** The department filter matches the ordering department or ward. Confirm at Step 0 what `departmentId` on the scope means; if it is the viewer's department, it is not this filter.
- **LW-6** Section counts ignore the section filter. Stage counts respect it.
- **LW-7** Default order: priority (immediate, urgent, routine). Within a priority: late rows (largest overrun first), then received rows by longest elapsed, then rows not yet received by longest since collection. The sort is stable.
- **LW-8** The primary action follows stage and permission. A missing permission gives no action, never a disabled button that explains nothing.
- **LW-9** Rows from another hospital never appear. Prove it with a fixture holding two hospitals.
- **LW-10** Legacy rows (`EMR_V1` off) are not projected.
- **LW-11** Every row carries two identifiers through the identity module. Reveal logging is batched per page load, in the existing pattern.
- **LW-12** A property test: for random inputs, every open item appears exactly once under "All sections", and the section counts sum to the total.

### 6.4 Turnaround (`lib/lab/turnaround.ts`)

- **TA-1** The clock starts at **lab receipt** and stops at **final release** (D-LAB0-06). A preliminary does not stop it. A rejection ends that specimen's clock; a re-collected specimen starts a new one.
- **TA-2** Before receipt, the cell shows the time since collection. It carries no label and no colour.
- **TA-3** The target is the facility's stated turnaround for the test when the hub has one, else the catalogue's `turnaround_target_minutes` marked `default`, else none (D-LAB0-07).
- **TA-4** Late means elapsed > target. The label is `Late by {duration}`.
- **TA-5** Priority-specific targets are used only if the data holds them. None is derived.
- **TA-6** Elapsed time uses `serverNow` plus the time since the response arrived. Test with a device clock set 3 hours wrong.
- **TA-7** The clock is wall-clock time. Section opening hours are not subtracted in this slice; the footer line says where the clock starts (D-LAB0-08).
- **TA-8** `formatDuration` is pure and tested at the boundaries: 0, 59 and 60 min, 23 h 59 min, 24 h.

### 6.5 Navigation registry (`lib/lab/nav.ts`)

- **NV-1** An ordered registry: `{ id, label, href, order, visibleFor(permissions), count? }`.
- **NV-2** The layout renders only registered items the viewer may see.
- **NV-3** This slice registers Worklist, Released today and Rejected, and nothing else.

### 6.6 Critical-flagging state (`lib/lab/critical-flagging.ts`)

- **CF-1** `criticalFlaggingActive(hospitalId)` is true only when a signed, in-force set of critical limits exists for that hospital. It reads the signed-reference mechanism if one exists (the `REF-CRIT-*` entries). If none exists it returns false. Lab Phase 1 replaces the body of this function, not its callers.
- **CF-2** The notice renders on every lab result screen while the function is false, and cannot be dismissed.
- **CF-3** The notice wording is a copy entry with a status (`draft` | `signed`). In production, `labWorkspace` cannot be switched on for a hospital while the wording is `draft`. Enforce it on the server and test it.

---

## 7. Data changes (only what GATE A approves; additive; next free migration number)

- **Permissions.** Extend the existing role and permission model if it can carry the six lab permissions (Q4). Add a table only if nothing exists (E-LAB0-01).
- **The cadre → permission map** as signed, versioned reference data (E-LAB0-02).
- **Section membership.** Reuse the staff affiliation's unit under the Laboratory department (the hub's model). If affiliations cannot hold a unit, STOP and flag; do not add a parallel store.
- **Role grant.** No new table if the audit log already records grants. Otherwise an audit kind for `lab_access_granted` and `lab_access_revoked`.
- **Backfill.** A script that lists approved lab staff who hold no lab access, with a dry run. It applies only after GATE A sees the list (D-LAB0-12).
- **The flag** `labWorkspace`, through the existing mechanism.
- **Indexes** only with `EXPLAIN` evidence from Step 0.
- **No change** to orders, specimens, reports or the catalogue.

**RLS probes** for every new or changed object:

| Actor                                            | Access                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| Lab staff, same hospital, with the permission    | Allowed                                                           |
| Lab staff, same hospital, without the permission | Denied                                                            |
| Doctor or nurse, same hospital                   | Lab lists denied; their existing order and result reads unchanged |
| Reception, hospital admin                        | Denied                                                            |
| Staff of another hospital                        | Denied                                                            |
| Superadmin, without break-glass                  | Denied                                                            |
| Anonymous                                        | Denied                                                            |
| Any client, direct INSERT, UPDATE or DELETE      | Denied                                                            |

## 8. Server actions and Edge Functions

Reuse, don't duplicate. Receive, reject, save preliminary, release and amend are **not touched**.

- **Staff approval** (existing function): on approving an AHPC lab cadre, grant the mapped permissions in the same transaction and write the audit row. Idempotent. The existing blocks stay (no approval without a licence on file).
- **`assign-role`** (existing): unchanged in behaviour. It stops being the only way a lab professional gets access.
- **Deactivation, affiliation end, cadre change** (existing): revoke lab permissions in the same transaction (LA-8).
- **`backfillLabAccess({ dryRun })`**: owner-run. Lists first, applies on confirmation, audits each grant.
- **Reads** (server components): `getLabWorklist`, `getLabReleasedToday`, `getLabRejected`. A fixed number of round trips. Each returns `serverNow`.

The house contract applies to every write: Zod → auth (`getUser()`, never `getSession()`) → AAL2 → role → hospital-scope check → one transaction → PII-redacted log → audit row → typed result `{ id, serverTime }`.

---

## 9. Steps and gates

### Step 0 — Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** The branch that serves `/lab` on the EMR path. The ORM, the migration pattern and the package manager on it.
- **Q2** The lab engine as it stands: tables for orders, specimens and `diagnostic_reports`; their states; the receive, reject, preliminary, release and amend actions. **If any of these is missing, STOP here** (Law 1).
- **Q3** L1–L10: confirm or correct each, with file and line.
- **Q4** The role and permission model. Is there anything finer than a role? Where are roles checked (middleware, actions, RLS)?
- **Q5** The staff approval function and `assign-role`: inputs, checks, audit rows. Which cadres map to which roles today?
- **Q6** Lab cadres in the catalogue. Onboarding v2 lists Laboratory technician and Laboratory technologist (AHPC). Is any other lab cadre seeded?
- **Q7** The sign-in action's landing logic: every branch, as a table of role and cadre → path.
- **Q8** What `departmentId` on the lab scope means, and where it is set.
- **Q9** Whether the hub is on this branch: lab sections as units, section in-charges, test offerings with a section and a stated turnaround. Is `test_catalogue` linked to offerings (HARMONISATION §9)?
- **Q10** Where a test's section lives today, if anywhere, and how many of the catalogue's tests have one.
- **Q11** `turnaround_target_minutes`: how many tests have a value, where the values came from, and whether they vary by priority.
- **Q12** Timestamps on a specimen: ordered, collected, received, preliminary, released. Which are always present?
- **Q13** How lab lists identify patients today: masked with an audited reveal, or shown? The identity module's contract.
- **Q14** The feature-flag mechanism, and the state of `EMR_V1` and `LAB_RESULTS_LIVE` per hospital.
- **Q15** Whether a signed-reference mechanism exists (`REF-*` entries with a status), and where critical limits would live.
- **Q16** The shared page header and sidebar components. Which design tokens are on the branch (plum for place, the amber caution pair, the neutral chip)? Are any Chroma tokens present?
- **Q17** Are Playwright and axe available? If not, STOP and flag (Law 12).
- **Q18** How other "today" lists compute hospital-local midnight.
- **Q19** Whether the server client still reads a legacy `service_role` key. If so, flag it: Supabase is replacing the `anon` and `service_role` keys with publishable and secret keys.

**Baseline:**

- Screenshots: sign-in as a lab technician and where it lands; `/lab`; `/clinician` as a lab technician. At 390×844, 834×1194 and 1440×900.
- Counts for the test hospital: approved lab staff; how many of them hold lab access; open specimens by stage; tests with a section; tests with a target.
- Queries and TTFB for `/lab`. axe results.
- **Failing tests** that reproduce L1, L3, L5 and L7. Do not fix them yet.

**STOP 0.** Report Q1–Q19, the prompt-versus-repo differences, the failing tests and the baseline.

### Step 1 — GATE A proposal (documents only)

Write `docs/lab/phase-0/gate-a-proposal.md`:

- the access model: permissions, the cadre map (Appendix A, corrected against the repo), and where each check runs;
- the landing table, before and after;
- annotated wireframes of the shell, the worklist (desktop and phone), the two lists and the notice, starting from Section 5 and the canvas;
- the worklist and turnaround rules as tables, each with one worked example from the test data;
- the schema diff, the backfill list (dry run) and the RLS probe plan;
- the notice wording, with its status;
- the test plan and the ADR drafts;
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions.

### Step 2 — Access

The permission model, the cadre map, the grant in the approval transaction, revocation, the backfill script (dry run only until told), `resolveLanding`, the flag, and the RLS probes.

**STOP 2.** The migration diff; the RLS probe table (every object × every actor); the landing table test; the backfill dry-run list; audit rows for one grant and one revocation.

### Step 3 — Engines (pure, no UI)

`worklist.ts`, `turnaround.ts`, `nav.ts`, `critical-flagging.ts` and the three read queries, with tests:

- every LA, LD, LW, TA, NV and CF rule ID covered;
- the two-hospital fixture (LW-9) and the property test (LW-12);
- the wrong-clock test (TA-6);
- the query budget asserted with a query counter;
- the Step 0 failing test for L5 now passes at the projection level.

**STOP 3.** Test counts, the rule coverage table, the property-test result and the query counts.

### Step 4 — Shell, worklist, lists and notice

The layout, the navigation registry, the page header, the worklist with its filters and URL state, the turnaround cell, Released today, Rejected, and the notice on the result screens. Primary buttons are wired to the existing routes and actions.

**STOP 4.** Screenshots against the canvas (three viewports, light, and dark if the workspace supports it); the budget counts; axe (0 serious or critical); red-scarcity tests green; flag-off screenshots identical to the baseline.

### Step 5 — Scenarios, hardening and documentation

Run the scenarios (Playwright if present, otherwise scripted integration tests):

- **S1** A hospital admin approves a Laboratory technician with a licence on file. The permissions are granted in that transaction, with an audit row. The technician signs in and lands on `/lab`.
- **S2** An approved lab technologist who held no access before: after the backfill, they land on `/lab`.
- **S3** A nurse is approved. No lab permission is granted. `/lab` is refused.
- **S4** A haematology technologist opens the worklist: it shows Haematology. "All sections" shows every open specimen. Reload restores the view.
- **S5** A test with no section: it appears under "All sections" and under "No section".
- **S6** A specimen received 70 minutes ago against a 60-minute stated turnaround: "Late by 10 min", amber, with its icon. The same specimen with no target: elapsed time, "no target set", no colour.
- **S7** A specimen collected but not received: "Collected … ago · not received", no label. After Receive, the clock restarts from receipt.
- **S8** Release a final result: the row leaves the worklist and appears in Released today with its turnaround. Nothing else changes.
- **S9** Reject a specimen: it appears in Rejected with its coded reason, and the order is back in "to collect".
- **S10** The device clock is 3 hours wrong: every elapsed time still matches the server.
- **S11** The result screen shows the notice. With `criticalFlaggingActive` stubbed true, the notice is absent. With the wording at `draft`, production refuses to enable `labWorkspace`.
- **S12** Reception is refused. Staff of another hospital are refused. A lab technician of hospital A sees no specimen of hospital B.
- **S13** A lab technician is deactivated: access is revoked in that transaction, audited, and the next request is refused.
- **S14** `labWorkspace` off: sign-in, `/lab` and `/clinician` behave as in the baseline.
- **S15** `labWorkspace` on with `EMR_V1` off: the shell and landing apply, and the legacy list is unchanged, with its one-line note.
- **S16** A viewer without `lab.result.enter`: rows show no "Enter results" button, and the action is refused on the server.
- **S17** Phone viewport: S4 and S6 end to end.

Then: reduced motion, the performance budgets, the ADRs and the final report.

**STOP 5 (final).** The table in Section 13, filled in.

---

## 10. Accessibility, motion, colour

- WCAG 2.2 AA. Targets at least 44×44 px on touch.
- Section and stage filters are `tablist`s with counts in their accessible names ("Clinical chemistry, 6").
- The worklist is a table with real headers. The action column has a visually hidden header. Each button's accessible name includes the patient and the test ("Enter results, Patient Seven-7, urea and electrolytes").
- The Late chip's accessible name is its full text. Colour is never the only signal.
- The clock tick is not announced. A live region (polite) announces only the result of Refresh ("Worklist updated, 14 specimens").
- The notice is `role="status"`, not an alert: it is standing information.
- Reduced motion: no row animation.
- Plum (or the lab hue's tint) marks the active navigation item only. Buttons and focus are teal. Amber is Late. No red. No green. No left-edge bars.

## 11. Performance budgets

| Measure                             | Budget                              |
| ----------------------------------- | ----------------------------------- |
| `/lab` TTFB with 500 open specimens | p95 < 400 ms                        |
| Section or stage switch             | p95 < 100 ms, no refetch            |
| Round trips per render              | fixed, regardless of row count      |
| Layout shift on a clock tick        | 0                                   |
| Added JS on `/lab`                  | ≤ 30 KB gzipped (report the number) |

## 12. Security, privacy, audit

- AAL2 on every `/lab` route. Hospital scope on every read. Reception blocked in the app and in the database.
- Writes only through audited server-side functions. No client write to any role or permission object.
- Every grant, revocation and backfilled grant is audited with the actor, the basis (cadre, council, approval reference) and the hospital.
- Logs, analytics, URLs and realtime payloads carry no PHI. Filters in the URL are ids, never names.
- Name reveals on the lists follow the existing reveal logging (Q13).
- The governance gap stays documented: Fadhul holds superadmin, CSO and audit-reviewer roles at once.

---

## 13. Numbers to report at the final STOP

| Metric                                                      | Baseline | Target                | Result |
| ----------------------------------------------------------- | -------- | --------------------- | ------ |
| Approved lab staff who land on `/lab` at sign-in            | S0       | 100 %                 |        |
| Approved lab staff with no lab access                       | S0       | 0                     |        |
| Lab access grants without an audit row                      | —        | 0                     |        |
| Non-lab cadres holding a lab permission                     | S0       | 0                     |        |
| Navigations between sign-in and the worklist                | S0       | 0                     |        |
| Sidebar items rendered that have no page                    | —        | 0                     |        |
| Open specimens missing from "All sections"                  | —        | 0                     |        |
| Worklist rows with fewer than two identifiers               | S0       | 0                     |        |
| Coloured waiting times with no data-backed target           | —        | 0                     |        |
| Lab result screens without the notice while flagging is off | all      | 0                     |        |
| Rule IDs without a test                                     | —        | 0                     |        |
| RLS probes passed                                           | —        | 100 %                 |        |
| axe serious or critical                                     | S0       | 0                     |        |
| Red on `/lab` routes added by this slice                    | —        | 0                     |        |
| Section switch p95 / added JS                               | —        | < 100 ms / ≤ 30 KB gz |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #         | Decision                                  | Recommendation                                                                                                                                                                                                     |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-LAB0-01 | The lab access model                      | Six permissions carried by the existing workspace role, derived from cadre and in-charge assignment. Not four separate roles                                                                                       |
| D-LAB0-02 | Who may release a final result (CSO)      | Laboratory technicians and laboratory technologists both. Release is its own permission, so a hospital can restrict it later without a code change. The second-verifier question stays with lab Phase 1 (ADR 0077) |
| D-LAB0-03 | A phlebotomy role                         | None. Collection stays with nurses, doctors and lab staff. No such cadre is in the catalogue                                                                                                                       |
| D-LAB0-04 | Lab management                            | The Laboratory head and section in-charges from the hub hold `lab.manage`. No new assignment store                                                                                                                 |
| D-LAB0-05 | Landing for staff with several workspaces | The workspace last used, stored on the server; otherwise the workspace of the primary affiliation's cadre                                                                                                          |
| D-LAB0-06 | The turnaround clock's two points         | Lab receipt to final release. ISO 15189:2022 leaves the two points to the laboratory to define and agree with its users. Time before receipt is shown, never labelled                                              |
| D-LAB0-07 | Which figure drives "Late"                | The facility's stated turnaround from the hub; else the catalogue target, marked "default"; else no label. The hub calls its figure operational and not a clinical target, which is what this label is             |
| D-LAB0-08 | Working hours                             | Wall-clock time in this slice. A working-hours clock comes with lab reports (roadmap Phase 3)                                                                                                                      |
| D-LAB0-09 | Colour for "Immediate" priority           | None. The word, the weight and the sort order carry it. Red stays for critical results and the Emergency affordance                                                                                                |
| D-LAB0-10 | An Emergency affordance on lab pages      | No. The lab's emergency path is the critical alert, which arrives in lab Phase 1                                                                                                                                   |
| D-LAB0-11 | The notice wording (CSO)                  | Appendix B. Sign it before any production hospital is switched on                                                                                                                                                  |
| D-LAB0-12 | Backfill of existing lab staff            | Review the dry-run list, then apply. Every grant audited                                                                                                                                                           |
| D-LAB0-13 | Patient names on lab lists                | Name and MRN on every row, with batched reveal logging, as on the doctor workspace (D1). If lists are masked today, keep the mask and the reveal                                                                   |
| D-LAB0-14 | Second factor for lab staff               | AAL2 required. Lab staff are clinical staff                                                                                                                                                                        |
| D-LAB0-15 | Rollout                                   | `labWorkspace` per hospital, test hospital first. It requires signed notice wording in production                                                                                                                  |
| E-LAB0-01 | Permission storage                        | Extend the existing model. A new table only if nothing can carry permissions                                                                                                                                       |
| E-LAB0-02 | The cadre map                             | Versioned reference data with a signature, not constants in code                                                                                                                                                   |
| E-LAB0-03 | Landing logic                             | One pure `resolveLanding`, covered by a table test of every existing landing                                                                                                                                       |
| E-LAB0-04 | Section routing                           | Offering section, else catalogue section, else "No section". This closes the hub's worklist seam                                                                                                                   |
| E-LAB0-05 | The clock                                 | Server time plus a 30-second client tick. No polling and no realtime                                                                                                                                               |

## 15. Out of scope (leave clean seams)

**Lab Phase 1, the safety floor.** Marking a result critical and alerting the doctor · automatic critical flagging · repeat and confirm · fixed units and test codes · the reference-range store · downtime working · retiring the legacy `/lab` path. This slice leaves `criticalFlaggingActive` and the navigation registry ready for them.

**Lab Phase 2 and later.** One test menu · payment status · point-of-care tests · identity check at collection · scan to receive · the live worklist · clinical context on the specimen · HMIS outputs · QC · reports.

**Not here at all.** Any change to receive, reject, result entry, release or amend · a mobile (Expo) lab workspace · SMS or push · search.

## 16. ADRs (next free numbers)

- The lab access model: permissions by cadre, carried by the workspace role.
- Lab access is granted at approval and revoked at deactivation, in the same transaction.
- One landing resolver for sign-in.
- The lab worklist projection and section routing.
- The turnaround clock: its two points, its source of target, and "no figure, no colour".
- The "system says what it is not doing" notice, and the critical-flagging state seam.

## 17. Definition of Done

- [ ] L1–L8 resolved. L9 and L10 recorded as deferred, with their phases.
- [ ] Every approved lab professional lands on `/lab`. Every grant and revocation has an audit row. No non-lab cadre holds a lab permission.
- [ ] The worklist opens on the viewer's section. "All sections" shows every open specimen, and the counts add up.
- [ ] No waiting time is coloured without a data-backed target. Every elapsed time uses the server clock.
- [ ] Every lab result screen shows the signed notice while flagging is off.
- [ ] No clinical write path was added or changed.
- [ ] Every rule ID has a test. RLS probes are green, and client writes are denied.
- [ ] axe is clean. Red-scarcity tests are green on every `/lab` route. Reduced motion is honoured.
- [ ] S1–S17 pass. With the flag off, behaviour matches the baseline.
- [ ] ADRs written. The final report has its numbers. The diff on `feat/lab-front-door` is reviewable.

---

## Appendix A — Proposed permission map (for signature at GATE A)

| Who                                   | view     | collect  | receive  | enter    | release         | manage      |
| ------------------------------------- | -------- | -------- | -------- | -------- | --------------- | ----------- |
| Laboratory technician (AHPC)          | yes      | yes      | yes      | yes      | yes (D-LAB0-02) | no          |
| Laboratory technologist (AHPC)        | yes      | yes      | yes      | yes      | yes             | no          |
| Section in-charge (hub assignment)    | by cadre | by cadre | by cadre | by cadre | by cadre        | own section |
| Head of Laboratory (hub assignment)   | by cadre | by cadre | by cadre | by cadre | by cadre        | whole lab   |
| Nurse, doctor                         | no       | as today | no       | no       | no              | no          |
| Reception, hospital admin, superadmin | no       | no       | no       | no       | no              | no          |

Any other lab cadre found in the catalogue at Step 0 gets no row until Fadhul adds one.

## Appendix B — Copy (draft; the notice needs the CSO's signature)

| Key                           | Text                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notice, first sentence (bold) | Automatic critical flagging is off.                                                                                                                   |
| Notice, body                  | MedSync will not flag critical values at this hospital. Follow the lab's critical-call procedure and phone critical results to the ward.              |
| Late                          | Late by {duration}                                                                                                                                    |
| Not received                  | Collected {duration} ago · not received                                                                                                               |
| No target                     | {elapsed} · no target set                                                                                                                             |
| Default target                | {elapsed} · target {target} default                                                                                                                   |
| Footer                        | {n} of {N} specimens, in {section}. The clock starts when the lab receives the specimen. "Late" means past this lab's stated turnaround for the test. |
| Empty, my section             | Nothing waiting in {section}. {n} in other sections.                                                                                                  |
| Empty, all                    | No specimens are waiting.                                                                                                                             |
| No section assigned           | You are not assigned to a lab section, so this shows all sections.                                                                                    |
| Legacy list                   | This hospital is still on the old lab list.                                                                                                           |
| Refused                       | You do not have access to the laboratory workspace. Ask your hospital admin.                                                                          |

The canvas shows a longer notice that mentions marking results by hand. That sentence belongs to lab Phase 1, when the mark exists.

## Appendix C — Sources checked (10 Oct 2026; re-verify at build time)

- **ISO 15189:2022 on turnaround time.** Clause 3.30 defines it as the elapsed time between two specified points through the pre-examination, examination and post-examination processes. Turnaround times are defined by the laboratory and agreed with users, and the rate of achieving them is a quality indicator (5.5 d, note). Read through the Irish National Accreditation Board's notification: https://www.inab.ie/inab-documents/notifications/notification-on-turnaround-times-tats.pdf
- **SLIPTA checklist version 3 (2023)** is based on ISO 15189:2022: https://aslm.org/wp-content/uploads/2024/07/1720161712-resource_file-Changes-of-SLIPTA-Checklist-V-3-and-Transition-Plan.pdf
- **A-LIS User Guide** (Central Public Health Laboratories), for what public labs in Uganda already expect of a lab worklist: https://cphl.go.ug/web/sites/default/files/2024-10/ALIS%20User%20Guide.pdf
- **Lab cadres** are taken from MedSync's own profession catalogue (`PROMPT-ONBOARDING-V2.md`, Appendix B). The Allied Health Professionals Council's current register categories were not confirmed from a primary source; confirm them at Step 0 (Q6) before the map is signed.
