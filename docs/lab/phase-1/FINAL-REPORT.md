# Lab Phase 1 — final report

**Branch:** `feat/lab-safety-floor` (worktree `medsync-lab1`), one local commit per step, not pushed.
**Migrations:** 0101 applied (11 Oct); 0102–0106 GATED and **not applied**: the owner applies them.
**Flags:** `LAB_CRITICALS`, `LAB_UNITS_RANGES`, `LAB_DOWNTIME` (per hospital; each needs `LAB_WORKSPACE`), all off by
default. Automatic flagging has no flag: it starts when a hospital's limits and response times are both signed.
**Unsigned:** the Appendix A wording, the hazard log, and every limit, range and response time (none ship; each hospital
enters and signs its own).

The step-by-step evidence is in [STOP-REPORTS.md](STOP-REPORTS.md). Decisions: [GATE A](gate-a-proposal.md) and ADRs
0239–0250. Guide: [user-guide.md](user-guide.md). Hazards: [hazard-log.md](hazard-log.md).

## Section 13 — the numbers

"Where" says how each was established. `lane` = PGlite with every migration to 0106 applied; `unit` = pure engines;
`harness` = `next dev` against PGlite on one machine, which shows behaviour and order of magnitude, not production
timings.

| Metric                                                              | Baseline | Target         | Result                                                                                                                                                                            |
| ------------------------------------------------------------------- | -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical marks without an alert                                     | all      | 0              | **0** (CA-14 on the record, lane; property test over random event sequences, unit)                                                                                                |
| Open alerts past the last level without an event                    | —        | 0              | **0** (CA-14 on the record: nothing overdue below the last level; ES-4)                                                                                                           |
| Alerts closed by anything but an acknowledgement                    | —        | 0              | **0** (CA-2: a DB CHECK allows only open and acknowledged; acknowledged needs an acknowledger and a channel)                                                                      |
| Screens that say or imply "the doctor knows" before acknowledgement | —        | 0              | **0** (`phase-1/words`: seen has no wording at all; sent reads "Sent · waiting"; CA-5)                                                                                            |
| Taps for a doctor to acknowledge                                    | —        | 1              | **1** (harness, S2 and S18)                                                                                                                                                       |
| Release → alert visible, p95                                        | —        | ≤ 5 s / ≤ 15 s | **Not measured.** The harness has no Supabase Realtime. Polling is every 15 s by construction, so ≤ 15 s holds on polling; realtime needs a measurement on a deployed preview     |
| Due time → escalation written                                       | —        | ≤ 60 s         | **At once on any read** (lazy path, lane S14); **≤ 60 s** by the every-minute schedule once the owner runs `private.schedule_lab_escalations` (not yet: 0106 is unapplied)        |
| Results released without a catalogue unit (flag on)                 | all      | 0              | **0** (S20: refused; production refuses the flag while a test in use lacks one, S29)                                                                                              |
| Units typed by hand (flag on)                                       | all      | 0              | **0** (the unit is text, not an input; UN-1 to UN-4)                                                                                                                              |
| Released results whose snapshot changed after a set-up edit         | —        | 0              | **0** (S25, S26; snapshots raise on UPDATE, as the owner too)                                                                                                                     |
| Unsigned limits or ranges that fired                                | —        | 0              | **0** (S24, S34; RR-1)                                                                                                                                                            |
| Clinical numbers in code, seeds or copy                             | —        | 0              | **0 added by Phase 1** (no INSERT of limits, ranges, times or measures in 0102–0106; fixtures are named as invented). Pre-existing: `lib/lab/critical-values.ts`, see note 1      |
| Templates failing the banned-term scan                              | —        | 0              | **0** (MS-2; the scan is proven to fail on a fixture that names a patient)                                                                                                        |
| Back-entry of a four-result form, median                            | —        | ≤ 90 s         | **Not measured with people.** A scripted entry of a four-result FBC form took 14 s (harness, S38): the screen is not the bottleneck. The timed trial with lab staff is still owed |
| Legacy write actions callable after the switch                      | all      | 0              | **0 of 3** (enter, release, reject each refuse; S47 and F9)                                                                                                                       |
| Hazards without a control and a test                                | —        | 0              | **2, both open by decision**: 7 (alert fatigue, D-LAB1-15) and 23 (pregnancy ranges, D-LAB1-21). The other 24 have both                                                           |
| Rule IDs without a test                                             | —        | 0              | **0 of 72** (UN, RR, FL, CM, CA, RC, ES, MS, DT, CO, CF)                                                                                                                          |
| RLS probes passed                                                   | —        | 100 %          | **100 %** (`lab-safety-data`, 14 probes over 21 tables, plus the access probes in `lab-reads` and `lab-criticals` S16)                                                            |
| axe serious or critical                                             | S0       | 0              | **0** on every new screen (STOPs 4–8, 1440 px and 390 px). Pre-existing: 10 contrast nodes on the doctor sidebar's dimmed "Soon" items with the workspace off, untouched          |
| Red outside signed uses on the new routes                           | —        | 0              | **0** (`tests/design/red-reserved.test.ts`; the critical tint only on the pinned alert and the Critical pill, ADR 0250)                                                           |

