# Lab Phase 0 — GATE A proposal

**Status:** Signed 10 Oct 2026 (see §10). Prompt: [PROMPT-LAB-PHASE-0.md](PROMPT-LAB-PHASE-0.md). Evidence for every
statement about the repo: [STOP-REPORTS.md](STOP-REPORTS.md), STOP 0.

**For:** Fadhul, as owner and Clinical Safety Officer, and the sessions that build Steps 2–5.

---

## 1. What changes from the prompt, and why

Step 0 found four facts the prompt did not know. The design below answers each without breaking a Law.

| Finding                                                                                                                                      | Consequence                                                               | Answer here                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| All 44 catalogue targets are NULL; the hub's `stated_tat` is free text                                                                       | No figure exists for "Late" (Law 5)                                       | Read the hub's text **only when it is one unambiguous duration** ("45 min", "2 h", "1 h 30 min", "1 d"); anything else is no target (D-LAB0-16) |
| The catalogue (`test.*`) has no key that joins it to the offerings (LOINC); `encounter_orders.loinc_code` exists but the EMR never writes it | No row can take a section from the hub; §7 forbids touching the catalogue | Build the full section machinery; rows fall to "No section" until the one-test-menu link lands (D-LAB0-17)                                      |
| Approval is sequential REST calls, not a transaction                                                                                         | "Grant in the same transaction" cannot live in the Edge Function          | A trigger on `staff_affiliations` keeps the lab role in step with every affiliation write (D-LAB0-18)                                           |
| No Playwright; PGlite is not a dependency (by policy)                                                                                        | Scenarios, screenshots and RLS probes need tools                          | The repo's scratch-harness method: PGlite symlinked from `~/Desktop/emr-harness`, Chrome over CDP. No new dependency (D-LAB0-19)                |

---

## 2. Access model

### 2.1 Permissions (LA-1, LA-2)

Six permissions, **derived, never stored**: `lab.view`, `lab.collect`, `lab.receive`, `lab.result.enter`,
`lab.result.release`, `lab.manage`. They are computed on each request by the pure `lib/lab/access.ts` from:

- the viewer's **approved or active lab-cadre affiliation** at the hospital, read through the map below; and
- the viewer's **open `department_heads` rows** (head of LABORATORY = `lab.manage` for the whole lab; head of a lab
  section = `lab.manage` for that section).

The `lab_tech` row in `user_roles` stays the carrier: it is what landing and the MFA rule already read. It is kept in
step with the affiliations by the database (2.3), so nothing that reads roles today changes.

### 2.2 The cadre map (E-LAB0-02)

Versioned reference data, `data/lab/permission-map.v1.json`, with `version`, `status` and `signedBy`. Code reads the
file; it never restates it.

| Cadre (AHPC)                          | view | collect | receive | enter | release | manage                       |
| ------------------------------------- | ---- | ------- | ------- | ----- | ------- | ---------------------------- |
| `LAB_TECH` (Laboratory technician)    | yes  | yes     | yes     | yes   | yes     | from `department_heads` only |
| `LAB_TECHNOLOGIST` (Lab technologist) | yes  | yes     | yes     | yes   | yes     | from `department_heads` only |
| Any other cadre                       | no   | no      | no      | no    | no      | no                           |

No other lab cadre is seeded (Q6). Nurses and doctors keep collecting through their own workspaces (LA-4); they get no
lab permission.

### 2.3 Granting and revoking (Law 2, LA-8, D-LAB0-18)

Migration **0097** adds `private.sync_lab_access()` and an `AFTER INSERT OR UPDATE OF state, cadre_id, hospital_id OR
DELETE` trigger on `staff_affiliations`. For each (user, hospital) the row touches, old and new:

- **has** an approved or active affiliation with a lab cadre, and **no** `lab_tech` row → insert the row, `created_by`
  = the approver;
- **has no** such affiliation, and **has** a `lab_tech` row → delete it.

Each change writes one `audit_log` row (`table_name = 'lab_access'`, `action` insert or delete) carrying the basis:
affiliation id, cadre code, council code, approver, approval time, hospital. The generic `user_roles` audit trigger
also fires, as it does for every role. It is idempotent, and it runs inside whatever transaction changed the
affiliation: approval, suspension, deactivation, reactivation, or a future cadre change. No Edge Function changes.

