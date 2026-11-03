# Prompt for Claude Code: replace Stock › Main store

Paste everything below the line into Claude Code, opened at the root of the MedSync repo. Before you do, copy the updated kit to `docs/pharmacy/rework/`. Run it after `PROMPT-MEDICINES.md`, `PROMPT-ROSTER.md` and `PROMPT-SETUP.md`: it reuses their rules registry, roster (witnesses), places, top-up levels and fridge data.

---

Replace the pharmacy **Stock › Main store** tab with the design in `docs/pharmacy/rework/STORE.md`. Build every function it describes, exactly, including the figures and charts in every section. The bar is **perfect UI and perfect behaviour, at minimal token cost**. Work on a branch `feat/pharmacy-main-store`, and commit after each step.

## Sources of truth (read in this order, and only the parts you need)

1. `docs/pharmacy/rework/STORE.md` is the spec:
   - §A shell and navigation
   - §B figures and charts
   - §C–§F the sections and dialogs
   - §G–§M data, derivations, actions, permissions, rules, prototype-only, acceptance

   It overrides PRD §6.4 and the TECH-SPEC store rows. Read it by section: `rg -n "^## |^### " STORE.md`, then read ranges.

2. The working reference is `docs/pharmacy/rework/prototype/store.dc.html` (about 1,500 lines).
   - **Never read it whole.** Find behaviour with `rg -n "<name>"`, e.g. `navGroups`, `shareFair`, `makeDispatch`, `confirmDispatch`, `transitTo`, `daysAt`, `needAt`, `runLines`, `transfers`, `books`, `suggest`, `trim`, `expRows`, `toggleStocktake`, `saveCount`, `saveIssue`, `saveLoss`, `colChart`, `lineChart`, `hbar`, `segOf`, `stat(`, `mkChart`, `V === 'home'`. Read only those ranges.
   - Copy the wording verbatim: labels, sub-lines, chips, errors and toasts.
   - Port the behaviour and chart geometry **function for function**, with the same thresholds, colours, sizes and order. Do not copy markup or inline styles; rebuild with Tide components.
3. TECH-SPEC §0 (repo shape), §4 (action pattern), §6 (UI notes) and §7 (tests). PRD §5 (safety invariants).
4. `DESIGN-medsync.md` (Tide): tokens, type and components only.
5. Already built and to be **reused, not rebuilt**:
   - the rules registry and its reader (SETUP-TABS §C3)
   - the roster and who is on duty, for the witness pickers (PEOPLE-ROSTER)
   - places, top-up runs, suppliers and fridges (SETUP-TABS §B)
   - the top-up levels and live stock (MEDICINES-TAB)
   - cases (Controls › Investigations)
   - Tide tiles, chips, dialogs and menus

## Token discipline (strict)

- **Plan once.** Write `docs/pharmacy/rework/RECON-STORE.md`: at most 50 lines mapping every table in §G and every action in §I to a real name, or "create". Then do not re-explore.
- Use `rg -n` before every read. Read line ranges, never whole files over 200 lines. Never re-read a file you just wrote.
- Edit in place with minimal diffs. No refactors outside the store tab, its derive and action folders, and one shared chart module.
- No narration between tool calls. No restating the spec. No summaries until the final message.
- Run only the tests touching what you changed, then the store suite once per step.
- Use subagents only for step 5, three in parallel. Give each:
  - its spec sections
  - the exact folder it owns
  - "do not touch derive, actions, charts or tide"

  Each returns a list of changed files only. The split:
  1. §A + §B4 Overview + §C Send out
  2. §D The places + §E Bring in
  3. §F Look after the stock + the dialogs

- Docs: update only `docs/pharmacy/HANDOFF.md` (one section). No ADRs or changelogs.

## Hard rules

- **The ledger is the truth.** Every figure, tile and chart is a query or a pure derivation over the ledger, dispatches, requisitions, batches and readings. No stored totals, except the voucher sequences.
- **The database enforces the invariants,** each with a guard test:
  - stock never goes below 0 per batch
  - issues take FEFO, worked out server-side
  - a controlled line needs a witness who is not the issuer
  - a dispatch adds to the place only when confirmed
  - put-away is refused while a cold line waits
  - a count difference over the sign-off value isn't posted until signed
  - a stock-take can't close with uncounted or unsigned shelves
  - an order trim never cuts V lines
  - quarantined batches can't be issued
- **Thresholds come from the rules registry** (STORE §K). Grep for hard-coded 7, 14, 60, 90, 2, 4, 6, 30, 50000, 100000, 25, 60, 2.5, 7.5 in the store code and replace each with the rule.
- **Charts:**
  - build one shared module, `components/pharmacy/charts/*`, with column, line (with a stepped mode), bar rows (value at tip), stacked rows, a thin segmented bar and a figure tile with a sparkline
  - plain SVG and CSS, with no chart library
  - keep the validated colours in STORE §B3
  - every mark has a tooltip on hover and focus, and an `aria-label`
  - every chart has "Show the numbers"
  - no dual axes
