# Pharmacy Workspace v2: GATE A proposal (Step 1)

Read this with `step-0/STOP-0-REPORT.md` and `step-0/data-sources.md`. The proposal changes the pharmacy's interface only. No engine, store, action contract, RLS policy, audit row or signed configuration changes (Law 1). The boards in `pharmacy-workspace-v2-canvas/` are the wireframes. The prompt file the canvas names was not on this Mac (STOP 0).

**Approval route.** The owner said "go through all gates" (27 Oct 2026, relayed from the parent session). I took that as approval of every recommendation below and built on.

**This is not a CSO signature.** The items marked **CSO** still need Fadhul's signature in §11 before production. Until then, `PHWS2_COPY_STATUS` is draft and `PHARMACY_WORKSPACE_V2` stays off in production (the CF-3 pattern, `workspaceLiveFor`).

## 1. Board-versus-repo resolutions (adopted)

These are the thirteen rows of STOP 0 §disagreements, as written there. Each board item that has no source is dropped or reworded, never faked (rule: no fabricated data).

## 2. Decisions

| # | Decision | Adopted |
| --- | --- | --- |
| D-PW-01 | Design system | MedSync Tide (`data-ds="tide"` on the shell root), the same tokens the lab desk uses. No new tokens. The place hue is grape (`bg-tide-area-lab`, the Pharmacy & lab domain), not the board's plum |
| D-PW-02 | Reuse | The lab v2 kit (`app/lab/_components/v2`: charts, fields, kit, button, space, loading) is imported, not copied. Pharmacy-own pieces go in `app/pharmacy/_components/v2/` |
| D-PW-03 | Places | Today, Window, Shelf, Store, Clinical, Set-up, plus the Needs you inbox. Every tab exists exactly when the old nav item it replaces is visible (`lib/pharmacy/workspace-v2/places.ts`), so the flags and permissions are the old ones, unchanged |
| D-PW-04 | Landing | `pharmacy.manage` → Today; everyone else → Window |
| D-PW-05 | Acting point | One pill naming the point and Live / Not live. With several points it opens the chooser (`chooseActingPoint`, unchanged) |
| D-PW-06 | Needs you | One inbox over the §7 sources, each shown only to someone holding the permission that acts on it. An item leaves only when its source changes |
| D-PW-07 | Rows | Every work row shows "Next: …" and one action. The rest sit in a More menu |
| D-PW-08 | Limits | The amber notice becomes one slim line built from the same signed state (`interactionsStateFor`, `pharmacyChecksState`). "Read the full notice" opens the existing signed wording (`PharmacyNotice`) unchanged. **CSO** (wording) |
| D-PW-09 | Rollout | Flag `PHARMACY_WORKSPACE_V2` (per hospital, `1` or ids; needs `PHARMACY_WORKSPACE`). While it is on, old list pages answer a temporary redirect (307) to their new home, because a 308 is cached by browsers and would survive switching the flag off. Detail, print and form routes stay where they are, inside the new shell. Step 11 (deleting the old UI and moving to 308s in `next.config.ts`) waits for the parity signature and a pilot |
| D-PW-10 | Dialogs | One wrapper: `StoreDialog`, `ActionDialog` and `ReviewDialog` become thin re-exports of `EditorDialog`'s props, as the NavMap asks |
| D-PW-11 | Today definitions | §6. **CSO** |
| D-PW-12 | "Live" | No realtime channel exists. Screens say "As of {time}" and offer Refresh. Nothing claims to update live |

## 3. Route map

| Old | New (flag on) | How |
| --- | --- | --- |
| `/pharmacy` (queue) | `/pharmacy/today` (`pharmacy.manage`) or `/pharmacy/window` | redirect (307) |
| — | `/pharmacy/today` | new |
| — | `/pharmacy/needs-you` | new |
| — | `/pharmacy/window?view=queue\|ready\|open\|refills\|supplied&rx=` | new; queue in three panes |
| `/pharmacy/prescriptions/[key]` | stays (full page), also opens in Window's middle pane via `rx=` | inside the shell |
| `/pharmacy/prescriptions/[key]/handover` | stays | inside the shell |
| `/pharmacy/open-lines` | `/pharmacy/window?view=open` | 307 |
| `/pharmacy/refills` | `/pharmacy/window?view=refills` | 307 |
| `/pharmacy/supplied` | `/pharmacy/window?view=supplied` | 307 |
| `/pharmacy/supplied/log`, `/labels/[id]`, `/slip/[id]` | stay (print) | unchanged |
| `/pharmacy/downtime` | `/pharmacy/setup?view=downtime`; Window shows "Enter downtime sheets {n}" when sheets wait | 307 |
| `/pharmacy/downtime/enter/[sheet]`, `/downtime/sheets/[from]/[to]` | stay | unchanged |
| `/pharmacy/stock` | `/pharmacy/shelf` | 307 |
| `/pharmacy/stock/[medicineId]` | stays | inside the shell |
| `/pharmacy/stock/national-list` | `/pharmacy/setup?view=national` | 307 |
| `/pharmacy/controlled` | `/pharmacy/shelf?view=controlled` | 307 |
| `/pharmacy/controlled/register/[entryId]` | stays | inside the shell |
| `/pharmacy/emergency-doses` | `/pharmacy/shelf?view=emergency` | 307 |
| `/pharmacy/store/{deliveries,issues,wards,carts,expiry,orders,month-end}` | `/pharmacy/store?tab=…` | 307 |
| `/pharmacy/store/*/[id]`, `/store/expiry/recalls…` | stay | inside the shell |
| `/pharmacy/store/packs` | `/pharmacy/setup` | 307 |
| `/pharmacy/store/places` | `/pharmacy/setup?view=places` | 307 |
| `/pharmacy/clinical/content` | `/pharmacy/setup?view=content` | 307 |
| `/pharmacy/clinical/{reconciliation,reactions,stewardship,interventions}` and `[id]` | stay; `/pharmacy/clinical` is the new hub | inside the shell |

