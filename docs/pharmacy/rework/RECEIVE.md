# RECEIVE: Stock › Receive a delivery, as designed on 4 Nov 2026

This file specifies the Receive tab. It **overrides**:
- PRD §6.4 (Receive) and the receive rows in TECH-SPEC
- the receive part of `prototype/store.js`
- the Put away section of STORE.md §E2: putting away is done here, and the Main store's Put away section reads the same records

PRD safety invariants S1–S14 still apply. So do the shared rules in SETUP-TABS.md (status colours, toasts, audit) and the look of STORE.md (shell, cards, chips, charts).

**The working reference is `prototype/receive.dc.html`, a Design-canvas component:**
- The markup uses `{{holes}}`, `<sc-for>` and `<sc-if>`.
- All behaviour lives in `class Component`: `seed()` holds the sample data, `info(line, delivery, world)` works out one line, and `renderVals()` holds the view models and handlers.
- Port it **function for function**, with the same wording, thresholds, colours and flows. Rebuild the markup with Tide components.
- Never read the file whole (about 2,200 lines). Find a behaviour with `rg -n` and read only that range.

**Shared:**
- **Route:** `/pharmacy/stock?tab=receive`, with `&delivery=<id>` for the count and after views. The tab bar reads Main store · Receive a delivery (with the number of things waiting) · Medicines.
- **Page:**
  - The app rail on the left, with Stock active in navy.
  - Title "Stock" (36 px), with the place picker ("Working at"), + Start and Emergency on the right.
  - Muted background `#f6f7f9`, with white cards (radius 22, soft shadow).
- **Colour:** no coloured side or left borders, and no very dark themes. Status colours always come with a word.
- **Everything is per place.** A place with `direct` receiving (Main store, A&E) receives from suppliers. Every other place only confirms what the Main store sends (§F).
- **Thresholds** come from the rules registry (§J), never hard-coded.
- **Every action** writes the ledger where stock moves, and an audit event.
- **Nothing moves until a delivery is finished.** Counting saves as you go, with no stock effect.

---

## A. The board (Receive home)
1. **Header card:** "Receive · Main store · 2 orders expected · 2 things to do", the line "Everything arriving here, in one list. Stock moves only when you finish a delivery.", and the primary **Receive a delivery** button.
2. **Stage board:** one grey column per stage, each with a number, title, count chip and one-line note.
   - **For a receiving place:** 1 Expected → 2 Counting → 3 To put away → 4 Received. An **On the way** column comes first when the Main store has sent this place something.
   - **For other places:** On the way → Received.
   - **Layout:** 4 columns, 2 below 1,100 px, 1 below 640 px.
   - **Empty columns** show a dashed box with a line, e.g. "Everything is shelved."
3. **Cards (one per item):** reference (mono) and a status tag at the top, then title and sub-line, then up to two buttons. Only work already in progress ("Carry on counting", "Put away", "Confirm what arrived") is the primary teal; everything else is outlined.
   - **Expected (orders):**
     - **Due tag:** "Due in n days" (info), "Due today" (warning), "n days late" (bad).
     - **Sub-line:** state · lines still expected · "chased <date>" once it has been chased.
     - **Link:** "See the order in detail · edit" (§C).
     - **Buttons:** **Receive** (Sent) or **Record the rest** (Partly delivered). Late orders and orders due today also get **Chase the supplier** (§C3).
   - **Counting:**
     - Tag "Counting", or the kind for a non-order receipt (teal: Donation, From another facility, Return from a ward).
     - Sub-line "Arrived … · n lines counted".
     - A delivery saved offline shows "Waiting for the network" and has no button (§H).
   - **To put away:** "n batches waiting for a shelf", with **Put away**.
   - **Received:**
     - Supplier deliveries: GRN · date · "n differences" or "every line matched". Tag Received (OK), or Abandoned (neutral) with the reason. **Open** goes to the after view.
     - Confirmed dispatches (places only): Received (OK), or Received with a difference (bad) with the note.
4. **Claims to suppliers:** a card listing every claim (§E2): id, supplier, state tag (Draft warning / Sent info / Credit received OK), note number, lines, total, and **Send the claim** or **Credit received**.
5. **Receiving figures:** Main store only (§G).
6. **Received without a current registration:** for the in-charge. It lists each such line with the reason given.

