# STORE: Stock › Main store, as designed on 3 Nov 2026

This file specifies the Main store tab. It **overrides**:

- PRD §6.4 (Store: receive, issue, count, order) wherever they differ
- the store rows in TECH-SPEC
- the store part of `prototype/store.js`, which this design supersedes. Receiving a delivery stays as it is for now: it has its own tab.

PRD safety invariants S1–S14 still apply. So do the shared rules in SETUP-TABS.md (status colours, two signatures, toasts, audit).

**The store's job, in the owner's words:** "It receives stock, and then distributes it. It keeps track of stock from all dispensing points. And requisitions from dispensing points reach it." Every feature below serves one of those three.

**The working reference is `prototype/store.dc.html`, a Design-canvas component:**

- The markup uses `{{holes}}`, `<sc-for>` and `<sc-if>`.
- All behaviour lives in `class Component`: `constructor` holds the data and `renderVals()` the logic and handlers.
- Port it **function for function**, with the same wording, thresholds, colours and flows. Rebuild the markup with Tide components.
- Never read the file whole (about 1,500 lines). Find a behaviour with `rg -n` and read only that range.

**Shared:**

- **Route:** `/pharmacy/stock?tab=store&section=<key>`. The tab bar reads Main store · Receive a delivery · Medicines.
- **Page:** muted background `#f6f7f9`, with white cards (radius 22, soft shadow). Font Figtree, ink `#1b2540`, teal `#2dd4bf`, tint `#ccfbf1`, link `#0f766e`, line `#dde1e9`.
- **Colour:** no coloured side or left borders, and no very dark themes. Status colours always come with a word: OK `#dcfce7/#166534`, warning `#fef3c7/#92400e`, bad `#fde2e1/#9f1d1d`, info `#dbeafe/#1e40af`, neutral `#e4e7ee/#4a5574`, teal `#ccfbf1/#0f766e`.
- **Thresholds** are read from the rules registry (`pharmacy_rules.params`, SETUP-TABS §C3), never hard-coded. Each is listed in §K.
- **Every action** writes a ledger row (where stock moves) and an audit event. Toasts are UI feedback only.
- **Vouchers:** RIV for issues, TRF for transfers between places, GRN for receipts, RTS for returns to the store, RTN for returns to the supplier, ADJ for adjustments and losses, CNT for counts. Numbers come from one server-side sequence per prefix.

---

## A. Shell and navigation (`<nav aria-label="Store sections">`, `navGroups`)

1. **Header card:** `Main store · 11 medicines · UGX 8.9 m on hand` (live count and value) and three buttons:
   - Count a shelf (opens §F11)
   - Issue without a requisition (opens §F12)
   - Receive a delivery, the primary teal pill, which links to the Receive tab
   - There is **no description line** under the title (the owner removed it).
2. **Section bar:** a full-width white bar under the header, holding:
   - **Overview**, a plain button
   - **Four group buttons with menus:** Send out ▾, The places ▾, Bring in ▾, Look after the stock ▾
   - **Group button:**
     - Shows a count chip: the sum of its sections' counts, coloured by the most serious one (bad > warning > info > neutral).
     - In the active group, the label reads "Group · Section", e.g. "Send out · Requisitions", on a tint background.
     - The chevron turns when the menu is open.
   - **Menu:** a popover listing that group's sections, each with its own count chip.
     - Choosing a section opens it and closes the menu.
     - Clicking outside or pressing Esc closes it.
     - Use proper `menu` and `menuitem` semantics, with `aria-expanded`.
   - **Groups and sections (counts in brackets):**
     - Send out: Requisitions (open, bad if any urgent), Top-up runs (due today), Dispatches (in transit)
     - The places: Stock everywhere (lines under 7 days), Place balances
     - Bring in: Orders (1 if a draft is unsent), Put away (lines left), Receive a delivery (a link to the tab)
     - Look after the stock: Store stock (out + under 2 months), Expiry (batches at risk), Stock cards, Counts (shelves due), Quarantine and losses (batches waiting), Store conditions
3. **Under 760 px,** the bar becomes a single `<select>` labelled "Section".
4. **The content is full width.** There is no left section list.

## B. Figures and charts (shown first in every section)