**Effect on `assign-role`:** unchanged in behaviour. A `lab_tech` row granted by hand to someone with no lab
affiliation is removed the next time their affiliation at that hospital changes (Law 3: the register is the only
source).

### 2.4 Where each check runs (LA-7)

| Check                               | Where                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `lab.view` on every route           | `requireLabTechScope()` (layout and pages) → refused state when absent                                        |
| `lab.receive` / `enter` / `release` | the four entry points in `app/lab/actions.ts` and `app/lab/_lib/emr.ts`, before the EMR engine runs           |
| Hospital scope                      | every lab read filters by the scope's hospital (unchanged), and the EMR engine re-checks on write (unchanged) |
| Database                            | `user_roles` stays closed to client writes; the trigger function is `SECURITY DEFINER`, revoked from `PUBLIC` |

Lab lists read through the service connection, as the EMR worklist already does, so no new RLS policy is needed; no
new table is added. The RLS probes (§6) prove the trigger, the closed `user_roles`, and that a lab user sees only their
hospital.

### 2.5 Backfill (D-LAB0-12)

The trigger covers every **future** write. Existing approved lab staff get their row from
`scripts/lab/backfill-lab-access.ts`: `--dry-run` (default) lists them; `--apply` inserts through the same SQL
function, so each grant is audited the same way. Known today (your query, 9 Oct): one person at Test Hospital-1,
`LAB_TECH`, approved, no role. The owner runs the dry run against production and applies.

---

## 3. Landing (LD-1 to LD-6)

`lib/auth/landing.ts` gains a pure `resolveLanding(facts)`; `app/(auth)/sign-in/landing.ts` keeps the queries and calls
it. Every row below is a table test.

| Facts                                                             | Before                         | After               |
| ----------------------------------------------------------------- | ------------------------------ | ------------------- |
| superadmin                                                        | `/admin`                       | same                |
| hospital_admin                                                    | `/hospital-admin`              | same                |
| clinical role + active doctor-cadre affiliation                   | `/doctor`                      | same                |
| `lab_tech` role **with** an active lab affiliation                | `/lab`                         | same                |
| `lab_tech` role **without** a lab affiliation                     | `/lab`, then bounced to `/`    | `/clinician` (LD-2) |
| other clinical role                                               | `/clinician`                   | same                |
| no role, pending hospital application                             | `/onboarding/hospital-pending` | same                |
| no role, active affiliation: doctor, nurse, reception, lab, other | its workspace                  | same                |
| no role, affiliation pending or rejected                          | `/onboarding/clinical-pending` | same                |
| patient profile                                                   | `/patient`                     | same                |
| anyone else                                                       | `/`                            | same                |

