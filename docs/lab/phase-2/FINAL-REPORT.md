# Lab Phase 2: final report

Branch `feat/lab-one-menu` (worktree `medsync-lab1`), 12 Oct 2026. It builds both Phase 2 prompts, the catalogue
(`PROMPT-LAB-PHASE-2.md`) and the one menu (`PROMPT-LAB-PHASE-2-ONE-MENU.md`). Every GATE A decision was taken as
recommended, on the owner's instruction. The branch has local commits only: nothing is pushed or merged.
Migrations 0107–0111 are written and **not applied**. ADRs 0251–0259 are written. The step-by-step record is in
`STOP-REPORTS.md`.

## Checks

| Check                              | Result                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| Typecheck                          | Clean                                                        |
| Lint                               | Clean                                                        |
| Full suite with the PGlite lane on | 445 files, 10,113 tests, 0 failed                            |
| Production build                   | Passes                                                       |
| axe (harness, 1440 and 390 px)     | 0 serious or critical on the new screens; see the note below |

## §13 numbers

| Metric                                                                     | Target         | Result                                                                                                                          |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Ordering surfaces reading one availability engine                          | 3 of 3         | **3 of 3**: the order sheet, the Plan basket and resus                                                                          |
| Orders placed for a test the hub marks not offered (flag on)               | 0              | **0**: refused in `placeOrders` (S20)                                                                                           |
| Immediate or resus orders held for payment                                 | 0              | **0**: fixed at placement; the database refuses any later change (S30)                                                          |
| Restricted test names visible to the cashier                               | 0              | **0**: counted only (S31, cashier function probe)                                                                               |
| Specimens marked collected without a matching label (flag on)              | 0              | **0**: checked inside "collected", with no override (S26–S28)                                                                   |
| Identity mismatches recorded and blocked                                   | report         | Every check is recorded in `lab_identity_checks`. No live data yet                                                              |
| Scan to received, p95                                                      | ≤ 1 s          | **Not measured** on real hardware. One indexed lookup and one write                                                             |
| New specimen visible on an open worklist, p95                              | ≤ 5 s / ≤ 15 s | Polling fallback 15 s, seen in the harness. Realtime p95 not measured (no realtime server in the harness)                       |
| Working-diagnosis reveals without an access event                          | 0              | **0**: the reveal and its log row are one transaction (S44)                                                                     |
| High-risk surfaces missing the warning                                     | 0 of 6         | **0 of 6**, plus the downtime form                                                                                              |
| Bedside results without device, lot and operator                           | 0              | **0**: a database check pairs device and lot; the operator grant is enforced (S46, S48)                                         |
| Bedside results given a diagnostic category by a scheme not naming bedside | 0              | **0** (S46)                                                                                                                     |
| Research-use parameters released                                           | 0              | **0**: blocked at mapping (S10)                                                                                                 |
| `lab_only` parameters in clinician views or prints                         | 0              | **0**: filtered in results, the chart and the NCD feed (S11)                                                                    |
| Imported values resolvable before two signatures                           | 0              | **0** (S7, S15)                                                                                                                 |
| Released results whose basis or category changed after a set-up edit       | 0              | **0**: snapshotted at release (S12)                                                                                             |
| Hand-typed NCD HbA1c where an in-house result existed (90 days)            | 0              | The visit fills the value and it is read-only once the mapping is signed. The window is the registry lead's to sign; no default |
| NCD fields filled from a result in a different unit                        | 0              | **0**: listed as "unit differs" (S60)                                                                                           |
| Clinical numbers in code, seeds or copy                                    | 0              | **0**: fixtures are named as fixtures; researched values are unsigned drafts                                                    |
| Hazards without a control and a test                                       | 0              | **0** in `hazard-log.md` (draft, unsigned)                                                                                      |
| Rule IDs without a test                                                    | 0              | Not 0. PC-9 (bedside critical mark) and NF-8 (diabetes pack reader) were not built; see the gaps                                |
| RLS probes passed                                                          | 100 %          | **100 %**: 12 of 12, plus the cashier and realtime channel probes                                                               |
| axe serious or critical                                                    | 0              | **0** on new screens. One pre-existing contrast issue on the nurse sidebar is out of scope                                      |
| Red outside signed uses on new routes                                      | 0              | **0** (`red-reserved.test.ts`, 36 of 36)                                                                                        |

## Definition of Done

**Done**:

- one menu;
- not offered and "Not known today";
- emergencies never held;
- the cashier masks restricted tests;
- the label check;
- scan to receive, with undo and the loud fallback;
- the high-risk warning on six surfaces and the downtime form, cleared by clinicians only;
- bedside device, lot and operator, with expired lots refused;
- import as drafts, verification blockers, nothing flags before two signatures;
- lab-only and research-use rows;
- frozen snapshots;
- the Hb scheme with elevation and recorded pregnancy;
- the NCD feed by reference, unit-safe;
- no clinical numbers;
- RLS probes and append-only tables;
- red scarcity;
- S1–S66 except the gaps below;
- all flags off matches Phase 1.

**Owner's to finish** (outside Claude's remit):

- the CSO signs the addendum, the Appendix A copy and the hazard log;
- the migrations are applied;
- 33 tests become active once the addendum is signed.

## Gaps (honest list)

1. **PC-9 not built.** A bedside HI reading shows "Consider marking this result critical", but there is no mark to
   press. The lab's own critical mark (Phase 1) is unaffected.
2. **NF-8 not done.** The diabetes pack keeps its own reader, because its look-back windows are signed pack data.
   Moving it to the feed needs a CSO decision.
3. **Not built**:
   - the "Also at the bedside" line when ordering;
   - the bedside entry from the doctor's patient page (nurses have it).
4. **The worklist's "Open procedure" row action is not switched.** The server still refuses a high-risk receipt
   without "Procedure followed", by scan or by click.
5. **Not measured**:
   - S25 (search speed);
   - scan p95;
   - realtime p95;
   - S54 (the timed bedside trial, which needs real users).

   There is no NCD visit screenshot.

6. **Four unit factors** in the research file run the opposite way (UACR mg/g, direct LDL mg/dL, D-dimer µg/L FEU and
   DDU). They are left out of the addendum, so such outside results are refused rather than mis-converted. The CSO
   should check them.
7. **The DH-615 research-use blocklist** comes from the research file and may be incomplete. The laboratory lead
   confirms it on the analyser at profile verification.
8. **Copy outside Appendix A** (labels on set-up screens, cashier, bedside register) needs a CSO wording pass.
9. **Not fixed here**: the pre-existing axe contrast issue on the nurse sidebar.

## Owner actions, in order

1. Review the branch. Say when to push and open the PR.
2. Apply migrations 0107 → 0108 → 0109 → 0110 → 0111 (after 0106) with `npm run db:migrate`.
3. CSO signs:
   - the Appendix A copy (`content/lab-phase-2.ts`, then `LAB2_COPY_STATUS` to signed);
   - the v1.6 addendum;
   - the hazard log;
   - then, per hospital, schemes, elevation, REF entries (eGFR constants), the HIV algorithm and the NCD field
     mappings.
4. Turn on the flags per hospital in the D-LAB2-28 order:
   1. `LAB_CATALOGUE_V2`
   2. `LAB_ONE_MENU`
   3. `LAB_COLLECTION_CHECK` + `LAB_HIGH_RISK`
   4. `LAB_BENCH`
   5. `LAB_PAYMENT` (sites that charge only)
   6. `LAB_BEDSIDE`
   7. `NCD_LAB_FEED`
5. Unset `DEV_SKIP_MFA` before go-live.
