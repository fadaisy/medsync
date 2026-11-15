# PROMPT: Tether clinics and schedule (hospital admin), built from the prototype canvas

> **For Claude Code.** Work at the repo root on a new branch, `feat/clinics-schedule`, cut from `main`.
>
> **What this slice does.** It builds the hospital admin's clinics and schedule workspace from the _Tether Clinics & Schedule · Prototype_ canvas, for the booking-first launch. One shell holds seven views:
>
> - **Get ready:** what stands between each clinic and taking bookings, and the hospital basics.
> - **Clinics:** the list, and the clinic editor (basics, sessions, booking, fee, desks).
> - **Week plan:** every clinic's usual week, clashes, changing many sessions at once, and the printed timetable.
> - **Closures:** holidays, closures, time away and extra sessions, on a calendar.
> - **People:** who runs each session, their grade, office and what patients see, and leave requests.
> - **Desks and screens:** which desk and screen covers which clinic, pairing and health.
> - **History:** drafts, scheduled publishes and past versions.
>
> Admin changes are **drafts**. Patients, desks and screens see only what has been **published**. Section 2 says how.
>
> **One record per fact. This is not negotiable.**
>
> - A clinic is the booking engine's bookable service.
> - Its sessions are the booking engine's session templates.
> - Blocks, wings and rooms are the Services Hub's places.
> - Holidays and closures are the Hub's and the booking engine's exceptions.
> - People are the staff feature's approved staff, and their time away is the scheduling engine's availability.
>
> This slice is an **editor** over those records, plus the few things they lack (Section 5). It never stores a second copy.
>
> **Relationship to other prompts.**
>
> - `PROMPT-HOSPITAL-SERVICES-HUB.md`: structure, places, holidays, level presets and the clinic record's added fields. If it has landed, reuse it. If it has not, Step 2 adds only the rows this slice needs, in the Hub's shape and paths, so the Hub later extends them rather than replacing them.
> - **The hospital admin shell** (integration contract, registry, panels, ⌘K, audit). This slice registers as one feature in it.
> - `PROMPT-RECEPTION-DESK.md`: the shell components, tokens, `Ticket`, toasts, user switch with PIN, the desk's "Mine" clinic list and the device model. Reuse them; never fork them.
> - `PROMPT-CLINIC-FLOOR.md`: the waiting-room screen feed and its PHI-free rules. This slice only decides which clinics a screen shows.
> - **The scheduling PRD and engine:** session templates, one-offs, exceptions, the cancel-session flow and doctor availability (`lib/scheduling/**`, the availability sheet in `app/doctor/schedule/`).
>
> **Mode: gated.** Nine steps, numbered 0 to 8, each ending in a **STOP**.
>
> - Documents: draft, critique against this prompt, revise (two passes at most), present, STOP.
> - Code: build, run the real checks, fix, re-run until green, report, STOP.
> - Never start the next step on your own.
>
> **The CSO is Fadhul.** He signs:
>
> - the GATE A decisions;
> - every string a user reads (into `content/clinics-schedule/` as `draft`; **never edit a `*_COPY_STATUS` yourself**);
> - the fee bands, level templates, holiday list and confidential-clinic list;
> - each step's screenshots;
> - the cutover.

---

## 0. Working economy (read first, applies to every step)

Be **exact and lean**. Accuracy beats speed, and tokens are not free.

