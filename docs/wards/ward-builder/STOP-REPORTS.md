# Ward builder — STOP reports

Branch `feat/ward-builder`, off `main` at `2378ce3`. The owner said "go through all gates", so each
phase ends with its report here instead of a pause. Nothing is committed to `main` and no migration
is applied. Decisions this report takes to keep going are marked **Decided (reversible)**; each is
recorded in an ADR in Phase 1.

---

## STOP 0 — Discovery (no product changes)

### 0.1 What is there today

| Area                | Found                                                                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ward list and panel | `app/hospital-admin/departments/wards/page.tsx`, `_components/wards-view.tsx`                                                                                                                                                              | `WardsView` lists wards; `WardPanel` (a `HubPanel`, centred) holds details, `Closure`, archive, `InCharge`, `BedRegister`. Every write is `useHub().run({ op })` → `runHubOp` server action → `callEdge("ha-services-hub")`.                                                                           |
| Data loading        | `lib/services/data.ts` → `loadWards`                                                                                                                                                                                                       | Reads `hospital_wards`, **`select()` of every `hospital_beds` column**, open in-charges.                                                                                                                                                                                                               |
| Ward table          | `db/schema/hospital-wards.ts`                                                                                                                                                                                                              | `bed_count` (≥ 0, the denominator), `ward_type` (A.5 list: general, hdu, icu, nicu, …), `sex`, `age_group`, `place_id`, closure, archive.                                                                                                                                                              |
| Bed register        | `db/schema/services-hub.ts` → `hospital_beds` (0080)                                                                                                                                                                                       | `label` (1–20, unique per ward, archived labels stay taken), `bed_type` (free text ≤ 40, **never written by any code today**), `closed_at` + `closed_reason` (a closed bed needs a reason), `archived_at`. RLS: hospital admins, superadmins and hospital staff read; no client writes. Audit trigger. |
| STR-5               | 0080 constraint triggers, **deferred to commit**                                                                                                                                                                                           | The register never holds more unarchived beds than `bed_count`, checked from both tables.                                                                                                                                                                                                              |
| Structure ops       | `ha-services-hub/ops-structure.ts`                                                                                                                                                                                                         | Pattern: Zod union → caller → role (hospital admin with scope, superadmin; heads for six ops) → `plan()` reads only → audit row → `apply()`. Writes go through supabase-js on the service role: **no transaction across calls**.                                                                       |
| Nursing             | `nursing_assignments` (patient ↔ nurse, `ward_id` nullable, open while `ends_at` is null), `ward_in_charge_assignments` (open while `ends_at` is null; acting beside substantive)                                                          | `requireNurseScope()` gives `isInCharge` and `inChargeWardIds`. Nurse sidebar is `app/nurse/_lib/features.ts`.                                                                                                                                                                                         |
| Receiving ward      | `patient_intakes.receiving_ward_id`                                                                                                                                                                                                        | Accepted by `ha-register-intake`; **no screen sets it today**.                                                                                                                                                                                                                                         |
| Realtime            | 0069 `workspace_broadcast()` → `realtime.send` on a private topic `workspace:<hospital>`, payload `{ kind, at }`, no PHI; `realtime.messages` policy; client `useWorkspaceLive` re-reads on a message, polls every 15 s without a channel. | The pattern to copy.                                                                                                                                                                                                                                                                                   |

**How `generate_beds` and `set_bed` behave.** `generate_beds` fills the register up to `bed_count` with
`Bed 1…Bed N`, skipping labels already used (archived included), and refuses when the register
already matches. `set_bed` renames a bed and closes it (reason required) or reopens it. `upsert_ward`
refuses to lower `bed_count` below the unarchived beds. So today `bed_count` is the truth and the
register is optional and never larger. The layout reverses this for laid-out wards (Phase 1, ADR on
reconcile): publishing sets `bed_count` to the layout's active beds, in the same transaction as the
bed rows, so the deferred STR-5 trigger still holds at commit.

### 0.2 The prototype walked, element by element