Each section opens with a row of **figure tiles**, then a **chart grid**. Both are generated per section (`stat()`, `mkChart()`, and the `if (V === …)` block at the end of `renderVals`).

### B1. Figure tile

- **Contents:**
  - a label (12 px, short)
  - a value (22 px, semibold)
  - a full-width sparkline (12 points, grey line, teal end dot), when there is a series
  - a delta line, with the period first, e.g. "Last week · up 4 points"
- **Delta colour** goes by whether up is good: green `#166534` for good, red `#9f1d1d` for bad, muted otherwise. It is always in words, never colour alone.
- **Clicking a tile** opens its section. Tiles that filter (Store stock: Out, Under 2 months, Too much or not moving) toggle the filter instead, showing a pressed state (teal border on tint).
- **Column width:** 6 tiles fit one row from 150 px each, 4 tiles from 200 px, and 3 tiles from 240 px. The tiles wrap below that.

### B2. Chart card

- **Header:** title (15 px), a short sub-line that says how to read it, and optionally a headline figure on the right.
- **Then:** a legend (only when there are 2 or more series), the plot, and a footer. The footer holds "Show the numbers" (a `<details>` table of every value) and an optional "Section →" link.
- **Cards in a row are equal height.** The footer sticks to the bottom.
- **Grid:** 6 columns, so a card takes a third (2), a half (3), two-thirds (4) or the full width.
  - Below 1,100 px the grid has 2 columns, and halves and thirds take one each.
  - Below 700 px it has 1 column.
- **Interaction:** hover or keyboard focus shows a tooltip on every bar, segment and point. Points and bars can be reached with Tab and have an `aria-label`. A line chart shows a crosshair on hover.

### B3. Chart forms (one renderer each; port the geometry, not the markup)

| Form                      | Used for                                                                                                 | Spec                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column (`colChart`)       | weekly in/out, expiry by month, dispatches per day, lost to expiry                                       | Bars ≤ 24 px wide (64 % of the slot), 4 px rounded data-end, square at the baseline. Stacked segments are separated by a 2 px white gap. Negative values hang below a darker zero line. Grid lines at a "nice" step (1, 2, 2.5, 5 × 10ⁿ), labelled compactly (2.5 m, 100k). X labels every 2nd or 3rd, always including the last.                                    |
| Line (`lineChart`)        | store value, fill rate, stock-card balance (stepped), cold room, room temperature                        | 2 px line, non-scaling. Area wash at 10 % teal, except for temperatures. End dot 10 px with a 2 px white ring; other dots appear on hover. A reference line (target, limit) is solid, with a label. A band (2–8 °C, 2–6 months of stock) is a teal 8 % wash.                                                                                                         |
| Bar rows (`hbar`)         | months of stock, issued per place, unexplained by place, order lines, days since count, losses by reason | Label column, then a track with a 12 px bar (4 px rounded end). **The value sits at the bar's tip** on a white pill, with space reserved at the end of the track so it never clips. Marker lines (2 and 6 months, 30 days, UGX 100,000) are labelled above. Status chip column only when the rows have a state. A row can be clicked (e.g. it opens the stock card). |
| Stacked rows (`stack`)    | days of cover by place, how lines were filled                                                            | One row per place: segments with a 2 px gap and 4 px corners; the count is printed inside when the segment is ≥ 12 % wide; the total is on the right.                                                                                                                                                                                                                |
| Thin segmented bar + list | store value by VEN                                                                                       | A 12 px bar with no text, and below it one row per class: swatch, name, number of medicines, value, share (`<1%` under 1 %).                                                                                                                                                                                                                                         |

**Phones (≤ 600 px):** a bar row stacks as label and chip on one line, with the bar underneath.

**Colours** (validated for colour blindness; do not change them):

- Data: teal `#0d9488`.
- Second series: indigo `#5b6bd6` (issued, lost).
- Status marks: bad `#d03b3b`, warning `#fab219`, good `#0ca30c`, too much `#5b6bd6`, not moving `#b4bccb`.
- VEN, an ordinal ramp: V `#115e59`, E `#0d9488`, N `#14b8a6`.
- Text never takes the data colour.

### B4. Overview (`view = home`)

**Tiles (6):**