1. **Search before you read.** Use `rg` for symbols, routes, tables and engine exports. Open only the line ranges you need.
2. **Never re-print.** Do not echo files, diffs, schemas or logs in chat. Quote at most 1 to 5 lines, with `path:line`.
3. **Edit, don't rewrite.** Make targeted edits and leave untouched code unformatted.
4. **Reuse first.** Before creating a component, hook, action, table, token or helper, `rg` for an existing one and report what you reused. For clinics and sessions the answer is always the booking engine.
5. **Run narrow checks while building** (touched test files, one route's spec). Run the full suite once per STOP.
6. **The canvas is a reference, not source.** Take layout, behaviour and words from it. Never paste its markup, CSS or script.
   - Its seed, fixed date (Fri 13 Nov 2026), booked counts (60 % of places), SMS rate, QR pattern and template patterns are **demo stand-ins**. Do not port them as rules or test against them.
   - Its clash, readiness and impact functions show the behaviour wanted, not the implementation.
7. **STOP reports are short and tabular.** List changed files (one line each), checks with numbers, screenshots by path and open questions. Keep it under 60 lines, with no narrative.
8. **When unsure, ask at the STOP.** Never guess a fee, a rule, a permission or a string.
9. **No new dependency** without stopping to flag it (the QR code is the likely one; Section 4).

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt and the canvas. Report every disagreement at STOP 0.
2. **The booking and scheduling engine:** services, session templates (kind, recurrence, capacity, split), one-offs, exceptions, holidays, the cancel-session and reschedule flows, the SMS renderer (including confidential clinics) and availability kinds. Read its public API and tests. Do not re-implement it.
3. **The Services Hub**, if landed: structure, places, holidays, level presets, the clinic record's added columns. If it has not landed, read its prompt as the target shape.
4. **The canvas:** _Tether Clinics & Schedule · Prototype_ (https://claude.ai/artifact/DsGesqF3pfLyE4nkWJj7i4).
   - Boards: **Setup · computer (hospital admin)** 1440 × 960, **tablet** 834 × 1112, **phone** 390 × 844.
   - Tweaks: scenario _Getting ready / First run / Offline_, _dark_.
   - Fadhul exports it to `docs/design/canvases/clinics-schedule/`. Its sticky notes list assumed decisions; Section 11 turns them into GATE A items.
5. **The hospital admin shell** and the **reception desk build** (shell, devices, user switch) and their ADRs.
6. **MedSync Tide** (`docs/design/tide/`). Map every canvas colour to a token.
7. **ADRs and invariants:** 0084 (queue honesty), 0097 (place colour), 0098 (unsigned clinical content), red reserved, persistent emergency affordance, engine-first, DPPA 2019 minimum necessary.
8. **Project docs, if present:** `DESIGN-medsync.md`, `CLAUDE.md`, `MASTER-BUILD-ROADMAP.md`, the scheduling PRD, the entry-points and handling-flow docs.

---

## 2. Drafts and publishing (how a change reaches patients)

| Rule                                    | What it means here                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 **Everything is a draft first**      | Every edit in this workspace writes a draft change: entity, before, after, author, time. Patient booking, desks, screens and SMS read only the **published version**. The one exception is P7.                                                                                                             |
| P2 **One shared draft per hospital**    | All admins see and add to the same draft list, each change carrying its author. Two admins editing the same field: the later save wins and the earlier author is told.                                                                                                                                     |
| P3 **Undo is real**                     | Undo on a draft change restores the records to exactly how they were before it. Changes made after it are undone with it, and the button says so ("Undo, with 2 after it"). A test proves the restored state equals the pre-change state.                                                                  |
| P4 **Publish is atomic**                | Publishing applies every draft change in one transaction and creates a numbered version with its author and time. If any step fails, nothing is published.                                                                                                                                                 |
| P5 **Impact before publish**            | The publish sheet shows the number of changes, the number of booked patients affected, the estimated SMS cost (count × the configured unit cost, never a literal) and what updates (booking page, N desks, N screens). Each change shows its own impact line.                                              |
| P6 **Bookings move through the engine** | A published change that touches booked sessions (time moved, places cut, session removed, closure, time away) runs the booking engine's reschedule or cancel-and-offer flow, with SMS enqueued after commit. This slice never edits a booking directly.                                                    |
| P7 **Stopping is immediate**            | "Pause bookings" on a live clinic takes effect at once and is audited. It reduces exposure, so it does not wait for publish. Resuming goes through publish.                                                                                                                                                |
| P8 **Scheduled publish re-checks**      | A publish can be scheduled (now, tonight 22:00, tomorrow 06:00, or a set time). At run time the server re-validates (clashes, readiness, conflicts with newer drafts). If validation fails it does not publish and tells the author. Scheduled changes can be published early or cancelled back to drafts. |
| P9 **Restore is a new draft**           | "Bring this version back" creates a draft that returns every record to that version. It goes through publish like any other change. Versions are never edited or deleted.                                                                                                                                  |
| P10 **Blocking checks**                 | Publish is blocked while any room or person clash exists in the result (Section 4, Week plan), and while a change would make a clinic live that fails a blocking readiness check. The sheet names each blocker with a fix.                                                                                 |

---

## 3. Laws (each gets a test where one is possible)

| #    | Law                                                  | In this workspace                                                                                                                                                                                                                                                                                                     |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CS1  | **Engine-first.**                                    | Step 2 lands missing pieces before any screen uses them. No surface writes a table without RLS and tests.                                                                                                                                                                                                             |
| CS2  | **One record per fact.**                             | Clinics, sessions, places, holidays, closures, staff and availability live in their engines. A guard fails on any new table that duplicates them (Appendix C).                                                                                                                                                        |
| CS3  | **Nothing unpublished reaches patients.**            | The booking directory, desks, screens and SMS read the published version only (P1). A test edits a draft and asserts the patient read model is unchanged.                                                                                                                                                             |
| CS4  | **Queue honesty** (ADR 0084).                        | Screens show booking codes and room names only. SMS, tickets and the patient preview promise no position, wait or count ahead.                                                                                                                                                                                        |
| CS5  | **Red is emergency only.**                           | Red is used for the Emergency control and critical errors. Clinic colours may never be red; the picker refuses the red hue band and needs at least 3:1 contrast on white (tested).                                                                                                                                    |
| CS6  | **Amber is caution, lagoon is the one main action.** | Amber marks blockers, clashes, offline devices, missing offices and undecided holidays. Lagoon marks one main action per view (Open ready clinics, Publish, Fill N clinics, Change N sessions). Green only for "taking bookings" and "online". No left- or top-edge accent bars anywhere; status uses dots and words. |
| CS7  | **Confidential clinics stay confidential.**          | For clinics on the signed confidential list, the SMS, the screen and the patient preview use the booking engine's confidential rendering: no clinic name or type. The preview shows exactly what that renderer returns.                                                                                               |
| CS8  | **Names and photos need consent** (DPPA 2019).       | A clinician's name or photo appears on booking cards, tickets or SMS only with a written-consent record (date and who recorded it). Without one the card says the cadre ("A physician"). Photos never leave Tether.                                                                                                   |
| CS9  | **Fees are signed numbers.**                         | Fee bands come from the hospital's approved band table; clinic overrides are explicit. No fee literal in components. Changing the band table needs the medical superintendent's approval (four-eyes).                                                                                                                 |
| CS10 | **Audit every change.**                              | Every draft, undo, publish, schedule, cancel schedule, restore, pause, leave decision, device pair and unpair, and user switch is audited. Append-only.                                                                                                                                                               |
| CS11 | **Role isolation.**                                  | Hospital admin and medical superintendent publish. Records officer drafts only. No patient PHI is shown anywhere in this workspace; booked counts are numbers only. RLS probes for every new table, including cross-tenant.                                                                                           |
| CS12 | **Emergency on every screen.**                       | The red Emergency control stays in the top bar at every width.                                                                                                                                                                                                                                                        |
| CS13 | **Plain words, tokens only, WCAG 2.2 AA.**           | Strings come from `content/clinics-schedule/`. Lint for raw colours. Clinics always show as dot plus name, never colour alone.                                                                                                                                                                                        |

---

## 4. The workspace, by area (the canvas is the visual spec)

| Area                    | Must do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Notes                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Placement and shell** | Feature "Clinics & schedule" in the hospital admin shell (D-CS-01). Hospital-branded sidebar with "Powered by Tether". **Booking launch card:** ring of clinics taking bookings, counts for taking bookings, ready to open and to fix, and a **Next** line naming the single most useful fix. Nav with badges: Get ready (N to fix), Clinics (count), Week plan (N clashes, amber), Closures, People (N leave requests), Desks and screens (N offline, amber), History. Top bar: search (clinics, people, rooms), draft pill ("N changes not published · Review and publish"), scheduled pill ("N changes go live Mon 06:00"), "Everything is published" when clean, Emergency. User dock: role, dark mode, keyboard sheet, switch user with PIN, "Online · drafts saved".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Tablet opens in rail; phone uses a drawer. Only lists scroll; the page never scrolls sideways.                                                                                 |
| **Get ready**           | Header: "N of M clinics are taking bookings", **Start from a template**, and the lagoon **Open N ready clinics** (confirm sheet lists them). **Booking launch** pipeline: Needs setup → Ready to open → Taking bookings, each a tappable stage with count and places a week; a capacity bar; a children's clinics note (D-CS-10). **Do next:** up to five fixes, each with one action (fix in week plan, set the fee, assign someone, add sessions, add to a desk, check a device). **Clinic rows:** name, department and block, a six-segment readiness meter with missing items as chips, places a week, first bookable day, state, one action (Fix, Open, Pause). Tabs by state. **Hospital basics:** name, logo and address; opening hours; mobile money; SMS sender name; privacy notice and terms; fees by grade, each done or waiting.                                                                                                                                                                                                                                                                                                                                                                                                                             | Readiness checks (pure function): sessions, a clinician on every session, a fee or free, a desk (all blocking); a screen and patient words (not blocking).                     |
| **Templates**           | Pick the level (Health Centre IV, General hospital, Regional referral). The sheet lists each clinic in the template with its usual days and hours and "Fills" or "Keeps yours". Applying fills **only clinics with no sessions**, as drafts, using the clinic's first room and first team member.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The patterns are signed content per level (D-CS-11), from the same source as the Hub's level presets. Never a second list.                                                     |
| **Clinics list**        | Header with count and **+ Add a clinic**. Filter chips with counts: All, Needs setup, Ready, Taking bookings. Group by Department, Block or wing, State, with group headers (count, places a week). Each row: colour tile with initials, name, tags (tier, Children, Referral), block and rooms, a mini week (one cell per day showing session windows on a 07:00 to 19:00 scale), team faces (three plus count), fee (range, flat, Free, or amber "Not set"), places a week, state. "No one yet" in amber. Collapses to name and state when the editor is open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                |
| **Clinic editor**       | Header: colour, name, state; **Preview as a patient**; **Duplicate**; Close. A **Before it can open** block lists blockers, each jumping to its tab. Tabs: **Basics** (name, short name for desk and screen, colour with palette and custom picker: shade square, hue, HEX / RGB / HSB / HSL, swatches, eyedropper where supported, contrast readout; department; where it is: block or wing, then rooms in it, add a room, add a block or wing with tier; tier: general, private, both; ages: everyone or children; patient words). **Sessions** (per day, each session with time, kind, rooms, clinicians, places, booked count; add a session). **Booking** (booking opens 1 week to 2 months ahead; closes when it starts, 1 hour before, or 6 pm the day before; join today's line; walk-ins when full; reminder text; needs a referral letter; follow-ups can skip triage, D-CS-19; payment: cash office, mobile money providers as linked). **Fee** (free clinic; by who sees you, using grade bands with per-clinic overrides shown as "Set for this clinic"; or one fee; general and private columns by tier; the team with offices; add a doctor from same clinic first, then same department; add a new person). **Desks** (which desks and screens cover it). | Duplicate copies the clinic as "(copy)", not live, and opens it.                                                                                                               |
| **Session editor**      | Presets (morning, afternoon, full day, evening). Kind: **clinic day** (arrive any time, seen in turn) or **doctor's times** (slots of N minutes). Break. Repeats: every week, every other week, first week of the month. Visit length. Places: suggested from minutes ÷ visit length × clinicians, or set; held for walk-ins (0, 10, 20, 30 %). Rooms and clinicians, each showing what else they are doing that day. A day timeline. **Checks:** issues first (room or person clash, no clinician, no room), then what's fine; for a clash, the nearest time the room and people are free, one tap to move. "Same session on" other days. For a live clinic, the impact line (about N booked, what they will be told). What the patient reads ("Arrive between 08:00 and 11:00").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The clash function is shared with Week plan and publish (P10).                                                                                                                 |
| **Patient preview**     | Three panes: booking card (clinic, clinician as consent allows, usual sessions, next date, fee, "Book · N places left"), ticket (code, date, arrive window, block and room, office for doctor's-times sessions, fee, payment line), text message (with character count and SMS parts; amber over 160). Drafts included, labelled "nothing here is live".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Rendered by the **real** booking card, `Ticket` and SMS renderer with draft data, never a mock. Confidential clinics render confidentially (CS7).                              |
| **Week plan**           | Header with **Change many at once** and **Print timetable**. **Clash alert:** grouped by pair (Diabetes + Hypertension: same room and doctor, Tue and Fri 10:00 to 12:00), each with a suggested fix and Edit, plus "fix all". **Grid:** clinics by day with each session (time, clinicians, places, kind), per-day totals (places, staff), add in empty cells, clash and no-clinician cells marked in amber with an icon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |                                                                                                                                                                                |
| **Change many at once** | Pick clinics (All, Taking bookings, None, or chips), days, and the change: move times (1 h or 30 min, earlier or later) or change places (±10 %, ±20 %; doctor's-times sessions keep their slots). Shows "N sessions in M clinics", one worked example, and the booked count that gets a text. Applying creates one draft change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Times stay within the hospital's opening hours; clashes surface in Week plan and block publish.                                                                                |
| **Print timetable**     | Pick the whole hospital or a block. One A4 landscape sheet: hospital name, title, "usual week from <date>", clinics by day with times and rooms, Children and Referral notes, a QR code to the hospital's booking page, "Book before you come", "Closed on public holidays", and **"Emergencies: go straight to Casualty, any time."**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Print CSS only; legible in black and white. The QR code must encode the real booking URL: use an existing generator if the repo has one, else flag the dependency at the STOP. |
| **Closures**            | Month calendar with marks (closed, someone away, extra session); tap a future day to add. **Coming up** list with draft tags and Remove. **Add a closure or change:** type (closed, someone away, extra session), date range, whole day or part, which clinics or blocks, cover (same clinic first, then same department), what happens to bookings (offer the next session or cancel with a text), impact rows per affected session, and the SMS preview. **Public holidays · next 12 months:** date, name, how many clinics run that weekday, state (Closed, Open as usual, Not decided), Close all / Keep open / Change, and "Close every clinic on all N". Eid dates are "expected · confirm when announced". The note: closing only stops bookings; Casualty, maternity and wards run as usual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Holidays come from the Hub's verified list (D-CS-12); closures run through the booking engine (P6).                                                                            |
| **People**              | **Leave requests** card (when any): who, dates, reason, sent from the app, impact (sessions, clinics, about N booked), cover suggestion or amber "no one else on these clinics", **Approve…** (opens the closure form filled in) and Decline (the doctor sees "Not approved"; Undo). Header with count and **+ Add a person** (name, role as patients read it, grade with each band's fees; new people stay hidden on cards until consent). Filter chips: All, Needs attention (double-booked, or specialist or consultant without an office), Away, No sessions, Hidden on cards. Group by grade (consultants first), department, office. Each row: avatar, name, role and grade, office or amber "No office set", Away and double-booked tags, a mini week coloured by clinic, clinic chips, hours a week with a load bar (amber above the signed threshold), fee band, and what patients see. **Person panel:** usual week, add leave, office (block, then room; another person's office is shown), grade (fee band), name and photo on booking cards with the consent record, and a card preview.                                                                                                                                                                     | People are the staff feature's approved staff. "Add a person" starts the staff feature's invite or records a non-user clinician per D-CS-09.                                   |
| **Desks and screens**   | Header with count and online count, **+ Add a device** (desk, triage tablet or waiting-room screen; place; a 6-character pairing code that works once for 15 minutes). **Health tiles:** devices online (amber if any offline, naming them), clinics with no desk (amber; they cannot open), clinics with no screen (grey; patients called by text only); tiles jump to the right view. **Devices / Coverage** switch. Devices: filter chips (All, Desks, Tablets, Screens, Offline) and groups; each card with a type icon, name, place, last seen, clinic chips, and lock rule or "codes and rooms only". **Coverage:** a clinic × device grid; tap a cell to add or remove; rows with no desk in amber; "No screen" tags. **Device panel:** clinics it covers ("Mine" for desks), lock after 5, 10 or 15 minutes for desks and tablets, and for screens what it shows (codes and rooms only, with a sample).                                                                                                                                                                                                                                                                                                                                                           | Device records are the reception desk build's; this slice adds coverage editing and health only.                                                                               |
| **History**             | **Not published yet:** each draft with author, time, impact and Undo (P3). **Scheduled:** when, count, "See or change". **Published:** each version with when, who, count, texts sent, the first four items, and "Bring this version back" (P9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                |
| **Publish sheet**       | Stats: changes, booked people who get a text, estimated SMS cost, what updates. The change list with Undo. When: Now, Tonight 22:00, Tomorrow 06:00 (D-CS-04), with a line on what each means. Blockers listed with fixes (P10). The lagoon button names the action ("Publish 3 now", "Schedule for Mon 06:00").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                |
| **Other**               | Keyboard sheet (?), toasts with Undo, offline banner (drafts saved on the device; publish needs a connection), first-run empty states, switch user with PIN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                                |

---

## 5. Engine and data scope (Step 2; confirm each at Step 0, add only what is missing)

| Capability         | Expected shape                                                                                                                                                                                                         | Tests                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Clinic record      | Booking service plus: short name, colour, block, rooms, tier, ages, patient words, referral flag, fee mode, booking rules, payment options, team, live and paused flags. Columns live where the Hub decides (D-CS-01). | colour rule (CS5); confidential flag read from the signed list                              |
| Session template   | Kind (clinic day / doctor's times), slot, visit length, places (set or suggested), held for walk-ins, break, recurrence (weekly, every N weeks, nth weekday), rooms, clinicians, effective dates                       | suggested places formula; recurrence expansion against holidays and closures (closures win) |
| Places             | Blocks and wings with tier; rooms per block; offices are rooms                                                                                                                                                         | a room belongs to one block                                                                 |
| Fee bands          | Per hospital: grade → general and private amount, version, approved by, approved at                                                                                                                                    | four-eyes approval (CS9); no unapproved band reaches patients                               |
| Fee resolution     | Pure: (clinic, session, clinician grade, tier) → fee shown and fee charged                                                                                                                                             | table-driven, mixed-grade sessions per D-CS-06                                              |
| Clinician display  | Grade, office room, booking-card visibility, consent record                                                                                                                                                            | name or photo never rendered without consent (CS8)                                          |
| Readiness          | Pure: clinic + published state → checks, blockers, status (setup, ready, live, children desk-only)                                                                                                                     | each check's edge                                                                           |
| Clash detection    | Pure: all sessions → overlaps by room and by person, per weekday and recurrence, with the nearest free slot                                                                                                            | fixtures incl. every-other-week vs weekly                                                   |
| Impact             | Pure over the booking engine's read model: affected sessions → booked count, SMS count, cost (count × configured unit cost)                                                                                            | no PHI in output                                                                            |
| Draft change log   | hospital, entity type and id, before, after, author, time, group id (bulk), status                                                                                                                                     | undo restores exactly (P3); later changes undone with it                                    |
| Published versions | Number, author, time, change ids, texts sent; publish is one transaction                                                                                                                                               | atomic failure leaves nothing published (P4)                                                |
| Scheduled publish  | Run at, author, change ids; a scheduled job re-validates (P8)                                                                                                                                                          | invalid at run time → not published, author told                                            |
| Exceptions         | Closed, away, extra; date range, part of day, scope (clinics or blocks), cover, booking policy; via the booking engine and availability engine                                                                         | closure wins over holidays and sessions                                                     |
| Holidays           | The Hub's verified list per year, Eid flagged expected; per hospital decision (closed, open)                                                                                                                           | an undecided holiday is listed as such, never assumed                                       |
| Leave requests     | Clinician, from, to, part of day, reason, status (new, approved, declined), decided by; created from the doctor's existing availability sheet                                                                          | approval creates one availability exception; decline notifies the clinician                 |
| Devices            | Kind, place, covered clinics, lock minutes, last seen, pairing code (hash, expiry, used)                                                                                                                               | code single-use and 15-minute expiry                                                        |
| Templates          | Signed content per facility level: clinic catalogue key → days, start, end                                                                                                                                             | applies only to clinics with no sessions                                                    |

RLS on every new table. Admin, medical superintendent and records officer access are limited to their hospital and role (CS11).

---

## 6. Steps and gates

The `clinicsSchedule` flag: off serves the current admin pages, on serves this workspace. It is deleted at Step 8.

**Step 0: Discovery (no product changes).**

- Q1: the booking engine's service and session template shape, recurrence options, exceptions, holidays, cancel and reschedule flows, SMS renderer and confidential handling; file:line for each.
- Q2: Services Hub status (structure, places, holidays, presets, clinic columns).
- Q3: staff feature (grades or cadres, offices, consent), availability engine and the doctor's availability sheet.
- Q4: device model, desk "Mine" list, screen feed (reception desk and clinic floor builds).
- Q5: which Section 5 rows exist.
- Q6: current admin clinic and schedule pages, with a parity crawl (every control by role and name).
- Q7: baselines at 1440, 834, 390 (screens, axe, first-load JS, INP on a 40-clinic week grid).
- Q8: Playwright, axe, harness, fake clock and the scheduled-job runner work locally.

**STOP 0.**

**Step 1: GATE A proposal (documents).** `docs/clinics-schedule/gate-a-proposal.md` contains:

- the route map and 308s;
- the component list with reuse;
- the engine-gap list, each gap as an extension of an existing engine;
- the draft and publish design (P1 to P10) with the data model;
- every string, band, template and holiday entry in `content/clinics-schedule/` as `draft`;
- the Section 11 table with a signature block;
- the test plan;
- ADR drafts.

**STOP 1.** Nothing proceeds without signatures.

**Step 2: Data and engine gaps.** Migrations, RLS, server actions, Zod, audit and tests for missing Section 5 rows, the draft log, versions and the scheduled job. No UI.

- **S1** RLS probes (cross-tenant; records officer cannot publish).
- **S2** a draft edit leaves the patient read model unchanged (CS3).
- **S3** undo restores the exact prior state, including later changes (P3).
- **S4** publish is atomic under an injected failure (P4).
- **S5** a scheduled publish that becomes invalid does not run and tells the author (P8).

**STOP 2.**

**Step 3: Shell and Get ready.** Feature registration, sidebar with the launch card and badges, top bar pills, search, user switch; Get ready with the pipeline, Do next, clinic rows, hospital basics; templates.

- **S6** Emergency is visible and named at 1440, 1024, 834 and 390 in both themes.
- **S7** readiness checks and statuses equal the pure function on a fixture.
- **S8** a template fills only empty clinics, as drafts.

**STOP 3.**

**Step 4: Clinics, editor, session editor, preview.**

- **S9** the colour picker refuses red and anything under 3:1.
- **S10** clash detection and nearest free time are correct on fixtures (weekly vs every other week).
- **S11** fee resolution is table-driven and matches D-CS-05 and D-CS-06.
- **S12** the preview uses the real card, ticket and SMS renderer; a confidential clinic's SMS contains no clinic name or type.
- **S13** a name or photo never renders without consent.

**STOP 4.**

**Step 5: Week plan, change many at once, print.**

- **S14** the clash alert groups by pair and "fix all" clears them on the fixture.
- **S15** a bulk change is one draft change and its undo restores every session.
- **S16** the printed sheet is one A4 landscape page per block, legible in black and white, and its QR resolves to the booking URL.

**STOP 5.**

**Step 6: Closures, holidays, People, leave.**

- **S17** a closure shows affected sessions and booked counts first, and on publish runs the booking engine's flow with one SMS per booking.
- **S18** holidays: undecided ones are listed, "close all" creates drafts, Eid shows "expected".
- **S19** approving a leave request creates one availability exception with the chosen cover; declining notifies the clinician.
- **S20** People filters and group counts equal the fixture.

**STOP 6.**

**Step 7: Desks and screens.**

- **S21** coverage edits change the desk's "Mine" list and the screen's clinics only after publish.
- **S22** a clinic with no desk cannot be opened (blocking check).
- **S23** pairing codes are single-use and expire at 15 minutes.

**STOP 7.**

**Step 8: Publish, history, offline, parity, cutover, harden.**

- **S24** the publish sheet's numbers equal the impact function; cost uses the configured rate.
- **S25** restore creates a draft that returns every record to the chosen version.
- **S26** offline (D-CS-15): drafts save on the device, survive a reload and sync once; publish needs a connection.
- Parity report signed.
- Flag on for one pilot hospital for 3 days.
- Delete the old pages, components and flag; keep the 308s.
- axe, guards and budgets.
- `docs/clinics-schedule/REPORT.md` with Section 9 filled.

**STOP 8.**

---

## 7. Parity

Every control from the Step 0 crawl is reachable in this workspace, or listed in `tests/parity/clinics-schedule/renames.json` with a reason Fadhul signs.

## 8. Budgets

| Measure                                  | Budget                                    |
| ---------------------------------------- | ----------------------------------------- |
| First-load JS for the route (gzip)       | ≤ 170 KB; report                          |
| INP, week grid with 40 clinics           | ≤ 200 ms                                  |
| Clash detection over 40 clinics × 7 days | ≤ 20 ms (pure)                            |
| Panel and sheet open                     | ≤ 150 ms                                  |
| CLS                                      | ≤ 0.05                                    |
| Server action p95                        | ≤ 300 ms; publish of 50 changes p95 ≤ 2 s |
| axe serious or critical                  | 0, all widths, both themes                |
| Horizontal page scroll at 390            | 0                                         |
| Guards (Appendix C)                      | 0 failures                                |

## 9. Numbers to report at the final STOP

Baseline vs result for each Section 8 row, plus:

- interactions to set up a General hospital's clinics from the template vs from scratch (target ≥ 70 % fewer);
- interactions to move every afternoon session 30 minutes later;
- clashes that reached a published version (must be 0);
- draft changes visible to patients before publish (must be 0);
- stores for clinics or sessions outside the booking engine (must be 0);
- names or photos shown without consent (must be 0);
- parity items lost (must be 0);
- strings outside `content/clinics-schedule/` (must be 0).

---

## 10. Accessibility

- WCAG 2.2 AA at 1440, 1024, 834 and 390, in both themes.
- Dialogs and sheets trap and return focus.
- Tabs, segments and chips expose `aria-selected` or `aria-pressed`.
- The week grid and coverage grid are real grids with named rows, columns and cells; every coverage cell has a full label ("Add Heart Clinic to Reception desk 1, Main hall").
- Mini weeks and load bars have text equivalents.
- The colour picker is operable by keyboard (arrow keys move the shade and hue) and announces the hex and contrast.
- Never colour alone: clinics are dot plus name; states carry their word; amber always has an icon or word.
- Targets ≥ 44 px (48 on phone); inputs ≥ 16 px.
- Reduced motion: no slides or pulses.
- Print: legible in black and white.

---

## 11. GATE A decisions (Fadhul owns; recommendations given)

| #       | Decision                                  | Recommendation                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-CS-01 | Placement                                 | Its own nav item, "Clinics & schedule", in the hospital admin shell. The Hub's Clinics tab links here, so there is one clinic editor. Added clinic columns live where the Hub places them.                                                                               |
| D-CS-02 | Draft model                               | One shared draft per hospital, with authors (P2). Undo cascades to later changes (P3).                                                                                                                                                                                   |
| D-CS-03 | Who publishes                             | Hospital admin and medical superintendent publish. Records officer drafts only. Fee band changes need the medical superintendent's approval.                                                                                                                             |
| D-CS-04 | Publish timing                            | Now, tonight 22:00, tomorrow 06:00, or a set time. Recommend after-hours as the default for changes that move booked patients.                                                                                                                                           |
| D-CS-05 | Fee bands (draft, UGX, general / private) | Nurse or midwife 10,000 / 20,000; clinical officer or allied 15,000 / 30,000; medical officer 30,000 / 50,000; specialist 60,000 / 100,000; consultant 100,000 / 150,000. Per hospital, approved by the medical superintendent, reviewed yearly. Free clinics stay free. |
| D-CS-06 | Fee in mixed-grade sessions               | On a clinic day with mixed grades, the booking card shows the range; the desk charges the grade of the clinician actually seen. Doctor's-times sessions show the exact fee.                                                                                              |
| D-CS-07 | Clashes                                   | A room or person overlap blocks publish. Suggest the nearest free time. No "shared room" exception at launch.                                                                                                                                                            |
| D-CS-08 | Clinic colours                            | Never red; at least 3:1 on white; a curated palette plus a custom picker.                                                                                                                                                                                                |
| D-CS-09 | People                                    | Clinicians are approved staff. "Add a person" sends the staff feature's invite; until they accept, they can be named on sessions but stay hidden on cards.                                                                                                               |
| D-CS-10 | Children's clinics                        | "Children · desk only": bookable at the desk, not by patients, until the minor and guardian model (outstanding GATE A item) is signed.                                                                                                                                   |
| D-CS-11 | Level templates                           | Signed content per level, from the Hub's preset source (MoH service standards). Fill empty clinics only, as drafts.                                                                                                                                                      |
| D-CS-12 | Public holidays                           | From the Hub's verified yearly list. Each starts "Not decided" with a reminder 30 days before; Eid marked expected until announced. Closing stops bookings only; emergency, maternity and inpatient care are untouched.                                                  |
| D-CS-13 | Leave requests                            | Doctors request from the existing availability sheet. Approval creates an availability exception with cover (same clinic first, then same department) and the chosen booking policy. Decline notifies the doctor in the app.                                             |
| D-CS-14 | Booking-card identity                     | Name and photo off by default; on only with a written-consent record. Otherwise the cadre is shown.                                                                                                                                                                      |
| D-CS-15 | Offline                                   | Drafts save on the device (encrypted), survive a reload and sync idempotently. Publish, pause and pairing need a connection. "Print timetable" works offline from the last published version.                                                                            |
| D-CS-16 | Devices                                   | Pairing code: 6 characters, single use, 15 minutes. Desks and tablets lock after 5, 10 or 15 minutes, unlocked by staff PIN. Screens show codes and rooms only. A clinic needs at least one desk to open; a screen is optional.                                          |
| D-CS-17 | History                                   | Published versions kept for the life of the hospital's account; restore creates a draft (P9).                                                                                                                                                                            |
| D-CS-18 | SMS cost                                  | Count × the configured per-message rate, shown as "about"; the rate lives in configuration, not code.                                                                                                                                                                    |
| D-CS-19 | "Follow-ups can skip triage"              | **Off by default and CSO-signed per clinic.** Refills, results and planned follow-ups only; anything new still goes to triage; the desk can always send someone to triage.                                                                                               |
| D-CS-20 | Offices                                   | Needed for doctor's-times sessions of specialists and consultants: an amber warning, not a blocker.                                                                                                                                                                      |
| D-CS-21 | Workload bar threshold                    | Clinic hours a week above which the bar turns amber (canvas uses 30 h). Fadhul sets the number; it is a hint, never a block.                                                                                                                                             |

## 12. ADRs (next free numbers)

- Clinics and schedule workspace as an editor over the booking engine (no parallel stores).
- Draft, publish, schedule and restore model.
- Fee bands and fee resolution.
- Clash detection as a publish blocker.
- Clinician identity on patient-facing surfaces needs consent.
- Leave requests to availability exceptions.
- Device pairing, coverage and lock policy.

## 13. Out of scope

- Booking itself (patient app and desk flows) beyond reading the published version.
- The clinic floor, triage and the visit record.
- Wards, beds, lab and diagnostics setup (the Hub).
- Payroll, rosters for wards and on-call.
- The minor and guardian booking model.
- Spoken calls, and screen content beyond codes and rooms.
- SMS provider work.

## 14. Definition of Done

- [ ] GATE A signed; ADRs written.
- [ ] Section 2 holds: P1 to P10 each with a test.
- [ ] Laws CS1 to CS13 hold, each with its test.
- [ ] Every area in Section 4 and every item in Appendix B works by mouse, touch and keyboard at 1440, 1024, 834 and 390, both themes.
- [ ] Data gaps closed with RLS and tests.
- [ ] Parity signed; old pages, components and flag deleted; 308s kept.
- [ ] Budgets met; axe clean; guards green.
- [ ] Strings, bands, templates and holidays in `content/clinics-schedule/` as `draft`; no `*_COPY_STATUS` edited.
- [ ] `docs/clinics-schedule/REPORT.md` with Section 9 and screenshots.

---

## Appendix A: Seed data for tests and screenshots

Port the canvas's _Getting ready_ scenario as a fixture. Use invented names only. Booked counts come from seeded bookings in the booking engine, never typed.

| Group            | Content                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocks and wings | Main OPD block, Outpatients block B, Eye and Dental annex, Maternity wing, Paediatric wing, Rehabilitation block, Private wing (private tier)                                                                                                                                                                                                            |
| Clinics (19)     | General OPD, Diabetes, Antenatal (free), Hypertension, Eye, ENT (no fee), Surgical OPD, Orthopaedics, Dental, Skin (no clinician), Gynaecology (general and private), Mental Health (doctor's times; confidential per the signed list), Physiotherapy, Nutrition (no patient words), Neurology, Kidney, Heart (no desk), Urology, Sickle cell (children) |
| States           | 4 taking bookings, 10 ready, 4 need setup, 1 children desk-only                                                                                                                                                                                                                                                                                          |
| Clash            | Diabetes and Hypertension share Room 7 and Dr. Okello, Tue and Fri 10:00 to 12:00                                                                                                                                                                                                                                                                        |
| People (21)      | Grades across nurse, clinical officer or allied, medical officer, specialist, consultant; consultants with private-wing suites; Dr. Nakitto with no sessions and hidden on cards; Dr. Namata away 23 to 27 Nov                                                                                                                                           |
| Leave requests   | Dr. Ayebare 30 Nov to 4 Dec (cover exists); Dr. Kato 20 Nov morning (no cover)                                                                                                                                                                                                                                                                           |
| Devices          | Reception desks 1 and 2, triage tablet, screens in the main hall and outpatients corridor (offline)                                                                                                                                                                                                                                                      |
| Exceptions       | World Diabetes Day screening (extra), Christmas, Boxing Day, New Year's Day closed                                                                                                                                                                                                                                                                       |
| History          | Two published versions before the fixture date                                                                                                                                                                                                                                                                                                           |

_First run_ (only General OPD set up) and _Offline_ are scenarios of the same fixture.

## Appendix B: Interaction checklist (from the canvas)

| Area                | Interactions                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell               | Rail and drawer; launch card Next; badges; search; draft and scheduled pills; switch user with PIN; dark mode; keyboard sheet; Emergency.                                                                                                                                         |
| Get ready           | Template (level pick, fill); open ready clinics; pipeline stage filter; Do next actions; row Fix / Open / Pause; state tabs; hospital basics.                                                                                                                                     |
| Clinics             | Filters; group by; row open; editor tabs; colour palette and picker (shade, hue, formats, swatches, eyedropper, contrast); new room and block; tier; ages; booking toggles and segments; fee modes, overrides, team, add doctor, new person; desks; preview; duplicate; blockers. |
| Session editor      | Presets; kind; slot; break; repeats; visit length; places set or suggested; held %; rooms; clinicians; timeline; checks; move to free time; same session on; remove; impact.                                                                                                      |
| Week plan           | Clash alert fix and fix all; cell edit and add; change many at once (clinics, days, change, amount); print (block, print).                                                                                                                                                        |
| Closures            | Month navigation; day tap; add closure, away, extra (range, part of day, scope, cover, booking policy, impact, SMS); remove; holidays (close all, keep open, change, close every clinic).                                                                                         |
| People              | Leave approve and decline (Undo); add a person; filters; group by; row open; usual week; add leave; office block and room; grade; name and photo with consent; card preview.                                                                                                      |
| Desks and screens   | Health tiles; devices and coverage switch; filters; card open; coverage cell toggle; device clinics, lock, screen sample; add device with code.                                                                                                                                   |
| History and publish | Undo with later changes; publish now; schedule; publish early; cancel schedule; restore version.                                                                                                                                                                                  |
| Everywhere          | Toast Undo; offline banner.                                                                                                                                                                                                                                                       |

## Appendix C: Guards

| Guard                   | Rule                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| One record per fact     | No new table holds sessions, clinics, holidays, closures or staff outside their engines (schema scan against an allow-list).                    |
| Published only          | Patient booking, desk, screen and SMS code paths read the published version accessor only (import scan).                                        |
| Red reserved            | Emergency tokens only in the Emergency control and critical errors; the colour picker test covers the red band.                                 |
| Queue honesty           | Screen feed, SMS, ticket and preview templates fail on a name, a position, "ahead of you", "#N" near line or queue, a wait, or an hour promise. |
| Confidential clinics    | The SMS and screen render for every confidential clinic in the fixture contains no clinic name or type.                                         |
| Consent                 | No clinician name or photo in card, ticket or SMS output without a consent record (fixture scan).                                               |
| Fees are content        | No fee literal in components; bands and the SMS rate come from data or configuration.                                                           |
| No PII in logs and URLs | Request logs, analytics and URLs contain no patient name, phone or code with a name.                                                            |
| Raw colour              | No hex, rgb, hsl or font family in components (the picker's own value handling excepted by path).                                               |
| No edge accent bars     | No coloured left or top border as a status marker.                                                                                              |
| Emergency everywhere    | A visible, named Emergency control on every view at every width.                                                                                |
| Shortcuts off in inputs | Typing in any input never triggers a shortcut.                                                                                                  |