## B. Receive a delivery (one dialog; every door opens it)
The doors are: + Start › Receive a delivery, the header button, an order's Receive / Record the rest / Receive against it, and Medicines › Receive (which pre-adds that medicine as a line).

Four numbered sections, each with an `h3`. Fields are 44 px tall with 13 px semibold labels, helper text under the field, a teal focus ring, and drop-downs with a custom chevron. **Errors outline the field in red and show the message under it**, with `aria-invalid`. Errors that belong to no field show at the bottom.

1. **What arrived:** four option cards in a radio group, each with an icon, title and one line:
   - Supplier delivery
   - Donation
   - From another facility
   - Return from a ward

   This section is hidden when editing.
2. **Supplier and order** (or Donor / Facility / Ward or unit):
   - **Supplier:** option cards, one per supplier, each showing "n orders open" or "No order open".
     - Choosing a supplier shows **only that supplier's** open orders as cards, with the due tag and lines still expected, plus a "No order" card. It pre-selects the supplier's first open order.
     - Opened from an order, the supplier and order are locked.
   - **Donation / facility:** a text input with an example placeholder ("e.g. MSF Uganda…", "e.g. Kiruddu National Referral Hospital"), and a one-line explanation of how that kind is handled.
   - **Return from a ward:** a select of the other places.
3. **Paperwork:**
   - **Reference:** the label follows the kind: Delivery note number / Donation letter or reference / Their transfer voucher number / Return slip number. It shows an example placeholder and a hint.
   - **Arrived:** a native date input and time input, defaulting to now. Under them: "n min ago" and a **Now** chip.
4. **Who brought it** (optional): deliverer's name, and vehicle number plate (uppercase, "UBK 123X").

Then a **Count blind** switch (`role="switch"`) with its explanation. The footer has a hint: "The order's lines will be ready to count." or "You add lines by scanning or typing."

**Validation, with the error placed on its field:**
- "Choose the supplier." / "Give the donor." / "Give the facility it came from." / "Choose the ward or unit."
- "Type the delivery note number." / "Type the reference on the paperwork."
- "Give the date and time it arrived." / "The arrival time is in the future."
- **Duplicate:** the same supplier (or the same source) with the same reference, unless abandoned, gives "This delivery note is already recorded for this supplier, so the stock cannot come in twice." with **Open that delivery**. The database enforces it too.

**Starting** creates the delivery in `counting`, with the order's unfinished lines pre-added as lines waiting to be counted, and opens the count view.

## C. Orders: detail, edit, due and chase
1. **Order in detail** (`openOrder`), from the Expected card:
   - **Header:** "Sent <date> · due <date> (due in n days) · <state> · changed <date>".
   - **One row per line:** medicine (with pack size, 2–8 °C, controlled) · Ordered (packs) · Arrived · Still to come ("All in" in green) · Price a pack · Value. Then the order value.
   - **Buttons:** Close, **Edit the order** (unless closed) and **Receive against it**.
2. **Edit the order:**
   - Each line's packs and price become inputs. ✕ removes a line that has nothing received.
   - **Add a line:** a medicine not already on the order, packs, and the price (pre-filled with the usual price).
   - **Save:**
     - Refused if a line is empty or below what already arrived ("…ordered can't be less than the 25 packs that already arrived."), or if the order is left with no lines.
     - Sets `edited_on`, and recomputes the state (sent / part / closed).
     - Toast: "Order changed. Send the change to <supplier> too: they are not told automatically."
3. **Due and chase:**
   - **Due date:** `sent_on + lead days` (NMS 23, JMS 7, local 2; from Rules).
   - **Chase the supplier** opens an editable message:
     - It names the order, when it was sent and when it was due, and lists the outstanding lines and packs.
     - Buttons: **Copy the message** (clipboard) and **Mark as chased**, which sets `chased_on`.
   - Sending by email or SMS is a later integration (Messages). Do not send automatically.

## D. Counting a delivery (count view)
**Header card:** "‹ Receive", "Counting DN-20418 · A local wholesaler", a **Blind count** tag when it is on, and "Nothing is in stock until you add it. Everything here saves as you go."

