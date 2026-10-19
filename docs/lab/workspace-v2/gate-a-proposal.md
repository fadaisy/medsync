# Lab Workspace v2: GATE A proposal (Step 1)

Read with `step-0/STOP-0-REPORT.md`. This proposal changes the lab's interface only. No engine, store, action contract, RLS policy, audit row or signed configuration changes (Law 1).

**Approval route.** On 19 Oct 2026 the owner said "go through all gates please" after reading STOP 0. I took that as approval of every recommendation below, including those for the open STOP 0 questions, and built through Step 11.

It is **not** a CSO signature. The items marked **CSO** still need Fadhul's signature in §11 before production:

- the copy in `content/lab-workspace-v2.ts`;
- the Today definitions;
- the DESIGN change;
- the parity checklist.

Until the copy is signed, the house rule keeps the `LAB_WORKSPACE_V2` flag off in production (CF-3 pattern).

## 1. Answers to the STOP 0 questions (recommendations adopted)

| Question                                 | Adopted                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test and pilot hospital flags            | Unknown to Claude. The harness runs with every lab flag on; the owner sets production env                                                                                                                                                                                                                                       |
| Timed baselines                          | Harness proxy: the same fixture and the same scripted steps, old and new. A human trial stays open for the pilot                                                                                                                                                                                                                |
| Playwright                               | Not added. The CDP harness (`~/Desktop/labws2-harness`) does screenshots, axe, timings and keyboard checks. No new dependency                                                                                                                                                                                                   |
| "Needs you" colour                       | As the prompt says: amber pill when n > 0, neutral at 0. The word "Needs you" always carries the count, so it is never colour alone                                                                                                                                                                                             |
| Lead's signature queue                   | Drafts of signed configuration (`lab_signed_configs`) at this hospital whose **lead slot** is empty and which this user did not author, and only when the user may sit in that slot. Second-slot (CSO, focal) items show under "Waiting for the CSO" as information, without a sign button. The CSO keeps `/admin/lab-signoffs` |
| Hospital admin aggregates                | No change: hospital admin holds no lab permission. S13 holds because `/lab` refuses them. No new permission (Law 1)                                                                                                                                                                                                             |
| QC status severity, for the section pill | failed > not run in window > warning > provisional target > passed > no plan. Display only: it picks which existing status to show. **CSO**                                                                                                                                                                                     |
| Section stated time                      | There is none. The scorecard bar shows the section's median with a scale. Instead of a stated-time mark, it states "{n} past their own test's time" in words. The canvas's mark is dropped                                                                                                                                      |

## 2. Decisions (§14 of the prompt)

| #       | Decision          | Adopted                                                                                                                                                                                |
| ------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-UI-01 | Lab design system | MedSync Tide at desk density for `/lab` only. Recorded as a lab section in `DESIGN-medsync.md`. Supersedes ADR 0340's "Tide is mobile only" for `/lab` (ADR 0344)                      |
| D-UI-02 | Tokens            | A `lab-tide` utility re-pins the semantic tokens inside the lab shell, plus new `--tide-*` tokens (§4). Figtree for text through `next/font`; Geist Mono for identifiers only          |
| D-UI-03 | Places            | Today, Bench, Send-outs, Quality, Reports, Set-up. Set-up needs `lab.manage`                                                                                                           |
| D-UI-04 | Landing           | `lab.manage` → Today; everyone else → Bench                                                                                                                                            |
| D-UI-05 | Needs you         | One inbox over existing sources. An item leaves only when its source changes                                                                                                           |
| D-UI-06 | Today definitions | Appendix B as corrected in §6. **CSO**                                                                                                                                                 |
| D-UI-07 | Change lines      | An arrow and the amount in ink, in words. No coloured badges                                                                                                                           |
| D-UI-08 | Card boards       | Send-outs board only; no drag                                                                                                                                                          |
| D-UI-09 | Replacement       | Flag `LAB_WORKSPACE_V2` (per hospital, `1` or ids) during Steps 3–10. Step 11 removes the old interface in the last commit of the branch, so a pilot can run from the commit before it |
| D-UI-10 | Field kit         | Mandatory under `app/lab/**`, enforced by `tests/lab/workspace-v2/sweep.test.ts`                                                                                                       |
| D-UI-11 | Dark              | Tokens for both themes are written. The lab ships light (`lab-tide` pins light)                                                                                                        |

## 3. Route map and redirects (Appendix C completed)

New routes:

- **Today:** `/lab/today`.
- **Bench:**
  - `/lab/bench?stage=to_receive|to_result|preliminary|released|rejected&section=`;
  - `/lab/bench/[orderId]`: the repo's result id is the **order** id, not a specimen id;
  - `/lab/bench/downtime?tab=enter|record|print|drills` and `/lab/bench/downtime/print`;
  - `/lab/bench/older`.