### Performance budgets (§11)

| Measure                                        | Budget               | Result                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release with a mark                            | p95 < 500 ms server  | 193 ms round trip in the browser, one sample (harness)                                                                                                                                                                                                             |
| Alert visible to an online recipient           | ≤ 5 s / ≤ 15 s       | See above                                                                                                                                                                                                                                                          |
| Acknowledge                                    | p95 < 300 ms server  | 222 ms round trip in the browser, one sample (harness)                                                                                                                                                                                                             |
| Escalation written after the due time          | ≤ 60 s               | See above                                                                                                                                                                                                                                                          |
| Criticals list TTFB                            | p95 < 400 ms         | Not measured as a p95; the page renders in the harness under `next dev`, which is not a basis                                                                                                                                                                      |
| Range resolution per report                    | < 5 ms, one query    | Two reads per report (versions, then their bands), none per component; resolution is in memory. Not timed                                                                                                                                                          |
| Added JS on `/lab` and on the doctor Workspace | report, flag > 40 KB | **0.0 KB on each.** `/lab` 256.9 KB and the doctor Workspace 464.8 KB on the wire, the same with the three flags on or off (`next start`, harness, first load, cache off). The new client code loads on the result, Criticals and set-up screens, not on these two |

## What is not done

1. **The timed trial** of acknowledgement and back-entry with two or three clinicians and lab staff. It needs people;
   the scripted numbers above say only that the screens are fast.
2. **Realtime delivery time** on a deployed preview with Supabase Realtime.
3. **Signatures:** Appendix A wording, the hazard log, and each hospital's limits, ranges and response times.
4. **Not built, as recorded at GATE A:** push notifications; informing the ward's nurse in charge (no surface,
   D-LAB1-05); per-class restricted filtering (reports carry `restricted` only); coded critical rules (D-LAB1-16);
   pregnancy ranges (D-LAB1-21); alert suppression (D-LAB1-15).
5. **F10** is partly resolved: alerts are live in the app; the worklist itself does not update live.

## Notes for the owner

1. `lib/lab/critical-values.ts` (from the earlier result-workflow work, commit 5738a935) holds a cited but unsigned list
   of critical thresholds that the legacy entry check reads. It is flagged unsigned and does not fire alerts. Phase 1
   does not read it. It stops mattering at the switch, because the legacy writes close; delete it after every hospital
   has switched.
2. To go live at a hospital, in order (D-LAB1-25): apply 0102–0106 and set up the scheduler (STOP 4, note 8); the CSO
   signs Appendix A; the lead sets response times and contacts, both sign; `LAB_CRITICALS`; the lead sets units, then
   ranges, both sign; `LAB_UNITS_RANGES`; limits, both sign (flagging starts); `LAB_DOWNTIME`, print forms, record a
   drill; brief the wards; two hospital admins switch.
3. The cut-over cannot happen anywhere until the Appendix A wording is signed. That is deliberate.
4. D-LAB1-12: today one person is owner, superadmin and CSO. Every two-person rule is enforced by the database, so a
   second person is needed for each signature, approval and reversal.