### D1. Lines card
- **Cold-chain timer**, when any line is cold: "Cold lines arrived 12 min ago. Into the fridge within 30 min." It turns amber at two-thirds of the limit and red past it, reading "…over the 30 min limit. Put them in the fridge now, then finish counting." It is driven by a 30 s tick.
- **Scan band** (light teal, not dark): "Scan the next pack, or type a name", a 44 px input, **Read**, and **Pick from the catalogue (Ctrl K)**.
  - **GS1 parsing** (`parseCode`):
    - application identifiers `(01)` GTIN, `(17)` expiry YYMMDD (where DD 00 means month only), `(10)` batch and `(21)` serial
    - plain 8–14 digit codes are padded to a 14-digit GTIN
    - text that isn't a code opens the picker with it as the search
  - **Unknown GTIN:** "This barcode is new here. Which medicine is on the pack? It is linked for this hospital only, nothing is guessed." Choose the medicine, then **Link it and add the line**.
  - **The same pack again** (same medicine and batch) adds one to that line's packs.
  - **Serial already seen:** the pack is refused with "This pack was already scanned (serial …, on DN-…). The same serial twice can mean a copied pack: set it aside and tell the in-charge. It was not counted."
  - **A batch on a recall list** is flagged as soon as it's scanned, and its line opens.
  - A line opens by itself when the medicine is cold, a vaccine, has a lapsed registration, or is on recall, or when the scan lacks the batch or expiry, or when the batch is short-dated.
- **Picker:** search the medicines and tick several. **Not stocked yet? Add it** makes a local line (generic name, strength, unit), reviewed in Set-up › Medicines.
- **A line:** number, name, tags (2–8 °C, Controlled, Registration lapsed, Local line, Vaccine · VVM), the source (Scanned, Picked, Typed, From the order), **Change** / **Count**, and **Remove**.
  - **Facts:**
    - "Into stock 12 × 100 = 1,200 tablets", batch, expiry, not accepted, arrival temperature
    - before counting: "On the order n packs, not counted yet", or with blind count on: "count it first, the quantity stays hidden"
  - **Words**, with caution words amber:
    - Matches · n packs fewer / more than the note · n packs short of the order · Not on the order
    - Expired · Expires in under 180 days · Damaged · Wrong product · Cold chain broken
    - Batch on recall · Price n% above / below the order · VVM stage n: do not use · Freeze indicator tripped
