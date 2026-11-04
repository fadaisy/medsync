# Prompt for Claude Code: replace Stock › Receive a delivery

Paste everything below the line into Claude Code, opened at the root of the MedSync repo. Before you do, copy the updated kit to `docs/pharmacy/rework/`. Run it after `PROMPT-STORE.md`: it shares the shell, chart module, quarantine, dispatch confirmation and rules registry built there.

---

Replace the pharmacy **Stock › Receive a delivery** tab with the design in `docs/pharmacy/rework/RECEIVE.md`. Build every function it describes, exactly:
- the stage board
- the four-step start dialog
- counting with scanning, blind count, recall and serial checks, the price and invoice check, vaccine and cold-chain checks, short-dated approval and photos
- finishing with a witness and a second check
- claims, order detail, editing and chasing
- put away with shelf labels
- receiving figures
- working offline

The bar is **perfect UI and perfect behaviour, at minimal token cost**. Work on a branch `feat/pharmacy-receive`, and commit after each step.

## Sources of truth (read in this order, and only the parts you need)
1. `docs/pharmacy/rework/RECEIVE.md` is the spec:
   - §A board, §B start dialog, §C orders, §D counting, §E after, §F places, §G figures, §H offline
   - §I–§L data, rules, prototype-only, acceptance

   It overrides PRD §6.4 (Receive) and STORE.md §E2. Read it by section: `rg -n "^## |^### " RECEIVE.md`, then read ranges.
2. The working reference is `docs/pharmacy/rework/prototype/receive.dc.html` (about 2,200 lines).
   - **Never read it whole.** Find behaviour with `rg -n "<name>"`, e.g. `info(`, `parseCode`, `scanRaw`, `countPack`, `submitStart`, `openStart`, `askFinish`, `finish(`, `applyCommit`, `goOnline`, `markPut`, `sendStraight`, `openOrder`, `openChase`, `openClaim`, `openLabels`, `ean13`, `checkDigit`, `miniBars`, `stages`, `matchRows`, `coldText`. Read only those ranges.
   - Copy every label, hint, error, word and toast verbatim.
   - Port the logic **function for function**, with the same thresholds and order of checks. Rebuild the markup with Tide components and the STORE chart module.
3. TECH-SPEC §0 (repo shape), §4 (action pattern), §6 (UI notes) and §7 (tests). PRD §5 (safety invariants).
4. `DESIGN-medsync.md` (Tide): tokens, type and components only.
5. Already built and to be **reused, not rebuilt**:
   - the rules registry
   - the roster, for witnesses, second checkers and the in-charge
   - medicines with GTIN, cold, controlled and registration
   - suppliers and lead days (Places)
   - orders (STORE §E1)
   - quarantine, dispatches and their confirmation (STORE §C3)
   - cases
   - the chart module (STORE §B3)
   - the Stock shell and tab bar

## Token discipline (strict)
- **Plan once.** Write `docs/pharmacy/rework/RECON-RECEIVE.md`: at most 50 lines mapping every table in §I and every action to a real name, or "create". Then do not re-explore.
- Use `rg -n` before every read. Read line ranges, never whole files over 200 lines. Never re-read a file you just wrote.
- Edit in place with minimal diffs. No refactors outside the receive folders, the GS1 and barcode utilities, and the offline queue.
- No narration between tool calls. No restating the spec. No summaries until the final message.
- Run only the tests touching what you changed, then the receive suite once per step.
- Use subagents only for step 5, three in parallel. Give each:
  - its spec sections
  - the exact folder it owns
  - "do not touch derive, actions, gs1, barcode, offline or tide"

  Each returns a list of changed files only. The split:
  1. §A board + §B start dialog + §C order dialogs
  2. §D count view
  3. §E after view + §F + §G figures
- Docs: update only `docs/pharmacy/HANDOFF.md` (one section). No ADRs or changelogs.

## Hard rules
- **Nothing moves until finished.** Finishing is one server transaction (`applyCommit`), idempotent on the delivery id:
  - GRN, ledger, place stock, put-away lines, quarantine
  - order received and state
  - witnesses and the second checker
  - the claim
- **The database enforces the invariants,** each with a guard test:
  - **No duplicates:** a delivery reference is unique per supplier or source (abandoned excluded), and a pack serial is unique per GTIN.
  - **Lines that can't go into stock:** an expired line, a recalled batch, VVM stage 3–4 or a tripped freeze indicator, a cold line outside 2–8 °C, or a short-dated line accepted without the in-charge's approval.
  - **Witness and second check:** a controlled line needs a witness who is not the receiver, and a delivery over the limit needs a second checker who is not the receiver.
  - **Order lines** can't be edited below what was received.
  - **Put-away** is refused while a cold line waits.
  - **Claims:** credit received needs a credit note number. Donations, transfers and returns make no claim.
- **Thresholds come from the rules registry** (RECEIVE §J). Grep the receive code for hard-coded 180, 5, 30, 2000000, 1000, 120, 60, 95, 23, 7, 2 and 8 °C, and replace each with the rule.
- **GS1 and barcodes:**
  - `lib/pharmacy/gs1.ts` parses AIs 01, 17, 10 and 21, and pads plain GTINs
  - `lib/pharmacy/barcode.ts` encodes EAN-13 (L/G/R patterns, parity by the first digit) and computes check digits; in-house codes are `200` + a 9-digit sequence + a check digit
  - unit-test both against known codes, and decode the rendered labels in Playwright