- **Needs you:** `/lab/needs-you?filter=`, `/lab/needs-you/criticals/[alertId]`.
- **Send-outs:** `/lab/send-outs?tab=board|manifests|match|partners|connections` (with `r=` for a referral and `i=` for a match), `/lab/send-outs/[id]/result`, `/lab/send-outs/manifests/[id]/print`.
- **Quality:**
  - `/lab/quality?tab=today|plans|runs|stock|equipment|eqa|bedside|nc`;
  - `/lab/quality/plans/new`, `/lab/quality/qc/run`, `/lab/quality/nc/[id]`;
  - `/lab/quality/stock/order`, `/lab/quality/stock/receive`.
- **Reports:** `/lab/reports?tab=indicators|register|hmis|downloads`, `/lab/reports/records`, `/lab/reports/hmis/print`, `/lab/reports/hmis/records`.
- **Set-up:** `/lab/setup` (the hub), the existing `/lab/setup/*`, plus `/lab/setup/analysers` and `/lab/setup/hmis-mapping`.

| Old route (nav item)                          | New home                                                        | Kept parameters                            |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `/lab` (Worklist)                             | lead → `/lab/today`, others → `/lab/bench` (role redirect, 307) | `section`, `stage`, `dept`, `sort` → bench |
| `/lab/results/[orderId]`                      | `/lab/bench/[orderId]`                                          | all                                        |
| `/lab/released` (Released today)              | `/lab/bench?stage=released`                                     | —                                          |
| `/lab/rejected` (Rejected)                    | `/lab/bench?stage=rejected`                                     | —                                          |
| `/lab/older`                                  | `/lab/bench/older`                                              | —                                          |
| `/lab/criticals` (Criticals)                  | `/lab/needs-you?filter=results`                                 | —                                          |
| `/lab/criticals/[alertId]`                    | `/lab/needs-you/criticals/[alertId]`                            | all                                        |
| `/lab/downtime` (Downtime entry)              | `/lab/bench/downtime`                                           | —                                          |
| `/lab/downtime/print`                         | `/lab/bench/downtime/print`                                     | all                                        |
| `/lab/refer` (To refer)                       | `/lab/send-outs?tab=board`                                      | —                                          |
| `/lab/refer/manifests/[id]/print`             | `/lab/send-outs/manifests/[id]/print`                           | all                                        |
| `/lab/referrals` (Referrals)                  | `/lab/send-outs?tab=board`                                      | `month`, `partner`, `view`, `r`            |
| `/lab/referrals/[id]/result`                  | `/lab/send-outs/[id]/result`                                    | all                                        |
| `/lab/exchange` (Connections)                 | `/lab/send-outs?tab=connections`                                | `view`                                     |
| `/lab/exchange/partners` (Partners)           | `/lab/send-outs?tab=partners`                                   | `p`                                        |
| `/lab/exchange/matches` (Waiting for a match) | `/lab/send-outs?tab=match`                                      | `i`                                        |
| `/lab/exchange/analysers` (Analysers)         | `/lab/setup/analysers`                                          | —                                          |
| `/lab/quality` (Quality today)                | `/lab/quality?tab=today` (same path)                            | —                                          |
| `/lab/quality/qc` (Quality control)           | `/lab/quality?tab=plans`                                        | all                                        |
| `/lab/quality/qc/run`                         | same path, in the new shell                                     | all                                        |
| `/lab/quality/eqa`                            | `/lab/quality?tab=eqa`                                          | all                                        |
| `/lab/quality/bedside`                        | `/lab/quality?tab=bedside`                                      | all                                        |
| `/lab/quality/nonconformities`                | `/lab/quality?tab=nc`                                           | all                                        |
| `/lab/quality/nonconformities/[id]`           | `/lab/quality/nc/[id]`                                          | all                                        |
| `/lab/stock` (Stock and lots)                 | `/lab/quality?tab=stock`                                        | all                                        |
| `/lab/stock/order`, `/lab/stock/receive`      | `/lab/quality/stock/order`, `/lab/quality/stock/receive`        | all                                        |
| `/lab/equipment` (Equipment)                  | `/lab/quality?tab=equipment`                                    | all                                        |
| `/lab/register` (Daily register)              | `/lab/reports?tab=register`                                     | `day`, `section`                           |
| `/lab/hmis` (HMIS 105)                        | `/lab/reports?tab=hmis`                                         | `month`                                    |
| `/lab/hmis/print`, `/lab/hmis/records`        | `/lab/reports/hmis/print`, `/lab/reports/hmis/records`          | all                                        |
| `/lab/hmis/mapping`                           | `/lab/setup/hmis-mapping`                                       | all                                        |
| `/lab/reports` (Lab reports)                  | `/lab/reports?tab=indicators` (same path)                       | all                                        |
| `/lab/reports/records`                        | same path                                                       | all                                        |
| `/lab/setup/*` (14 items)                     | same paths, reached from the Set-up hub                         | all                                        |