`?redirect=` (the prompt's `next`): honoured only when it is a same-origin path **and** the viewer may open it.
Otherwise it is dropped and a `landing.redirect_refused` line is logged with the path prefix only, no ids (LD-4).
A lab-only user who reaches `/clinician` already goes to `/lab` (LD-5, `app/clinician/layout.tsx:39`).

**Several workspaces (D-LAB0-05).** I recommend **not** adding a stored "last used" workspace in this slice: nobody
holds two staff workspaces today, and storing it needs a new column and a write on every visit. The current precedence
(doctor, then lab, then clinician) stays and is pinned by the table test. The seam is `resolveLanding`'s
`lastWorkspace` input, unused until a later slice fills it.

---

## 4. Screens

Built with the design system on `main`: Chroma (ADR 0162). Lab is the "Pharmacy & lab" domain, **grape**, through the
shared `SidebarNavItem` (its active state is the grape tint, edge and text; no left-edge bar). Buttons and focus are
teal. Amber is Late only. No red, no green.

### 4.1 Shell (desktop ≥ 1024 px)

```
┌ Sidebar 232 px ──────────┬ Top bar ───────────────────────────────────────────────────────────┐
│ [T] Test Hospital-1      │ Laboratory / Worklist                    Laboratory technician · —   │
│ LABORATORY               ├──────────────────────────────────────────────────────────────────────┤
│ ▣ Worklist           14  │ TEST HOSPITAL-1 · LABORATORY                  (PageHeader place)     │
│ ✓ Released today     37  │ Worklist                              Updated 10:42   [Refresh]      │
│ ⊘ Rejected            2  │ …                                                                    │
│                          │                                                                      │
│ Lab Guy      Sign out    │                                                                      │
└──────────────────────────┴──────────────────────────────────────────────────────────────────────┘
```

- Items come from `lib/lab/nav.ts` (NV-1..3): exactly these three. Counts are neutral mono numbers.
- The top-right names the cadre and section: "Laboratory technician · Clinical chemistry", or the cadre alone when the
  viewer has no section.
- The page header is the doctor workspace's `PageHeader` contract (place, title, subline, right). It is route-private
  to `app/doctor`, so it moves to `components/medsync/page-header.tsx` and both workspaces import it (flagged at
  STOP 0, #11).
- Below 1024 px the sidebar becomes the existing phone menu (ADR 0161's one exception), and the top bar keeps the
  cadre.

### 4.2 Worklist

Canvas artboard "0 Worklist (Phase 0)", rebuilt on repo components. Section tabs (counts before the section filter),
stage tabs (counts within the section), ward filter, the table, the footer line. With today's data the section tabs
read **"All sections 14 · No section 14"**; a viewer's own section appears first once an admin assigns one.

Phone (390 px): tabs scroll sideways; each row is three lines — identifiers; test and source; stage, time and the
button (44 px).

### 4.3 Released today, Rejected

Same table component, read-only. Released today: Patient · Test · Released (time, by cadre) · Turnaround · State
(Final, Amended); the row links to `/lab/results/[orderId]`. Rejected (7 days): Patient · Test · Rejected (time, by
cadre) · Reason (coded) · Now ("Awaiting re-collection" or "Re-collected 11:20").

### 4.4 The notice

Top of `/lab/results/[orderId]` (entry and review are the same route), above the results table, whenever
`criticalFlaggingActive(hospital)` is false. Caution tokens (`status-caution` background, `-fg-aa` text), a triangle
icon, bold first sentence, `role="status"`, no close button. Wording: Appendix B, from `content/lab.ts` with
`status: "draft"` (§10).

### 4.5 Refused

No standard not-authorised page exists (STOP 0). A viewer without `lab.view` sees a plain page in the lab shell's place:
"You do not have access to the laboratory workspace. Ask your hospital admin." with a link home. No patient data is
loaded.

---

## 5. Rules, with worked examples

All examples use fixture data. Server time 10:42 on 10 Oct 2026.

### 5.1 Worklist projection (LW)

| Rule  | Example                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| LW-1  | A U&E order (one specimen, one report) is one row, not five.                                                                                   |
| LW-2  | Collected 10:05, no receipt → To receive. Received 10:18, no report → To result. Preliminary saved → Preliminary. Final → gone.                |
| LW-3  | No offering link → "No section". Never hidden.                                                                                                 |
| LW-4  | Viewer in Haematology → opens on Haematology. Viewer in none → "All sections" with the one-line note.                                          |
| LW-5  | "From" = the ordering encounter's department (`encounters.department_id`); empty → "Not recorded". The viewer's department is not this filter. |
| LW-6  | 14 open: section counts 14 (No section) + 0 others = 14; stage counts follow the chosen section.                                               |
| LW-7  | Immediate glucose (6 min, target 30) above urgent U&E (24 min, target 1 h) above routine LFT late by 25 min above routine HbA1c 40 min.        |
| LW-8  | A viewer without `lab.result.enter` sees the row and no button.                                                                                |
| LW-9  | Hospital B's specimens never appear for a hospital A viewer (two-hospital fixture).                                                            |
| LW-10 | `EMR_V1` off → the legacy list, untouched, plus "This hospital is still on the old lab list."                                                  |
| LW-11 | Name + MRN on each row through `identitiesFor` (one batched reveal per page load).                                                             |
| LW-12 | Property test: every open item exactly once under "All sections"; section counts sum to the total.                                             |

### 5.2 Turnaround (TA)

| Rule | Example                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| TA-1 | Received 10:18 → clock runs from 10:18. A preliminary at 10:30 does not stop it. Final at 10:52 → 34 min.                         |
| TA-2 | Collected 10:07, not received → "Collected 35 min ago · not received", muted, no label.                                           |
| TA-3 | Hub `stated_tat` "1 h" → target 60 min. Hub "same day" → not a duration → catalogue minutes, marked "default" → NULL → no target. |
| TA-4 | Received 08:17, target 2 h → 145 min → "Late by 25 min", amber chip with clock icon, then "target 2 h".                           |
| TA-5 | No per-priority targets exist; none is derived.                                                                                   |
| TA-6 | Device clock 3 h fast: elapsed = server time at render + time since the page arrived; the device clock is not read for time.      |
| TA-7 | Wall clock; the footer says where the clock starts.                                                                               |
| TA-8 | `formatDuration`: 0 → "0 min"; 59 → "59 min"; 60 → "1 h"; 1 439 → "23 h 59 min"; 1 440 → "1 d".                                   |

**The hub-text reader (D-LAB0-16).** Accepted, case-insensitive, whole string only: `N min`, `N mins`, `N minutes`,
`N h`, `N hr`, `N hrs`, `N hour(s)`, `N h M min`, `N d`, `N day(s)`; N a whole number from 1 to 999. Rejected: ranges
("24–48 h"), words ("same day", "next morning"), decimals, anything else. A rejected value means no target, never a
guess.

### 5.3 Navigation (NV) and the flagging seam (CF)

- NV-1..3: the registry holds Worklist (`/lab`), Released today (`/lab/released`), Rejected (`/lab/rejected`).
- CF-1: `criticalFlaggingActive(hospitalId)` returns true only when every `REF-CRIT-*` entry in
  `lib/emr/reference/critical.ts` is `signed`. Today all are `pending_cso` → false.
- CF-3: in production (`VERCEL_ENV=production`), `labWorkspaceLiveFor()` returns false while the notice copy is
  `draft`, whatever `LAB_WORKSPACE` says, and logs `lab_workspace.blocked_unsigned_notice` once per process.

---

## 6. Schema diff, RLS probes, flag

**Migration 0097** (additive; not GATED, because it changes access, not clinical reference data; the owner applies it):

- `private.sync_lab_access(p_user uuid, p_hospital uuid, p_basis jsonb)`: the insert or delete plus the audit row.
- `private.staff_affiliations_lab_access()` and its trigger on `staff_affiliations`.
- `REVOKE ALL … FROM PUBLIC, anon, authenticated` on both functions.
- No new table, column or index; no change to orders, specimens, reports or the catalogue.

**Flag:** `LAB_WORKSPACE` = `1` or a comma-separated list of hospital ids, read by `labWorkspaceLiveFor()` in
`lib/lab/feature.ts`, the same form as `EMR_V1`. Off by default.

**RLS probes** (PGlite lane, `tests/emr-db/lab-access.test.ts`):

| Actor                                         | Probe                                  | Expect                                      |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| Service (approval) on a lab-cadre affiliation | `UPDATE … SET state = 'approved'`      | `lab_tech` row + one `lab_access` audit row |
| Service on a nurse affiliation                | `UPDATE … SET state = 'approved'`      | no `lab_tech` row                           |
| Service (deactivate)                          | `UPDATE … SET state = 'deactivated'`   | row deleted + audit row                     |
| Service, two hospitals                        | approve at A only                      | role at A only                              |
| `authenticated` (any staff)                   | `INSERT/UPDATE/DELETE` on `user_roles` | denied                                      |
| `authenticated`, `anon`                       | `EXECUTE private.sync_lab_access`      | denied                                      |
| Service                                       | re-run the same update twice           | one row, idempotent                         |

The worklist's hospital isolation (LW-9) is proven on the projection and on the loader query in the same lane.

---

## 7. Test plan

| Layer            | What                                                                        | Where                                                                                    |
| ---------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Pure engines     | every LA, LD, LW, TA, NV, CF rule ID; LW-12 property test; TA-6 wrong clock | `tests/lab/*.test.ts` (Vitest)                                                           |
| Database         | §6 probes; the loader against the two-hospital fixture; query count         | `tests/emr-db/lab-*.test.ts` (PGlite lane)                                               |
| Source contracts | red-reserved extended to `app/lab`; flag-off returns today's tree; no `any` | `tests/design/red-reserved.test.ts`, `tests/lab/flag-off.test.ts`                        |
| Screens          | S1–S17 at 390, 834, 1440 px, light; axe; layout shift on tick; JS size      | scratch harness `~/Desktop/lab0-harness` (CDP + PGlite fixture), results in STOP 4 and 5 |

The Step 0 `it.fails` tests flip to plain `it` in the step that fixes each defect.

---

## 8. ADR drafts (0221–0226)

- **0221** Lab access: six permissions derived from cadre and headship, carried by the `lab_tech` role.
- **0222** The database keeps the lab role in step with affiliations (trigger), so grant and revoke share the
  transaction of whatever changed the affiliation.
- **0223** One pure landing resolver; `?redirect=` honoured only for paths the viewer may open.
- **0224** The lab worklist projection: stages, section routing (offering, catalogue, No section), sort.
- **0225** The turnaround clock: receipt to final release; the hub's text read only when unambiguous; no figure, no
  colour.
- **0226** "Say what the system is not doing": the critical-flagging notice and its signed-copy gate.

---

## 9. Decisions

The prompt's recommendations stand except where marked **changed**, each for a reason found at Step 0.

| #         | Decision                                   | Recommendation                                                                                                                                                     |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-LAB0-01 | Access model                               | Six permissions, derived from cadre and headship, carried by `lab_tech` (§2.1)                                                                                     |
| D-LAB0-02 | Who may release (CSO)                      | Technicians and technologists both; release is its own permission                                                                                                  |
| D-LAB0-03 | Phlebotomy role                            | None                                                                                                                                                               |
| D-LAB0-04 | Lab management                             | `department_heads` of LABORATORY and its sections                                                                                                                  |
| D-LAB0-05 | Several workspaces                         | **Changed:** keep today's precedence; no stored "last used" in this slice (§3)                                                                                     |
| D-LAB0-06 | Clock points                               | Lab receipt to final release                                                                                                                                       |
| D-LAB0-07 | Figure for "Late"                          | Hub stated turnaround, else catalogue target ("default"), else none                                                                                                |
| D-LAB0-08 | Working hours                              | Wall clock                                                                                                                                                         |
| D-LAB0-09 | Colour for Immediate                       | None; word, weight, order                                                                                                                                          |
| D-LAB0-10 | Emergency affordance on lab pages          | No lab-specific one. The global Emergency pill stays: by design it is on every page (`components/emergency/emergency-pill.tsx`, "never leaves a page without one") |
| D-LAB0-11 | Notice wording (CSO)                       | Appendix B; **sign before any production hospital is switched on**                                                                                                 |
| D-LAB0-12 | Backfill                                   | Dry run, review, apply; each grant audited                                                                                                                         |
| D-LAB0-13 | Names on lab lists                         | Name and MRN with batched reveal logging (already the behaviour)                                                                                                   |
| D-LAB0-14 | Second factor                              | AAL2                                                                                                                                                               |
| D-LAB0-15 | Rollout                                    | `LAB_WORKSPACE` per hospital, test hospital first; production needs signed notice wording                                                                          |
| D-LAB0-16 | **New:** reading the hub's `stated_tat`    | Only an unambiguous single duration; anything else is no target (§5.2)                                                                                             |
| D-LAB0-17 | **New:** sections without a catalogue link | Ship the machinery; rows show "No section" until the one-test-menu link (HARMONISATION §9) lands; no catalogue change                                              |
| D-LAB0-18 | **New:** where the grant happens           | A trigger on `staff_affiliations` (§2.3), not the Edge Function                                                                                                    |
| D-LAB0-19 | **New:** test tooling                      | **Changed** from STOP 0's suggestion: the repo's scratch harness (PGlite symlink, Chrome over CDP), no new dependency                                              |
| E-LAB0-01 | Permission storage                         | Derived, not stored; nothing to extend                                                                                                                             |
| E-LAB0-02 | Cadre map                                  | Versioned JSON with status and signer                                                                                                                              |
| E-LAB0-03 | Landing                                    | Pure `resolveLanding` + table test                                                                                                                                 |
| E-LAB0-04 | Section routing                            | Offering, else catalogue, else No section (the first two empty today)                                                                                              |
| E-LAB0-05 | Clock                                      | Server time + 30 s tick, paused when hidden                                                                                                                        |

---

## 10. Signature

| Item                               | Signed by           | Date        | Basis                                                                                                   |
| ---------------------------------- | ------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| D-LAB0-01 to -19, E-LAB0-01 to -05 | Fadhul (owner, CSO) | 10 Oct 2026 | Instruction in session: "go with your recommendation and go through all gates"                          |
| Permission map v1 (§2.2)           | Fadhul (CSO)        | 10 Oct 2026 | Same instruction; D-LAB0-02                                                                             |
| Notice wording (Appendix B)        | **Not signed**      | —           | D-LAB0-11 itself asks for a signature before production. Copy ships `draft`; CF-3 keeps production off. |

To sign the notice: set `status: "signed"`, `signedBy`, `signedOn` on the notice entry in `content/lab.ts`.
