# PROMPT: Lab Workspace v2 — replace the lab's interface completely (six places, one inbox, compact analytical dashboard, rebuilt forms) in MedSync Tide

> **For Claude Code.** Work at the repo root on a new branch, `feat/lab-workspace-v2`, cut from `main` with lab Phases 0–5 merged.
>
> - First copy into `docs/lab/workspace-v2/`:
>   - this prompt;
>   - the canvas export `lab-workspace-v2-canvas/` (unzip `lab-workspace-v2-canvas.zip`). It holds one HTML file per screen, `ws.css` with every style the screens use, the MedSync Tide tokens, and a README mapping files to screens.
> - **This slice changes the interface only.** It adds no clinical rule, no signed configuration, no table that holds clinical facts, and no new write path. Every engine, store, action, permission, flag, RLS policy, audit row and signed-config read stays exactly as it is. The new screens call the same actions with the same arguments.
> - **"Replaces completely" means:** at the end, the old sidebar, the old lab shell and every old lab page component are deleted. Every old lab URL permanently redirects to its new home. There is one lab interface, not two.
>
> **Mode: gated.** There are twelve steps, numbered 0–11, and each ends in a **STOP**.
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** He signs:
> - the design-system decision for the lab (D-UI-01, D-UI-02) and the change to `DESIGN-medsync.md`;
> - every new or changed string a clinician or lab user reads (they go into `content/` as `draft`; **never edit a `*_COPY_STATUS` yourself**);
> - the metric definitions on Today (Appendix B), because staff will act on them;
> - the parity checklist before the old interface is deleted (Step 11).

---

## 0. What we are building, in one paragraph

Lab staff find the current interface bulky. The sidebar holds 35 items in five groups, each with a coloured icon tile, so nothing stands out and the screen the technologist needs is a long scroll away. Pages stack unrelated forms (Downtime has four on one page). Inputs are browser defaults ("dd/mm/yyyy, --:--"). An internal concept id is typed as "obs.potassium". Disabled buttons look ghostly and say nothing. Dashboard tiles show "0" and "Alert window not set" in code type. Empty states are large dashed boxes.

Lab Workspace v2 replaces all of it:

- **Six places** in a slim floating rail: **Today** (the lab at a glance, the lab lead's home), **Bench** (the technologist's home), **Send-outs**, **Quality**, **Reports** and **Set-up** (lead only). Inside each place, work is split into pill tabs.
- **One top bar** on every screen:
  - **Scan or search (Ctrl K)**: scan a tube, or find a patient, lab number, action or page;
  - **Live**;
  - **Needs you**: one inbox for what is waiting on a person;
  - **Emergency**, always visible.
- **A compact, analytical Today dashboard:**
  - a navy hero showing what is in the lab now, by stage;
  - six key figures, each with a seven-day sparkline and its change from the same weekday;
  - received against released per hour, with a "now" line;
  - a turnaround distribution;
  - a section scorecard;
  - the top of the inbox.
- **A three-pane Bench:** the queue; result entry with the patient on a navy band; and a **Before release** checklist (units, QC, delta, critical) with the last results as a small trend.
- **Rebuilt forms and states:** a field kit (date and time, pick by name, numbers with locked units, steppers, disabled buttons that say why, three kinds of empty) used on every lab screen.
- **MedSync Tide, compacted for a desk:** the soft grey ground, navy ink, white cards, pill controls and one lagoon action per region, at staff density.