During Steps 3–10, a moved page answers `permanentRedirect` (308) when the flag is on for the viewer's hospital, and renders as before when it is off. At Step 11 the old route files go, and the map moves to `next.config.ts` `redirects()` (`permanent: true`, so 308, and the query string is kept by default). `tests/lab/workspace-v2/redirects.test.ts` walks this table.

## 4. Design-system change (D-UI-01, D-UI-02)

`app/globals.css` gets `@utility lab-tide`. It re-pins these semantic tokens on the lab shell's root element only, so no other workspace changes:

| Token                             | Chroma today      | Lab (Tide desk)                                |
| --------------------------------- | ----------------- | ---------------------------------------------- |
| `--background`                    | ink-50            | `#f6f7f9` Tide bg                              |
| `--foreground`                    | ink-900           | `#1b2540` navy ink                             |
| `--card` / `--popover`            | white             | white                                          |
| `--muted`                         | ink-100           | `#e4e7ee` sunken                               |
| `--muted-foreground`              | ink-600           | `#4a5574` ink-2                                |
| `--border` / `--input`            | ink-200 / ink-300 | `#dde1e9` / `#c5cbd8`                          |
| `--primary` (links, text-primary) | `#0f766e`         | `#0f766e` (= Tide `accent-text`, unchanged)    |
| `--ring`                          | teal-600          | `#0d9488` focus                                |
| `--radius`                        | 8                 | 12 (rows 12, fields 10–12, cards 18, tiles 16) |
| `--font-sans`                     | Geist             | Figtree, then Geist                            |

New tokens, generated as utilities (`bg-tide-lagoon`, `text-tide-on-lagoon`, …):

- `--tide-lagoon #2dd4bf` and `--tide-lagoon-pressed #14b8a6`: the one primary fill per region;
- `--tide-on-lagoon #1b2540`;
- `--tide-ink-3 #5f6987`;
- `--tide-navy-950…600`: the band and hero;
- `--tide-on-band #ffffff`, `--tide-on-band-2 #e8ecf3`;
- `--tide-cascade-2 #2f4a6d`, `--tide-cascade-3 #296a89`, `--tide-cascade-next #a7f3e4`: chart marks;
- `--tide-caution-edge #f59e0b`;
- `--tide-area-lab`: = grape solid;
- `--tide-shadow-card`, `--tide-shadow-float`, `--tide-shadow-emergency`.

`shadow-accent` (a glow) is **not** adopted: DESIGN forbids glows. Red and amber keep the existing status tokens.

Proposed `DESIGN-medsync.md` section "Laboratory workspace (Tide at desk density)", added at Step 2: the table above plus the Section 4 size table of the prompt, the seven rules, and lab laws 7–9 (three empties, red reserved, nothing green, one lagoon fill per region). **CSO.**

## 5. Components (Section 7) and what they replace

They live in `app/lab/_components/v2/` and move to `app/lab/_components/` at Step 11.

