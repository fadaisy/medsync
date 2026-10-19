# Lab Workspace v2: STOP 0, discovery and baseline

Branch `feat/lab-workspace-v2`, cut from `origin/main` 1dc94b56 (Lab Phases 0–5 merged, PRs #240 and #243). Worktree: `~/Desktop/medsync-labws2`. No product change has been made. The only additions are this folder, the prompt and the canvas export, all uncommitted.

Evidence lives next to this report:

- `inventory-bench-sendouts.md`, `inventory-quality-reports.md`, `inventory-setup-nav.md`: the raw parity list (Q2);
- `reads-appendix-b.md`: Q6;
- `tokens-fonts-tests.md`: Q4, Q5 and Q8;
- `baseline-measures.json`, `shots/`: Q3. All 84 runs (42 routes at 1440 and 1280) are in `~/Desktop/labws2-harness/shots/baseline/`.

## Q1: phases and flags

- Lab Phases 0–5 are merged on `main`.
- **The test hospital's real flag state is unknown to me.** The production flags are env vars I cannot read (owner rule: `.env*` untouchable).
- The harness ran with every lab flag on: `LAB_WORKSPACE LAB_BENCH LAB_UNITS_RANGES LAB_DELTA_CHECKS LAB_CRITICALS LAB_DOWNTIME LAB_CATALOGUE_V2 LAB_ONE_MENU LAB_STOCK LAB_EQUIPMENT LAB_QC LAB_QC_HOLD LAB_EQA LAB_POCT_QUALITY LAB_BEDSIDE LAB_HMIS LAB_REPORTS LAB_REFERRAL LAB_EXCHANGE LAB_HIGH_RISK PATIENT_RESULTS PATIENT_RESULTS_SMS IPC_LAB_FEED`, plus `EMR_V1` and `ENCOUNTER_ENGINE_LIVE`.
- **Ask:** which of these are on at the test hospital and at the pilot hospital?

## Q2: inventory (raw parity list)

- 46 page routes under `app/lab`: 41 static and 5 dynamic (`results/[orderId]`, `criticals/[alertId]`, `quality/nonconformities/[id]`, `referrals/[id]/result`, `refer/manifests/[id]/print`).
- **About 133 distinct server actions** are reachable:
  - 48 from the bench and send-out routes;
  - 51 from quality, stock, equipment and reports;
  - 34 from set-up;
  - with some overlap between the groups.
  - Every action is listed with its page and button in the three inventory files.
- **Prints:** downtime blank forms, manifest, register (records a print event), HMIS 105.
- **Downloads:** HMIS 105 CSV (a server action returns the string, then a Blob), and the Lab reports CSV (`data:` URI). There are no API route handlers.
- **Signing:** 3 partner signs; set-up signs for ranges, limits, response times, SMS, delta, patient release, scheme, flag basis, elevation, HIV and addendum; QC plan and policy; HMIS mapping.

## Q3: U1–U10, checked against the running build (screenshots in `shots/`)

| #   | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| U1  | **Confirmed, one correction.** There are 35 items in 5 groups: Laboratory 7, Quality 7, Reports 3, Exchange 4, **Set-up 14 (not 11)**. Each has a solid grape icon tile. The technician sees 21 items.                                                                                                                                                                                                                        | `home.png`, `tech-home.png`; `lib/lab/nav.ts` |
| U2  | **Confirmed.** Emergency floats at the bottom right over the content, for example over the drill form on Downtime. It comes from the **root** `app/layout.tsx` (`components/emergency/emergency-pill.tsx`), not the lab layout, so the lab's top-bar version must suppress the global one under `/lab`.                                                                                                                       | `downtime-full.png`                           |
| U3  | **Confirmed.** Downtime stacks four forms: enter a form, record a downtime, print blank forms, record a drill.                                                                                                                                                                                                                                                                                                                | `downtime-full.png`                           |
| U4  | **Confirmed and wider than stated.** About 30 native date inputs: 3 `date` + 7 `datetime-local` + 3 `month` on bench and send-out pages, 12 `date` + 4 `datetime-local` on quality, stock, equipment and reports pages, and 1 in set-up. Downtime, Reports, Register, Stock receive, Referrals and Partners all show "dd/mm/yyyy".                                                                                            | inventories                                   |
| U5  | **Confirmed and wider.** QC plan: pattern and placeholder `obs.potassium` (`quality/qc/page.tsx:151-152`). The same appears in EQA (`eqa-forms.tsx:255`), stock ("e.g. obs.creatinine"), and the concept-list fields in stock and equipment. Raw concept ids also appear as display fallbacks in the delta panel, referral result, catalogue, ranges (144 hits on the page), research drafts (79) and patient-release labels. | `setup_catalogue.png`, inventories            |
| U6  | **Confirmed.** About 30 disabled buttons have no reason, for example "Record the downtime", "Record the drill", Receive on a high-risk row, Log call, Release to the doctor, the QC run submit, and lot Accept/Reject.                                                                                                                                                                                                        | `downtime-full.png`                           |
| U7  | **Confirmed.** Quality today shows "0" and "Alert window not set" in mono. Lab reports shows "6" and "0 %" in teal mono, and "0 min · No stated time" in mono.                                                                                                                                                                                                                                                                | `quality-1280.png`, `reports.png`             |
| U8  | **Confirmed.** Dashed empty boxes on Quality (2), EQA (3), Bedside (2), To refer, Rejected, Criticals, Referrals, Partners, Matches, Stock, Equipment, HMIS, Delta and Patient release. The shared source is `app/lab/_components/record-list.tsx:30`.                                                                                                                                                                        | `quality-1280.png`                            |
| U9  | **Confirmed.** Reports has a Month select, native From/To dates, three selects and a separate "Show" button.                                                                                                                                                                                                                                                                                                                  | `reports.png`                                 |
| U10 | **Not confirmed for shell pages.** `main` uses 1192 px of 1440 and 1032 px of 1280; the narrow look comes from the 248 px sidebar and short content. **But 5 routes render outside the shell at 800 px wide and scroll sideways**: `/lab/older`, `/lab/downtime/print`, `/lab/quality/qc/run`, `/lab/hmis/records`, `/lab/reports/records`. These 5 are also the only axe serious failures (color-contrast).                  | `older.png`, measures                         |

Other measures (`baseline-measures.json`):

- **axe:** 0 serious or critical issues on shell pages; color-contrast fails on the 5 shell-less pages.
- **Horizontal scroll at 1280:** the same 5 pages, plus `/lab/setup/limits`.
- **TTFB (local production build, PGlite):** `/lab` 1149 ms cold and 63–177 ms warm; other pages 50–175 ms.
- **First-load JS:** 411 KB gzipped transferred on `/lab` (cold). This is the Step 0 shell baseline for the 120 KB "added" budget.

## Q4: tokens and the design system today

- **Where tokens live:** in `app/globals.css` `@theme inline` (lines 15–340), with values in `:root`/`.dark`, generated from the Chroma tokens.
- **What `DESIGN-medsync.md` says:**
  - Geist for product UI, Geist Mono for data, Bricolage for titles only;
  - teal `#0f766e` is the one action colour; the lab's place hue is grape;
  - radii 4/6/8/12/16/24, cards 12;
  - rows 38 px, buttons 32 px;
  - centred `EditorDialog` only.
- **Tide in the web app:** none. Tide exists only in `mobile/src/theme/tide.ts` and `design/mobile-tide-v1/`, and **ADR 0340 limits Tide to `mobile/`**, so D-UI-01 must supersede it for `/lab`.
- **Tide values with no web token:**
  - the whole navy ink ramp (ink, ink-2, ink-3, navy-950…600, on-band-2, accent-on);
  - `accent #2dd4bf` as a fill;
  - `caution-edge`;
  - Tide's pending pair;
  - radii 10/14/18/22/28;
  - `shadow-float` and `shadow-emergency`;
  - every Tide type size.
- **Tide values that clash with the design system:**
  - `shadow-accent` is a lagoon glow, and DESIGN forbids glows;
  - caution and critical text match only the `-fg-aa` tokens, which are still PROPOSED.

## Q5: fonts

- `app/layout.tsx` loads Bricolage, Geist and **Geist Mono** (latin, variable) through `next/font/google`.
- **Figtree is not loaded on the web.** `next/font/google` can load it with no new dependency.
- Figtree latin 400/500/600 static woff2 is about **34 KB**. The variable file's size is unmeasured (no network); I will measure it at Step 2.

## Q6: reads for Today and Needs you (details in `reads-appendix-b.md`)

These have an existing source:

- stages, late, oldest;
- first release, past stated time, rejected with reason (strict definitions in SQL 0118);
- criticals counts;
- QC status per plan, held reports;
- stock, equipment, matches, referral overdue (RF-5).

These have **no source today**. None needs a write; each can be a pure read model over existing tables:

1. **Per hour received and released.** Derivable from the 0118 rows.
2. **Same weekday, same clock time, and the 7-week sparklines.** Derivable by re-running the 0118 rows over the earlier windows. Cost: 7 extra windows per figure. I will measure it against the 1.5 s TTFB budget.
3. **Median turnaround.** SQL 0118 computes p50 and the total row, but `reportFromCounts` throws them away. A read model can expose them.
4. **Per-section QC status (worst component).** QC plans carry a device, not a section; `devices.section_id` exists. It needs a severity order of QC statuses, which is a display rule that **needs your sign-off**.
5. **A section's stated time** (the scorecard bullet mark). **No such figure exists.** Stated time is per test. Proposal: mark nothing, show the section's median beside the share of its results past their own test's time, and drop the "mark" from the canvas.
6. **Hospital-wide delta flags without an outcome** (Needs you).
7. **Lots awaiting acceptance** (Needs you).
8. **"Signatures waiting for this user" across set-up.** Only `loadConfigsWaitingForCso` exists (CSO, every hospital, signed configs only).

Definitional gaps the prompt must decide (they affect D-UI-06):

- 0118 "received" counts received **or rejected** specimens and ignores `receipt_undone`.
- Bedside results are a flag in 0118, not excluded.
- Criticals "median to acknowledge" covers only alerts with a due time.
- There is no per-hospital time zone: Africa/Kampala is a constant, and `referral.ts` hard-codes UTC+3.
- `loadLabCriticals` **writes** (lazy escalation), so Today must use `countOpenCriticals` or the 0118 rows, never it.

## Q7: timed baselines

**Not done. It needs a person.** The prompt asks for timings with a lab user at the test hospital. I cannot run a human trial, and the harness's fixture is too thin for a five-component FBC (one creatinine order, no QC plan, no downtime period).

What I can give now, from the code (old interface):

| Task                                            | Steps today                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Login → first specimen to result (technologist) | `/lab` lands on the Worklist; **1 click** ("Continue" on the row)                                                   |
| Receive, enter 5 components, release            | scan + Enter, Continue, 5 values, Release final (plus "Release and alert" for a critical): **3 clicks + 6 entries** |
| Record a QC run                                 | Quality control → Record a QC run (separate page `/lab/quality/qc/run`) → form → Save                               |
| Enter one downtime form                         | Downtime entry → form number select → MRN → Find → test select → 3 native datetimes → values → Save                 |
| Find a specimen by lab number                   | "Find a specimen" field on the Worklist → Find (server action `findSpecimenAction`)                                 |

**Ask:** can you, or a lab user, run the four timed tasks once on the test hospital (or I seed an FBC fixture in the harness and time it there as the proxy)? Step 11's "−20 %" needs a real baseline.

## Q8: tooling

- **Visual harness:** working. `~/Desktop/labws2-harness`: seeded PGlite, production build on :4006, CDP screenshots and axe. It reads the worktree and never writes it. Ports differ from `lab5-harness`.
- **Playwright: not configured.** There is no config, no dependency and no script.
  - **This is a STOP flag** under the prompt.
  - Adding Playwright is a new dependency (Law 12).
  - **Recommendation:** keep the CDP harness for screenshots, axe, timings and keyboard flows, and do not add Playwright.
- **Fake clock:** there is no shared helper. Engines take `now` (turnaround, indicators). Seven test files use `vi.useFakeTimers` inline. The new read models will take `now` as a parameter, which is enough.
- **Guard tests:**
  - `tests/design/red-reserved.test.ts` already scans `app/lab`, `lib/lab` and `content/lab*.ts` for red.
  - A **no-green** check already exists for `app/lab/{stock,equipment,quality,_lib,hmis,register,reports}`. Step 10 extends it to all of `app/lab`.

## Disagreements: the repo wins, the prompt or canvas is wrong or silent

1. **Set-up has 14 nav items, not 11.** The 35 total is right.
2. **Two Tide rules clash with `DESIGN-medsync.md`:**
   - ADR 0340 confines Tide to mobile;
   - DESIGN's single-teal-action, glow-free, Geist-only rules.
   - D-UI-01 and D-UI-02 need an ADR that supersedes 0340 for `/lab`.
3. **The Emergency button is global** (root layout), not the lab's. The top-bar version means hiding the global pill under `/lab` only.
4. **The canvas and the prompt differ:**
   - page title 32/36 on the canvas, 24/28 in the prompt;
   - rail 88 px on the canvas, ~72 in the prompt;
   - the Needs you pill is 44 px tall while buttons are 36.
   - The prompt wins.
5. **The canvas export has no README**, though the prompt says it does, and canvas.json lists `TodayV1.dc.html`, which is not in the export (marked "Earlier version", so harmless).
6. **"Needs you" amber when n > 0.** Amber is lab Law 8's "late/held/…" colour. A count is not a state, and DESIGN says no colour on counts. Proposal: a neutral pill with the amber dot only when a "Now" item exists. **Decision for you.**
7. **"Waiting for your signature" (5.8) and S32.** The second slot for most lab kinds is the **CSO**, who signs at `/admin/lab-signoffs`, outside the lab.
   - For a lab lead, the queue would be "drafts awaiting the lead slot that I did not author", plus the HMIS mapping for the focal person.
   - **Decision for you:** what exactly lands in the lead's queue, and whether the CSO's queue stays in `/admin`.
8. **Hospital admin and lab aggregates (S13, 5.9).** Hospital admin holds **no lab permission** and cannot open `/lab` at all (Handbook, access matrix). Either S13 is trivially true, or you want admin to see Today and Reports aggregates somewhere. The second would be a new permission, which is out of scope under Law 1.
9. **U10 is mostly not true** of shell pages (see Q3). The real defect is the 5 shell-less pages.
10. **Live paused is amber today.** The prompt wants grey. That is fine; noting it as a visible change.

## Found in passing (out of scope, not changed; for follow-up)

- **D-LAB1-12 is enforced unevenly:**
  - an author can sign their own ranges, limits and response times with a note alone (no `anotherSigner` check);
  - the SMS template's first approver can be its author;
  - `SignRule authoredByMe={false}` is hard-coded on Delta and Patient release, so the author never sees the note field;
  - a lead-signed draft still shows "Draft" and a Sign button.
- `/lab/downtime/print` does not check `lab.result.release`; `/lab/downtime` does.
- `/lab/exchange/matches` is gated on the referral flag, not the exchange flag.
- `loadReleasedToday` and the Released-today nav count include later finals, external and bedside results. They disagree with the 0118 "released" definition, so Today and the old Released tab would show different numbers.

## What I need from you to start Step 1

1. The flags on at the test and pilot hospitals (Q1).
2. Timed baselines (Q7): a person runs them, or the harness proxy.
3. Playwright: confirm the CDP harness instead of a new dependency (Q8).
4. Decisions 6, 7 and 8 above, and the gaps in Q6 4 and 5 (QC severity order; no section stated time).

Then Step 1 writes `gate-a-proposal.md` (route map, parity checklist, D-UI-02 token table, DESIGN lab section, Appendix A/B, wireframes, ADR drafts) and STOPs for your signature.
