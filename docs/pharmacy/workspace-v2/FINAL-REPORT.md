# Pharmacy Workspace v2: final report

**Where it is.**

- Worktree `~/Desktop/medsync-pharmws2`, branch `feat/pharmacy-workspace-v2`, off `feat/pharmacy-demo` (4ffcc9d2).
- **Not committed and not pushed.** That waits for the owner's word.
- **No migrations.**
- The new interface sits behind `PHARMACY_WORKSPACE_V2` (per hospital, `1` or ids). In production it stays off while `PHWS2_COPY_STATUS` is draft. With the flag off, `/pharmacy` is the Phase 1–4 interface exactly.

**Read first:**

- `step-0/STOP-0-REPORT.md`: the spec, and every place the boards and the repo disagree;
- `gate-a-proposal.md`: the decisions, route map, Today definitions and signature block;
- `parity-checklist.md`: 139 actions, none lost.

## 1. What was built, gate by gate

| Gate | Done |
| --- | --- |
| STOP 0 | Inventory of the 40 old routes and the 24 nav items; data sources checked in code; the missing prompt and the board-versus-repo disagreements recorded |
| GATE A | Proposal written with decisions D-PW-01…12. Approved by the owner ("go through all gates"). **Not CSO-signed** |
| Shell | Rail of six places; top bar with the overline, title, Find (Ctrl/Cmd K), acting point pill (chooser when there are several), Needs you pill (amber with its count, neutral at 0) and Emergency; account menu on the avatar; the one-time "Where everything went" note (cookie); `g` + letter jumps to a place |
| Today | Navy hero ("Is the window keeping up?") with waiting count, pace chart (arrived and supplied per hour), stages with oldest waits, and "Open the window". Six key figures with 7-day bars and change lines. Medicines flow. Needs you top 5. Points table. Scope: point or all points |
| Window | Queue in panes: the left list, grouped by stage, opens the prescription's own review screen beside it, which keeps every decision and action. Then Ready to hand over, Open lines (grouped by what you can do now), Refills and Supplied today. "Enter downtime sheets {n}" appears when sheets wait |
| Needs you | One inbox over 9 existing sources, each gated by the permission that acts on it. Chips and groups. The count everywhere is the length of the same list |
| Shelf | Strip (medicines, out of stock and vital, below reorder level, last count). Stock, Controlled drugs and Emergency doses. "Record an adjustment" is the one lagoon action. Side cards for controlled differences and emergency doses |
| Store | Flow card, then one tab each for Deliveries, Issues, Wards, Carts, Expiry and recall, Orders and Month end. Expiry/recall and Month end cards |
| Clinical | Hub with the Clinical limits line ("See signed packs" opens Set-up) and four cards: Reconciliation, Reactions, Stewardship and Interventions, each with real counts and a link to its page |
| Set-up | Signed packs in the board's columns (state, what stays off while missing, who signs, by the coded rule), Places and suppliers, Clinical content, National list, Downtime records, and a read-only Going live list |
| Find | Patient number → prescriptions; slip code; batch number → the medicine page and the patients supplied from that batch (identities through the audited reveal); delivery note number; pages |
| Build gaps | `loading`, `error` and `not-found` for every place. **One dialog:** `PharmacyDialog` now backs ReviewDialog, ActionDialog, StoreDialog and a fourth copy found in Stock (StockDialog) ([ADR 0454](../../adr/0454-pharmacy-one-dialog.md)). **Nav and flags:** Clinical content now opens whenever its nav item shows (any Phase 3 flag); in v2, Signed packs shows whenever its page opens (dispensing alone included). The old nav is unchanged, because the Phase 1 baseline test pins it. **Network routing:** not on this base (Phase 4 branch), so there is nothing to place |
| Redirects | 18 old list pages answer a 307 to their new home while the flag is on, with the query string carried. Detail, print and form routes are unchanged. Old page bodies moved to sibling `body.tsx` files (a page file may export only page fields) |

## 2. Dropped or reworded from the boards (no source: never faked)

- **Live updates.** There is no realtime channel, so pages say "As of {time}" and offer Refresh. "Up from {n} at {time}" and "arrivals outpacing supplies" are dropped: there is no history of queue size.
- **"Late".** The queue has no wait threshold. Today marks a stage late when it holds a row written before today (the queue's own divider). Window does not colour waits. **CSO** to confirm.
- **Points table.** The states are Live, Not live and Switched off; there is no "Downtime" state.
- **Shelf.** No Counts tab ("Not counted" stays as a filter). No cold chain. Emergency doses are not matched to prescriptions. "Last full count" becomes "Last count". The "across N batches" subline is dropped.
- **Store.** Deliveries stay the old table, because "Counting n of m" has no loader. Month end is not in the Today flow.
- **Clinical.** No "not started" reconciliations. No "Record one" intervention, because there is no writer. "Accepted" becomes "led to a change or a stop".
- **Needs you.** "Queries answered" is not a separate item, because an answer returns the line to To review. Requisitions are shown to `pharmacy.store` only.
- **Window.** The "What happens when you finish" card is not drawn outside the review screen: it would copy decision logic. The review screen's own side column serves as the third pane. The navy patient band is not restyled.
- **Place hue.** Grape (DESIGN: Pharmacy and lab), not the board's plum.

## 3. Checks

- `tsc --noEmit`: clean.
- `eslint` on everything changed: clean. Repo lint has 7 older warnings only.
- **Vitest:** 11,550 pass. The only failures are files that need a `.env.local`, which this worktree does not have: the PGlite EMR files and two env-reading tests. The same files fail on the untouched base checkout.
- **New tests in `tests/pharmacy/workspace-v2/`:** places, today, window, needs-you, find, setup, shelf, store, redirects, and laws (red and green, Law 4, no "updates live", no bracketed placeholders).
- **Existing source tests** now read the moved `body.tsx` files, so they still check the real code.
- **`next build --webpack`:** passes (§5).
- **Not done:** a visual pass in a browser against the demo hospital. That needs a signed-in pharmacy account, which Claude does not enter, and a dev server with this branch's env. The PGlite pharmacy lane did not run (no env).

## 4. Unsigned (CSO) and open

| Item | State |
| --- | --- |
| `content/pharmacy-workspace-v2*.ts` (shell + 8 place files) | draft; the flag stays off in production |
| GATE A decisions D-PW-01…12 and the §1 resolutions | ☐ |
| Today definitions (§6), including the "late" rule above | ☐ |
| Limits line wording | ☐ |
| Parity checklist | ☐ |
| ADRs 0451–0455 | Proposed (0454 Accepted: no clinical content) |
| Step 11 (delete the old interface, 308s in `next.config.ts`) | not started; waits for parity signature + pilot |

**Ceilings, marked `ponytail:` in code:**

- Needs you runs its nine loaders on every pharmacy page.
- Today and Store re-read what the rail or the open tab already read.
- Add a per-request shared cache if timings show it.

## 5. Build

Turbopack refuses this worktree's symlinked `node_modules`. That is the worktree setup, not the code. `next build --webpack` passes (27 Oct 2026) with the seven new routes: `/pharmacy/{today,window,needs-you,shelf,store,clinical,setup}`. It ran with placeholder Supabase env and `SKIP_ENV_VALIDATION=1`.
