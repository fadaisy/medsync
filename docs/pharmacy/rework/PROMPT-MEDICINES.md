# Prompt for Claude Code: replace the Medicines tab

Paste everything below the line into Claude Code, opened at the root of the MedSync repo. Before you do, copy the updated kit to `docs/pharmacy/rework/`. You can run this on its own, or as part of phase P5 of `PROMPT.md`.

---

Replace the pharmacy **Medicines tab** with the design in `docs/pharmacy/rework/MEDICINES-TAB.md`. Build every function it describes, exactly as specified. Work on a branch `feat/pharmacy-medicines`. Commit after each step below.

## Sources of truth (read in this order)

1. `docs/pharmacy/rework/MEDICINES-TAB.md`: the full specification. It overrides PRD §6.4 (medicine list) and §6.7 (Set-up › Medicines), and the matching TECH-SPEC rows.
2. `docs/pharmacy/rework/prototype/medicines-tab.dc.html`: the working reference.
   - The markup uses `{{holes}}`, `<sc-for>` and `<sc-if>`.
   - All behaviour is plain JavaScript in `class Component … renderVals()`, plus `constructor` (data and constants) and `componentDidMount` (the live ticker, which is simulation only).
   - Port the behaviour **function for function**, with the same wording, thresholds, colours and flows. Do not copy its markup or inline styles; rebuild with Tide components and tokens.
3. `docs/pharmacy/rework/TECH-SPEC.md`: §0 repo shape, §4 action pattern, §6 UI notes, §7 tests. `docs/pharmacy/rework/PRD.md` §5 safety invariants still apply.
4. `DESIGN-medsync.md` (Tide): tokens, type and components only.

## Hard rules

- **Replace, don't duplicate.** Remove the old Set-up › Medicines list, the old edit dialog, the old Prices sections (price rule, payers, dispensing points, needs a price) and the old catalogue picker. Build one `MedicinesGrid` component:
  - **edit mode** at `/pharmacy/setup?tab=medicines`
  - **operate mode** at `/pharmacy/stock/medicines`
  - old routes redirect
- **Dispensing-point billing** (Free point, Pay before collecting) moves to Set-up › Places, on places of kind "Dispensing point".
- **A line is generic + strength + form + route.** Enforce it with a unique index (MEDICINES-TAB §14), not only in the UI.
- **Rule changes need two signatures**, enforced in SQL (a trigger refuses to apply a proposal without both).
- **The national controlled list locks the Controlled flag on** for those lines.
- **Data:**
  - Live stock comes from the ledger, through Realtime with a 30 s polling fallback.
  - No sample data in production paths. Sample fixtures go only in `scripts/seed-pharmacy-dev.ts`.
  - Do not ship the simulated ticker or the "Acting as" selector; use the session user.
- **Look:** no coloured side or left accent borders; no very dark themes; Tide tokens only. Status colours always come with a word.
- **Copy:** all copy goes through signed content, with new strings as `draft`. Use the spec's wording verbatim. Quantities always carry the unit, and prices say "per &lt;unit&gt;".

## Steps

1. **Recon (short).** Use `rg` to find the current Medicines tab, catalogue tables (`cat_*`), prices, places, fridges, batches, the movements ledger, signed Rules and audit events. Write `docs/pharmacy/rework/RECON-MEDICINES.md` (≤ 40 lines) mapping every table and function in MEDICINES-TAB §14–§16 to a real name, or "create".
2. **Data.**
   - Write migrations for MEDICINES-TAB §14:
     - lines with identity and flags, including `cytotoxic`
     - levels, payers, prices per payer and brand, brands and brand catalogue
     - rules, proposals and signatures, with the two-signature trigger
     - saved views and line history
     - `cat_items` extended with ATC and classification
   - Write the catalogue importer `scripts/import-catalogue.ts` (§11.1). It must be idempotent and keyed on identity. It reads the EMHSLU, NMS, JMS, UNEPI and NDA files from `data/pharmacy/catalogues/` (ask the owner for the files; until then run it on the fixture files). If there is no WHO ATC licence, store only the ATC level-1 letter.
   - Write the dev seed with ~50 lines covering every check in §10.
3. **Derivations.** Write `lib/pharmacy/derive/medicines.ts` with the §15 pure functions, ported from the prototype's `renderVals`. Unit-test each one, especially `evalConditions` (left-to-right AND/OR), `placeStatus`, `qcChecks` (every check fires and clears) and `fefoWaste`.
4. **Actions.** Write `lib/pharmacy/actions/medicines.ts` with the §16 actions, following the TECH-SPEC §4 pattern and the §17 permissions.
5. **UI.** Build `components/pharmacy/medicines/*`. MEDICINES-TAB §2–§13 gives the order and every detail:
   - toolbar, Views, Rules badges, condition chips, tiles, bulk bar
   - the grid: columns, ⋮ menus, sort, group, pager
   - the open-row panel: About with locked CD and cold-chain fridges, Rules that apply, Packs and top-up levels with live stock, request/order and batches, Prices per payer, Brands, History, footer
   - the dialogs: Filters with saved views, Rules group, Catalogue (Master catalogue · EMHSLU · NMS · JMS · UNEPI; Body system, Class and Sale category filters; duplicate guard) and the local-medicine form
   - below 640 px the grid becomes cards
6. **Wire-up.**
   - Realtime subscription for balances and fridge readings.
   - Request top-up creates an issue request in Stock › Issue; Add to order creates an order-draft line.
   - Rules badges read the same rules as Set-up › Rules.
   - Going live counts incomplete lines from the Checks.
7. **Tests.**
   - every acceptance item in MEDICINES-TAB §19
   - SQL guard tests for the identity unique index, the two-signature trigger and the locked controlled flag
   - Playwright at 1440 px and 390 px: no console errors, no horizontal page scroll
8. **Clean-up.** Delete the old Medicines code and copy keys it no longer uses. Update `docs/pharmacy/HANDOFF.md`: what was built, defaults taken, what still needs real data (the catalogue files, the NDA sale categories, the brand list, and the ATC licence decision).

## Definition of done

- Every function in MEDICINES-TAB.md works as specified, and the §19 acceptance items pass.
- There is one Medicines component, used by both routes, and the old one is deleted.
- `pnpm typecheck`, `pnpm lint`, unit tests, guard tests and Playwright are clean.

## Final message (≤ 15 lines)

Report steps done, the test summary, defaults taken, data still needed from the owner, and the branch name. Do not recap the steps.
