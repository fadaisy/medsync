# PROMPT — Ward builder (hospital admin) and the live bed board

**For:** Claude Code, working in `justfadhul/medsync`. Branch off the latest `main` into a new branch, `feat/ward-builder`.
**Owner:** Usama Fadhul.
**Design authority:** `prototype/WardBuilder.dc.html` in this pack (interactive; open it on the canvas: https://claude.ai/artifact/5m1vC8hWwSveSFkRnYmTnq). Where the prototype and `DESIGN-medsync.md` disagree, the design system wins. The prototype uses raw hex; the build uses the tokens in `app/globals.css`.

Read `AGENTS.md` first. This Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing code.

Work in phases. **Every phase ends with STOP:** report what you did, the commands you ran and their results, then wait for the owner. Do not commit to `main`, do not push, and do not run `npm run db:migrate`. A migration marked GATED is written and reviewed only; the owner applies it.

---

## 0. What we are building

On the ward panel (Hospital admin › Departments & wards › Wards), the admin opens **Layout** and assembles the ward on a 2D floor plan:
- beds, placed and rotated as they stand in real life;
- dividers: walls, curtains, glass partitions, windows and doors;
- rooms: private, isolation, side rooms, and curtained bays;
- fixtures: nurses' station, hand-wash, toilet or shower, store, sluice, resus trolley;
- on each bed, the services and equipment at that bed: wall oxygen, suction, medical air, cardiac monitor, nurse call, power, infusion pump, IV pole, locker, overbed table, pressure-relief mattress, privacy curtain track.

Publishing the layout makes its beds the ward's bed register: the bed count, bed numbers and closed beds. It also gives nurses and bed managers a **live bed board** on the same plan: each bed is occupied, free, cleaning, reserved or out, and free beds can be found *by what the patient needs* (with oxygen, with suction, with a monitor, in a single room).

## 1. Rules that override everything below

1. **The bed register stays the source of bed identity.** `hospital_beds` rows are never deleted.
   - A bed removed from a layout is **archived** on publish.
   - Archiving a bed with an open assignment is refused, and the refusal names the bed and says why.
   - Bed ids survive re-layouts.
2. **Privileged writes go through the Edge Function** (`ha-services-hub`, as every structure change does today, ADR 0150/0151). The client never writes these tables directly. RLS is on for every new table.
3. **Layouts are versioned and append-only once published.**
   - Each ward has at most one draft and one published version.
   - Publishing supersedes the previous version, which is kept.
   - Every publish is audited with the admin, the time, the diff summary and any warnings that were accepted.
4. **The checks are proposed, not standards.**
   - Every check is a warning with its text. Publishing is never blocked by one; the warnings shown at publish are recorded.
   - Only these block publishing: data integrity (duplicate bed numbers, beds overlapping each other) and the occupied-bed archive refusal.
5. **Colour never carries state alone.** Every bed state has its word on the bed (Occ, Free, Clean, Res, Out).
   - Amber is for cautions. No red anywhere in this feature.
   - No left-edge accent bars; headings are weight 500.
   - Motion only as sanctioned (150 ms chevrons); nothing animates on the plan.
6. **Keyboard shortcuts are scoped to the editor, never global.**
   - Handle keys on the editor root element, not `window`.
   - Ignore events whose target is an `input`, `textarea` or contenteditable, so text fields keep their own undo.
   - Shortcuts are off in live mode.

## 2. Where things are today (verify in Phase 0)

| Area | Where |
|---|---|
| Ward list and panel | `app/hospital-admin/departments/wards/page.tsx`; `app/hospital-admin/departments/_components/wards-view.tsx` (`WardPanel`, `BedRegister`, `InCharge`, `Closure`) |
| Data loading | `lib/services/data.ts` → `loadWards` (wards, beds, in-charge) |
| Ward and bed tables | `db/schema/hospital-wards.ts` (`bed_count`, `ward_type`, `sex`, `age_group`, closure), `db/schema/services-hub.ts` → `hospital_beds` (label, `bed_type`, `closed_at`, `closed_reason`, `archived_at`) |
| Structure ops | `supabase/functions/ha-services-hub/ops-structure.ts`: `upsert_ward`, `set_ward_closure`, `generate_beds`, `set_bed`, `assign_ward_in_charge`, … and `common.ts`, `index.ts` |
| Nursing | `db/schema/nurse-workspace.ts` (`nursing_assignments.ward_id`, `ward_in_charge_assignments`, `shift_handovers`); `app/nurse/assignments`, `app/nurse/handover` |
| Receiving ward | `db/schema/patient-intakes.ts` → `receiving_ward_id` |
| Emergency capacity | The wards view says ICU, HDU, isolation and NICU beds feed Emergency. Find where, and keep it working. |

There is **no bed assignment or occupancy model** on `main` today (no `bed_id` anywhere). Phase 5 adds it.

---

## Phase 0 — Discovery (no product changes)

1. Read everything in §2. Write down how `generate_beds` and `set_bed` behave, and how the ward's `bed_count` relates to the register. The wards view says "never more unarchived beds than the ward's count", which the publish reconcile must respect or deliberately change.
2. Open the prototype and walk it:
   - the three wards and New ward;
   - every palette item, and the Row of beds tool;
   - drag, the room resize handle, the divider end handles;
   - rotate, duplicate, delete, nudge; Cmd/Ctrl+Z and Shift+Cmd+Z / Ctrl+Y;
   - the Show lens, the checks, and Publish;
   - Live bed board, and "Free beds by what the patient needs".

   Map each element to an existing component, or mark it new.
3. Find which features consume beds or ward capacity (Emergency, intake receiving ward, reports) and how.
4. List the migrations you expect in Phase 2, with their columns.

**STOP.** Report the map, the consumers of beds, the risks (existing registers with more beds than a layout, for example), and the migrations you propose.

## Phase 1 — Decisions (ADRs only)

Write the ADRs below, numbered after the latest in `docs/adr/`, and mirror them in `CHANGELOG.md`:

1. **Ward layout document and versioning.**
   - A layout is a JSON document (floor size, grid, rooms, dividers, doors, fixtures, bed placements) stored per ward as `draft | published | superseded`.
   - Units: 1 grid cell = 0.5 m, recorded as `cell_mm = 500`. Floor size is per ward.
   - Why a document, and not one row per wall: walls and curtains have no identity anyone refers to; beds do.
2. **Beds reconcile from the layout.**
   - Publishing creates, updates or archives `hospital_beds` rows, matched by the bed's register id carried in the document.
   - It sets `bed_count` to the number of active beds. This supersedes the manual count only for wards that have a published layout.
   - It refuses to archive an occupied bed.
3. **Bed services catalogue.**
   - A fixed v1 list of service codes, each with its short plan glyph: `o2`, `suction`, `air`, `monitor`, `call`, `power`, `pump`, `iv_pole`, `locker`, `overbed_table`, `pressure_mattress`, `curtain_track`.
   - Services are stored per bed in a normalised table, so "free beds with oxygen" is one query.
   - Room features (toilet or shower, hand-wash, anteroom, negative pressure) are stored per room in the document.
4. **Bed state and assignment.**
   - Occupied is derived from an open `bed_assignments` row (patient and encounter ↔ bed).
   - Cleaning and reserved come from an append-only `bed_state_events`.
   - Out is the existing `closed_at` on `hospital_beds`.
   - Who may set which state.
5. **Scoped keyboard shortcuts** for the editor: R, Delete / Backspace, arrows, Escape, Cmd/Ctrl+Z, Shift+Cmd+Z / Ctrl+Y, and the rules in §1.6.

**STOP.**

## Phase 2 — Data (GATED migrations written, not applied)

Use the next migration numbers after the latest in `supabase/migrations/`. Each migration gets the GATED header, RLS policies mirroring the services-hub tables (hospital staff read; writes via the Edge Function's service role), and audit triggers. Write the Drizzle intent in `db/schema/`.

1. **`ward_layouts`:** id, hospital_id, ward_id, version (int), state (`draft | published | superseded`), `floor_w_cells`, `floor_h_cells`, `cell_mm` (default 500), document (jsonb), `warnings` (jsonb: the check texts shown at publish), `created_by`, `created_at`, `published_by`, `published_at`.
   - Partial unique indexes: one draft per ward, and one published per ward.
2. **`hospital_beds` additions:** `layout_x`, `layout_y` (int cells), `rotation` (0, 90, 180 or 270, with a check constraint), `room_key` (text, a room id in the document; nullable).
   - Extend `bed_type` values to `standard | icu | cot | couch`, with a check constraint; keep existing values valid.
3. **`hospital_bed_services`:** bed_id, hospital_id, service_code (a check constraint on the catalogue), created_by, created_at. Unique (bed_id, service_code).
4. **`bed_assignments`:** id, hospital_id, ward_id, bed_id, patient_user_id, encounter_id (nullable), started_at, ended_at, started_by, ended_by, reason.
   - Partial unique indexes: one open assignment per bed, and one open assignment per patient.
5. **`bed_state_events`:** id, hospital_id, bed_id, state (`cleaning | reserved | free`), reason, set_by, set_at. Append-only; the current state is the latest event since the last assignment ended.
6. **The document schema** as a Zod type in `lib/wards/layout-schema.ts`, shared by the client and the Edge Function (put it where `supabase/functions/_shared` can import it, as the services-hub shared code does):

   ```ts
   {
     v: 1,
     floor: { w, h },
     rooms: [{ key, kind: "private" | "isolation" | "side" | "bay", name, x, y, w, h, door: "top" | "right" | "bottom" | "left", features: { ensuite?, sink?, anteroom?, negativePressure? } }],
     dividers: [{ key, kind: "wall" | "curtain" | "glass" | "window", x1, y1, x2, y2 }],   // axis-aligned, on grid lines
     doors: [{ key, x, y, orient: "h" | "v" }],
     fixtures: [{ key, kind: "station" | "sink" | "toilet" | "store" | "sluice" | "resus_trolley", label, x, y, rot }],
     beds: [{ key, bedId?: uuid, label, type, x, y, rot, services: ServiceCode[], status: "in" | "out", outReason? }]
   }
   ```

   Limits: at most 200 beds and 1,000 items per layout, and every coordinate inside the floor.

**STOP.** Report the migrations (not applied), the schema and the Zod type.

## Phase 3 — Edge Function ops

Add these to `ha-services-hub/ops-structure.ts`, following the existing op pattern (Zod input, `reason` where the others take it, the hospital-admin scope check, audit):

1. **`save_ward_layout_draft`** `{ ward_id, document }`. Validates the document, then upserts the ward's draft (bumping the version).
2. **`publish_ward_layout`** `{ ward_id, accepted_warnings: string[] }`, in one transaction:
   - Validate the draft; refuse on the blocking integrity checks (§1.4).
   - Reconcile beds:
     - document beds with a `bedId` update position, label, type and services;
     - beds without a `bedId` create register rows, and the ids are written back into the new published document;
     - active register beds missing from the document are archived, unless occupied, which refuses with the bed labels;
     - `status: out` sets `closed_at` and `closed_reason`; `in` clears them.
   - Set `hospital_wards.bed_count` to the active beds.
   - Mark the previous published version superseded, and insert the new published row with the warnings.
   - Audit.
3. **`start_layout_from_register`** `{ ward_id }`. For a ward that already has named beds, makes a first draft with those beds laid out in rows, so nothing is lost.
4. **Live ops** (Phase 5): `set_bed_state` `{ bed_id, state, reason? }`, `assign_bed` `{ bed_id, patient_user_id, encounter_id? }`, `release_bed` `{ assignment_id, reason }`.
   - Allowed for the hospital admin, the ward in-charge and nurses assigned to the ward. Check the existing nursing-assignment tables for the ward.

Unit-test the reconcile logic as a pure function (`lib/wards/reconcile.ts`), with the Edge Function calling it.

**STOP.**

## Phase 4 — The editor (Build mode)

**Route and entry**
- Route: `app/hospital-admin/departments/wards/[wardId]/layout/page.tsx`, a full-width page inside the hospital shell. It needs `requireHospitalAdminScope`.
- Entry points:
  - a **Layout** button on `WardPanel`;
  - on a ward with a register but no layout, **Start from the register** (`start_layout_from_register`).

**The page, following the prototype**
1. **Header:**
   - the breadcrumb, then the title (Ward layout / Bed board);
   - the **Build / Live bed board** segmented control;
   - ward tabs for the hospital's active wards, plus **New ward** (it opens the existing ward panel to create one);
   - a save state (Draft saved hh:mm / Unsaved changes), **Save draft** and **Publish layout**.
2. **Palette (left):**
   - Select and move;
   - **Quick:** Row of beds;
   - **Beds:** standard, ICU, cot, couch or trolley;
   - **Dividers:** wall, curtain, glass, window (click start, click end, snapping straight across or down), and door;
   - **Rooms:** private, isolation, bay;
   - **Fixtures;**
   - **Start from a layout:** open ward, bays and private rooms, high dependency, empty floor. These are templates from `lib/wards/presets.ts`, scaled to the ward's floor.
   - **Row of beds settings:** number of beds, gap, which wall the heads face, curtains between (on or off), wall oxygen (on or off). A dashed preview follows the pointer and one click places the row, numbered on from the highest bed number.
3. **Plan (centre):**
   - A grid drawn with tokens, 1 cell = 0.5 m. The floor size is editable in the ward inspector.
   - Pointer drag with snapping; a ghost preview while placing.
   - A corner resize handle on a selected room, and end handles on a selected divider.
   - Beds show the headboard band, the pillow, the bed number, and small O₂ / S / M glyphs. Out beds are hatched with the word "Out".
   - **Show** lens: Plan / Oxygen / Suction / Monitors / Out of service. Beds with the service are highlighted with an outline and tint; the rest are dimmed.
   - A caption: "1 square = 0.5 m · the floor is W × D m" and the shortcut hints.
4. **Inspector (right):**
   - **Nothing selected:**
     - the ward's name, department, sex and level of care (read and write through the existing `upsert_ward`);
     - bedside services coverage bars (of the beds in service);
     - **Before you publish** checks;
     - **Renumber beds, left to right.**
   - **Bed selected:** number, type, services as chips grouped (piped services / monitoring and call / at the bedside), "Copy these services to every bed in this bay / room / the open ward", in or out of service with reason chips, rotate, duplicate, delete, nudge.
   - **Room selected:** name, kind, width and depth steppers, which side the door is on, room features, the beds in it.
   - **Divider selected:** kind and length.
   - **Fixture selected:** its label.
5. **Bottom bar:** the counts, and the amber note when the plan's bed count differs from the registered count.
6. **Undo and redo:**
   - A reducer over document snapshots, at most 50, per ward in the session.
   - Cleared on ward switch; new edits clear redo. Buttons with tooltips naming the platform shortcut.
   - **Cmd+Z / Ctrl+Z** undo; **Shift+Cmd+Z / Ctrl+Y** redo; handled as in §1.6.
7. **Keyboard and accessibility:**
   - The plan is focusable. With focus on it: R rotates, Delete / Backspace removes, the arrows nudge, Escape stops placing and clears the selection.
   - **Required, not in the prototype:** an **Items** list view (a toggle beside the plan). It is a table of every bed, room, divider and fixture, with select, edit, move (x and y inputs), rotate and delete. It gives full keyboard and screen-reader access; drag is never the only way.
   - Placing from the keyboard: arm a palette item, then Enter on the plan places it at the plan's centre, and the arrows move it.
8. **Autosave:** the draft saves 2 s after the last change, through `save_ward_layout_draft`. Leaving with unsaved changes asks first.
9. **Checks** (pure functions in `lib/wards/checks.ts`, each unit-tested). Each returns `{ ok, text, blocking }`:
   - every bed in service has a nurse call;
   - beds without wall oxygen, naming them; for HDU and ICU wards, beds without a monitor;
   - isolation rooms have hand-wash;
   - a nurses' station and a resus trolley are placed;
   - **overlapping** beds or fixtures, or a bed crossing a wall or glass partition. Bed-on-bed is *blocking*.
   - **piped services away from the wall:** a bed with o2, suction or air whose head edge is not within 1 cell of a wall or a room wall along the bed's width;
   - **duplicate bed numbers** (*blocking*).

**STOP.** Show screenshots of each ward preset, a bed with services, a room being resized, and the Items list. Run typecheck, lint and test.

## Phase 5 — Live bed board

1. **The same plan, read-only for layout**, at `app/hospital-admin/departments/wards/[wardId]/board`. The same component is embedded for nurses on their ward (find the right place in the nurse workspace, next to assignments or handover).
2. **Bed state:**
   - occupied, from an open `bed_assignments` row;
   - out, from `closed_at`;
   - otherwise the latest `bed_state_events` state, defaulting to free.
   - Each bed shows its state word and a tint from tokens: Occupied teal tint, Free white, Cleaning amber, Reserved grey with a dashed border, Out hatched.
3. **Choosing a bed:** shows its services and its state. Staff with rights can set it to Free, Cleaning or Reserved (with a reason), assign a patient (from the ward's receiving intakes, `receiving_ward_id`), or release a patient. Patient details follow the existing RLS and show only the minimum (name and MRN) to those allowed.
4. **"Free beds by what the patient needs"** panel: any, with wall oxygen, with suction, with a monitor, in a single room. Each lists clickable bed numbers. This is one query over the beds, their services and state.
5. **Live updates:** state changes appear without reload for everyone viewing the ward. Use the repo's existing realtime pattern (see the workspace realtime tests).
6. **Existing consumers:** make sure Emergency capacity and reports read the same state (Phase 0 list).

**STOP.** Show screenshots with a seeded ward: occupied, free, cleaning, reserved and out beds, and the free-by-need panel.

## Phase 6 — Tests

- **Geometry:** snapping, the rotated footprint, clamping to the floor, the row generator (count, gap, facing, curtains, numbering), divider drawing snapping to the dominant axis.
- **Checks:** each one, including head-at-wall for all four rotations and room walls.
- **Reconcile:**
  - create, update and archive;
  - refusal on an occupied bed;
  - `bed_count` updated;
  - the previous version superseded;
  - `bedId` written back;
  - a ward with an existing register started from it.
- **Undo and redo reducer:** limits, redo cleared by a new edit, cleared on ward switch.
- **Key handling:** Cmd+Z and Ctrl+Z undo; Shift+Cmd+Z and Ctrl+Y redo; nothing happens in an input or textarea or in live mode.
- **Bed state derivation**, and the free-by-need query.
- **RLS** for every new table in `tests/rls/`: hospital isolation, and nurses of another ward cannot set state.

**STOP.**

## Phase 7 — Ship check

Run `npm run typecheck && npm run lint && npm run test`, then `rm -rf .next && npm run build`. Do a keyboard-only pass of the editor using the Items list and the live board. Check `/styleguide` if tokens changed.

**STOP.** Report. The owner applies the GATED migrations.

---

## Appendix — What the prototype invents (do not ship as fact)

- **Sizes:** bed footprints (standard 1 × 2 m, ICU 1.5 × 2 m, cot 1 × 1.5 m), the 0.5 m grid, and the 21 × 16 m default floor. The floor must be set per ward.
- **Lists:** the bed-services list and its glyphs; the room kinds and features; the out-of-service reasons.
- **Checks:** every check and its wording. They are proposals for the owner to confirm; none is a national standard.
- **Wards:** the three sample wards and their templates.
- **Bed states:** the live states in the prototype are deterministic demo data.