| Tile              | Value                                                | Opens        |
| ----------------- | ---------------------------------------------------- | ------------ |
| Store value       | Store value now                                      | Store stock  |
| Filled in full    | Requisition lines issued in full, last complete week | Requisitions |
| Request to issue  | Median time from requisition to issue                | Requisitions |
| Vital in stock    | V medicines with stock, as "n of N"                  | Store stock  |
| Days out of stock | Days out of stock in the last 30 days                | Store stock  |
| Expiry risk       | Value that won't be used before expiry               | Expiry       |

**Charts, in this order and size:**

1. Stock in and out of the store, **half**. Weekly value, 12 weeks: received above the line, issued to places below. The headline is the total issued.
2. Requisition lines filled in full, **half**. A line chart with the 90 % target line.
3. Store value, **third**. End-of-week value. It is derived backwards from today: `value[w−1] = value[w] − in[w] + out[w]`.
4. Issued to each place in the last 30 days, **third**, as ranked bars.
5. Store value by VEN class, **third**.
6. Months of stock in the store, **two-thirds and two rows tall**:
   - every medicine, sorted ascending, with the bars capped at 12
   - status chips: Out, Short (< 2), OK, Too much (> 6), Not moving (> 90 days still)
   - clicking a row opens its stock card
7. Days of cover at each place, **third**. Lines under 7, 7–14 and over 14 days, counting what is in transit.
8. Value expiring in the next 12 months, **third**. Stacked by month: "will be used in time" and "won't be used in time".

**Then "Needs you now":** 8 cards, 4 per row. Each shows its count chip, its top 3 items with an inline action, and "open section →". The cards are:

- Requisitions to pick (Pick)
- About to run out at places (Send n)
- Top-up runs due today (Open)
- On the way to places
- Won't be used before expiry (Decide)
- Shelves due a count (Count)
- To put away
- Order to send (Review)

### B5. Figures and charts per section

