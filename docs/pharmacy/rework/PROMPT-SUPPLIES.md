# Prompt for Claude Code: add EMHSLU health and lab supplies across the pharmacy

Paste everything below the line into Claude Code, opened at the root of the MedSync repo. Before you do, copy the updated kit to `docs/pharmacy/rework/`. Run it last, after `PROMPT-RECEIVE.md`: it extends the item table, catalogue, store, receiving, rules and going-live built by the earlier prompts.

---

Add the health supplies and laboratory supplies of the EMHSLU 2023 to the whole pharmacy, as specified in `docs/pharmacy/rework/SUPPLIES.md`. Medicines and supplies share one item table, ledger and set of screens; do not build a parallel module. The bar is **perfect UI and perfect behaviour, at minimal token cost**. Work on a branch `feat/pharmacy-supplies`, and commit after each step.

## Sources of truth (read in this order, and only the parts you need)
1. `SUPPLIES.md` (§A–§H). It extends MEDICINES-TAB, STORE, RECEIVE and SETUP-TABS. Where they conflict, it wins.
2. The prototypes in `prototype/`. **Never read one whole.** Find each change with `rg -n`, then read only those ranges:

   | Prototype | Search for |
   |---|---|
   | `medicines-tab.dc.html` | `SUPCLS`, `itype`, `typeOf`, `itypes`, `B1:`, `'sad5'` |
   | `store.dc.html` | `itype`, `typeOf`, `healthFilter`, `typeLabel`, `'E', 'Health supplies`, `fmtExp` |
   | `receive.dc.html` | `sealBad`, `kitHot`, `noExp`, `seals:`, `kitTemps:`, `ptype` |
   | `rules.dc.html` | `G('sup'` |
   | `going-live.dc.html` | `I('supplies'`, `I('suplevels'` |

   Copy the wording verbatim.
3. The EMHSLU 2023 PDF itself, for the full Section B, C and D item lists:
   - The owner supplies it at `docs/pharmacy/rework/EMHSLU-2023.pdf`.
   - Parse it once with a script into `data/emhslu-2023-supplies.csv`, with these columns: section, category, name, specification, unit, level of care, VEN.
   - Commit the CSV. Never hand-type items.

## Token discipline (strict)
- Write `RECON-SUPPLIES.md` (≤ 30 lines): every change mapped to a file and function. Do not re-explore.
- Use `rg -n` before every read. Edit in place with minimal diffs.
- No narration between tool calls. No subagents.
- Run only the tests you touch, then the pharmacy suite once at the end.

## Hard rules
- **Data:**
  - `item_type`, `level_of_care`, `sterile`, `test_kit` and `no_expiry` go on the item.
  - `seal` and `kit_temp` go on the receipt line.
  - Item type is derived from the EMHSLU section and is never editable.
  - Section C loads only behind the hospital switch, off by default.
- **The database enforces the invariants,** each with a guard test:
  - **Sterile seal:** no stock-in of an accepted sterile line with a broken seal.
  - **Kit temperature:** no stock-in of an accepted kit line kept hot.
  - **Dispense:** supplies never reach Dispense.
  - **Billing:** no bill line for a supply without a price.
  - **Expiry:** `no_expiry` batches never appear in expiry or at-risk queries.
- **Thresholds** come from the new rules group (§F). There is no hard-coded 60 or 30 °C in the supply code.
- **Look:**
  - Tide tokens only.
  - The type switch is the same segmented control in every tab.
  - Tags are chips with a word.
  - No coloured side borders, and no very dark themes.
- **Copy:** all strings go through signed content as `draft`, in en-GB.

## Steps
1. **Recon.**
2. **Data.**
   - Migrations.
   - The CSV import.
   - A seed with the 28 prototype supplies, ward requisitions with supply lines, and an E and an L shelf.
3. **Derivations and actions.** Extend `lineInfo`, the store filters and the item filters. Add a `setSectionC` action.
4. **UI.** Work through the Medicines and supplies tab, the Main store, Receive, Rules and Going live, in that order.
5. **Tests.**
   - every §H acceptance item, as Playwright end-to-end tests
   - the guard tests above
   - Playwright at 1440 px and 390 px:
     - no console errors and no horizontal scroll
     - axe clean
6. **UI perfection pass.** Compare against each prototype at both widths, then fix the differences.
7. **Handoff.** Add one section to `HANDOFF.md`: what was built, the defaults taken, and what the owner must supply:
   - the EMHSLU PDF
   - whether Section C is used
   - the supply prices, if any are billed
   - the supply top-up levels

## Final message (≤ 10 lines)
Steps done, the test counts, the grep for hard-coded thresholds, defaults taken, what the owner still needs to supply, and the branch name.