| New                                                                                                          | Replaces                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `LabShell`, `Rail`, `TopBar`, `SpaceHeader`                                                                  | `lab-shell.tsx`, `lab-nav.tsx` (sidebar, phone nav, crumb), the global Emergency pill under `/lab`                 |
| `PillTabs`, `FilterChips`, `PeriodPicker`                                                                    | `TabList`/segment tabs, the Reports filter row, the referral month form                                            |
| `Panel`, `HeroCard`, `KeyFigure`, `KeyFigureGrid`                                                            | Quality and Reports tiles, Exchange tiles, referral tiles                                                          |
| `Sparkline`, `HourlyFlowChart`, `Histogram`, `BulletBar`, `MiniLJ`, `MonthsOfStockBar`, `StageBar`           | `lab-report-view` bars (kept for the records pages until Step 11)                                                  |
| `Queue`, `QueueRow`, `PatientBand`, `BeforeRelease`                                                          | `worklist-screen.tsx` table; the result page header; the release reason text                                       |
| `ResultGrid`                                                                                                 | wraps the existing `ResultEntry` inputs (parsing and validation unchanged)                                         |
| `InboxList`, `InboxRow`                                                                                      | Criticals list, Quality "Needs you" card                                                                           |
| `SearchPalette`                                                                                              | `FindSpecimen`                                                                                                     |
| `DateTimeField`, `DateField`, `Combobox`, `NumberStepper`, `Button` (`disabledReason`), `EmptyState`, `Pill` | native date inputs, raw selects with more than 4 choices, reasonless disabled buttons, `RecordList`'s dashed empty |
| `ColumnsBoard`, `BoardCard`                                                                                  | the referrals table (the table stays as the board's "table" view for filters)                                      |

## 6. Today definitions (Appendix B, checked against Q6)

The adopted definitions keep Appendix B, with these corrections, which state what the existing engines can say:

- **Received so far:** distinct specimens with a `received` event today up to `now`, minus those whose last event is `receipt_undone`.
- **Released:** the 0118 "released" rows. First final version, in-house, today by local day, using the downtime form's time where there is one. Bedside results are excluded by their `bedside` flag.
- **Turnaround median:** p50 (nearest rank, as the indicators engine does) over Released with a receipt time.
- **Past their stated time:** Released rows whose own test has a stated time and whose turnaround exceeds it. The share's denominator is the released rows **with** a stated time. Rows with none count as "No stated time".
- **Criticals:**
  - alerts sent today;
  - "acknowledged" = alerts with an acknowledgement;
  - median minutes to acknowledge over acknowledged alerts (not only those with a due time).
- **Rejected:** specimens with a `rejected` event today ÷ Received so far, with the top reason code.
- **Per hour:** the same Received and Released rows bucketed by local hour, 07:00 (or the first event, if earlier) to `now`.
- **Comparison:** the same figures over the same weekday 7 days earlier, from local midnight to the same clock time. The sparkline repeats this for 7 weeks. Empty weeks show "No earlier data".
- **Sections:** offering section as the worklist uses it, else "No section". Totals equal the hero exactly (tested).
- **Time zone:** `LAB_TIME_ZONE` (Africa/Kampala). There is no per-hospital zone in the repo.
- **Cache:** none at first. React `cache()` per request, then measured against the TTFB budget. A 60 s server cache is added only if the budget fails.

The read model is `lib/lab/today.ts` (pure) and `lib/lab/today-read.ts` (one clinical-reader transaction). Tests use a fixture day counted by hand (`tests/lab/workspace-v2/today.test.ts`). **CSO.**

## 7. Needs you sources

| Kind                       | Group              | Source                                                                                | Leaves when                                       |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Open critical              | Now                | `countOpenCriticals` list form (read only, never `loadLabCriticals`, which escalates) | acknowledged or closed                            |
| Delta decision             | Waiting on the lab | `delta_flags` without `delta_outcomes` (new read model, read only)                    | an outcome is recorded                            |
| Results held by QC         | Waiting on the lab | `heldReports`                                                                         | QC passes or the result is released past the hold |
| Waiting for a match        | Waiting on the lab | `loadMatches`                                                                         | resolved                                          |
| Overdue referral (RF-5)    | Today              | `loadReferrals` + `overdue`                                                           | the state changes                                 |
| Lot waiting for acceptance | Today              | `loadStock` lots in `received`/`in_acceptance`                                        | accepted or rejected                              |
| Signature due (lead)       | Today              | §1 queue                                                                              | signed                                            |

## 8. Strings (Appendix A)

All new and changed strings go into `content/lab-workspace-v2.ts` with `LABWS2_COPY_STATUS = { status: "draft" }`:

- Appendix A word for word;
- the place, tab and button labels;
- the field-kit words;
- the empty states.

**CSO.**

## 9. Wireframes

The canvas boards are the wireframes, with these annotations:

- §1 (no section stated-time mark);
- §3 (the order id in the bench URL);
- prompt 5.14 (no boards except Send-outs).

Real screens replace them at each STOP's screenshots.

## 10. Test plan and ADRs

**Tests**, all under `tests/lab/workspace-v2/`:

- `today.test.ts`: hand count, totals, no earlier data, no stated time, pace;
- `needs-you.test.ts`;
- `search.test.ts`;
- `redirects.test.ts`;
- `parity.test.ts`: every action in `parity.ts` is referenced from a new-route file;
- `sweep.test.ts`: no native date inputs, no `obs.` placeholders, no reasonless disabled `Button`, no dashed empties;
- `red-reserved.test.ts` and no-green extended to `app/lab/**`;
- harness plans for every screen at 1440, 1280 and 1024, with axe and horizontal-scroll checks.

**ADRs:**

- 0343: six places and the shell;
- 0344: Tide at desk density for the lab;
- 0345: Needs you;
- 0346: Today's figures;
- 0347: search and scan;
- 0348: the field kit;
- 0349: removal and the redirect map.

## 11. Signature block

| Item                            | Approved                                                   | Signed (CSO)                                           |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| D-UI-01…11, §1 answers          | Owner in chat, 19 Oct 2026 ("go through all gates please") | ☐ Fadhul                                               |
| `DESIGN-medsync.md` lab section | as above                                                   | ☐ Fadhul                                               |
| Today definitions (§6)          | as above                                                   | ☐ Fadhul                                               |
| `content/lab-workspace-v2.ts`   | —                                                          | ☐ Fadhul (until then the flag stays off in production) |
| Parity checklist (Step 11)      | —                                                          | ☐ Fadhul                                               |