| Section               | Tiles                                                                                                           | Charts                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Requisitions          | Waiting to pick (urgent count), Filled in full this month, Request to issue, Lines owed (backorder)             | How each place's lines were filled · this month (stacked rows: in full, part, not at all), two-thirds. Fill rate line, third. |
| Stock everywhere      | Lines under 7 days (filter), Median days of cover, Days out at places this month, Urgent requests this month    | Days of cover at each place, full                                                                                             |
| Top-up runs           | Runs due today, Lines to top up (how many can't be filled in full), Value to send                               | none                                                                                                                          |
| Dispatches            | On the way (filter), Confirmed within 24 h, Received with a difference                                          | Dispatches per day over the last 14 days, full                                                                                |
| Place balances        | Unexplained this month, Places that balance, Cases open                                                         | Unexplained difference by place, with a marker at UGX 100,000, full                                                           |
| Store stock           | Out of stock / Under 2 months / Too much or not moving (all three are filters), Between 2 and 6 months          | Months of stock, two-thirds. VEN, third.                                                                                      |
| Orders                | This order, Budget used (%), Vital lines in the order                                                           | Where the order money goes (lines by cost), full                                                                              |
| Expiry                | Won't be used in 6 months, Batches expiring in 6 months, Lost to expiry over 6 months                           | Value expiring over 12 months, two-thirds. Lost to expiry over 6 months, third.                                               |
| Stock cards           | On hand, Months of stock, Issued in the last 30 days, Received in the last 30 days                              | Balance over time for the chosen medicine: a stepped line with the 2–6 month band, full                                       |
| Counts                | Shelves due a count, Counted right first time (last stock-take, by value), Counted today (waiting for sign-off) | Days since each shelf was counted, marker at 30 days; clicking a shelf opens the count, full                                  |
| Put away              | Lines to put away, Cold chain waiting, Value waiting                                                            | none                                                                                                                          |
| Quarantine and losses | In quarantine, Losses over 6 months, Losses this month                                                          | Losses by reason over 6 months, full                                                                                          |
| Store conditions      | none                                                                                                            | Cold room CR-01 live, with the 2–8 °C band, two-thirds. Store room temperature over 7 days, with the 25 °C limit, third.      |

**All figures are computed from the database** (§E, §F). The prototype's history arrays are sample data (§L).

---

## C. Send out

### C1. Requisitions (`isReq`)

- **The list on the left:** urgent first, then open, then the rest. Each item shows the place, when it was asked, lines, the voucher and a state chip:
  - Waiting to pick (info)
  - Partly issued (warning)
  - Issued · not received yet (teal)
  - Received (OK)
  - Received with a difference (bad)
- **The pick list on the right:** the place, when it was asked, and the reason (urgent requests carry one).
- **Columns:** Medicine · Asked · At the place · In the store · Issue · Take from (first expiry).
  - **At the place:** what the place has, and its days of cover, red under 7 and amber under 14. A need note:
    - "Already at its top-up level, counting what is on the way"
    - "Asks more than it needs: n tops it up" when the request is over 1.5 × the need, or over the need plus one pack
    - "Asks less than it needs" when the request is under half the need
    - "Needs n to top up" otherwise
  - **Issue:** a number input, defaulting to min(asked, on hand).
  - **Take from:** FEFO lines showing bin · batch · expiry · quantity.
  - **Line notes:**
    - "Out in the store. n stay owed (backorder)."
    - "Only n here."
    - "n stay owed (backorder)."
- **Short across requests:** when the same medicine is asked by more than one open requisition and the total is above what is on hand, a warning appears with **Share fairly** (`shareFair`):
  1. Urgent requests first get up to 7 days of cover.
  2. The rest are filled so every place reaches the same days of cover (water-filling, a binary search over days).
  3. The toast states the days reached.
- **Controlled lines** need a witness from the roster before the issue can be made.
- **Issue on a voucher:**
  - disabled when nothing is to be issued, a line is over stock, or the witness is missing
  - takes stock out FEFO and writes the ledger
  - creates a dispatch in transit
  - sets the state to issued, or to partial with the owed quantities; a second issue issues only what is owed
- **Print** prints the pick list only.
- **Confirm receipt:** the place confirms, with an optional "Difference, if any" note. A note sets the state to Received with a difference and opens a case.

### C2. Top-up runs (`isRuns`)

- **Schedule** (from Places): OPD dispensary every day 08:30; Paediatrics Tuesday and Friday 10:00; Ward 3 and Maternity Monday and Thursday 10:00 / 10:30.
- **Each run:** brings every line at that place back to its **top-up level** (set on Medicines), less what is in transit.
- **Chips:**
  - give = need: teal
  - store short: warning, "n of m (store short)"
  - store out: bad
- **Buttons:** "Make the pick list and send" when due today, "Send early" otherwise. Either one creates a Top-up run dispatch.
- A run that is already sent shows "Sent on RIV-…".

### C3. Dispatches (`isDisp`)

- **Lists everything that left the store or moved between places.** Each row shows the voucher, from → to, the kind (Requisition, Top-up run, Urgent send, Transfer, Straight from delivery, Issue without a requisition), the time and the lines.
- **States:** On the way, Received, Received with a difference.
- **In transit:** **Confirm (as <place>)**, with an optional difference note.
- **Stock counts at the place only once it is confirmed.** Until then it shows as "on the way" everywhere (days of cover, needs, runs), so nothing is counted twice.

## D. The places

### D1. Stock everywhere (`isAll`)

- **About to run out:** every place × line with 7 days or fewer of cover, counting what is in transit. Sorted by days left.
  - **Chip:** "Out" or "n days", bad under 3 days, warning otherwise.
  - **Sub-line:** what is there, what is on the way, use per month, and the top-up level.
    - When the store is out: "the store is out too, n on order".
    - When another place has spare: "x has spare".
  - **Send n now** creates an Urgent send dispatch for min(need, on hand). It is disabled, reading "Store is out", when the store has none.
- **Stock everywhere matrix:** medicines × (store + 4 places). Each cell is coloured by days of cover. Clicking a cell sends to that place.
- **Move between places:**
  - A transfer is suggested when one place holds over 60 days and above its top-up level, and another has under 14 days and a need.
  - The quantity is min(excess, need).
  - **Arrange** creates a TRF dispatch from the place to the place.
  - It stays listed as "Arranged on TRF-… · waiting for …" after the need is met.
- **Coming back to the store:** returns from places (short-dated, not moving).
  - **Accept into the store** adds an RTS batch on the medicine's bin, first in line for the next pick, and takes it off the place.

### D2. Place balances (`isBooks`)

- **For each place, this month:**
  - **Columns:** At the start · Sent by the store · Dispensed or given · On the shelf now · Unexplained.
  - **Unexplained** = start + received − used − sent out − shelf.
  - **Received** counts only confirmed dispatches.
  - **Sent out** includes transfers out and returns accepted by the store.
- **Gap chip:** bad over UGX 100,000 or for any controlled medicine, warning above 0, otherwise "Balances".
- **Open a case** shows on a bad gap and notifies the in-charge and the ward in-charge. The row then shows "Case open".

## E. Bring in

### E1. Orders (`isOrder`)

- **Orders list:** the NMS cycle (draft, then sent), a JMS top-up with partial delivery (with "Record the rest", which goes to Receive), and closed cycles.
  - **Supplier strip:** NMS fills 86 % in 23 days on average; JMS fills 67 % so far, promised in 7 days.
  - These figures are computed from the GRNs against the orders.
- **Next order to NMS:** each line is filled to **4 months of use** (Rules › Ordering), less what is here and what is on order, rounded up to whole packs.
  - **Use per month:** the last 3 months, adjusted for days out of stock.
  - Medicines not moving for over 90 days are left out.
  - **Columns:** Medicine · VEN · Use / month · Here · On order · Months of stock · Order · Cost · Why.
- **Budget:**
  - The budget input shows the total, and "within budget" or "UGX n over".
  - **Trim to the budget:** trims N lines first, then E, down to 2 months. V lines are never cut.
  - If it is still over: "Still over after trimming N and E to 2 months. V lines are never cut: raise the budget or ask for an emergency order."
- **Send** locks the order: "Order sent to NMS. It shows as Sent until the delivery is received."

### E2. Put away (`isPut`)

- **Lines from today's GRN:** each goes to the bin where the medicine already is.
- **Cold-chain first:** no other line can be put away while a cold line is waiting ("Cold-chain first: put the insulin in CR-01.").
- **Send n straight to <place>:** when a place has under 14 days and a need, part of the delivery goes out directly on a voucher and is never shelved. The ledger shows both the GRN in and the RIV out.
- **Undo** is allowed for the same session.

## F. Look after the stock

### F1. Store stock (`isHealth`)

- **Table:** Medicine (opens the stock card) · VEN · Here · Use / month · Months of stock (bar) · Last moved · State.
- **States:** Out; No movement (> 90 days); Under 2 months; Over 6 months; OK.
- The tiles filter it (§B5).

### F2. Expiry (`isExp`)

- **Batches expiring within 6 months.** Risk = qty − (use per month × months to expiry).
- **Chips:**
  - expiry ≤ 3 months: bad; otherwise warning
  - risk: "n won't be used in time · UGX" (bad), or "Will be used in time at n a month" (OK)
- **Actions:**
  - **Move n to <place>:** the place that uses it fastest and is short; a short-dated move on an RIV.
  - **Issue this batch first.**
  - **Return n to the supplier:** RTN, with credit asked.
  - After one is recorded, the row shows what was done.

### F3. Stock cards (`isCard`)

- **Pick a medicine.** The header shows balance, use a month, months of stock and value, then batch chips.
- **The ledger:** date · ref · from / to · in · out · balance · by, sorted newest first.
  - The running balance is worked back from today.
  - Count rows show "0 diff" when they match.
- **The chart** (§B5) is the same ledger as a stepped line.

### F4. Counts (`isCount`)

- **Shelves:** A Oral antibiotics and antimalarials, B Injectables, C Tablets, D Oral liquids and sachets, CR-01 Cold room, CD-1 Controlled cupboard (double lock).
- **Due:** after 30 days; CD-1 daily. Each shelf shows its due chip or "Counted n days ago", with **Count**.
- **Blind count dialog** (§F11): the expected quantity is shown only after saving.
  - A difference worth over **UGX 50,000** (Rules › Stock) needs the **in-charge's sign-off** before it is posted.
  - Otherwise it posts a CNT ledger row.
- **Full stock-take:**
  1. **Start** begins it; the store keeps issuing.
  2. **Close** is refused until every shelf is counted ("Count every shelf first.") and every sign-off is done.
  3. Closing files the report in Records.

### F5. Quarantine and losses (`isQuar`)

- **Quarantine:** expired, recalled and rejected batches, kept on the Q-shelf. Nothing there can be issued.
  - Each batch leaves one of two ways:
    - **Destroy, with a witness:** the witness is required ("Choose the witness for the destruction.").
    - **Return to the supplier:** credit note asked.
  - Both write it off, with its value, into the losses register.
- **Losses and adjustments:** a register of date, medicine, batch, quantity, reason, note and value, with the total this month.
  - **Record a loss** (§F13).
  - **Theft, or any controlled medicine, opens a case.**

### F6. Store conditions (`isCond`)

- **Store room:** readings at 08:00 and 14:00 of temperature (°C) and humidity (%).
  - **Limits** (Rules › Stock): below 25 °C (amber over 24) and below 60 % humidity (amber over 55).
  - **Out-of-limit save:** "Saved. Too warm / damp: the in-charge is told. Check the fan and the windows."
  - The month line reads "n of n readings inside the limits".
- **Cold room CR-01:** a live sensor reading, with its state:
  - In range: 2.5–7.5 °C
  - Near limit: 2–2.5 or 7.5–8 °C
  - Out of range: below 2 or above 8 °C
- It also shows today's minimum and maximum, the cold-chain lines kept there, and a link to the cold chain in Places.

### F11–F13. Dialogs

- **F11. Count a shelf:**
  - **Pick the shelf**, with due shelves marked.
  - **Counting:** for each batch, show the bin, batch number, expiry and an input. "Type a count for every batch, 0 if none."
  - **Save** reveals each line as "Matches" or "±n · UGX", plus a summary: matches / posted / needs sign-off.
- **F12. Issue without a requisition** ("For an emergency only. It still gets a voucher, and the place is asked to confirm receipt."):
  - **Fields:**
    - To: places, including the EPI clinic
    - Why: Emergency at night / Patient waiting, the place is out / Theatre case / Other
    - Medicine
    - How many, showing "n here" and the FEFO take
    - Witness, for controlled lines
  - **Errors:**
    - "Choose a medicine."
    - "Type how many."
    - "Only n in the store."
    - "Controlled: choose the witness."
  - **On save:** creates an RIV, a dispatch in transit and an issued requisition record. One id links all three.
- **F13. Record a loss:**
  - **Fields:** medicine → batch (with quantity) → how many → why (Damaged, Broken, Spoilt (heat or damp), Missing (theft suspected), Other) → what happened (required).
  - **Errors:**
    - "Choose the medicine and batch."
    - "Type how many."
    - "Only n in that batch."
    - "Say what happened."
  - **On save:** posts an ADJ. Theft or a controlled medicine opens a case.

---

## G. Data model (map onto existing tables first; see TECH-SPEC §0)

| Table                 | Columns                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_ledger`        | Existing. Every movement: `med_id`, `batch_id`, `place_id` (store or place), `delta`, `ref` (voucher), `party`, `by`, `witness_id`, `at`                                                           |
| `batches`             | Existing: `med_id`, `no`, `expiry`, `bin`, `place_id`, `qty`, `status` (ok, quarantine)                                                                                                            |
| `requisitions`        | `place_id`, `asked_at`, `urgent`, `reason`, `state` (open, partial, issued, received, diff), `voucher`, `diff_note`, `received_at`; plus `requisition_lines` (`med_id`, `asked`, `issued`, `owed`) |
| `dispatches`          | `voucher`, `from_place_id`, `to_place_id`, `kind`, `requisition_id`, `status` (transit, received, diff), `sent_at`, `received_at`, `note`; plus `dispatch_lines` (`med_id`, `batch_id`, `qty`)     |
| `place_levels`        | Per place × medicine: `top_up_level` (from Medicines), `use_per_month` (derived)                                                                                                                   |
| `topup_runs`          | `place_id`, `days` (weekdays), `time`; and `topup_run_log` (`run_id`, `on`, `voucher`)                                                                                                             |
| `returns_to_store`    | `place_id`, `med_id`, `qty`, `expiry`, `reason`, `status`, `accepted_ref`                                                                                                                          |
| `orders`              | `supplier_id`, `cycle`, `status` (draft, sent, part, closed), `budget_ugx`, `sent_at`; plus `order_lines` (`med_id`, `qty`, `cost`, `why`, `trimmed`)                                              |
| `shelves`             | `code`, `name`, `count_every_days`, `last_counted_at`; plus `counts` (`shelf_id`, `by`, `at`, `diff_value`, `needs_sign`, `signed_by`) and `count_lines`; plus `stocktakes`                        |
| `quarantine`          | A batch with `status = quarantine`, `why`, `decided` (destroy or return), `witness_id`, `decided_at`                                                                                               |
| `losses`              | `batch_id`, `qty`, `reason`, `note`, `value_ugx`, `case_id`                                                                                                                                        |
| `store_room_readings` | `at`, `temp_c`, `humidity`, `by`                                                                                                                                                                   |
| `place_balance_month` | A view: opening, received (confirmed), used, sent out, shelf, unexplained, per place and month                                                                                                     |
| `cases`               | Existing (Controls › Investigations). Opened by gaps, receipt differences, theft and controlled-drug losses                                                                                        |

## H. Derivations (pure, unit-tested; port from `renderVals`)

- **Stock:** `onHand`, `mosOf`, `stateOf`, `fefo(batches, qty)`, `takeOut`.
- **Places:** `transitTo(med, place)`, `daysAt(med, place)` (including transit), `needAt(med, place)`, `lowList(≤ 7 days)`, `transfers` (> 60 days with excess → < 14 days with need), `runLines(place)`.
- **Requisitions:** `lineQtyAsked` (owed after a partial), `needNote`, `shortMeds`, `shareFair` (urgent 7 days first, then water-filling), `canIssue`, `fillRate(week)`, `turnaround`.
- **Place balances:** `placeBalance(place, month)`.
- **Orders:** `suggest(med)` = ceil((use × maxMonths − here − onOrder) / pack) × pack, `trimToBudget` (N, then E, to 2 months, never V), `budgetPct`, `supplierFillRate`, `supplierLeadDays`.
- **Expiry:** `expRows` (≤ 6 months), `riskQty`, `bestPlace`, `expByMonth(12)`.
- **Counts:** `shelfDue`, `countDiffValue`, `needsSignOff` (> UGX 50,000).
- **Conditions:** `roomState`, `coldState`.
- **Statistics:**
  - `storeValueByWeek`, worked backwards from in/out
  - `inOutByWeek`, `issuedByPlace(30 d)`, `coverBuckets(place)`, `venSplit`, `availabilityV`, `stockOutDays`
  - `dispatchesPerDay`, `confirmedWithin24h`, `lossesByReason`
- **Chart geometry** (one shared module):
  - `niceStep`, `colChart`, `lineChart` (with stepped), `hbar` (value at tip)
  - `segments`, `tipPosition`

## I. Server actions

- **Requisitions:** `issueRequisition(lines, witness)` (FEFO server-side), `shareFairly`, `confirmReceipt(note)`.
- **Movements and runs:**
  - `sendUrgent(place, med, qty)`, `sendTopUpRun(place)`
  - `arrangeTransfer(from, to, med, qty)`, `confirmDispatch(note)`, `acceptReturn`
- **Cases:** `openBalanceCase(place)`.
- **Orders:** `setOrderQty`, `setBudget`, `trimToBudget`, `sendOrder`.
- **Put away:** `putAway(line, bin)` (refused while a cold line waits), `sendStraight(line, place, qty)`.
- **Expiry:** `expiryAction(batch, move|first|return)`.
- **Counts:** `startCount(shelf)`, `saveCount(lines)` (blind), `signOffCount`, `startStocktake`, `closeStocktake`.
- **Quarantine and losses:** `quarantineDecide(batch, destroy|return, witness)`, `recordLoss`.
- **Readings and emergency issues:** `recordRoomReading`, `issueWithoutRequisition`.
- **Every action:**
  - re-checks permissions on the server
  - writes the ledger and an audit event
  - is idempotent on its voucher number

## J. Permissions

| Actor                           | Can                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Store keeper                    | Everything operational: issue, runs, transfers, put away, counts, expiry actions, losses, readings, order drafts |
| Pharmacy in-charge              | Everything, plus: signs off counts over UGX 50,000, closes a stock-take, sends the order, opens and closes cases |
| Pharmacist (store duty)         | Issue, runs, put away, counts, readings. Can witness.                                                            |
| Place staff (via their own tab) | Raise requisitions, confirm receipts, propose returns                                                            |
| Witness                         | Any pharmacist on duty from the roster, other than the person issuing                                            |

## K. Rules used (from the registry; never hard-coded)

| Group      | Rules                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordering   | months to order to (4), short under 2 months, too much over 6, not moving after 90 days, use = the last 3 months adjusted for days out, trim to 2 months, trim order N → E (never V)        |
| Rationing  | urgent first up to 7 days, then equal days of cover                                                                                                                                         |
| Places     | running out ≤ 7 days, the transfer suggestion (> 60 days with excess → < 14 days), the days-of-cover colours (7 and 14)                                                                     |
| Stock      | count every 30 days, controlled cupboard daily, count sign-off over UGX 50,000, room limits 25 °C (warn 24) and 60 % humidity (warn 55), expiry window 6 months, expiry chip bad ≤ 3 months |
| Controls   | a balance case over UGX 100,000 or any controlled medicine, theft opens a case, a witness for controlled issues and destruction                                                             |
| Cold chain | 2–8 °C, near limit within 0.5 °C (from Places)                                                                                                                                              |
| Targets    | requisition fill target 90 %                                                                                                                                                                |

## L. Prototype-only (do not ship)

- The fixed date `2026-11-03`, the actor `Moses Wanyama` (store keeper) and the in-charge `Grace Namutebi`.
- **Sample data:**
  - the 11 medicines, place stock, batches, requisitions r1–r4, the generated ledger, and the dispatches d0/d1
  - the returns, quarantine batches, losses and room readings
  - the orders and the supplier performance figures
  - the place-balance targets (`TGT`, `USED`, `RECV0`)
- **All history arrays in the statistics block:**
  - `OUTW` factors, `INW`, `FILL`, `TAT`, `AVAIL`, `OUTD`
  - `RQ0`, the `DN` dispatch counts, `LOST`, `REAS`, `ROOMH`
  - "Days out at places 14", "Urgent 2 of 11", "Confirmed within 24 h 92 %", "Counted right first time 98.4 %"
- **The cold-room jitter ticker and `crHist`:** use Realtime from the sensor table.
- **The fixed voucher counter `nextRiv`:** use the server sequence.
- Seed fixtures go only in `scripts/seed-pharmacy-dev.ts`.

## M. Acceptance (add to the PRD scenarios)

1. **FEFO:** issuing takes the earliest expiry first, across batches, and the pick list shows exactly those bins.
2. **Partial issue:** issuing less leaves owed lines. The next issue offers only what is owed, and the state goes partial → issued.
3. **Share fairly:** with 2 open requests over stock, the urgent one gets up to 7 days first, then both reach equal days of cover. The total never exceeds stock.
4. **Controlled lines:** they can't be issued, destroyed or lost without a witness, and the witness is not the issuer.
5. **A dispatch** adds to a place only on confirmation. While in transit, it counts as "on the way" in days of cover, needs and runs, never twice.
6. **A top-up run** sends exactly top-up level − on hand − in transit, limited by the store, and marks short lines.
7. **The transfer suggestion** appears and disappears with the 60 / 14-day rule. Arranging one creates a TRF from place to place.
8. **Place balances:** a confirmed dispatch moves "Sent by the store", and a gap over UGX 100,000 offers a case.
9. **Order:** the suggestion follows the formula. Trim cuts N, then E, to 2 months and never V, and says so when still over.
10. **Put away:** non-cold lines are refused while a cold line waits. "Send straight" writes the GRN and the RIV.
11. **Count:** blind until saved, a difference over UGX 50,000 needs the in-charge's sign-off, and a stock-take can't close early.
12. **Loss:** theft or a controlled medicine opens a case, and the value is written off.
13. **Statistics:**
    - every tile and chart matches a SQL check on the same data
    - "Show the numbers" lists the exact values
    - the store value line ends at the live value
14. **Navigation:**
    - the group menus open and close by mouse and keyboard (Esc closes, focus returns)
    - the counts match the sections
    - at ≤ 760 px the select replaces the bar
15. **At 1,440 px and 390 px:**
    - no horizontal page scroll, and no console errors
    - axe is clean (WCAG AA)
    - every chart mark can be reached by keyboard and has a label
    - cards in a row are equal height
