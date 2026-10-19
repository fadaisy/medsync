# Lab Workspace v2: final report (STOP 11)

**Branch:** `feat/lab-workspace-v2` in worktree `~/Desktop/medsync-labws2`. Not pushed.

**Commits:**

- `95a3b127`: Steps 0–10, behind `LAB_WORKSPACE_V2`. This is the commit to pilot from.
- `d1773c93`: main merged in (lab demo everywhere, #244).
- The last commit: Step 11, which removes the old interface. Its flag is gone and its redirects are unconditional.

**Approval route.** The owner said in chat (19 Oct 2026): "go through all gates please". The GATE A recommendations were adopted on that basis (`gate-a-proposal.md` §1–§2). It is not a CSO signature. The signatures in §11 of that file are still open.

## Do not deploy the last commit until all three of these are true

1. **The CSO signs the copy.** That means `content/lab-workspace-v2*.ts`; `LABWS2_COPY_STATUS` is `draft`. While it was a flag, the copy kept v2 off in production (CF-3). After Step 11 there is no flag left to hold it back.
2. **The CSO signs the parity checklist** (`parity-checklist.md`), the Today definitions (gate-a §6), the QC severity order and the `DESIGN-medsync.md` lab section.
3. **The five-day pilot has run** from `95a3b127`, with `LAB_WORKSPACE_V2=<pilot hospital id>`. Claude cannot run a pilot.

If any of these is not done, merge only up to `95a3b127`, or the merge commit after it.

## Section 12 numbers

All figures come from the local harness (`~/Desktop/labws2-harness`: production build, seeded PGlite plus main's demo loader). They are not from a hospital.

| Metric                                                   | Baseline                                 | Target               | Result                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nav items in the lab                                     | 35 (5 groups; Set-up 14)                 | 6 places             | **6 places**, plus Needs you and search                                                                                                                            |
| Clicks, login to first specimen to result (technologist) | 1 (worklist "Continue")                  | ≤ 1                  | **1** (land on Bench, click the queue row)                                                                                                                         |
| Receive, enter and release FBC, median                   | not measured (needs a person; STOP 0 Q7) | −20 %                | **not measured**: open for the pilot                                                                                                                               |
| Find a specimen by lab number                            | not measured                             | < 300 ms after Enter | not measured by a timed trial. The search reads one indexed table (`lab_labels.label_no`, primary key); measure in the pilot                                       |
| Today TTFB p95                                           | —                                        | < 1.5 s              | **164 ms** p95 across 84 harness runs (Today cold start 0.8–1.2 s)                                                                                                 |
| Old lab actions not reachable                            | —                                        | 0                    | **0** of 131 (`parity.test.ts`). The 3 legacy-list actions stay for hospitals with `LAB_WORKSPACE` off                                                             |
| Old URLs without a redirect                              | —                                        | 0                    | **0** (`redirects.test.ts`; 30 redirects, 15 kept paths)                                                                                                           |
| Native date inputs under `app/lab`                       | ~30                                      | 0                    | **0** (`sweep.test.ts`)                                                                                                                                            |
| Visible concept ids                                      | many (`obs.potassium` and others)        | 0                    | **0** in placeholders, labels and text. Raw-id fallbacks now show words                                                                                            |
| Disabled buttons without a reason                        | ~30                                      | 0                    | **0**. No shared `Button` in `app/lab` has `disabled`; `LabButton` prints its reason                                                                               |
| Today figures differing from the hand count              | —                                        | 0                    | **0** on the fixture day (`today.test.ts`, S7–S11)                                                                                                                 |
| axe serious or critical                                  | 5 pages (colour contrast)                | 0                    | **0** on every lab screen at 1440, 1280 and 1024. The only hit is the app-wide 404 page                                                                            |
| Red outside criticals and Emergency; any green           | —                                        | 0                    | **0** (`red-reserved.test.ts`, extended to `app/lab` and `components/lab`)                                                                                         |
| Added JS on the lab shell (gzipped)                      | 411 KB first load (Step 0)               | < 120 KB added       | **not measured precisely.** The shell adds the rail, top bar and search palette (client) and Figtree (about 34 KB, lab pages only). Measure with `npm run analyze` |

## Done

- **Steps 0–10:** six places, top bar, search, Needs you, Today, Bench, Send-outs, Quality (with the QC plan form and the mini Levey-Jennings charts), Reports (with the period picker), Set-up hub and Downtime. Each was rebuilt on the Tide desk tokens and the field kit.
- **Step 11:**
  - removed: the old sidebar shell (`lab-shell`, `lab-nav`), the Phase 0 worklist screen, 30 old route pages, the flag and the `redirectIfV2` helper;
  - `next.config.ts` now serves `LAB_REDIRECTS`;
  - `/lab` lands by role;
  - kept: the pre-workspace layout and list, for hospitals with `LAB_WORKSPACE` or EMR v1 off.
- **Docs:**
  - ADRs 0343–0349;
  - the `DESIGN-medsync.md` lab section;
  - the menu and screens section of `docs/lab/LAB-DOCUMENTATION.md`;
  - `gate-a-proposal.md`, `parity-checklist.md`, `BUILD-BRIEF.md`, the Step 0 report and inventories.
- **Checks:**
  - typecheck clean (web and functions);
  - ESLint 0 errors;
  - Prettier clean;
  - Vitest: 10,443 pass, 1 failure fixed since (the emergency pill file);
  - lab, design and emergency suites: 1,278 of 1,278 after the fix;
  - production build passes in the harness (same code; three harness-only patches to auth, proxy and db).
  - `next build` inside the worktree stops at Turbopack's refusal of the `node_modules` symlink. That is the worktree's setup, not the code.

## Bugs the harness found and fixed

- **Today hung the server.** `today-read` ran `db` queries inside a `db.transaction`. That deadlocks a one-connection pool and takes a second connection in production. Every query in it now runs on the transaction.
- **Needs you crashed.** It passed `Date` parameters through raw `sql`. It now uses typed `gte`/`lte`.
- **A second h1 on the work pane.** The shared result entry now takes a heading level through context (`components/emr/results/heading-level.tsx`); the doctor's screens are unchanged.
- **Before release broke list semantics.** `role="status"` on an `<li>` failed axe; it moved to the row's content.
- **The result grid scrolled the page at 1024.** It now scrolls inside its card.
- **The queue opened on the wrong stage** for an order. It now opens on the order's own stage.

## Open, for the owner and the CSO

1. **The signatures** in gate-a §11: copy, parity, Today definitions, QC severity and the DESIGN section.
2. **Pilot and the human timed trial** (Section 4 budgets: receive, enter and release; scan to open).
3. **Downtime gaps.** These need new writes and were not built (Law 1):
   - a downtime cannot be recorded as still open ("Still down"): `recordPeriodAction` takes only ended periods;
   - the patient cannot be found by name and date of birth: `findPatientAction` takes a hospital number only;
   - no "received" time is stored on a paper form.
4. **Search finds names only on the open worklist,** because names are encrypted at rest. Closed work is found by lab number or hospital number.
5. **Not carried into the queue:** the worklist's ward filter and column sorts. The queue keeps the engine's order. **Decision for the CSO.**
6. **Not swept, because they were not on the list:** the stock and equipment "codes, comma-separated" fields, raw selects with more than 4 options, and the addendum dialog's concept-id columns (they are the ids being signed).
7. **Found in passing** (STOP 0, unchanged):
   - D-LAB1-12 is enforced unevenly;
   - `/lab/downtime/print` had no `lab.result.release` check (the new print page keeps that);
   - the matches gate uses the referral flag.
8. **The Laboratory Handbook and the Engineering Guide (artifacts)** still describe the old menu. The handbook session has a hand-over note in the shared notes folder.
9. **The "Where everything went" note** is dismissed per browser (a cookie), not recorded per user. Recording it per user would be a new write.
10. **The harness's demo load** stops in several sections because the harness seeds its own signed configs first. That is harness-only.
