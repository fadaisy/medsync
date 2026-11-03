# Prompt for Claude Code: replace Set-up › Going live, Places, Rules and Messages

Paste everything below the line into Claude Code, opened at the root of the MedSync repo. Before you do, copy the updated kit to `docs/pharmacy/rework/`. Run it after `PROMPT-MEDICINES.md` and `PROMPT-ROSTER.md`: it reuses their rules machinery, roster and licence data.

---

Replace the pharmacy Set-up tabs **Going live, Places, Rules and Messages** with the design in `docs/pharmacy/rework/SETUP-TABS.md`. Build every function it describes, exactly. The bar is **perfect UI and perfect behaviour, at minimal token cost**. Work on a branch `feat/pharmacy-setup-tabs`, and commit after each step.

## Sources of truth (read in this order, and only the parts you need)

1. `docs/pharmacy/rework/SETUP-TABS.md` is the spec (§A Going live, §B Places, §C Rules, §D Messages, §E–§J shared). It overrides the matching PRD and TECH-SPEC rows. Read it by section: `rg -n "^## |^### " SETUP-TABS.md`, then read ranges.
2. The working references are `docs/pharmacy/rework/prototype/going-live.dc.html`, `places.dc.html`, `rules.dc.html` and `messages.dc.html` (about 350–800 lines each).
   - **Never read one whole.** Find the behaviour with `rg -n "<name>"` (e.g. `hoToday`, `fState`, `readingDlg`, `snapSlot`, `textOf`, `applyProp`, `signBtn`, `parts`, `gsm`, `validPhone`, `effStatus`, `phaseIdx`) and read only those ranges.
   - Copy the rule texts and template texts from each `constructor` verbatim.
   - Port the behaviour **function for function**, with the same wording, thresholds, colours and flows. Do not copy markup or inline styles; rebuild with Tide components.
3. TECH-SPEC §0 (repo shape), §4 (action pattern), §6 (UI notes) and §7 (tests). PRD §5 (safety invariants).
4. `DESIGN-medsync.md` (Tide): tokens, type and components only.
5. Already built and to be **reused, not rebuilt**:
   - the rules badges, dialog and two-signature flow from the Medicines tab
   - the roster, licences, attendance and reminders from People and roster
   - the tiles, chips, segmented controls and dialogs in `components/tide`
   - live stock and fridge Realtime from Medicines

## Token discipline (strict)

- **Plan once.** Write `docs/pharmacy/rework/RECON-SETUP.md`: at most 50 lines mapping every table and action in spec §E and §G to a real name, or "create". Then do not re-explore.
- Use `rg -n` before every read. Read line ranges, never whole files over 200 lines. Never re-read a file you just wrote.
- Edit in place with minimal diffs. No rewrites to change a few lines. No refactors outside these four tabs and the shared rules registry.
- No narration between tool calls. No restating the spec. No summaries until the final message.
- Run only the tests touching what you changed, then each tab's suite once per step.
- Use subagents only for step 5, one per tab (4 in parallel). Give each:
  - its spec section
  - the exact folder it owns (`components/pharmacy/setup/<tab>/*`)
  - "do not touch shared derive, rules or tide files"

  Each returns a list of changed files only. Integrate them yourself.

- Docs: update only `docs/pharmacy/HANDOFF.md` (one section). No ADRs or changelogs.

## Hard rules

- **One rules registry** (§C3). Every check in the app reads its numbers from `pharmacy_rules.params`: handover missed, fridge near and out, excursion, expiry warning, order due, price markup, roster limits, SMS caps. Grep for hard-coded copies of these numbers and replace them. A signed change takes effect at once.
- **The database enforces the invariants**, each with a guard test:
  - going live needs both signatures and no open blocker
  - the rule proposer is not the second signer
  - a place with stock can't be closed
  - a store can't be supplied from itself
  - a fridge is at one place at most
  - an out-of-range reading needs a note and creates an excursion
  - SMS is never sent to opted-out numbers, during quiet hours, past the weekly cap or past the budget cap
  - only the owner can change practice and live state
- **Practice mode** is a separate dataset with a "Practice" banner everywhere, wiped on end. Prove it with a test: no practice rows appear in real tables.
- **Secrets:** the SMS API key is stored server-side as a secret, never returned to the client, and shown masked.
- **Phones** are normalised to `+256 7xx xxx xxx`, stored encrypted, and shown masked (`+256 7•• ••• 093`).
- **Don't invent:**
  - Luganda text (a native speaker enters and checks it)
  - supplier phone numbers
  - the Eid dates (from PEOPLE-ROSTER)
  - the HMIS/NDA column mappings: leave them as owner-supplied, and list them in HANDOFF