- **Offline:**
  - an IndexedDB queue holds deliveries in progress and finished-offline deliveries
  - sync runs on the `online` event
  - conflicts return the delivery to Counting with the reason
  - never a partial commit
  - test it with Playwright's offline mode
- **Photos** go to storage as attachments on the delivery, compressed on the device to about 1600 px. Never store base64 in rows.
- **Messages** (chase, claim) are drafted and copied only. Sending through the Messages provider is a later step: leave a TODO in HANDOFF, not in code.
- **Look:**
  - Tide tokens only, and the STORE shell
  - inputs at least 44 px, with 16 px text on phones and the teal focus ring
  - errors placed on their own fields, with `aria-invalid`
  - option cards as radio groups, and the switch with `role="switch"`
  - no coloured side borders, and no very dark themes (the scan band is light teal)
  - status colours always come with a word
- **Copy:** all strings go through signed content as `draft`. Use the spec's wording verbatim, en-GB, with dates like `4 Nov 2026, 12:40` and money like `UGX 3,105,000`.
- **Do not ship anything in RECEIVE §K:**
  - the seed, localStorage, the sample `hist` and the history notes
  - roles used as people
  - the "Go offline" button and the scan sample chips
  - in-memory photo URLs

## Steps
1. **Recon.** Write RECON-RECEIVE.md (above).
2. **Data.**
   - Migrations for §I, with triggers, RLS and the unique constraints.
   - Seed a dev hospital covering every state:
     - orders due in 3 days and 3 days late
     - a delivery being counted, one finished-offline (queued), one received with differences and a claim, and one abandoned
     - a store with batches waiting to be shelved, including a cold one
     - a recall
     - a medicine with no GTIN
     - a vaccine
     - a dispatch on its way to a ward
     - claims in each state
     - 8 past deliveries per supplier for the figures
3. **Derivations.**
   - Write `lib/pharmacy/derive/receive/*.ts`: `lineInfo` (the port of `info()`: words, problems, units, value, priceDiff, rc, VVM and freeze), `deliveryProblems`, `matchRows`, `orderDue`, `stages`, `claimLines`, `figures` and `supplierStats`.
   - Unit-test every branch, especially:
     - the expiry formats and short-dated edges (179 / 180 days)
     - the price tolerance at ±5 %
     - the invoice tolerance
     - claim values
     - the due date across months
     - the cold-timer thresholds
     - the median and target in the figures
4. **Actions.**
   - Write `lib/pharmacy/actions/receive/*.ts`:
     - `startDelivery`, `editDelivery`, `scanPack`, `linkGtin`
     - `addLines`, `updateLine`, `removeLine`, `approveShortDated`
     - `finishDelivery` (`applyCommit`), `abandonDelivery`
     - `putAway`, `undoPutAway`, `sendStraight`, `assignInHouseCode`
     - `editOrder`, `markChased`
     - `sendClaim`, `creditClaim`
     - `uploadPhoto`, `confirmDispatch` (shared)
   - Follow TECH-SPEC §4. Re-check permissions on the server. Write the ledger and an audit event, idempotent on ids.
5. **UI** ⇉ (3 subagents, split as above).
6. **Wire-up:**
   - the Expected column reads the Main store's orders, and "Record the rest" comes from Orders
   - put-away records feed the Main store's Put away section
   - claims and supplier statistics feed Orders' supplier strip
   - recalls come from Medicines and Controls
   - the in-charge approval is a request to the in-charge's device (Realtime), with a 30 s polling fallback
7. **Tests.**
   - every §L acceptance item, as Playwright end-to-end tests, offline included
   - the SQL guard tests above
   - the barcode decode test
   - Playwright at **1440 px and 390 px**, across the board, the start dialog (each kind, each error), the count view (each line state), the after view, labels, the order detail and edit, chase and the claim:
     - no console errors and no horizontal page scroll
     - axe clean (WCAG AA)
     - keyboard-only operation
8. **UI perfection pass.**
   - Run the prototype and your build at 1440 and 390 px. Screenshot every view and dialog in every state.
   - Compare them side by side. Fix every difference until they match: spacing, type, colour, wording, order, card and chart geometry, and empty and error states.
   - Keep the screenshots out of the repo.
9. **Clean-up.**
   - Delete the old receive code, and the copy keys it no longer uses.
   - Add one section to `docs/pharmacy/HANDOFF.md` covering what was built, the defaults taken, and what the owner must supply:
     - the supplier lead days
     - the receiving targets and limits
     - the HMIS 087 columns
     - the recall feed source
     - the label printer and label size
     - the in-house code prefix
     - the Messages integration for chase and claim

## Definition of done
- Every function in RECEIVE.md works as specified, and every §L item passes.
- Finishing is one idempotent transaction, and offline deliveries commit exactly once.
- There are no hard-coded thresholds and no sample arrays (show the greps).
- The old receive code is deleted.
- `pnpm typecheck`, `pnpm lint`, unit tests, SQL guard tests and Playwright (both widths, axe, offline, barcode decode) are all clean.
- The screenshots match the prototype view by view.

## Final message (≤ 12 lines)
Steps done, the test summary (counts), the greps, defaults taken, what the owner still needs to supply, and the branch name. Nothing else.