**Done when:**
- every lab action that existed before is reachable from the new interface, proven by the parity checklist (Step 11);
- every old lab URL redirects;
- the old shell and pages are deleted;
- the timed trials meet the budgets (Section 4);
- axe is clean;
- red appears only for criticals and the Emergency button, and nothing in the lab is green.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt and the canvas. Report every disagreement at STOP 0.
2. **The UI reference.** The design canvas *Lab Workspace v2* (https://claude.ai/artifact/Dnp6e5PsWzHtfw9MKDHJey), exported to `docs/lab/workspace-v2/lab-workspace-v2-canvas/`.
   - Twelve boards: Today, Bench, Needs you, Scan or search, Send-outs, Quality, Set-up, Downtime, QC plan, Reports, Field kit, Navigation map.
   - Read the HTML for structure, copy and hierarchy. Read `ws.css` for tokens, sizes and component styles.
   - **Do not paste the canvas markup into the app.** Rebuild it as components on the branch's stack, tokens and conventions.
   - Every patient, value, count, limit and turnaround on it is an example.
   - Where this prompt and the canvas differ, this prompt wins (5.14 lists the known differences).
3. **The lab's own documentation:**
   - *MedSync Laboratory Handbook* (https://claude.ai/artifact/G4yYJkDuoiigmBtpas1Vqj): every screen, role and rule as users meet them;
   - *Lab Engineering Guide* (https://claude.ai/artifact/HfDaJhrGYyZ1tSmMUdBSgo): layers, code map, the result write path, flags (`lib/lab/feature.ts`), navigation (`lib/lab/nav.ts`, `app/lab/layout.tsx`, `app/lab/_components/lab-nav.tsx`), house rules, the visual harness.

   If either is reachable only as a link, ask Fadhul for a copy and read it before Step 1.
4. **`DESIGN-medsync.md`.** Today it wins every design disagreement. This slice proposes a lab-scoped change to it (D-UI-01). Until that change is signed, nothing ships.
5. **The MedSync Tide design system:** its README and `tokens.json`, the copy in the canvas export, and the shipped mobile theme (`mobile/src/theme/tide.ts`, if present). Tide is written for the patient phone. This slice adapts it for a staff desk; Section 4 lists exactly what changes.
6. **The lab Phase 0–5 prompts and ADRs**, for every rule the screens must keep: two identifiers, restricted classes, red reserved, "No data" is not 0, release gates, the patient visibility gate.
7. **Code to read:**
   - `app/lab/**`, `app/lab/_components/**`, `app/lab/layout.tsx`;
   - `lib/lab/nav.ts`, `lib/lab/feature.ts`, `lib/lab/access.ts`, every `*-read.ts` that feeds a lab page;
   - `lib/lab/worklist.ts`, `turnaround.ts`, the indicators engine, the QC status engine, the referral and exchange reads;
   - `content/lab*.ts`, `app/globals.css` (`@theme`);
   - `tests/design/red-reserved.test.ts`, the Playwright and harness set-up.

---

## 2. Laws (non-negotiable)

1. **Interface only.**
   - No change to any engine's rules, any store, any action's contract or any RLS policy.
   - New reads are allowed only as **read models**: pure projections over existing engines and tables, in `lib/lab/*-read.ts` or `lib/lab/today.ts`, with tests.
   - A screen that seems to need a new write stops and is reported at the next STOP.
2. **Nothing lost.** Every action, filter, view, print, download, sign and count the old interface offered is reachable in the new one. The parity checklist (Step 1, proven at Step 11) is the test.
3. **Every old URL keeps working.** Old routes redirect (308) to their new homes, keeping query strings that still mean something (section, stage, period, id). Bookmarks, printed QR codes on forms and links in SMS or email must not break.
4. **Rules shown, not re-decided.**
   - The Before release checklist, the delta panel, holds, Needs you and every count read the existing engines' outputs.
   - The interface never computes a clinical decision of its own: no "late" computed in the browser, no critical inferred from a value.
5. **Two identifiers everywhere** a patient appears: queue rows, cards, the navy band, Needs you, search results, the scorecard drill-downs.
6. **Restricted classes stay restricted.**
   - Users without access see "Restricted test", never the test name, in queues, search, Needs you and send-outs.
   - Aggregate counts may include restricted tests. Their drill-downs honour Phase 1 Law 12.
   - Location never hints at the class: show "OPD", never "ART clinic".
7. **"No data", "0" and "Not set" are three different things** and look different (Field kit).
   - "Not set" names who can set it and links to it for that person.
   - A number is never shown in code type unless it is an identifier.
8. **Red is a safety property.**
   - Red appears only for a critical value or alert and for the Emergency button.
   - Amber (`caution`) is for late, held, delta waiting, overdue, quarantined and down.
   - **Nothing in the lab is green**, including "passed": passed is a neutral pill with a check.
   - Extend `tests/design/red-reserved.test.ts` to every new lab component and add a no-green test.
9. **One lagoon action per region.** Lagoon (`accent`) fills only the primary action of a card or panel, the active nav dot and the current "now" mark. Lagoon carries navy text (`accent-on`). It is never used as text: links use `accent-text`.
10. **Strings live in `content/`.**
    - New and changed strings go in as `draft` with the screen they belong to. Appendix A lists them.
    - Never edit a `*_COPY_STATUS`.
    - No string is typed into a component.
11. **Behind a flag until parity, then the old interface goes.**
    - One per-hospital flag, `labWorkspaceV2`, off by default, gates the new interface during Steps 3–10.
    - At Step 11, after the parity sign-off and the pilot, the flag is removed, the old interface is deleted and the redirects become unconditional.
    - There is no permanent toggle back.
12. **Stack as found.** Next.js App Router, server components where they fit, the house action contract, `useAct()` → `router.refresh()`, tokens from `app/globals.css` `@theme` (no raw hex in components), TypeScript strict, no `any`.
    - **No new dependencies without stopping to flag them.** Charts are hand-built SVG; the combobox and date-time field are built from the branch's primitives.
13. **en-GB.** Dates `19 OCT 2026` in tables and `Mon 19 Oct` in fields and headers, times 24-hour. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it.
14. **No Expo work.** Gate CG stays open.

---

## 3. What the current interface does wrong (verify every line at Step 0, with a screenshot)

| # | Claim | Where | Fix in v2 |
|---|---|---|---|
| U1 | The sidebar holds 35 items in 5 groups, each with a solid coloured icon tile; Set-up alone has 11 | `lib/lab/nav.ts`, `lab-nav.tsx` | Six places in a rail; tabs inside places (5.1, Appendix C) |
| U2 | The Emergency button floats over content at the bottom right | lab layout | In the top bar on every screen |
| U3 | Downtime entry stacks four unrelated forms on one page | `/lab/downtime` | Four tabs; one task at a time (5.10) |
| U4 | Native date and datetime inputs show "dd/mm/yyyy, --:--" | Downtime, Reports, drills | Date-time field with quick picks (5.12) |
| U5 | The QC plan form asks for "Analyte (concept id)" with the placeholder `obs.potassium`; the analyser select can be empty | `/lab/quality/qc` | Pick the test by name and unit; only analysers in service (5.11) |
| U6 | Disabled buttons are pale outlines with no reason | Downtime, QC | Disabled primary with a reason line (5.12) |
| U7 | Tiles render values and "Alert window not set" in monospace; "0 %" in teal mono | Quality today, Lab reports | Text face for numbers; three empty kinds (5.12) |
| U8 | Empty states are large dashed boxes that say little | Quality, To refer | Empty state with why and what next (5.12) |
| U9 | Reports filters are a row of five native controls and a floating "Show" button | `/lab/reports` | One period picker and filter chips (5.9) |
| U10 | Page content sits in a narrow centred column with wide empty margins | most lab pages | Fluid workspace; panels use the width |

---

## 4. Design direction

**The look: MedSync Tide at desk density.** Tide's tokens, shapes and colour jobs, unchanged; its phone sizes reduced for a staff desk. The canvas's `ws.css` is the reference implementation.

| Tide (phone) | Lab Workspace v2 (desk) | Why |
|---|---|---|
| Body 17px | Body 13–14px; table cells 13px | Lab users read dense lists all day |
| Display 36/40 | Page title 24/28, weight 500 | One headline per screen, smaller |
| Touch minimum 48px; buttons 52px | Buttons 36px, small 30px; table rows ≥ 44px; rail items ≥ 54px | Mouse and keyboard desk; still ≥ 44px wherever a row is the target |
| Cards radius 22 | Cards 18, tiles 16, rows 12, fields 10–12 | Tighter panels |
| Bottom nav pill, five places | Left floating rail, six places, icon plus word, lagoon dot under the current place | Desk layout; Tide's "icon never travels alone" kept |
| Help button | Emergency button, top right | Staff wording; same red, same shadow |
| Area dots | One area dot for the lab (`area-medicines`, "Medicines, refills and the lab") on the overline | Place by dot, as Tide says |
| Green "in your range" | Not used in the lab | Lab law: nothing green |

Kept from Tide exactly: the ground, navy ink, the lagoon accent with navy text, `accent-text` for links, the cascade tones (used for chart marks), the status colours, the shadows, Figtree for text and Geist Mono for identifiers, the "no gradients, no left accent bars, no orange" rules.

**Seven rules**
1. **One home per role.** The technologist lands on Bench; the laboratory lead on Today; nobody hunts in a menu.
2. **What needs a person comes to them.** Needs you gathers it; nothing urgent hides in a sub-page.
3. **Scan first.** A scanned label opens its specimen from anywhere.
4. **Numbers with their meaning.** Every figure has its unit, its comparison and what it is measured against (stated time, last week), in words.
5. **One task per view.** Tabs separate tasks; a form never shares a page with an unrelated form.
6. **Every state is honest.** Disabled says why; empty says why and what next; "No data" is never 0.
7. **Dense, not crowded.** Compact sizes, generous grouping, one lagoon action per region.

**Budgets** (baseline measured at Step 0; met by Step 11)

| Measure | Budget |
|---|---|
| Today page, one hospital, current day | p95 < 1.5 s TTFB; under 120 KB of added JS gzipped across the lab shell |
| Scan → specimen open (search palette) | p95 < 300 ms after the scanner's Enter |
| Receive, enter a five-component result and release (timed trial, same specimen) | median ≤ the Step 0 baseline minus 20 % |
| Clicks from login to the first specimen to result (technologist) | ≤ 1 |
| Clicks from any lab screen to Needs you | 1 |
| Old lab URLs without a redirect | 0 |
| Old actions not reachable (parity) | 0 |
| axe serious or critical on lab routes, at 1440 and 1280 | 0 |
| Horizontal scroll at 1280 px | 0 |

---

## 5. Interface specification

### 5.1 The shell (every lab screen)
- **Rail** (left, floating, ~72px): the MedSync mark; then **Today**, **Bench**, **Send-outs**, **Quality**, **Reports**, **Set-up**. Each is an icon with its word and an optional count: Bench (to result), Send-outs (needing action), Set-up (signatures waiting for this user). The current place shows ink at 600 with a lagoon dot. The signed-in user's initials sit at the foot; they open the account menu (switch account, sign out).
  - Places appear only when the user holds a permission for something inside them: Set-up for the laboratory lead only, Today for lab users. Visibility reuses `visibleFor(perms, flags)`.
- **Top bar:**
  - overline "Laboratory · {hospital}" with the lab area dot;
  - the page title;
  - **Scan or search** (Ctrl K and the scanner);
  - **Live** (Phase 0 live channel state; "Live updates paused" in grey when down, never amber);
  - **Needs you {n}**, amber pill, when n > 0, neutral otherwise;
  - **Emergency**, the red pill.
- **Space header:** pill tabs for the place's views, with counts, then filter chips, then the view's one primary action.
- **Responsive:** fluid from 1280 to 1920. Between 1024 and 1279 the right pane of three-pane views folds under the middle. Below 1024 the rail becomes a top row of six icon-and-word tabs. No horizontal scroll at 1280.
- **Keyboard:** Ctrl K (Cmd K on macOS) opens search; `g` then `t`, `b`, `s`, `q`, `r`, `u` jump to places when focus is not in a field; Esc closes overlays. No global handler fires while typing in a field.

### 5.2 Today (canvas `Main.dc.html`)
- For lab users; the laboratory lead's landing page.
- **Header row:** period pills (Today · 7 days · 28 days), section chips, and the as-of line ("Mon 19 Oct · 12:13 · compared with Mon 12 Oct at the same time").
- **Hero (navy):**
  - "In the lab now", the count;
  - a three-part stage bar (to receive, to result, preliminary) with a labelled legend;
  - "{n} more out at partners";
  - footer: oldest waiting, late now (amber text), and a pace line ("Bench is keeping pace since {time}" when released ≥ received for the last two hours, otherwise "Queue growing since {time}");
  - **Open the bench**.
- **Key figures panel:** six cells — received so far, released, median turnaround, past their stated time, criticals, rejected. Each has:
  - its value;
  - a seven-point sparkline (same weekday, last seven weeks, at the same clock time);
  - a change line: an arrow and the amount in ink ("↑ 12 more than last Monday (7 %)", "↓ 4 min faster than last Monday").

  Never a coloured badge, never green or red. Each cell opens its records.
- **Received and released per hour:** bars for received and a line for released, from opening to now, the current hour drawn as partial, a dashed "now" line, the peak labelled. Text alternative states the peak and whether the queue is growing.
- **How long results took today:** a histogram of receipt-to-release minutes for today's released results (buckets in Appendix B), with the median marked. The footnote counts results past their own test's stated time.
- **Sections today:** a scorecard row per section — in the lab, released, late now, turnaround as a bullet bar (median against the section's stated time, scale shown), rejected, QC status pill — and a totals row.
- **Needs you:** the four most urgent items and **See all**.
- Every figure follows Appendix B's definitions and comes from a read model over the existing engines (6.1).

### 5.3 Needs you (canvas `NeedsYou.dc.html`)
- Reached from the top bar on every screen.
- **Filter pills:** All · Results · Quality · Send-outs (and Set-up for the lead).
- **Groups:**
  - **Now**: open criticals not acknowledged, with escalation level;
  - **Waiting on the lab**: delta decisions, results held by QC, results waiting for a match;
  - **Today**: overdue referrals, lots waiting for acceptance, signatures due.
- **Each row:** icon tile (red only for criticals), what it is, two identifiers or the object, how long it has waited (server time), and one action that opens the exact place to act ("Log a call", "Decide", "Open the run", "Resolve", "Follow up", "Start", "Review and sign").
- **Side:** this week's three process measures (criticals acknowledged in time, delta alerts decided, matches resolved same day), and the plain list of what can land here.
- An item leaves by itself when its source state changes. Nothing is dismissed by hand without its action.
- Sources, all existing reads: critical alerts, delta flags without outcome, QC holds, match items, referrals overdue (RF-5), lots awaiting acceptance, signed-config drafts awaiting this user's slot.

### 5.4 Scan or search (canvas `Command.dc.html`)
- A centred overlay (the house's centred dialog, not a side sheet).
- **Input:** accepts a scanner (Code 128 lab numbers, manifest numbers) and typing.
- **Groups:** Specimens (lab number, two identifiers, test, stage pill) · Patients (two identifiers; opens the lab view of that patient) · Do (receive this specimen, record a QC run, send a specimen out, and the other entry actions the user may take) · Go to (every tab in every place).
- **A full scanned lab number opens its specimen at once.** Ctrl Enter runs the first action (for example Receive).
- Searches only what the user may see. Restricted tests show as "Restricted test". Results cap at 8 per group.

### 5.5 Bench (canvas `Bench.dc.html`)
- The technologist's landing page.
- **Stage pills:** To receive · To result · Preliminary · Released today · Rejected, with counts.
- **Section chips** with counts; the user's assigned section preselected (Phase 0 rule).
- **Downtime entry** button.
- **Queue (left):** urgent and late first (the existing worklist order). Each row: name and hospital number, waiting time (amber "Late {n} min" when the engine says late), test and ward, and one pill (delta check, QC hold, Immediate, Restricted). The selected row is lagoon-tinted.
- **Work pane (middle):**
  - **navy band**: name, hospital number, age and sex, lab number, ward and bed, received time;
  - the clinical question, with "Show working diagnosis (logged)" (Phase 2 rule);
  - **result grid**: component, value field, locked unit, range, flag, last time (an amber "{value} · delta" pill when a delta rule fired), with the delta row tinted amber;
  - **footer**: the reason Release is disabled, Reject specimen, Save preliminary, **Release** (or Check and release for criticals, per Phase 1).
- **Before release (right):** one row per gate from the existing gates, in order — units and entry checks, QC passed today, delta checks, critical check. Each row shows its state and its line. The delta decision control sits here (the Phase 5 outcome list and the required note), with **Ask the ward**.
- **Last results (right):** a small trend of the main component's last values in 30 days, with dates.
- The **receive** view (To receive) keeps the scan field at the top of the queue. **Released today** and **Rejected** are tables in the work pane.

### 5.6 Send-outs (canvas `SendOuts.dc.html`)
- **Tabs:** Board · Manifests · Waiting for a match · Partners · Connections.
- **Board:** five columns — To refer · On a manifest · Out · Overdue (amber column) · Back, to enter or file — reading the referral states.
  - Columns are views of state. **No drag-and-drop**; each card opens the referral, where the existing actions live.
  - The high-risk outbreak route keeps its amber tag and its separate path.
- **Key figures:** sent this month, back on the order, overdue, sent-to-back median by partner, rejected by partner.
- **New manifest** is the primary action.
- Manifests, Waiting for a match, Partners and Connections keep their existing content, re-laid in the new components.

### 5.7 Quality (canvas `Quality.dc.html`, `QcPlan.dc.html`)
- **Tabs:** Today · QC plans · QC runs · Stock and lots · Equipment · External quality · Bedside · Nonconformities, with amber counts where something needs action.
- **Today:**
  - four key figures (QC still to run, results held, lots expiring — "Window not set" with a link for the lead, equipment down);
  - **QC today by test and analyser**: test, analyser, last run, a **mini Levey-Jennings line of the last 10 runs** in SD units with ±2 SD dashes and amber points beyond 2 SD, a status pill, levels;
  - **stock below minimum** as months-of-stock bars with the minimum marked;
  - **nonconformities needing you**.
- **QC plans → New QC plan** (5.11).
- **Record a QC run** is the primary action on every Quality tab.

### 5.8 Set-up (canvas `Setup.dc.html`)
- Laboratory lead only.
- **Find a setting** search.
- **Waiting for your signature**: item, what changed, drafted by, second signer, Review and sign (the author never signs their own: D-LAB1-12).
- **Six groups** of setting links, each with its status in words ("38 signed · 6 drafts", "Draft v4", "Expiry window not set"):
  - Tests: test menu, test catalogue, analyser profiles;
  - Result safety: ranges and cut-offs, critical limits, response times and contacts, delta checks;
  - Patients: what patients see, plain words, results-ready message;
  - Quality plans: QC plans and policy, kit, stain and bedside device rules, lot acceptance and stock levels, equipment schedules and EQA;
  - Partners and machines: partner laboratories, analyser bridge and code maps, connections;
  - This laboratory: lab settings, registers and HMIS mapping, research drafts.
- Demo lab day appears only at demo hospitals.

### 5.9 Reports (canvas `Reports.dc.html`)
- **Tabs:** Indicators · Daily register · HMIS 105 (with its due date) · Downloads.
- **One period picker** (a chip showing the period, opening presets — today, last 7 days, this month, last month, last 3 months, pick dates — and a month calendar), then filter chips (ward, section, priority, each opening a short searchable list), then Download CSV. Changing a filter applies at once; there is no Show button.
- **Indicators:** the eight existing indicators as key-figure cells with a six-month sparkline and a context line; a weekly median turnaround line with the stated-time reference; rejected specimens by reason. "No data" never 0. Every number drills down for lab roles; hospital admin sees aggregates only.

### 5.10 Downtime (canvas `Downtime.dc.html`)
- **Tabs:** Enter paper forms · Record a downtime · Print blank forms · Drills.
- **Enter paper forms:** the last downtime's forms as a list (to enter, entered, void) beside a three-step entry:
  1. find the patient by the hospital number or name and date of birth on the form, with the matched patient and order shown for confirmation;
  2. the form's own collected, received and released times in the date-time field;
  3. results.
- **Record a downtime:** started (quick picks), ended ("Still down" until ended), cause as chips. **Start the downtime** is the primary action.
- **Print blank forms:** a stepper for how many, with the number range shown before printing.
- **Drills:** held on, who took part, what was done, problems found.
- Every existing downtime rule (reserved numbers, form times kept, limits in force at collection, read-back criticals) is unchanged.

### 5.11 New QC plan (canvas `QcPlan.dc.html`)
- **Analyser:** only analysers in service, by name and section.
- **Test:** a combobox searched by name. Each option shows the unit, the section and whether that analyser runs it. **Concept ids are never shown or typed.**
- **Control levels:** chips 1, 2 or 3, with the help line.
- **Control material and lot:** from the stock ledger's accepted QC material lots.
- **Target source:** maker's range (provisional), or this lab's runs.
- **When to run:** chips.
- **Per-level maker's mean and SD** in number fields, with the unit and "From: the insert in the control box".
- **Save draft** stays disabled with its reason until complete.
- **Side:** the QC policy state as an empty state with its consequence ("Runs are logged, results are not held yet"), and the plans on this analyser.

### 5.12 Field kit (canvas `Fields.dc.html`) — used on every lab screen
- **Date and time:** one field showing the day in words ("Today, Mon 19 Oct", "Fri 16 Oct") and a typed 24-hour time.
  - Typing accepts 0810, 8.10 or 8:10 and shows the parsed value.
  - Quick picks: Now, 15 min ago, 1 h ago, Yesterday, Pick.
  - Pick opens a month calendar.
  - Errors are in words ("Ends before it started (08:10)").
  - The server's time is the reference (house rule).
  - **No native `input type="date|datetime-local"` remains in the lab.**
- **Pick from a list:** a combobox by name with a secondary line (unit, section, availability). For four or fewer choices, chips instead of a dropdown.
- **Numbers:** result fields with the locked unit (Phase 1); counts with − and + steppers and the effect stated (the form numbers that will print).
- **Buttons:** primary (lagoon, one per card), secondary (outlined), text. **A disabled button always has a reason line beside it.**
- **Numbers in tiles:** the text face. **0** is a real zero. **No data** is muted ("Nothing released yet"). **Not set** names who can set it and links for that person.
- **Empty states:** a short title, why it is empty, what happens next, and the action if the viewer may take it. No dashed boxes.

### 5.13 Navigation map (canvas `NavMap.dc.html`)
- Appendix C is the authoritative route map: every old nav item → its new place, tab or button.
- It is also delivered as a short user note ("Where everything went") shown once to each lab user after switch-on, dismissible, recorded.

### 5.14 Known differences from the canvas
- The canvas mentions a "List | Board" switch and card boards for the Bench and nonconformities only in earlier versions. **There are no card boards except Send-outs**, and Send-outs has no drag.
- Values, sparklines, counts and charts on the canvas are examples. The real ones follow Appendix B.
- The canvas's Today shows "Bench is keeping pace since 10:00". Build the rule in 5.2 and its two strings.
- The canvas draws the Downtime "Started" field defaulting to now. Keep that default for starting a downtime; for paper forms the times always come from the form, with no default.
- `ws.css` uses raw hex in a token block for the canvas. In the app, tokens live in `app/globals.css` `@theme` under the names D-UI-02 approves.

---

## 6. Read models (pure; tested; no new writes)

### 6.1 Today (`lib/lab/today.ts`, `lib/lab/today-read.ts`)
- **TD-1** `todaySnapshot({ hospital, now, section? })` returns every figure in Appendix B from existing engines and tables: worklist stages, turnaround (`turnaround.ts`), indicators, critical alerts, QC status, referrals, specimen events. It is pure over a fetched snapshot; `now` is injected (no `Date.now()`).
- **TD-2** **Comparison:** the same weekday seven days earlier, cut at the same clock time in the hospital's zone. The sparkline uses the same cut for the last seven weeks. Where the earlier data do not exist, the change line says "No earlier data", never 0.
- **TD-3** **Late and stated time** come from the turnaround engine and the hub's stated figures (Phase 0/2). Tests without a stated time are counted as "No stated time" and never as late.
- **TD-4** **Pace:** released ≥ received in each of the last two complete hours → "keeping pace since {first such hour}"; otherwise "Queue growing since {first hour received > released}".
- **TD-5** **Histogram buckets** (minutes): < 15, 15–30, 30–45, 45–60, 60–90, 90–120, 120–180, > 180. Downtime results use form times (Phase 1). Referred and bedside results are excluded and footnoted.
- **TD-6** **Section scorecard:** per section of the hospital; totals equal the hero and key figures exactly (a test asserts it).
- **TD-7** **Restricted classes** are counted in aggregates and never named. Drill-downs apply Phase 1 Law 12.
- **TD-8** **Cache:** at most 60 s, server-side, keyed by hospital and section; the as-of time shown is the snapshot's time.

### 6.2 Needs you (`lib/lab/needs-you-read.ts`)
- **NY-1** One list from the sources in 5.3, each item with: kind, group, the object's identifiers, waited-since (server time), and the deep link to act.
- **NY-2** Ordered by group (Now, Waiting on the lab, Today), then by waited-since, oldest first.
- **NY-3** Scoped to what the viewer may act on: a technologist does not see signatures; a lead sees everything in the lab.
- **NY-4** The count in the top bar is the same list's length, from the same read, refreshed by the live channel's existing events.

### 6.3 Search (`lib/lab/search-read.ts`)
- **SR-1** Exact lab number and manifest number first; then hospital number; then name prefix (at least 3 characters); then actions and pages from a static registry.
- **SR-2** RLS-scoped reads only; restricted names masked; no PHI in the query string or logs (search terms are not logged).
- **SR-3** Each query returns in under 300 ms at p95 on the test hospital's data, with an index plan reported at Step 4.

### 6.4 Quality mini charts (`lib/lab/qc-spark-read.ts`)
- **QS-1** The last 10 accepted or rejected runs per QC item in SD units from the plan's target in force at each run.
- **QS-2** A target change starts a new series; the chart shows a gap, not a joined line.

---

## 7. Components (in `app/lab/_components/v2/` until Step 11, then `app/lab/_components/`)

| Component | Notes |
|---|---|
| `LabShell`, `Rail`, `TopBar`, `SpaceHeader` | The shell (5.1). `Rail` reuses `visibleFor` and the counts maps |
| `PillTabs`, `FilterChips`, `PeriodPicker` | Tabs as links (server-rendered, URL-driven); chips with counts |
| `Card`, `Panel`, `HeroCard`, `KeyFigure`, `KeyFigureGrid` | `KeyFigure`: value, unit, sparkline, change line, link |
| `Sparkline`, `HourlyFlowChart`, `Histogram`, `BulletBar`, `MiniLJ`, `MonthsOfStockBar`, `StageBar` | SVG, tokens only, text alternatives, a "view as table" toggle on the larger charts |
| `Queue`, `QueueRow` | Keyboard navigable (↑↓, Enter) |
| `PatientBand` | Navy band, two identifiers |
| `ResultGrid` | Wraps the existing result-entry inputs; no change to parsing or validation |
| `BeforeRelease` | Renders the existing gates' outputs |
| `InboxList`, `InboxRow` | Needs you |
| `SearchPalette` | Centred dialog; scanner-aware |
| `DateTimeField`, `Combobox`, `NumberStepper`, `Button` (with `disabledReason`), `EmptyState` (`empty`, `no_data`, `not_set`), `Pill` | The field kit (5.12). The old `Field` components in the lab are replaced |
| `ColumnsBoard`, `BoardCard` | Send-outs only; no drag |

Rules for every component:
- tokens only;
- states (hover, focus, disabled, loading) designed;
- a story or harness page under the visual harness;
- an axe test;
- no colour-only state;
- no side sheets: dialogs are centred (house rule).

---

## 8. Routes and redirects

New routes under `/lab`:
- `/lab/today`;
- `/lab/bench?stage=&section=` and `/lab/bench/[specimenId]`;
- `/lab/needs-you`;
- `/lab/send-outs` with `?tab=board|manifests|match|partners|connections`;
- `/lab/quality` with `?tab=today|plans|runs|stock|equipment|eqa|bedside|nc`;
- `/lab/reports` with `?tab=indicators|register|hmis|downloads`;
- `/lab/setup` and the existing set-up sub-routes;
- `/lab/bench/downtime` with `?tab=`.

- `/lab` lands on Today for the laboratory lead and on Bench for everyone else.
- **Every old route** (Appendix C) gets a 308 redirect that maps its query parameters. Deep links to an object (a specimen, a referral, a nonconformity, a QC run, an HMIS month) keep their ids.
- A redirect test walks every old route in Appendix C and asserts the target and the kept parameters.

---

## 9. Steps and gates

### Step 0 — Discovery and baseline (no product changes)
- **Q1** Confirm Phases 0–5 are merged; list the lab flags on for the test hospital.
- **Q2** **Inventory** every lab route, page, nav item, tab, dialog, form, button that calls an action, print, download and sign, with its file and the action or read it calls. This is the raw parity list.
- **Q3** Confirm or correct U1–U10 with screenshots at 1440 and 1280.
- **Q4** Where tokens live (`app/globals.css` `@theme`), what `DESIGN-medsync.md` says today about type, colour and shape, and whether Tide tokens already exist in the web app or only in mobile.
- **Q5** Fonts: is Figtree available through `next/font`; is Geist Mono already loaded? Report bytes.
- **Q6** The existing indicators, turnaround and QC status reads that Today and Quality will use, and whether any figure in Appendix B has no existing source (report it; do not invent one).
- **Q7** Timed baselines with a lab user at the test hospital:
  - receive, enter and release a five-component FBC;
  - record a QC run;
  - enter one downtime form;
  - find a specimen by lab number.
- **Q8** Playwright, axe, the visual harness and the fake clock are working. If not, STOP and flag.

**STOP 0.** Report Q1–Q8, the inventory, the screenshots and the baselines.

### Step 1 — GATE A proposal (documents only)
Write `docs/lab/workspace-v2/gate-a-proposal.md`:
- the route map and redirects (Appendix C completed from Q2);
- **the parity checklist**: every item from Q2, with its new home and the test that proves it;
- the design-system change: the Tide-at-desk token table (D-UI-02) and the proposed lab section for `DESIGN-medsync.md`;
- the component list (Section 7) with which old components each replaces;
- the Today metric definitions (Appendix B) checked against Q6;
- every new or changed string (Appendix A) as `draft`;
- annotated wireframes of each screen starting from the canvas;
- the rollout plan (D-UI-09);
- the test plan and ADR drafts (Section 15);
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions and on the `DESIGN-medsync.md` change.

### Step 2 — Tokens and the field kit
- Add the approved tokens to `app/globals.css` `@theme`, scoped so they apply only under the lab shell (D-UI-02), and load Figtree.
- Build the field kit (5.12) and its harness page.
- Replace nothing yet.

**STOP 2.** Report the token diff, the field kit screenshots at 1440 and 1280, axe, and bytes added.

### Step 3 — Shell, rail, top bar, search, redirects (behind `labWorkspaceV2`)
- Build `LabShell`, `Rail`, `TopBar`, `SpaceHeader` and `SearchPalette` (with its read model).
- Add the new routes (initially rendering the old pages' content inside the new shell where the new screen is not built yet).
- Add the redirects, active only when the flag is on.

Scenarios:
- **S1** A technologist lands on Bench; a lead lands on Today.
- **S2** Set-up is absent for a technologist; present for the lead.
- **S3** Ctrl K opens search from every lab route; a scanned lab number opens its specimen within the budget.
- **S4** A restricted test shows as "Restricted test" in search for a user without access.
- **S5** Every old route in Appendix C redirects with its parameters (flag on).
- **S6** Emergency is visible in the top bar on every lab route, at every width.

**STOP 3.** Report scenario results and screenshots.

### Step 4 — Today and Needs you
Build 5.2 and 5.3 with the read models 6.1 and 6.2.

Scenarios:
- **S7** On a fixture day, every Today figure equals a hand count over the same records (fixture reviewed by a person).
- **S8** Section totals equal the hero and the key figures.
- **S9** A day with no earlier data shows "No earlier data", never 0.
- **S10** A test without a stated time is never counted late.
- **S11** The pace line switches between its two strings on the fixture.
- **S12** Needs you shows each source kind; acting on an item removes it without a manual dismiss; the top bar count matches.
- **S13** Hospital admin cannot open Today's drill-downs to patient rows.

**STOP 4.** Report scenario results, the fixture review, TTFB and screenshots against the canvas.

### Step 5 — Bench
Build 5.5, wrapping the existing worklist, receive, result entry, release, reject, amend and delta outcome actions.

Scenarios:
- **S14** Receive by scan from the To receive view; undo within the existing window.
- **S15** Enter and release an FBC; the Before release checklist shows every gate's real state.
- **S16** A delta flag keeps Release disabled with its reason until an outcome and note are recorded (Phase 5 DL-6).
- **S17** A QC-held component shows the hold and the override path for the lead only.
- **S18** A critical goes through Check and release and raises the alert exactly as before.
- **S19** The working diagnosis reveal is logged.
- **S20** The timed trial meets the budget.

**STOP 5.** Report scenario results and the timed trial.

### Step 6 — Send-outs
Build 5.6 over the existing referral, manifest, match, partner and connection screens.

- **S21** Each referral state lands in the right column.
- **S22** Overdue uses RF-5.
- **S23** The outbreak route keeps its path.
- **S24** Waiting for a match keeps values hidden.

**STOP 6.**

### Step 7 — Quality, including the QC plan form
Build 5.7 and 5.11 over the existing QC, stock, equipment, EQA, bedside and nonconformity screens; build `MiniLJ` (6.4).

- **S25** The mini chart breaks at a target change.
- **S26** The QC plan form never shows a concept id; a test the analyser does not run is marked; Save draft states what is missing.
- **S27** "Window not set" links to the setting for the lead and is plain text for others.
- **S28** Every Quality action is reachable (parity subset).

**STOP 7.**

### Step 8 — Reports
Build 5.9 with `PeriodPicker`.

- **S29** Presets and the calendar set the same URL parameters the old filters used; CSV downloads match the old output byte for byte for the same period.
- **S30** "No data" never 0.
- **S31** Daily register and HMIS 105 print exactly as before.

**STOP 8.**

### Step 9 — Set-up hub
Build 5.8 over the existing set-up screens.

- **S32** The signature queue lists only items whose second slot the viewer may sign, never their own drafts.
- **S33** Every set-up screen is reachable from the hub and from search.

**STOP 9.**

### Step 10 — Downtime and the form sweep
- Build 5.10.
- Then **sweep every remaining lab form** onto the field kit: no native date inputs, no concept ids, no reasonless disabled buttons, no mono numbers in tiles, no dashed empty boxes.

- **S34** A downtime form is entered in three steps with the form's own times.
- **S35** A grep test fails the build on `type="date"`, `type="datetime-local"`, a visible `obs.` concept id, or a disabled button without a reason under `app/lab/**`.

**STOP 10.** Report the sweep list and the grep test.

### Step 11 — Parity, pilot, remove the old interface, harden
1. **Parity:** run the parity checklist end to end at the test hospital. Fadhul signs it.
2. **Pilot:** turn `labWorkspaceV2` on for the pilot hospital for at least five working days. Collect timings and issues; fix.
3. **Remove:**
   - delete the old sidebar, shell and page components, and the old nav items;
   - make the redirects unconditional;
   - remove the flag;
   - update `lib/lab/nav.ts`, the counts maps and the icon map to the six places.
4. **Harden:**
   - axe on every lab route at 1440 and 1280;
   - the red-reserved and no-green tests;
   - the budgets;
   - the visual harness plans for every new screen;
   - update the Laboratory Handbook's "The lab's menu" and screen sections, and the Engineering Guide's navigation recipe;
   - ADRs;
   - the final report.

**STOP 11.** Report Section 12 and the Definition of Done.

---

## 10. Accessibility
- WCAG 2.2 AA at 1440, 1280 and 1024.
- **Contrast:** text 4.5:1 including 11px labels and text on navy (`on-band`, `on-band-2`); never grey text on a coloured fill below 4.5:1.
- **Rail and tabs** are links with `aria-current`. Counts are announced with their meaning ("Bench, 21 to result").
- **Charts:** each has a text alternative stating its main finding; the larger ones have a "view as table" toggle; marks differ by shape or lightness as well as hue.
- **Search** is a dialog with focus trapped and returned; results are a listbox with arrow keys.
- **The navy band and the Before release checklist** read in order. A gate that blocks release is announced once (`role="status"`).
- **Live updates** are polite and never steal focus.
- **Reduced motion:** fades only.

## 11. Security, privacy, audit
- No change to any permission, RLS policy or audit.
- New reads use the clinical reader under existing scope helpers.
- **Search:** no search term logged; no PHI in URLs beyond ids already used; restricted names masked.
- **Today and Reports:** aggregates for hospital admin, drill-down only for lab roles.
- **Needs you** shows only what the viewer may act on.
- The working-diagnosis reveal and every other recorded view stay recorded.

## 12. Numbers to report at the final STOP

| Metric | Baseline | Target | Result |
|---|---|---|---|
| Nav items in the lab | 35 | 6 places | |
| Clicks, login to first specimen to result (technologist) | Step 0 | ≤ 1 | |
| Receive, enter and release FBC, median | Step 0 | −20 % | |
| Find a specimen by lab number | Step 0 | < 300 ms after Enter | |
| Today TTFB p95 | — | < 1.5 s | |
| Old lab actions not reachable | — | 0 | |
| Old URLs without a redirect | — | 0 | |
| Native date inputs under `app/lab` | Step 0 | 0 | |
| Visible concept ids | Step 0 | 0 | |
| Disabled buttons without a reason | Step 0 | 0 | |
| Today figures differing from the hand count | — | 0 | |
| axe serious or critical | Step 0 | 0 | |
| Red outside criticals and Emergency; any green | — | 0 | |
| Added JS on the lab shell (gzipped) | Step 0 | report; < 120 KB | |

## 13. Rollout
- Flag on at the test hospital (Steps 3–10).
- Pilot hospital for five working days (Step 11.2).
- Then all hospitals, and the old interface is deleted in the same release.
- The one-time "Where everything went" note shows to each lab user on first visit.

## 14. GATE A decisions (Fadhul owns; recommendations given)

| # | Decision | Recommendation |
|---|---|---|
| D-UI-01 | Design system for the lab | MedSync Tide at desk density for the lab workspace. Record it in `DESIGN-medsync.md` as a lab section; other staff workspaces stay on their current system until decided separately |
| D-UI-02 | Tokens | Add Tide's colour, radius and shadow tokens to `@theme` under a lab scope; desk sizes as in Section 4; Figtree for text, Geist Mono for identifiers only |
| D-UI-03 | Places | Today, Bench, Send-outs, Quality, Reports, Set-up; Set-up for the laboratory lead only |
| D-UI-04 | Landing | Lead → Today; everyone else → Bench |
| D-UI-05 | Needs you | One inbox with the sources in 5.3; items leave only when their source changes |
| D-UI-06 | Today definitions | Appendix B, comparison with the same weekday at the same clock time |
| D-UI-07 | Change lines | Arrow and amount in ink with words; no coloured badges; no green or red for "better" or "worse" |
| D-UI-08 | Card boards | Send-outs only, no drag; no card boards elsewhere |
| D-UI-09 | Replacement | Flagged build, five-day pilot, then deletion of the old interface with permanent redirects; no toggle back |
| D-UI-10 | Field kit | Mandatory for every lab form; enforced by the grep test |
| D-UI-11 | Dark theme | Tokens for both themes added now; the lab ships light in this slice; dark only after its own contrast pass |

## 15. ADRs (next free numbers)
- Lab Workspace v2: six places, the shell and the rail.
- MedSync Tide at desk density for the lab; the `DESIGN-medsync.md` lab section.
- Needs you as a read model over existing sources.
- Today's figures and their definitions.
- Search and scan from anywhere.
- The field kit and its enforcement.
- Removal of the old lab interface and the redirect map.

## 16. Out of scope
- Any change to clinical rules, engines, stores, actions, flags other than `labWorkspaceV2`, RLS or audit.
- Other workspaces (doctor, nurse, cashier, IPC, hospital admin, patient). The doctor's results views keep their current look.
- Card boards outside Send-outs; drag-and-drop anywhere.
- New indicators beyond Appendix B; customisable dashboards.
- The mobile (Expo) app (Gate CG).
- Dark theme release (D-UI-11).

## 17. Definition of Done
- [ ] U1–U10 confirmed and fixed. The inventory and parity checklist exist and are signed.
- [ ] The six places, top bar, search and Needs you work at 1440, 1280 and 1024.
- [ ] Today's figures match Appendix B and the fixture hand count.
- [ ] Bench, Send-outs, Quality, Reports, Set-up and Downtime are rebuilt; every old action is reachable.
- [ ] No native date input, visible concept id or reasonless disabled button remains (grep test).
- [ ] Every old URL redirects; the old shell, nav and pages are deleted; the flag is gone.
- [ ] axe clean; red reserved; no green; budgets met.
- [ ] Strings in `content/` as `draft` for the CSO; no `*_COPY_STATUS` edited.
- [ ] The Handbook and Engineering Guide are updated; ADRs and the final report exist. The diff on `feat/lab-workspace-v2` is reviewable.

---

## Appendix A — New and changed strings (all `draft`; the CSO signs)

| Key | Text |
|---|---|
| Overline | Laboratory · {hospital} |
| Places | Today · Bench · Send-outs · Quality · Reports · Set-up |
| Search placeholder | Scan a tube, or search a patient, lab number or page |
| Live paused | Live updates paused. Refreshing every 15 seconds. |
| Needs you | Needs you |
| Needs you, what lands here | Open criticals, delta decisions, QC holds, results waiting for a match, overdue referrals, lots waiting for acceptance and signatures due. A finished item leaves the list by itself. |
| In the lab now | In the lab now |
| Out at partners | {n} more out at partners |
| Oldest waiting | Oldest waiting {duration} |
| Late now | {n} late now |
| Pace, keeping | Bench is keeping pace since {time} |
| Pace, growing | Queue growing since {time} |
| As of | {day} · {time} · compared with {day} at the same time |
| Change, more | {n} more than {weekday} |
| Change, fewer | {n} fewer than {weekday} |
| Change, faster | {n} min faster than {weekday} |
| Change, slower | {n} min slower than {weekday} |
| No earlier data | No earlier data |
| Histogram footnote | {n} results. Each test is judged against its own stated time; {m} were past it. |
| No stated time | No stated time |
| Release reason, delta | Release waits for the delta decision. |
| Release reason, QC | Release waits for QC on {analyser}. |
| Delta check line | {component} {before} → {after} {unit} in {interval}. {signed meaning}. Check this tube and the last one. |
| Window not set | Window not set |
| Ask the lead | Ask the lab lead to set it |
| QC policy not signed | Runs are logged, results are not held yet. Holds start only when the policy is signed. |
| Disabled, missing | {what is missing} |
| Empty, nothing to refer | Nothing to refer today. Tests the hub marks as referred, or whose analyser is down, appear here when their specimen is received. |
| No data | No data |
| Where everything went | The lab's menu is now six places. Your work is under Bench; anything waiting on you is in Needs you; press Ctrl K to find anything. |

## Appendix B — Today figure definitions (hospital local day; `now` injected)

| Figure | Definition | Source |
|---|---|---|
| In the lab now | Specimens collected and labelled for this hospital, not yet released, rejected or referred, split: to receive (collected, not received), to result (received, no saved values), preliminary (saved, not released) | worklist engine, specimen events |
| Out at partners | Referrals handed over and not terminal | referral engine |
| Oldest waiting | Longest current wait among in-lab specimens, measured as the worklist does | worklist, turnaround |
| Late now | In-lab specimens past their test's stated turnaround | turnaround engine |
| Received so far | Specimens with a receipt event today up to `now` | specimen events |
| Released | Diagnostic reports first released today up to `now` (not amendments) | report versions |
| Turnaround, median | Median receipt-to-first-release minutes of today's released in-house results; downtime results use form times; referred and bedside excluded | turnaround engine |
| Past their stated time | Today's released in-house results whose turnaround exceeded their test's stated time; share of released with a stated time | turnaround engine |
| Criticals | Critical alerts created today; acknowledged count and median minutes to acknowledgement | critical alerts |
| Rejected | Specimens rejected today ÷ received today, with the top reason | specimen events, rejection codes |
| Per hour | Received and first-released counts per local hour from opening to `now` | as above |
| Histogram | Buckets of Today's "turnaround" population (TD-5) | as above |
| Section scorecard | The same figures per section; QC status pill from the QC status engine (worst component in the section) | as above, QC status |
| Comparison | Same weekday seven days earlier, cut at the same clock time; sparkline over seven such days | as above |

## Appendix C — Route and navigation map (complete from Q2 at Step 1)

| Old nav item | New home |
|---|---|
| Worklist | Bench (stage pills) |
| Released today | Bench · Released today |
| To refer | Send-outs · Board, To refer column |
| Referrals | Send-outs · Board |
| Rejected | Bench · Rejected |
| Criticals | Needs you (open), and Bench result timeline (history) |
| Downtime entry | Bench · Downtime entry button → Downtime tabs |
| Quality today | Quality · Today |
| Quality control | Quality · QC plans, QC runs |
| Stock and lots | Quality · Stock and lots |
| Equipment | Quality · Equipment |
| External quality | Quality · External quality |
| Bedside quality | Quality · Bedside |
| Nonconformities | Quality · Nonconformities |
| Daily register | Reports · Daily register |
| HMIS 105 | Reports · HMIS 105 |
| Lab reports | Reports · Indicators |
| Connections | Send-outs · Connections |
| Waiting for a match | Send-outs · Waiting for a match (and Needs you) |
| Analysers | Set-up · Partners and machines |
| Partners | Send-outs · Partners (and Set-up) |
| Test menu, Test catalogue, Analyser profiles | Set-up · Tests |
| Ranges and cut-offs, Critical limits, Response and contacts, Delta checks | Set-up · Result safety |
| Patient release | Set-up · Patients |
| Lab settings, Research drafts | Set-up · This laboratory |
| Demo lab day | Set-up · This laboratory (demo hospitals only) |