| Prototype                                                                                                                                                                                                         | Build                                                                                                                                                                                           | Status                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Header: breadcrumb, title, Build / Live toggle, ward tabs, New ward, save note, Save draft, Publish                                                                                                               | Page header; `ViewSwitcher` (never teal) for Build / Live; ward tabs as links; New ward opens the existing ward panel (`/hospital-admin/departments/wards?new=1`); primary `Button` for Publish | New page, existing primitives |
| Palette: Select, Beds ×4, Row of beds, Dividers ×4 + Door, Rooms ×3, Fixtures ×6, Start from a layout ×4, Row settings                                                                                            | `components/wards/editor/palette.tsx`; presets in `lib/wards/presets.ts`                                                                                                                        | New                           |
| Plan: grid, beds (headboard, pillow, number, O₂ / S / M glyphs, Out hatch), rooms (door gap, label), dividers, doors (leaf and arc), fixtures, ghost, room resize handle, divider end handles, drag with snapping | One SVG (`components/wards/plan/plan-view.tsx`) scaled by `viewBox`, tokens through `fill-*` / `stroke-*` classes; pointer maths in `lib/wards/geometry.ts`                                     | New                           |
| Show lens: Plan / Oxygen / Suction / Monitors / Out of service                                                                                                                                                    | `ViewSwitcher`                                                                                                                                                                                  | Existing primitive            |
| Undo / redo buttons, ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y on the root                                                                                                                                                        | `lib/wards/history.ts` reducer (50 snapshots) and `lib/wards/keys.ts`                                                                                                                           | New                           |
| R, Delete / Backspace, arrows, Escape on the plan                                                                                                                                                                 | `lib/wards/keys.ts`                                                                                                                                                                             | New                           |
| Inspector: ward (name, department, sex, level of care), bedside services coverage, Before you publish, Renumber                                                                                                   | Ward fields write through `upsert_ward` (the prototype's department / sex / care chips map to the real `department_id`, `sex`, `ward_type`)                                                     | New, existing op              |
| Inspector: bed (number, type, services in three groups, copy to the room / bay / open ward, in or out of service with reasons, rotate, duplicate, delete, nudge)                                                  | `components/wards/editor/inspector.tsx`                                                                                                                                                         | New                           |
| Inspector: room (name, kind, width and depth steppers, door side, features, its beds), divider (kind, length), fixture (label), door                                                                              | same                                                                                                                                                                                            | New                           |
| Bottom bar: counts, amber note when the plan differs from the register                                                                                                                                            | `Amber` from the hub (icon + words)                                                                                                                                                             | Existing primitive            |
| Live: legend with counts, bed state words, bed panel (state, services), Free beds by need                                                                                                                         | `components/wards/board/*`                                                                                                                                                                      | New                           |
| Grid toggle                                                                                                                                                                                                       | kept                                                                                                                                                                                            | New                           |
| **Not in the prototype, required:** Items list, placing from the keyboard, autosave, leave guard, the real publish refusal, Start from the register, assign and release a patient                                 | built in Phases 4–5                                                                                                                                                                             | New                           |

### 0.3 Who consumes beds and ward capacity

1. **Emergency & support capabilities** (`derivedCapabilities` in `_shared/services-hub.ts`, read by
   `lib/services/data.ts`): `icu_beds`, `hdu_beds`, `isolation_beds`, `nicu_cots`, `total_beds` are sums
   of `hospital_wards.bed_count` by `ward_type`. Publishing sets `bed_count`, so these stay right with
   no reader change.
2. **Hub summary strip, departments view, palette hints, super-admin setup** read `bed_count`. Same.
3. **Archive verdict** (`archiveVerdict`, STR-4) has an `occupiedBeds` seam that is always 0 today.
   Phase 3 wires it: a ward, department or bed with an open `bed_assignments` row cannot be archived.
4. **Reports** (`lib/hospital-admin/reports.ts`) read no ward or bed data.
5. **Intake** writes `receiving_ward_id`; the board reads it to offer patients for a bed.
6. **Test H10** (`tests/hospital-services/invariants.test.ts`) forbids an occupancy figure in the hub
   without its engine. The engine now exists (`bed_assignments`); occupancy is computed only in
   `lib/wards/board.ts` and the test is extended to say so.

### 0.4 Risks

- **An existing register larger than a first layout.** A ward with 30 named beds whose admin lays
  out 24 would archive 6 on publish. Mitigations: _Start from the register_ lays every existing bed
  out first; publish lists every bed it will archive in the confirm step; an occupied bed refuses.
- **No transaction in the Edge Function.** Reconcile touches beds, services, the ward and two layout
  rows. **Decided (reversible):** the pure `reconcile()` plans it; one SQL function,
  `public.ward_layout_publish(jsonb)`, applies the plan in one transaction under row locks and re-checks
  occupancy and the draft's revision, so a bed assigned between plan and apply still refuses.
- **The app reads every bed column** (`loadWards` uses `select()`). Deployed before the migration, it
  would fail. **Decided:** readers name their columns, and the new tables are read only behind the
  flag below.
- **Deployment order.** **Decided (reversible):** a flag, `WARD_BUILDER` (`1` or hospital ids), keeps
  the Layout button, the pages, the board and the nurse item off until the owner applies the
  migrations.
- **Nobody sets `receiving_ward_id` today**, so "assign a patient" will usually have nobody to offer.
  The board says so plainly; wiring intake to a ward is out of scope.
- **Colour.** The prompt asks for Cleaning in amber and headings at 500. `DESIGN-medsync.md` wins:
  workflow states are never red, amber or green, so **Cleaning is a sky tint** (the "in progress" tag
  hue) with its word, and headings take 600 from their token. Amber stays for cautions only (checks,
  the count note).
- **Invented content.** Bed sizes, the 0.5 m grid, the default 21 × 16 m floor, the services list, the
  room kinds and features, the out-of-service reasons and every check are prototype inventions. They
  ship marked _proposed_; new beds start with **no services recorded** (the prototype's default nurse
  call, locker and curtain would record equipment nobody confirmed).

### 0.5 Migrations proposed for Phase 2 (GATED, written, not applied)

**`0090_ward_layouts.sql`**

- `ward_layouts`: id, hospital_id, ward_id, version int, **revision int** (bumps on each draft save; a
  stale save from a second window is refused), state `draft | published | superseded`,
  floor_w_cells, floor_h_cells, cell_mm (default 500), document jsonb, warnings jsonb, created_by,
  created_at, updated_at, published_by, published_at. Partial unique: one draft per ward, one
  published per ward; unique (ward_id, version). Published and superseded rows are append-only
  (only published → superseded may change; no delete).
- `hospital_beds`: layout_x, layout_y (int cells), rotation (0, 90, 180, 270, checked), room_key text;
  `bed_type` checked to `standard | icu | cot | couch` **NOT VALID**, so any existing value stays valid.
- `hospital_bed_services`: bed_id, hospital_id, service_code (checked to the v1 catalogue),
  created_by, created_at; unique (bed_id, service_code).
- `public.ward_layout_publish(jsonb)`: the transaction above; `EXECUTE` for `service_role` only.
- `sa_audit_log_action_check`: 0080's list verbatim, plus `save_ward_layout`, `publish_ward_layout`.
- RLS as the hub tables (admins, superadmins and hospital staff read; no client writes), audit triggers.

**`0091_bed_board.sql`**

- `bed_assignments`: id, hospital_id, ward_id, bed_id, patient_user_id, encounter_id (nullable),
  started_at, ended_at, started_by, ended_by, reason. Partial unique: one open per bed, one open per
  patient. Read: hospital admins, superadmins and active clinical staff (not all staff: it names a
  patient).
- `bed_state_events`: id, hospital_id, bed_id, state `cleaning | reserved | free`, reason, set_by,
  set_at. Append-only.
- Broadcast triggers on both, and on `hospital_beds` closure, to the private topic
  `ward-beds:<hospital>` with `{ kind, ward_id, at }` (no PHI); a `realtime.messages` policy lets
  hospital admins and active clinical staff of that hospital listen.
- `sa_audit_log_action_check`: plus `set_bed_state`, `assign_bed`, `release_bed`.

### 0.6 Commands

```
git fetch origin main && git checkout -b feat/ward-builder origin/main
```

No product file changed in Phase 0; the pack was copied to `docs/wards/ward-builder/`.

---

## STOP 1 — Decisions (ADRs only)

| ADR                                                                     | Decides                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0191](../../adr/0191-ward-layout-document-and-versioning.md)           | The layout is one JSON document per version; 1 cell = 0.5 m (`cell_mm = 500`); draft / published / superseded, one draft and one published per ward; `revision` guards the draft against a second window; published is append-only; limits; behind `WARD_BUILDER`.                                      |
| [0192](../../adr/0192-beds-reconcile-from-the-layout.md)                | Publish matches beds by id, then label, then restores an archived label, else creates; writes ids back; archives what left the plan, refusing an occupied bed; sets `bed_count`; one SQL function applies it in one transaction; laid-out wards lose the manual count, `generate_beds` and bed restore. |
| [0193](../../adr/0193-bed-services-catalogue.md)                        | Twelve service codes with labels, glyphs and groups; stored per bed in `hospital_bed_services`; room features stay in the document; nothing recorded by default.                                                                                                                                        |
| [0194](../../adr/0194-bed-state-and-assignment.md)                      | Occupied, Out, then Cleaning / Reserved / Free from events; who may act (admin, in-charge, the ward's assigned nurses); assign from receiving intakes; release with a reason; the tints (Cleaning is sky, not amber); name and MRN only; the `ward-beds:<hospital>` topic.                              |
| [0195](../../adr/0195-scoped-keyboard-shortcuts-in-the-ward-builder.md) | Keys on the editor root; text fields ignored; undo and redo keys; plan keys; off in live mode; the Items list.                                                                                                                                                                                          |
| [0196](../../adr/0196-layout-checks-are-proposed-warnings.md)           | The checks, their wording marked proposed; only integrity blocks; warnings recorded at publish and re-checked on the server.                                                                                                                                                                            |

`CHANGELOG.md` carries the "Decided" entry. The ADR index (`docs/adr/README.md`) has not been kept since 0139,
so it is left as it is.

---

## STOP 2 — Data (GATED migration written, not applied)

**One migration, `supabase/migrations/0090_ward_builder.sql`** (GATED header). STOP 0 proposed two
(0090 layouts, 0091 board); they are one file so the owner applies one thing and the publish
function's occupancy re-check never runs against a missing table. Additive and re-runnable.

| Part                         | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ward_layouts`               | Columns as §2.1 plus `revision` (autosave conflict guard) and `updated_at`. Checks: state, version ≥ 1, floor 8–120 cells, the document an object with `v = 1`, warnings an array, `published_at` set exactly when not a draft. Partial unique: one draft, one published per ward; unique (ward, version). Guard trigger: the ward is the hospital's; rows start as drafts; a published row may only become superseded (nothing else changes); superseded never changes; only a draft may be deleted. Row audit only for published and superseded rows (autosaves stay out of `audit_log`). |
| `hospital_beds`              | `layout_x`, `layout_y`, `rotation` (0/90/180/270 check), `room_key`; `bed_type` checked to `standard, icu, cot, couch` **NOT VALID**. A guard refuses archiving or closing a bed with an open assignment (`WL409 …`).                                                                                                                                                                                                                                                                                                                                                                       |
| `hospital_bed_services`      | bed, hospital, `service_code` (check on the twelve codes), created by / at; unique (bed, code).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `bed_assignments`            | As §2.4, `reason` = why the patient left. Partial unique: one open per bed, one open per patient. Guard: a patient goes into an active, open bed of that ward and hospital; an assignment ends once (end, by whom, why) and is never deleted.                                                                                                                                                                                                                                                                                                                                               |
| `bed_state_events`           | As §2.5; Reserved needs a reason; append-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ward_layout_publish(jsonb)` | Locks the ward, the draft and the ward's beds; refuses a stale revision, a register that changed since the plan, or a patient now in a leaving or closing bed; archives; renames an off-plan bed whose number the plan uses to "B3 (old 1)"; moves kept beds through temporary labels (so numbers can swap); updates, restores and creates beds and their services; sets `bed_count`; writes the new ids into the document; supersedes the previous version and publishes the draft with its warnings. `EXECUTE` for `service_role` only.                                                   |
| RLS                          | Forced on all four tables. Layouts, services, state events: admins, superadmins, hospital staff read. Assignments: admins, superadmins, active clinical staff. `INSERT/UPDATE/DELETE/TRUNCATE` revoked from `anon` and `authenticated`.                                                                                                                                                                                                                                                                                                                                                     |
| Live                         | `ward_beds_broadcast()` sends `{ kind, ward_id, at }` to `ward-beds:<hospital>` on assignment start/end, a state event, a bed's closure / archive / label, and a publish. `realtime.messages` policy: admins, active clinical staff and superadmins of that hospital.                                                                                                                                                                                                                                                                                                                       |
| Audit verbs                  | 0080's list verbatim + `save_ward_layout`, `publish_ward_layout`, `set_bed_state`, `assign_bed`, `release_bed` (and in `sa-audit.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Drizzle:** `db/schema/ward-builder.ts` (four tables), `hospitalBeds` gains the four columns and two
checks, exported from `db/schema/index.ts`.

**The document:** `supabase/functions/_shared/ward-layout.ts` holds the catalogues, the types, the
cross-field rules and `buildLayoutSchema(z)`, so the Edge Function (npm:zod) and the app (zod) build
the same schema; `lib/wards/layout-schema.ts` exports it as `WardLayoutSchema: z.ZodType<WardLayout>`.
Limits: 200 beds, 1,000 items, every coordinate inside the floor, unique keys and register ids,
straight dividers, a reason for a bed out of service.

**Commands and results**

```
npx tsc --noEmit                                   # clean
npx tsc --noEmit -p supabase/functions/tsconfig.json   # clean
EMR_PGLITE=1 npx vitest run tests/emr-db/drizzle-parity.test.ts   # 152 passed (0090 replayed)
EMR_PGLITE=1 npx vitest run tests/emr-db/ward-builder.test.ts     # 9 passed
```

`tests/emr-db/ward-builder.test.ts` runs the pure reconcile into the SQL function: start from the
register, move and add beds with services (ids written back); a second version archives a bed, swaps two
numbers and supersedes the first; an archived number restores, and a reused one becomes "(old 1)"; an
out-of-service closure; a stale revision and a patient arriving under the locks both refuse; every guard;
RLS by actor; the live topic carries no patient.

---

## STOP 3 — Edge Function ops

The ops live in **`supabase/functions/ha-services-hub/ops-wards.ts`** rather than inside the
1,070-line `ops-structure.ts`; they follow its pattern exactly (Zod union → caller → role → `plan()`
reads only → audit → `apply()`), and the index dispatches them beside the other two maps. The hub's
source-level invariants now read all three files.

| Op                                                            | Who                                 | What                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_ward_layout_draft { ward_id, document, base_revision }` | admin                               | Validates the document with the shared Zod schema; refuses when `base_revision` isn't the draft's (another window saved); updates the draft (revision + 1, `WHERE revision = base`) or creates one with the next version. Audit: counts only, never the document.                                                                                                                                          |
| `publish_ward_layout { ward_id, accepted_warnings }`          | admin                               | Re-validates the draft; blocking checks refuse with their texts; the recomputed warnings must equal the ones the admin saw, else "The checks changed since you looked"; `reconcile()` with fresh occupancy refuses an occupied bed by name; audit (version, the diff summary, the warnings); then one `rpc("ward_layout_publish")`. `WL409 …` from SQL becomes a 409 with the words; a unique clash a 409. |
| `start_layout_from_register { ward_id }`                      | admin                               | Only for a ward with a register and no layout; `layoutFromRegister()` lays every active bed out in rows.                                                                                                                                                                                                                                                                                                   |
| `discard_ward_layout_draft { ward_id }`                       | admin                               | Not in the prompt; added so a bad draft isn't stuck until published. Deletes the draft only (the trigger refuses anything else).                                                                                                                                                                                                                                                                           |
| `set_bed_state { bed_id, state, reason? }`                    | admin, in-charge, the ward's nurses | Free, Cleaning or Reserved (a reason for Reserved); refused on an out-of-service or occupied bed.                                                                                                                                                                                                                                                                                                          |
| `assign_bed { bed_id, patient_user_id, encounter_id? }`       | same                                | The bed open and empty; the patient in no other bed; the patient has an open intake whose receiving ward is this one (its encounter is recorded unless another of theirs is named).                                                                                                                                                                                                                        |
| `release_bed { assignment_id, reason, next_state? }`          | same                                | Ends the assignment once (`WHERE ended_at IS NULL`); optionally sets the bed to Cleaning or Free in the same step.                                                                                                                                                                                                                                                                                         |

**Who may run the live ops.** The index gives `ward_staff` to a non-admin caller of those three ops only;
`assertWardWorker` then requires an active affiliation at the hospital and an open in-charge (or acting)
row for the ward, or an open nursing assignment on it (`mayWorkBeds`, pure). A nurse of another ward is
refused with words (403).

**Existing ops, changed** (each read tolerates 0090 not being applied yet, so the hub keeps working):
`upsert_ward` keeps a laid-out ward's count; `generate_beds` and restoring a bed are refused on a laid-out
ward; archiving a ward or a bed with a patient in a bed is refused (the STR-4 `occupiedBeds` seam is
wired); closing an occupied bed is refused.

**Pure code the Edge Function calls:** `reconcile`, `layoutChecks`, `layoutFromRegister`,
`publishPayload`, `mayWorkBeds` in `_shared/ward-layout.ts`, re-exported by `lib/wards/reconcile.ts`,
`checks.ts` and `geometry.ts`. Flag: `lib/wards/feature.ts` (`WARD_BUILDER`).

**Commands and results**

```
npx tsc --noEmit -p supabase/functions/tsconfig.json    # clean
npx vitest run tests/wards/reconcile.test.ts           # 13 passed
```

The reconcile tests cover: a new ward; matching by id, then active label, then archived label (restore);
archiving; per-bed changes; rooms; refusals (one and several occupied beds leaving, an occupied bed going
out, a foreign id); an occupied bed that stays; start from the register and publish back; the next draft
syncing register edits; the payload's shape.

---

## STOP 4 — The editor (Build mode)

**Route:** `app/hospital-admin/departments/wards/[wardId]/layout/page.tsx` (hospital-admin scope,
`WARD_BUILDER`, `notFound()` otherwise). It is full width inside the hospital shell: the hub's layout
now renders its title, counts and tabs through `HubFrame`, which steps aside for a ward's `layout` and
`board` pages. **Entry points:** a _Layout_ section on the ward panel (Layout, Live bed board once
published, and _Start from the register_ for a ward with a register and no layout); `?new=1` on the
wards page opens _Add a ward_ (the editor's _New ward_). A laid-out ward's bed count is read-only in the
panel ("Set by the published layout"), and _Generate beds_ is gone for it.

**What is built** (`components/wards/*`, `lib/wards/*`):

| Part                  | Where                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan                  | `plan/plan-view.tsx`           | One SVG for Build and Live, scaled by `viewBox` so any floor fits; tokens through `fill-*`/`stroke-*` (dark mode flips with them). Beds draw the headboard band, pillow, number, O₂ / S / M glyphs; out-of-service beds are hatched with "Out"; rooms (double wall for isolation, dashed for a bay, a door gap), walls, curtains, glass, windows, doors (leaf and arc into the floor), fixtures. Ghost while placing; corner handle on a room, end handles on a divider.                                 |
| Editing               | `lib/wards/editor.ts`          | Pure: place, move, nudge, rotate (rooms swap size, dividers turn about their first end, doors switch), duplicate (a bed takes the next number and no register id), remove, resize a room, stretch a divider, set a divider's length, services, copy to the room / bay / open ward, floor size (never smaller than what is on it).                                                                                                                                                                        |
| Undo / redo           | `lib/wards/history.ts`         | 50 snapshots, a drag is one step, a new edit clears redo; the editor is keyed by ward, so a ward switch starts a new history.                                                                                                                                                                                                                                                                                                                                                                            |
| Keys                  | `lib/wards/keys.ts`            | On the editor root (undo, redo) and the plan (R, Delete / Backspace, arrows, Escape, Enter places the armed item at the centre); text fields keep theirs; never `window`.                                                                                                                                                                                                                                                                                                                                |
| Palette               | `editor/palette.tsx`           | Select; Row of beds (count, gap, which wall, curtains, wall oxygen; dashed preview; numbered on in the ward's own style); four beds; four dividers and a door (click start, click end, straight across or down); three rooms; six fixtures; four templates (`lib/wards/presets.ts`, built for the ward's floor).                                                                                                                                                                                         |
| Inspector             | `editor/inspector.tsx`         | Nothing selected: the ward (name, department, admits, level of care, through `upsert_ward`), the floor, bedside services coverage, _Before you publish_ with each check's words, _Renumber_, _Discard this draft_. A bed: number (refuses a duplicate), type, services in three groups, copy, in / out of service with reasons, rotate / duplicate / delete / nudge. A room: name, kind, width and depth, door side, features, its beds. A divider: kind, length. A fixture: label. A door: orientation. |
| Items list            | `editor/items-list.tsx`        | Required, not in the prototype: every bed, room, divider, door and fixture in a table; select to edit, x and y in metres, rotate, delete.                                                                                                                                                                                                                                                                                                                                                                |
| Saving                | `editor/ward-editor.tsx`       | Autosave 2 s after the last change through `save_ward_layout_draft` with the revision it started from; "Draft saved hh:mm / Unsaved changes / Saving… / Not saved: …"; a conflict stops autosave and offers _Reload_; leaving (tabs, breadcrumb, mode switch) with unsaved changes asks _Save and leave / Leave without saving / Stay_; the browser's own prompt on close.                                                                                                                               |
| Publish               | `editor/publish-dialog.tsx`    | Consequence first: beds added, restored, changed, unchanged and archived (named), the count from → to, the warnings that will be recorded; blocked with the reasons when an integrity check fails or a patient is in a leaving bed.                                                                                                                                                                                                                                                                      |
| A ward with no layout | `ward-editor.tsx` `StartPanel` | _Start from the register_ (N beds) or a template.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Fixtures and screenshots.** `app/styleguide/ward-builder/[screen]` (off unless `MEDSYNC_FIXTURES=1`,
synthetic data from `tests/wards/fixtures.ts`). In `docs/wards/ward-builder/screenshots/`:
`layout-open`, `layout-bays`, `layout-hdu`, `layout-empty` (the four templates), `layout-bed` (a bed with
services), `room-resized` (a room after dragging its corner handle), `layout-items` (the Items list),
`layout-lens` (Show: oxygen), `layout-start`, `publish-dialog`, `layout-open-dark`.

**Driven in a browser** (Playwright on the fixture): drag moves a bed; Ctrl+Z undoes the whole drag,
Ctrl+Y redoes; a palette click places a bed; R rotates; the arrow nudges; Delete removes; Ctrl+Z in the
bed-number field leaves the plan alone; two clicks draw a wall; Enter places the armed item; a row of six
beds; an Items-list x moves the bed; the corner handle resizes the room; "Unsaved changes" becomes
"Draft saved" 2 s later. No page errors.

**Found and fixed on the way:** the bays template had no wall behind the bays' second row (the
piped-services check caught it; a wall with a 2 m way in now stands there, and every template passes
that check with oxygen at every bed); the publish count now reads from the ward's registered count; a
text node after an expression that holds an HTML entity lost its space in the compiled output, so that
sentence is a template string.

**Commands and results**

```
npm run typecheck     # exit 0 (app and functions)
npm run lint          # exit 0 (the 2 older warnings)
npm run test          # 7,859 passed, 571 skipped (live-database suites), 0 failed
```

---

## STOP 5 — The live bed board

**Routes:** `app/hospital-admin/departments/wards/[wardId]/board` (the admin; _Build_ switches to the
layout) and **`app/nurse/beds`** (a new nurse sidebar item, _Bed board_, shown only with `WARD_BUILDER`;
the nurse sees the wards they are in charge of or assigned to, one tab each). One component,
`components/wards/board/bed-board.tsx`.

| Part               | What                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State              | `lib/wards/board.ts` (the occupancy engine): Occupied from an open `bed_assignments` row; Out from `closed_at`; else the latest `bed_state_events` row since the last assignment on that bed ended; else Free.                                                                                              |
| Paint              | Occupied a teal tint, Free the card, Cleaning a **sky** tint (not amber: `DESIGN-medsync.md` keeps red, amber and green for the patient), Reserved grey with a dashed edge, Out hatched; the word on every bed (Occ, Free, Clean, Res, Out); a legend with counts; the counts under the plan.               |
| A bed              | Its state, since when, its room, its services; with rights: set Free, Cleaning or Reserved (Reserved asks who or why); _Put a patient in this bed_ from the ward's receiving intakes; _Take the patient out_ with a reason, then _bed to cleaning_ or _bed free_. Out of service says the admin reopens it. |
| Free beds, by need | Any, with wall oxygen, with wall suction, with a monitor, in a single room; each lists clickable bed numbers (`freeByNeed`, one pass).                                                                                                                                                                      |
| Every bed          | A list of every bed with its state word: the keyboard and screen-reader way to choose a bed.                                                                                                                                                                                                                |
| Patients           | Name and MRN for the ward's own nurses; **MRN only for the hospital admin**, as on the admin's intake and scheduling pages.                                                                                                                                                                                 |
| Live               | `lib/wards/use-board-live.ts` joins `ward-beds:<hospital>`, re-reads on a message for this ward, polls every 15 s without the channel, pauses while hidden; the header says which.                                                                                                                          |
| Consumers          | Emergency capacity and the hub strip read `bed_count`, which publish sets; archiving a ward or a bed with a patient in it, and closing an occupied bed, are refused (STOP 3).                                                                                                                               |

**Screenshots** (seeded ward, all five states): `board` (a nurse's board, free beds by need, every bed),
`board-bed` (a free bed with a patient waiting to be put in it), `board-admin` (the admin, MRN only, an
occupied bed with _release_), `board-dark`.

**Honest gap:** nothing sets `patient_intakes.receiving_ward_id` from a screen today, so in production
_Put a patient in this bed_ will usually say "Nobody is waiting for this ward". The board says so.

---

## STOP 6 — Tests

Each of the prompt's Phase 6 items, and where it is proved:

| Prompt item                | Where                                                                                                                                             | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geometry                   | `tests/wards/geometry.test.ts` (14)                                                                                                               | Snapping (cells for items, grid lines for dividers and doors); the turned footprint at 0/90/180/270; clamping moves rather than cuts; bed sizes (proposed); the row of beds (count, gap, facing all four ways, curtains halfway and none after the last, numbered on from the highest, stops at the floor's edge, result valid); dividers snap to the dominant axis (a tie goes across); numbering continues the ward's own style; renumbering row by row. |
| Checks                     | `tests/wards/checks.test.ts` (11)                                                                                                                 | Every check and its wording; head at the wall for all four rotations, two cells away and a wall down the side are not; room walls count; only duplicate numbers and a bed on a bed block.                                                                                                                                                                                                                                                                  |
| Reconcile                  | `tests/wards/reconcile.test.ts` (13, pure) and `tests/emr-db/ward-builder.test.ts` (10, the SQL function on PGlite)                               | Create, update, archive; an archived bed restored by its number; a reused archived number becomes "(old n)"; two numbers swapped; refused on an occupied bed (in the plan and again under the locks) and on a stale revision; `bed_count` updated; the previous version superseded; `bedId` written back into the document; a ward with a register started from it, ids kept.                                                                              |
| Undo and redo              | `tests/wards/history-keys.test.ts`                                                                                                                | The 50-step limit; a new edit clears redo; a drag is one step; switching wards starts afresh (the editor is keyed by ward).                                                                                                                                                                                                                                                                                                                                |
| Keys                       | `tests/wards/history-keys.test.ts`                                                                                                                | Cmd+Z and Ctrl+Z undo; Shift+Cmd+Z, Shift+Ctrl+Z and Ctrl+Y redo; nothing in an input, textarea, select or contenteditable, nothing in live mode, nothing with Alt; the plan's R, Delete, arrows, Escape, Enter; Cmd+R left alone. Source rule: no key listener on `window` or `document` anywhere in the feature.                                                                                                                                         |
| Bed state and free by need | `tests/wards/editor-board.test.ts`                                                                                                                | Occupied whatever else is true, Out, else the latest event since the last assignment ended, else Free; the counts for the legend; free beds by oxygen, suction, monitor, single room, one pass; who may act (admin, in-charge, the ward's assigned nurses; a nurse of another ward may not).                                                                                                                                                               |
| RLS                        | `tests/rls/ward-builder-tables.test.ts` (live database, skips without `MEDSYNC_ALLOW_RLS_DB_WRITES=1`) and, on every commit, the PGlite lane test | Hospital isolation on all four new tables; assignments (they name a patient) hidden from non-clinical staff; no client writes at all, so no nurse, of this ward or another, sets a bed's state except through the hub, which checks the ward before the audit and any write (`tests/wards/invariants.test.ts`); the publish function is the service role's alone.                                                                                          |

Also: `tests/wards/presets.test.ts` (every template on small, default and large floors: valid, inside the floor, nothing blocking; with oxygen added at every bed, the piped-services check still passes), `tests/wards/invariants.test.ts` (source rules: GATED header, forced RLS, append-only
wording, a PHI-free broadcast, no red, no amber on a bed state, a word on every bed, heading weights,
the flag on every page), `tests/hospital-services/invariants.test.ts` (38 ops now, the ward ops
included). The lane test also proves the append-only guards let a cascade through: a ward or hospital
that is deleted takes its layouts, assignments and events with it, which no direct delete can
(found by an adversarial read of 0090 and fixed there: `pg_trigger_depth() > 1`).

```
npx vitest run tests/wards tests/hospital-services      # 10 files, 187 passed
EMR_PGLITE=1 npx vitest run tests/emr-db/ward-builder.test.ts   # 10 passed
```

---

## STOP 7 — Ship check

**Commands and results** (this branch, on the latest `main` at `2378ce3`):

```
npm run typecheck                    # exit 0 (app and functions)
npm run lint                         # exit 0; the 2 older warnings (scripts/embed-bench.mjs)
npm run test                         # 298 files passed, 46 skipped; 7,935 tests passed, 578 skipped, 0 failed
rm -rf .next && npm run build        # exit 0; new routes: /hospital-admin/departments/wards/[wardId]/layout,
                                     #   …/[wardId]/board, /nurse/beds, /styleguide/ward-builder/[screen]
EMR_PGLITE=1 npx vitest run tests/emr-db   # the whole lane: 26 files, 396 passed
npm run budget                       # exit 0 (its 18 patient routes; the new routes are not on its list)
npx prettier --check <every file this branch touches>   # clean
```

`npm run format:check` still lists 23 files that are already on `main` (the examination pack and
two EMR docs; PR #190 fixes that). The ward builder pack as delivered (prompt, README, prototype)
joins `.prettierignore` so it stays byte-identical, as the Plan pack did; `STOP-REPORTS.md` and the
ADRs are ours and formatted.

**`/styleguide`:** no token changed (`app/globals.css` and the Chroma tokens untouched), so nothing
to re-check there. The feature's fixture screens are at `/styleguide/ward-builder/[screen]`.

**Keyboard-only pass** (Playwright on the fixtures, keys only, no pointer):

| Step                                                      | Result                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Tab to the palette's _Standard_ bed, Enter arms it        | 13 presses                                                            |
| Tab on to the plan, Enter places the bed                  | 18 → 19 beds                                                          |
| Arrows nudge it; R rotates it; Ctrl+Z undoes the rotation | moved one cell each way; 1 × 2 m became 2 × 1 m; undone               |
| Shift+Tab to _Items list_, Enter                          | the table, 48 rows                                                    |
| Tab to _Bed B1: x in metres_, type 2.5, Enter             | the bed moves (1.5 → 2.5 m)                                           |
| Tab past the field to _Rotate bed B1_, Ctrl+Z             | undone (2.5 → 1.5 m); inside a field Ctrl+Z stays the field's         |
| Every control in the Items list has a label of its own    | 192 of 192 distinct                                                   |
| _Delete bed B1_, Enter                                    | 48 → 47 rows                                                          |
| Board: Tab to _Every bed_, then to a free bed, Enter      | the bed's panel opens and focus is on its heading                     |
| Tab to _Cleaning_, Enter                                  | set; focus comes back to the bed's heading                            |
| Tab to _Close_, Enter                                     | the free beds show again and focus is back on that bed in _Every bed_ |
| A free-bed chip (_Bed B5, free_), Enter                   | that bed's panel, focus on it                                         |
| Every Tab stop on both screens shows a focus ring         | yes (none without one)                                                |
| Page errors                                               | none                                                                  |

**Found by the pass and fixed:**

- The Items list gave every _Window_, every _Curtain_ and every _Door_ the same label ("Divider Window:
  x in metres" twice), so a screen reader couldn't tell the rows apart. A name shared within a kind is
  now counted, "Window (2 of 3)", "Door (1 of 4)" (`itemsOf`, tested); the _What_ column gives a
  divider's length; the coordinate fields take the design's focus halo; `aria-selected` is gone from
  plain table rows.
- On the board, choosing a bed from _Every bed_ or a free-bed chip removed the button that had focus,
  so focus fell back to the top of the page; so did an action (its button is disabled while it runs)
  and _Close_. Focus now goes to the bed's heading, comes back to it after an action, and returns to
  that bed in _Every bed_ on close. A live update that re-renders the bed never takes focus from
  elsewhere on the page.
- An action's error in the editor, the publish dialog, the ward form and the bed panel is announced
  (`role="alert"`), as the hub's own `ErrorLine` is.

**Screenshots** refreshed: `layout-items`, `board-bed`.

### For the owner

1. **Apply migration `0090_ward_builder.sql` (GATED)** when ready: `npm run db:migrate` from this
   branch. It only adds tables, columns, a function, policies and triggers; it is safe while `main`
   is deployed. The next new migration is 0091.
2. **Deploy the Edge Function** `ha-services-hub` (new `ops-wards.ts`, the shared `ward-layout.ts`,
   and refusals in `ops-structure.ts`): `npx supabase functions deploy ha-services-hub --use-api`.
   `_shared/sa-audit.ts` changed only a type, so no other function needs deploying. Either order is
   safe: the hub tolerates the missing tables until 0090 is in.
3. **Turn it on**: `WARD_BUILDER=1` (or a comma-separated list of hospital ids) in Vercel, then
   redeploy. Off, no page, no sidebar item and no query changes.
4. **Confirm or change the proposals** (the prompt's appendix; nothing here is a national standard):
   the bed footprints (standard 1 × 2 m, ICU 1.5 × 2 m, cot 1 × 1.5 m), the 0.5 m grid and the default
   floor; the twelve bed services and their glyphs; the room kinds and features; the out-of-service
   reasons; every layout check and its wording; the four templates.
5. **ADRs 0191–0196** are written as proposed.
6. **Known gap:** nothing sets `patient_intakes.receiving_ward_id` from a screen today, so _Put a
   patient in this bed_ will usually say nobody is waiting for the ward. A follow-up can let the
   emergency or admissions flow name the receiving ward.