Query strings are carried across. `tests/pharmacy/workspace-v2/redirects.test.ts` walks this table. The tab pages render the old page's own component, so filters and actions are the same code (parity by construction).

## 4. Design

The design is Tide at desk density, exactly as `DESIGN-medsync.md` § Laboratory workspace describes it, applied to `/pharmacy` while the flag is on. No new tokens and no DESIGN change, apart from one line naming the pharmacy as a second Tide desk. **CSO**

## 5. Components

| New (`app/pharmacy/_components/v2/`) | Replaces |
| --- | --- |
| `PharmacyShellV2` (rail, top bar, point pill, Needs you, Emergency, Find, "Where everything went") | `WorkspaceShell`, `PharmacySidebarNav`, `PharmacyPhoneNav`, `PharmacyCrumb`, `FindField`, `PointChooser` |
| `LimitsLine` | the large amber `PharmacyNotice` at the top of pages (the full notice stays one click away) |
| `FlowStrip` | the store pages' separate headers |
| `WorkRow` (`Next:` + one action + More) | per-page action columns |
| `PaceChart`, `WeekBars` | none (new read models) |
| `PackRow` | the packs table rows |
| `InboxRow` | none |
| Lab kit: `KeyFigure`, `Panel`, `Pill`, `EmptyState`, `NotSet`, `PillTabs`, `FilterChips`, `SpaceHeader`, `PlaceLoading` | segment tabs and tiles |

## 6. Today definitions (read model `lib/pharmacy/workspace-v2/today.ts`, pure, plus `today-read.ts`)

- **Scope:** the acting point ("{point}") or all points ("All {n} points"). The day is the local day in `DEFAULT_TIME_ZONE` (Africa/Kampala).
- **Waiting:** the review-queue rows at the point with a line at a stage, the same number as the rail. "Up from {n} at {time}" is dropped, because there is no history of queue size.
- **Stages:** To review, Ready to hand over, Queried and Awaiting co-sign, from `computeReviewQueue` stageCounts.
  - **Oldest:** now − min(`writtenAt`); for Queried, now − min(`queriedSince`).
  - **Late:** "late" (amber with the word) above the rule the queue already uses (`rule`). There is no other target. The board's "[target]" is not invented.
- **Per hour:** arrived = prescriptions created today in the point's scope, by local hour; supplied = hand-overs at the point by `supplied_at` hour. The axis runs from 08:00 (or the first event, if earlier) to now.
- **Key figures with 7 days of bars**, each a local day:
  - **Supplied:** hand-overs.
  - **Not on the shelf:** `owed` + `buying_outside` line events.
  - **Out of stock, vital:** stock-outs open at the end of each day (or now) for a VEN-V medicine. With no national list this is "Not set".
  - **Look-back:** items flagged that day.
  - **Controlled differences:** recorded that day. The figure is the open ones now.
  - **Refills to prepare:** now only, with "No earlier data".
  - **Change line:** the difference from the same weekday last week, as an arrow and an amount in words. With no data it says "No earlier data".
- **Points table:**
  - queue at each point (by `serves`);
  - supplied today;
  - vital out ("Not set" without the national list);
  - state Live / Not live / Switched off.
- **Medicines flow:** the counts listed in `data-sources.md`, read only.

**CSO.**

## 7. Needs you sources

These are the nine rows of `data-sources.md` § Needs you, grouped as follows:

- **Today, before you leave:** controlled, look-back, downtime.
- **Store:** deliveries, requisitions, confirm.
- **Clinical:** reactions, reconciliation.
- **Set-up:** packs not signed.

The rail and pill count is the length of the same list (tested).

## 8. Strings

All new strings go in `content/pharmacy-workspace-v2.ts` plus `content/pharmacy-workspace-v2-<place>.ts`, under `PHWS2_COPY_STATUS = draft`. Changed wording of the limits line is included. Board placeholders such as "[target]", "[dose]" and "[strength]" are never copied. **CSO.**

## 9. Wireframes

The canvas boards, annotated by §1.

## 10. Tests and ADRs

**Tests** (`tests/pharmacy/workspace-v2/`):

- `places.test.ts`: tabs equal the nav, landing, `placeOf`;
- `today.test.ts`: a hand count of stages, oldest, hourly buckets, week bars and no earlier data;
- `needs-you.test.ts`: permission gating;
- `redirects.test.ts`;
- `parity.test.ts`: every server action the old pages imported is still imported by some file reachable from the new shell;
- `red-reserved.test.ts`: no red outside the Emergency link, and no green, under `app/pharmacy/_components/v2`;
- `law4.test.ts`: no role words in the new copy.

**ADRs:**

- 0451: six places and the shell;
- 0452: Needs you;
- 0453: Today's figures;
- 0454: one dialog wrapper;
- 0455: the rollout and redirect map.

These are drafts in `docs/adr/`, numbered after the newest on this branch.

## 11. Signature block

| Item | Approved | Signed (CSO) |
| --- | --- | --- |
| D-PW-01…12, §1 resolutions | Owner, "go through all gates", 27 Oct 2026 | ☐ Fadhul |
| Today definitions (§6) | as above | ☐ Fadhul |
| Limits line wording (D-PW-08) | as above | ☐ Fadhul |
| `content/pharmacy-workspace-v2*.ts` | — | ☐ Fadhul (until then the flag stays off in production) |
| Parity checklist (Step 11) | — | ☐ Fadhul |