- **Layout:**
  - the section bar with group menus (STORE §A); no left section list
  - full-width content
  - a 6-column chart grid: thirds, halves, two-thirds, full
  - equal-height cards per row
  - Overview in exactly the order and sizes of §B4
- **Look:** Tide tokens only. No coloured side or left accent borders. No very dark themes. Status colours always come with a word.
- **Copy:** all strings go through signed content as `draft`. Use the spec's wording verbatim, en-GB, with dates like `Tue 3 Nov` and money like `UGX 8.9 m` / `UGX 911,070`.
- **Do not ship anything in STORE §L:**
  - the fixed date and actors, or the sample history arrays
  - the jitter ticker (use Realtime from the sensor table, with a 30 s poll as the fallback)
  - the fixed voucher counter

## Steps

1. **Recon.** Write RECON-STORE.md (above).
2. **Data.**
   - Migrations for §G, with triggers, RLS and the `place_balance_month` view.
   - Seed a dev hospital covering every state:
     - an urgent and a partial requisition, two requests over stock (to test share fairly), and a controlled line
     - a dispatch in transit and one with a difference
     - a place under 7 days, and a place with over 60 days and excess
     - a run due today with a short line
     - a return waiting
     - a balance gap over UGX 100,000, including a controlled one
     - a draft order over budget
     - a GRN with a cold line
     - batches expiring in ≤ 3 and ≤ 6 months, some at risk
     - shelves due, and the controlled cupboard due
     - quarantine batches of each kind
     - a loss marked theft
     - room readings in and out of limits
     - 12 weeks of ledger history, so every chart has data
3. **Derivations.**
   - Write `lib/pharmacy/derive/store/*.ts` with the §H pure functions, and `lib/pharmacy/derive/store/stats.ts` for every figure and series.
   - Unit-test every branch, especially:
     - `fefo` across batches
     - `shareFair`: an urgent pre-share, equal days, and never over stock
     - `needAt` with transit
     - `transfers` at the 60 / 14-day edges
     - `suggest`, rounded to packs
     - `trimToBudget`: N, then E, never V, and still over
     - `riskQty`
     - `placeBalance`
     - `needsSignOff` at 50,000
     - `storeValueByWeek`, which must end at the live value
     - `niceStep`
     - the `hbar` reserve, which must never clip
4. **Actions.** Write `lib/pharmacy/actions/store/*.ts` with the §I actions, following TECH-SPEC §4. Re-check permissions on the server. Write the ledger and an audit event, idempotent on the voucher.
5. **UI** ⇉ (3 subagents, split as above), with charts from the shared module.
6. **Wire-up.**
   - Requisitions arrive from the places' own tabs, and receipts are confirmed there.
   - Cases open in Controls › Investigations.
   - Cold room CR-01 and the cold chain come from Places.
   - Top-up levels come from Medicines.
   - The stock-take report goes to Records.
   - "Receive a delivery" and "Record the rest" go to the Receive tab.
   - Realtime covers dispatches, requisitions and sensor readings, with a 30 s polling fallback.
7. **Tests.**
   - every §M acceptance item, as Playwright end-to-end tests
   - the SQL guard tests above
   - a statistics check: each tile and chart value equals a direct SQL query on the seed
   - Playwright at **1440 px and 390 px**, across all 14 sections and every dialog:
     - no console errors and no horizontal page scroll
     - axe clean (WCAG AA)
     - keyboard-only operation of the menus, dialogs and chart marks
8. **UI perfection pass.**
   - Run the prototype and your build at 1440 and 390 px. Screenshot every section, every dialog and the open group menus, in every state (empty, filled, error, disabled, live).
   - Compare them side by side. Fix every difference until they match: spacing, type, colour, wording, order, card sizes and heights, chart geometry (bar widths, value-at-tip placement, grid steps, label density), and empty states.
   - Keep the screenshots out of the repo.
9. **Clean-up.**
   - Delete the old store code, `store.js`-derived components, and the copy keys they no longer use.
   - Add one section to `docs/pharmacy/HANDOFF.md` covering what was built, the defaults taken, and what the owner must supply:
     - the shelf list and bins
     - the top-up run days
     - the supplier cycles and the NMS budget
     - the place-balance opening counts
     - the room thermometer and hygrometer readings routine
     - the requisition fill target

## Definition of done

- Every function in STORE.md works as specified, and every §M item passes.
- Every figure and chart is computed from real data and matches SQL. No sample arrays remain (show `rg -n "OUTW|INW|FILL =|TAT =|AVAIL|OUTD|RQ0|LOST|REAS|ROOMH"` returning nothing in `src`).
- There are no hard-coded thresholds left (show the grep).
- The old store code is deleted.
- `pnpm typecheck`, `pnpm lint`, unit tests, SQL guard tests and Playwright (both widths, axe) are all clean.
- The screenshots match the prototype section by section.

## Final message (≤ 12 lines)

Steps done, the test summary (counts), the two greps, defaults taken, what the owner still needs to supply, and the branch name. Nothing else.