- **Look:** Tide tokens only. No coloured side or left accent borders. No very dark themes. Status colours always come with a word. Inline bars and gauges, as in the prototype.
- **Copy:** all strings go through signed content as `draft`. Use the spec's wording verbatim, en-GB, with dates like `Tue 3 Nov` and money like `UGX 31.2 m` / `UGX 35,840`.
- **Do not ship:** the fixed date, the fixed actor, the sample data, the jitter ticker, or "Check again" increments that fake progress. "Check again" re-runs the real query.

## Steps

1. **Recon.** Write RECON-SETUP.md (above).
2. **Data.**
   - Migrations for §E, with triggers and RLS.
   - Move the rule texts and params from all three prototypes (Medicines, People, these four) into `pharmacy_rules`, 46+ rules with groups and `shows_on`.
   - Seed: a dev hospital covering every state:
     - blockers open and done
     - an overdue item
     - a missed handover, a handover with differences, an offline device
     - a place with cold stock and no fridge
     - in-range, near-limit and out-of-range fridges, and a typed fridge with a due reading
     - suppliers due in 6 days, and one at a 90 % budget
     - two proposals (one with a signature), an unsigned group
     - an outbox with every status, and opt-outs
3. **Derivations.**
   - Write `lib/pharmacy/derive/setup/*.ts` with the §F pure functions.
   - Unit-test every branch, especially:
     - `smsParts` (GSM-7 vs UCS-2 boundaries 160/153/70/67)
     - `fridgeState` edges (2.0, 2.5, 7.5, 8.0)
     - `readingSlot` at ±90 minutes
     - `handoverToday` at slot + 29 and + 31 minutes
     - `ruleText` pluralising and units
     - `canSecondSign`
     - `readiness%`
     - `normalisePhoneUG`
4. **Actions.**
   - Write `lib/pharmacy/actions/setup/*.ts` with the §G actions, following TECH-SPEC §4. Re-check permissions on the server, and write an audit event for each.
   - SMS scheduler, delivery webhook and STOP webhook, with idempotency keys.
5. **UI** ⇉ (4 subagents): `components/pharmacy/setup/{going-live,places,rules,messages}/*`, following spec §A–§D in order: tiles, filters, grids, open rows, dialogs, empty states and phone layout (≤ 760 px).
6. **Wire-up.**
   - Going live auto items run real queries across Medicines, Places, People and Rules.
   - The Places cold-chain warning feeds the Medicines "No fridge" check.
   - The Places handover chips read the handover sessions.
   - The staff templates in Messages and People › Reminders share one setting.
   - Realtime for fridge readings and the outbox, with a 30 s polling fallback.
7. **Tests.**
   - every §I acceptance item, as Playwright end-to-end tests
   - the SQL guard tests above
   - Playwright at **1440 px and 390 px** on all four tabs: no console errors, no horizontal page scroll, axe clean (WCAG AA), keyboard-only operation of every dialog and inline editor
8. **UI perfection pass.**
   - Run each prototype and your build at 1440 and 390 px. Screenshot every section and every dialog in every state (empty, filled, error, disabled, live).
   - Compare them side by side, and fix every difference in spacing, type, colour, wording, order, states and empty states, until they match.
   - Keep the screenshots out of the repo.
9. **Clean-up.**
   - Delete the old Going live, Places, Rules and Messages code, and the copy keys they no longer use.
   - Add one section to `docs/pharmacy/HANDOFF.md` covering what was built, the defaults taken, and what the owner must supply:
     - the SMS provider and key
     - Luganda texts and checking
     - supplier contacts and budgets
     - the HMIS 105 / NDA columns
     - the second signer's name
     - the go-live date

## Definition of done

- Every function in SETUP-TABS.md works as specified, and every §I item passes.
- There is one rules registry, with no hard-coded thresholds left (show the grep in the final message).
- The old tab code is deleted.
- `pnpm typecheck`, `pnpm lint`, unit tests, SQL guard tests and Playwright (both widths, axe) are all clean.
- The screenshots match the prototypes section by section.

## Final message (≤ 12 lines)

Steps done, the test summary (counts), the hard-coded-threshold grep result, defaults taken, what the owner still needs to supply, and the branch name. Nothing else.