- **Edit panel:**
  - **Fields:** Batch · Expiry (2028-06, 2028-06-30, 06/2028 or 30/06/2028) · Packs counted · Per pack · On the note (packs) · Cost per pack, UGX.
    - With blind count on, "On the note" only appears after the line is counted, and the "All n packs arrived" chip is hidden.
  - **Notes:** cold arrival inside or outside 2–8 °C, expired, short expiry with the months left, an unusual pack size, the price difference against the order (or the usual price), a recall notice, and VVM or freeze.
  - **Cold line:** the arrival temperature from the cool box.
  - **Vaccine:**
    - the arrival temperature
    - the **VVM stage**: chips Stage 1 · use, Stage 2 · use, Stage 3 · discard, Stage 4 · discard
    - the **freeze indicator**: Fine, not frozen / Tripped
  - **Short-dated:**
    - Decide: Accept / Accept and tell the supplier / Reject.
    - **Accepting needs the in-charge's approval**: a select, "Waiting for approval" / "Approved by the Pharmacy in-charge". The real build makes this an approval request to the in-charge's device.
  - **Registration lapsed:** why it is received (Donated stock, No registered alternative could be had, Registration renewal pending (supplier's letter), Other (with text)).
  - **Some are not accepted:**
    - packs not accepted
    - why (Damaged, Wrong product, Expired, Rejected as short-dated, Batch on recall, Cold chain broken, Other)
    - where they go: Back with the driver / Keep in quarantine
  - **Reject all of it:** shown when the line is expired, cold chain broken, on recall, VVM 3–4 or freeze tripped. It rejects every pack into quarantine with the right reason.

### D2. The delivery card (right column)
- **Details:** Into, Arrived, Order (supplier deliveries only), Kind, Brought by, and **Change** (reopens §B in edit mode).
- **Invoice** (supplier deliveries): the invoice number and the invoice total in UGX. Then a **three-way check**:
  - "Prices match the order", or "n lines are priced differently from the order"
  - "Counts match the delivery note", or "n line(s) differ…"
  - "Invoice matches the count", or "Invoice is UGX n more / less than what was counted" (tolerance: 1 % or UGX 1,000), or "No invoice entered yet"
- **Photos:** **+ Delivery note**, **+ Invoice** and **+ Damage** (camera on phones), with thumbnails. These are stored as attachments on the delivery (§I). The prototype keeps them in memory only.
- **Summary:** "n lines · n units · UGX n".
- **Still to finish:** every blocking problem, each a link that opens its line.
- **Add n lines to stock** is disabled until there are no problems and at least one line is counted. When offline it reads "Save on this device".
- **Finish later** and **Abandon this delivery** (a reason is required).
- **Still owed on the order:** hidden while counting blind.

### D3. Problems that block finishing (`info().problems`)
- give the packs, the per-pack quantity, the batch or the expiry
- the expiry is in the wrong format
- the line has expired (reject it)
- give the cold arrival temperature
- the cold chain was broken
- the line is short-dated with no decision yet
- a short-dated acceptance has no approval
- a lapsed registration has no reason, or "other" has no text
- more are rejected than were counted
- a rejection has no reason
- the batch is on recall
- the VVM stage isn't recorded, or is at 3–4
- the freeze indicator isn't checked, or tripped

### D4. Finishing (`askFinish` → `finish` → `applyCommit`)
1. **Witness and second check, in one dialog:**
   - Every controlled line needs a witness on duty who is not the receiver.
   - A delivery worth more than **UGX 2,000,000** (Rules › Receiving) needs **a second person to check the count**: "Count checked by". The title and lead text change to suit.
   - Errors: "Each controlled line needs its witness." and "Choose who checked the count."
2. **One transaction (`applyCommit`):**
   - the GRN number (server sequence)
   - drop uncounted lines, and freeze what was owed
   - add accepted units to the place's stock
   - at a store, create a put-away line per batch, at the medicine's usual shelf
   - put rejected-and-kept stock into quarantine
   - add the accepted packs to the order lines, then set the order to part or closed
   - store the witnesses and the second checker
   - state `received`, with `finished` and `grn`
3. **Supplier claim:** created automatically, for supplier deliveries only (§E2).
4. **Toast:** "Added to Main store. Put each batch on its shelf next." plus "A claim to NMS is drafted for UGX n." when one is made.

## E. After receiving (after view)
### E1. Put away
- Cold-chain lines are listed first. A non-cold line can't be put away while a cold line waits: "Cold-chain first: put the oxytocin in CR-01."
- **Each batch:** the shelf code (uppercase), **Mark put away**, and "Already on A-03" or "New on this shelf". A shelf code given to a medicine with none becomes its usual shelf.
- **Send n straight to <place>:** when a place is short and the line isn't controlled, part of the stock is dispatched on a new RIV, and joins the place's stock on confirmation.
- **Undo**, for the same session.
- When every line is shelved, `shelved_at` is set; it feeds §G.
- **Print shelf labels:**
  - **One label per batch:** shelf code (large), medicine, batch · expiry · quantity, and a real **EAN-13 barcode** (bars plus digits), drawn from the GTIN.
  - **A medicine with no GTIN** gets an **in-house code**: `200` + a 9-digit sequence + a check digit. It is saved on the medicine, so the label scans next time. Toast: "No barcode on Metformin <code>: it now has an in-house code. Scanning the label counts it next time."
  - Printable (print area only).

### E2. Papers, claims, what moved
- **Goods received note:**
  - Facility, supplier, note, arrival, place, deliverer, vehicle and GRN.
  - **Lines:** product, batch, expiry, accepted, cost and witness.
  - Signature boxes: received, witnessed and delivered by.
- **Discrepancy report (HMIS 087),** only when there are differences:
  - **Lines:** on the note, counted, accepted, rejected, the discrepancy and the decision.
  - **Mark it:** "The columns of the national form are not confirmed yet. MedSync does not send this report." Do not invent the national columns.
- **Claim:**
  - **When one is made:** a line is short on the note (value = packs × cost), packs were rejected for any reason except short-dated, or a line was charged above the order price (value = accepted × difference).
  - Donations, transfers and returns make no claim.
  - **States:** Draft, then **Send the claim** (an editable message, Copy, then **Mark as sent**), then Sent, then **Credit received**, which needs the credit note number and closes the claim.
  - The claim is linked from the delivery's papers ("Claim CLM-0012") and from the board.
- **Count checked by <name>** is shown when a second check was made.
- **What moved:** product, batch, into stock, not accepted (and where it went), and the result words.
- **The order card:** what is still owed, with **Record the rest**.

## F. Places that don't receive from suppliers
- **On the way:** dispatches from the Main store ("Requisition · sent … · n lines"), each with **Confirm what arrived**.
- **Confirming:** lists each line (name, batch, quantity), with "Difference, if any".
  - With no difference: "Confirmed. It is in OPD's stock."
  - With a difference: "Confirmed with a difference. A case is open for the in-charge." The dispatch is stored as diff.
- This is the same confirmation as STORE.md §C3. Build it once.

## G. Receiving figures (Main store)
1. **Four figure cards:**

   | Card | Value | Target | Mini chart |
   |---|---|---|---|
   | Arrival to in stock | median minutes | 2 h | last 8 deliveries |
   | In stock to shelved | median minutes | 1 h | last 8 deliveries |
   | Lines that matched the note | % for the last delivery | 95 % | last 8 deliveries |
   | Claims open | UGX of draft and sent claims | none | open value per supplier as bars, plus "Open the oldest claim →" |

   - Each card shows its label, an **On target / Off target** chip, the value, and a delta line ("Median · Down 28 min on the delivery before", coloured by better or worse).
   - **The mini column chart for the first three:**
     - y labels for 0 and the top
     - a target line with its label
     - bars teal when on target and amber when not; the latest bar solid and earlier ones faded
     - "n deliveries ago … Latest" under the bars
     - each bar focusable, with a tooltip: "DN-19977: 1 h 17 min · on target"
2. **Suppliers table:** for each supplier, over the last 6 months:
   - Fill rate, as a bar with the value at the tip
   - Lead time against promised (amber when slower)
   - On time %
   - Differences
3. **All of it is computed from the deliveries, orders and claims tables (§I).** The prototype's `hist` arrays are sample data (§K).

## H. Working without the network
- **When the connection drops:** a banner reads "Offline. Scans and counts are saved on this device…", with the number of deliveries waiting.
- **Counting** goes on locally (IndexedDB). Scanning, lines and decisions all work.
- **Finishing while offline** saves the delivery as `queued`, together with its witnesses and second checker. It shows as "Waiting for the network" on the board. No stock moves.
- **When the connection is back:** each queued delivery goes through the same `applyCommit` on the server, in order and idempotently (the key is the delivery id). The board updates, and the toast reads "Back online. n deliveries … added to stock."
- **Conflicts:**
  - A duplicate note, or a line refused by a server rule (for example a recall published meanwhile), returns that delivery to Counting with the problem shown.
  - A queued delivery is never committed partly.
- **The prototype's "Go offline (try it)" button** only simulates this. In the build, use the browser's online/offline events and a sync queue.

---

## I. Data model (map onto existing tables first; see TECH-SPEC §0)
| Table | Columns |
|---|---|
| `deliveries` | `place_id`, `kind` (supplier, donation, facility, ward), `supplier_id` or `from_text` / `from_place_id`, `order_id`, `note_ref`, `arrived_at`, `deliverer`, `vehicle`, `blind`, `invoice_no`, `invoice_total`, `state` (counting, queued, received, abandoned), `grn`, `finished_at`, `shelved_at`, `abandon_reason`, `second_checker_id`, `claim_id`. **Unique:** (supplier or source, `note_ref`) where the state is not abandoned. |
| `delivery_lines` | `delivery_id`, `med_id`, `order_line_id`, `source`, `batch`, `expiry`, `packs`, `per_pack`, `note_packs`, `cost_per_pack`, `temp_c`, `vvm_stage`, `freeze` (ok, tripped), `decision`, `approved_by`, `reg_reason`, `reg_note`, `rej_packs`, `rej_why`, `rej_fate`, `witness_id`, `owed_frozen` |
| `delivery_photos` | `delivery_id`, `kind` (note, invoice, damage), `file` (storage), `by`, `at` |
| `put_away` | `delivery_line_id`, `shelf`, `qty`, `sent_qty`, `done_at`, `by` |
| `orders` (extend) | `sent_on`, `lead_days` (from the supplier), `chased_on`, `edited_on`; `order_lines.price` |
| `supplier_claims` | `id` (CLM-…), `delivery_id`, `supplier_id`, `state` (draft, sent, credit), `sent_at`, `credit_note`, `total`; plus `claim_lines` (`med_id`, `kind`, `packs`, `value`) |
| `recalls` | `med_id`, `batch`, `notice`, `why`, `from` (NDA, manufacturer), `active` |
| `pack_serials` | `gtin`, `serial`, `delivery_id`. **Unique** on (`gtin`, `serial`). |
| `medicines` (extend) | `gtin`, `own_code bool`, `vaccine bool`, `cold`, `controlled`, `reg_lapsed` |
| `quarantine` | Shared with STORE.md |

## J. Rules used (from the registry; never hard-coded)
| Group | Rules |
|---|---|
| Receiving | short-dated window 180 days · accepting short-dated needs the in-charge · price tolerance 5 % · second check above UGX 2,000,000 · invoice tolerance 1 % or UGX 1,000 · targets: 2 h to stock, 1 h to shelf, 95 % matched |
| Suppliers | lead days: NMS 23, JMS 7, local 2 (an editable list) |
| Cold chain | 2–8 °C on arrival, into the fridge within 30 min, VVM 3–4 means discard, a tripped freeze indicator means reject or a shake test |
| Controls | a witness for every controlled line, who is not the receiver |

## K. Prototype-only (do not ship)
- `seed()` and `localStorage` (key `medsync-receive-prototype-v2`). Use the database, and IndexedDB only for the offline queue.
- **Sample data:**
  - medicines, GTINs and orders
  - the deliveries DN-20418, DN-19977 and DN-19802
  - the dispatches RIV-0231 and RIV-0232
  - the recall AMX2301 and the claim CLM-0011
  - `hist` (times, matched %, supplier fill / lead / on-time), and the history note numbers
- The roles used as people: "Dispensing pharmacist, day shift" and "Pharmacy in-charge". Use the roster.
- "Go offline (try it)" and the scan sample chips.
- In-memory photo URLs.
- Copying a message to the clipboard instead of sending it.

## L. Acceptance (add to the PRD scenarios)
1. **A duplicate note** for the same supplier is refused, in the UI and by the database. An abandoned one can be re-used.
2. **Nothing moves until finished.** Abandoning leaves stock and orders untouched.
3. **Scanning:**
   - a GS1 code fills the batch and expiry
   - the same pack again adds one
   - an unknown GTIN must be linked by hand
   - a repeated serial is refused
   - a recalled batch blocks the line until it is rejected into quarantine
4. **Blind count** hides the note and order quantities until a line is counted.
5. **Short-dated:** accepting needs the in-charge's approval. Rejecting returns it to the driver as short-dated, with no claim.
6. **Vaccine:** VVM 3–4 or a tripped freeze indicator blocks the line until it is rejected. A missing VVM or freeze check also blocks.
7. **Cold timer** turns amber and then red at the rule values. A non-cold put-away is refused while a cold line waits.
8. **Price:** a line over the tolerance shows the word and the note, and makes a claim line for the overcharge on finishing. The invoice check works to the tolerance.
9. **Second check** is required above the limit, and the checker is not the receiver. Controlled lines need a witness.
10. **Claims:** short, rejected and overpriced lines go into one draft claim. Draft → Sent → Credit received needs the credit note number. A donation makes no claim.
11. **Order edit:** a line can't go below what arrived, and the state is recomputed. Receiving afterwards counts against the new quantities.
12. **Due and chase:** the due tags follow the lead days, and chasing records the date.
13. **Labels:** the EAN-13 bars decode to the printed digits (test with a decoder). A medicine without a GTIN gets a valid 200… code with a check digit, and the next scan of that label finds it.
14. **Offline:** queued deliveries commit exactly once when back online, and a conflict returns the delivery to Counting.
15. **Places:** confirming a dispatch adds the stock only then, and a difference opens a case.
16. **Figures:** each figure matches a SQL check on the seed, and each target follows its rule.
17. **At 1,440 px and 390 px:**
    - no horizontal page scroll, and no console errors
    - axe is clean (WCAG AA), with the option cards as radio groups and the switch as a switch
    - every dialog works by keyboard, and Esc closes it
    - inputs are at least 44 px, and 16 px text on phones
