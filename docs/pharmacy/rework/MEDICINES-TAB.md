# MEDICINES-TAB: the medicine master, as designed on 3 Nov 2026

This spec replaces the Medicines part of `PRD.md` §6.4 (medicine list) and §6.7 (Set-up › Medicines), and the matching rows of `TECH-SPEC.md`. Where they disagree, **this file wins**.

The reference implementation is `prototype/medicines-tab.dc.html`. It is one self-contained file:

- the markup is HTML with `{{holes}}`, `<sc-for>` loops and `<sc-if>` branches
- all behaviour is plain JavaScript in `class Component … renderVals()`

Port it **behaviour for behaviour**: same columns, same wording, same thresholds and same flows. Port it into the repo's own stack (Next.js, Tide components, server actions, Postgres). Do not copy the markup or the inline styles.

---

## 0. What it is and where it lives

- **One screen holds everything about a stocked medicine:**
  - identity, classification and VEN
  - handling flags
  - pack sizes
  - top-up levels and live stock per place
  - batches and expiry
  - prices per payer
  - brands
  - the rules that apply to it
  - quality checks and history
- **Route:** `/pharmacy/setup?tab=medicines`. It replaces the current Set-up › Medicines page completely: the old list, the "Edit medicine" dialog, the "Prices" sections (price rule, payers, dispensing points, needs a price) and the "Add from the catalogue" dialog.
- **Shared component, `MedicinesGrid`:**
  - Set-up › Medicines renders it in **edit mode**.
  - `/pharmacy/stock/medicines` renders the same component in **operate mode**: same data and columns, no editing of identity, VEN, rules or prices; top-up requests and orders allowed.
  - There is one home per thing. Do not build a second medicines table.
- **Dispensing-point billing moves to Set-up › Places** (Free point, Pay before collecting), on places of kind "Dispensing point". It is a property of the place, not of a medicine.

## 1. Concepts (use these exact meanings)

| Term                                                   | Meaning                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Line**                                               | One stockable product. Its identity is **generic + strength + form + route**. Change any one of them and it is a different line, with its own stock, top-up levels, prices, brands, rules and history (e.g. Amlodipine 5 mg Tablet Oral ≠ Amlodipine 10 mg Tablet Oral). Pack size and brand are _not_ part of identity.                                            |
| **Issue unit**                                         | What the line is counted and charged in: tablet, capsule, vial, ampoule, bottle, sachet, dose, tube, inhaler, pessary, suppository. Every quantity and every price is per issue unit.                                                                                                                                                                               |
| **Top-up level**                                       | Per place: how much the place should hold when fully stocked. It is _not_ what it holds now. Blank means the place doesn't keep this line.                                                                                                                                                                                                                          |
| **On hand**                                            | Live balance per place, from the ledger.                                                                                                                                                                                                                                                                                                                            |
| **Status per place** (only when a top-up level is set) | **Out:** on hand = 0. **Low:** on hand < half the level. **Over:** on hand > level. **OK:** otherwise.                                                                                                                                                                                                                                                              |
| **% of top-up**                                        | Σ on hand ÷ Σ top-up levels, over the places that have a level.                                                                                                                                                                                                                                                                                                     |
| **Days of cover**                                      | Σ on hand ÷ average daily use (all places, last 90 days of issues to patients).                                                                                                                                                                                                                                                                                     |
| **Payer**                                              | Cash (always present), plus any insurer or scheme the hospital adds. Kinds: Insurance, Community scheme, Employer scheme, Other scheme.                                                                                                                                                                                                                             |
| **Brand**                                              | A trade name of the same line, optionally with its own price per issue unit. A blank brand price means the same as the generic.                                                                                                                                                                                                                                     |
| **Local item**                                         | A line added by hand because it is in no catalogue. It is marked LOCAL and carries the reason.                                                                                                                                                                                                                                                                      |
| **Master catalogue**                                   | Every known medicine, not only those on EMHSLU: anticancers, antiretrovirals, anti-TB, psychiatric, dermatological, eye and ear, contraceptives, anaesthetics and the rest. Each item records which lists also carry it: EMHSLU (Essential Medicines and Health Supplies List for Uganda), NMS, JMS, UNEPI. An item on none of them shows "Master only". See §11.1. |
| **Classification**                                     | Four layers: **body system** (WHO ATC level 1, e.g. L Antineoplastic and immunomodulating agents), **therapeutic class** (e.g. Antineoplastics (anticancer)), **pharmacological group** (e.g. Alkylating agent), and **sale category** (Controlled, Prescription only, Pharmacy only, Over the counter).                                                            |
| **Rule**                                               | A signed value from Set-up › Rules, mapped to the lines it applies to (§9).                                                                                                                                                                                                                                                                                         |
| **Actor**                                              | The signed-in user and their role. Every change records "by &lt;name, role&gt;". The prototype fakes this with an "Acting as" selector; the real build uses the session.                                                                                                                                                                                            |

## 2. Layout, top to bottom

1. **Page shell:**
   - the 6-section rail, with Set-up active
   - h1 "Set-up"
   - sub-tabs: Going live · Places · **Medicines** · Rules · People and roster · Messages
2. **Card header:**
   - the one-sentence intro: "Everything about a medicine is set here…"
   - the primary button **Add from the catalogue**
   - the card fills the full content width; there is no max-width
3. **Toolbar:**
   - search box ("Find a medicine or class"; matches name or class)
   - **Filters** button. Shows "Filters · n" and turns teal when conditions are active.
   - **Columns** popover, with a checkbox per optional column
   - **Group by class** toggle
4. **Views row:** chips for the saved views (§6).
5. **Rules row:** one badge per rule group, e.g. "Controlled · 7". A badge with proposals awaiting signatures shows an amber "n to sign". Clicking a badge opens that group's rules dialog (§9).
6. **Active-condition chips:** "Showing medicines where VEN is Vital × AND Stock status any place is Low or out × Clear".
7. **Summary tiles:** six clickable tiles (§5).
8. **Bulk bar:** shown only when rows are selected (§8).
9. **The grid** (§3), with the open-row panel inside it (§4).
10. **Pager:** 20 rows a page. "Showing 1–20 of 47 medicines" (or "… of 28 (of 47)" when filtered), "Page 1 of 3", Previous and Next.
11. **Dialogs:** Filters (§7), Rules group (§9), Add from the catalogue and Add a local medicine (§11). The toast is at the bottom centre.

## 3. Grid

One row per line, with a sticky header and hairline row dividers. It scrolls horizontally inside the card when it is wider than the card.

**Fixed columns:**

- a checkbox
- **Medicine**, which contains:
  - a chevron (rotates when open)
  - the **generic name** (bold)
  - a grey **LOCAL** chip for local items
  - an amber **LASA** chip when the line has look-alike partners; its tooltip lists them
  - a sub-line: `Also stocked: 10 mg tablet · issued per tablet · packs 100 · 1000 · loose · 2 brands`

Clicking the name opens or closes the row. Only one row is open at a time.

**Optional columns, in this order** (D = shown by default):

| Key      | Header        | D   | Cell                                                                                                                                                                                                |
| -------- | ------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| strength | Strength      | ✓   | e.g. "10 mg", "125 mg/5 ml · 100 ml" (bold)                                                                                                                                                         |
| form     | Form          | ✓   | Tablet, Capsule, Syrup, Powder for injection…                                                                                                                                                       |
| route    | Route         | ✓   | Oral, IV/IM, SC, Intradermal…                                                                                                                                                                       |
| cls      | Class         |     | Therapeutic class                                                                                                                                                                                   |
| group    | Group         |     | Pharmacological group                                                                                                                                                                               |
| sale     | Sale category |     | Controlled / Prescription only / Pharmacy only / Over the counter                                                                                                                                   |
| ven      | VEN           | ✓   | Vital / Essential / Necessary / Not set                                                                                                                                                             |
| handling | Handling      | ✓   | Chips: **CD**, **High-risk**, **2–8 °C**, **No freeze**, **Cytotoxic**. The cold-chain chip's tooltip lists each place's fridge and temperature (§13)                                               |
| stock    | Stock         | ✓   | Σ on hand (bold) with "% of top-up" at the right; a thin bar filled to min(%, 100); tooltip per place "Ward 3: 180 of 200 (OK)"                                                                     |
| status   | Status        | ✓   | "● 1 out" (red) and/or "● 2 low" (amber); otherwise "● All OK" (green), "● Over" (blue) or "● Not set" (grey)                                                                                       |
| expiry   | Expiry        | ✓   | Nearest batch expiry "23 Dec 26" with "in 50 d" under it. Amber bold under 90 days, red bold under 30                                                                                               |
| cover    | Cover         |     | Days of cover, "12 d". Amber bold under 14 days                                                                                                                                                     |
| qc       | Checks        | ✓   | "● Ready" (green) or "● 2 issues", with the issues listed in the tooltip. The dot is red if any issue is Duplicate line, Controlled flag missing, Below cost or Expires before use; otherwise amber |
| price    | Cash price    | ✓   | "UGX 150" with "per tablet" under it; "Free"; or "Not set"                                                                                                                                          |

**Header cells:**

- Clicking the label sorts the column; clicking again reverses it. The active column shows ↑ or ↓.
- Each header has a **⋮ menu**:
  - Sort ascending
  - Sort descending
  - Filter by this column (opens Filters with a new condition on that column)
  - Group by class / Stop grouping by class
  - Hide this column (not offered on Medicine)

**Sort keys:**

- **Medicine:** generic, then numeric strength, so the strengths of one medicine sit together, smallest first.
- **VEN:** V < E < N < Not set.
- **Status:** severity, Out < Low < Not set < OK < Over.
- **Number columns:** numeric. Blanks sort last.

**Group by class:** class headings ("Antibiotics · 12") appear inside the page, in class order, and the chosen sort applies within each class.

## 4. The open row (one page; no tabs)

The open row is a panel inside the row, on the muted grey background (`#f6f7f9`), indented to line up under the medicine name. It uses the grid's density:

- section titles are small uppercase grey labels, with hairline dividers between sections
- fields are 30–34 px high with 13 px text

All edits go into a **draft** and nothing is saved until **Save changes**. Changing a field clears any error.

**Header.** The identity "Amlodipine · 10 mg · Tablet · Oral" on the left. On the right, a summary: "Vital · levels at 2 places · UGX 150 per tablet".

Sections, top to bottom:

**4.1 About**

- **Identity strip:** MEDICINE · STRENGTH · FORM · ROUTE · CLASS · GROUP · SALE CATEGORY · ISSUED PER, laid out like table cells. It is read-only. Under it: "A different strength, form or route is its own line, with its own stock and price. Add it from the catalogue."
- **Checks to fix:** shown when the line has quality-check issues (§10), as an amber note listing each issue in plain words.
- **Review:** "Last reviewed 34 days ago" (adds "· review due" after 90 days), with a **Mark reviewed** button. It sets `reviewed_at` to now and adds the history line "Reviewed and confirmed · by …".
- **Therapeutic class:** a select.
- **VEN class:** a segmented control (Vital, Essential, Necessary). Hint: "Budget cuts never touch Vital."
- **Handling:** five toggle cards, each with a one-line hint:
  - Controlled: "Register and a witness for every dose or issue."
  - High-risk: "Counted at every handover."
  - Cold chain, 2–8 °C: "Kept in a fridge."
  - Freeze-sensitive: "Shake test after freezing."
  - Cytotoxic: "PPE, designated area, cytotoxic waste and spill kit."

  A card that is on is teal-tinted, with a filled check.

- **Locked Controlled flag:** for lines on the national controlled list, the Controlled card reads "On the national controlled list: locked on". Trying to untick it shows the error "… is on the national controlled list. Removing Controlled needs a signed rule change."
- **Cold chain card:** when it is on, it lists each place that keeps the line (§13).

**4.2 Rules that apply** (§9.4): only the rule groups that apply to this line. Every rule is changeable with two signatures. There is also a "This medicine only" group with **+ Add a rule for this medicine**.

**4.3 Packs and top-up levels**

- **Pack sizes:** chips for 10, 25, 50, 100, 1000 and any existing custom size, plus **Loose**. "Other size" adds a size. Hint: "Counted in tablets."
- **Stock per place**, with a live line at the right: "● Live · 10:52:14 · Paracetamol at OPD −12 tablets". Hint: "On hand updates live as stock is dispensed, issued or received. Top up to = full stock. Low below half. Blank = not kept." Columns:
  - Place
  - On hand now (bold, with the unit, flashing teal for about 3.5 s after it changes)
  - a status chip (Out red, Low amber, OK green, Over blue)
  - the action button
  - Top up to (an input with the unit after it)
  - Low below ("100 tablets")
- **Action button** on a place that is Low or Out:
  - non-store place: **Request &lt;n&gt; from store**
  - Main store: **Add &lt;n&gt; to the order**
  - n = level − on hand
  - once pressed, the row shows "Requested from store: 140" or "On the next order: 2,000", with Undo
  - in the real build these create an issue request (Stock › Issue) or an order-draft line (Order builder, still subject to VEN/budget)
- **Batches · first to expire, first out:** "Use first · Batch 1 · 1,200 tablets" with "Expires 23 Dec 26 · in 50 d", in the same colours as the Expiry column. If there are none: "No stock received yet."

**4.4 Prices**

- The header reads "Price, charged per tablet issued". Under it, the rule hint: either "Rule suggests cost + 25%. A typed price wins." or "Typed by hand. No price rule set."
- A **Free for every payer** switch.
- When the line is charged, a table with columns Payer · Price · Works out to:
  - one row per payer
  - Price: "UGX [ ] per tablet". The Cash placeholder is "e.g. 100"; other payers show "Same as cash".
  - Works out to: "UGX 10,000 a pack of 100 · UGX 100,000 a pack of 1000"
- **+ Add insurance or scheme:** kind (Insurance, Community scheme, Employer scheme, Other scheme) and name. The payer is added hospital-wide, so every line gets a price box for it. A duplicate name is refused.

**4.5 Brands · n**

- Hint: "Blank price = same as the generic."
- Each brand row: name, maker, "UGX [ ] per tablet", Remove.
- **+ Add a brand** offers a select:
  - the starter brands for this generic
  - "Generic (any maker)"
  - "Not listed: type it", which asks for a name and maker
- Duplicate brand names are refused.
- Hint: "A starter list of brands common in Uganda and East Africa. Check each one is on the NDA register before you stock it."
- When brands are priced differently, the table's Cash price shows the range, e.g. "UGX 100–150 per tablet".

**4.6 History.** Every change, newest first.

**Footer:**

- **Stop stocking** (removes the line from the stocked list and keeps its history)
- "Changes run from [date]" (one date for the whole save)
- **Cancel**
- **Save changes**

Save validates:

- at least one pack size or Loose, otherwise "Pick at least one pack size, or Loose."
- a from-date, otherwise "Give the date these changes run from."

Save writes one history line per changed area, each ending " · from YYYY-MM-DD · by &lt;actor&gt;". The areas:

- "VEN Essential → Vital"
- "Class …"
- "Handling: Controlled, Cold chain"
- "Made free" / "Charged again"
- "&lt;payer&gt; price not set → UGX 150"
- "Levels: OPD 200 · Ward 3 50 tablets"
- "Packs: …"
- "Brands: …"

The toast reads "Saved &lt;name&gt;" or "Nothing changed".

## 5. Summary tiles

Clicking a tile applies its view; clicking it again returns to All. The active tile is teal.

| Tile                      | Value                                                         | Sub-label          | View                          |
| ------------------------- | ------------------------------------------------------------- | ------------------ | ----------------------------- |
| Medicines                 | lines stocked                                                 | stocked            | all                           |
| Places OK                 | "98 of 116": place-lines that have a level and are OK or Over | medicine × place   | all                           |
| Low (amber dot)           | place-lines that are Low                                      | places below half  | Stock status any place is Low |
| Out (red dot)             | place-lines that are Out                                      | places with none   | Stock status any place is Out |
| Under 14 days (amber dot) | lines with days of cover < 14                                 | of cover left      | Days of cover less than 14    |
| Need attention (red dot)  | lines with ≥ 1 quality check                                  | lines with a check | Checks shows Any issue        |

## 6. Views

**Built-in views:**

- All medicines
- Low or out
- Under 14 days of cover
- Vital and low (VEN is Vital AND Stock status any place is Low or out)
- Controlled
- No price
- No top-up
- Need attention
- Expiring within 90 days

Picking a view replaces the active conditions. A view the user saves from the Filters dialog ("Save as a view", name required, at least one condition) joins the list for that user. Persist saved views per user (`pharmacy_saved_views`).

## 7. Filters dialog

This is the condition builder. The first condition is labelled **Where**; each later one has an **AND / OR** select. Each condition row has:

- a Column select
- an Operator select
- a Value field: a select for lists, an input for text and numbers, or "No value needed"
- a delete (bin) button

Then come **+ Add condition** and the note "Conditions are read top to bottom: AND narrows the list, OR widens it."

Footer: a name box, **Save as a view**, Clear all, Cancel, and **Apply filters**. Conditions with an empty value are dropped when filters are applied.

| Column                                                                                           | Type   | Operators                                                | Values                                                            |
| ------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Medicine name                                                                                    | text   | contains · does not contain                              | free text, against the full name                                  |
| Strength                                                                                         | text   | contains · does not contain                              |                                                                   |
| Form                                                                                             | list   | is · is not                                              | the forms list                                                    |
| Route                                                                                            | route  | includes · does not include                              | Oral, IV, IM, SC, Intradermal, Rectal. Matches a token in "IV/IM" |
| Class                                                                                            | list   | is · is not                                              | the classes                                                       |
| Pharmacological group                                                                            | text   | contains · does not contain                              |                                                                   |
| Sale category                                                                                    | list   | is · is not                                              | the 4 categories                                                  |
| VEN                                                                                              | list   | is · is not                                              | Vital, Essential, Necessary, Not set                              |
| Handling                                                                                         | flag   | has · does not have                                      | Controlled, High-risk, Cold chain, Freeze-sensitive, Cytotoxic    |
| Stock status                                                                                     | status | any place is · no place is                               | Low or out, Out, Low, OK, Over, Top-up not set                    |
| On hand · % of top-up · Days of cover · Cash price, UGX · Brands mapped · Days to nearest expiry | number | less than · more than · equals · is empty · is not empty | number                                                            |
| Checks                                                                                           | qc     | shows · does not show                                    | Any issue, or a specific check name (§10)                         |

**Evaluation is strictly left to right:**

```
r = c1
for each later ci:
  r = (r OR ci) if ci.join == OR
  r = (r AND ci) otherwise
```

The search box is applied first, with AND.

## 8. Bulk actions

The header checkbox selects every row on the page. The bulk bar (lagoon tint) shows "n selected" and these actions:

- **Set VEN…** + Apply
- **Top-up at &lt;place&gt;** + level + Apply. This sets that place's level on every selected line.
- **Request top-ups.** For every selected line, every Low or Out place gets a request (or an order line for the store), sized level − on hand. Toast: "3 requests to the store · 1 line on the next order".
- **Mark free**
- **Clear selection**

Each bulk change writes a history line ending " · from &lt;today&gt; (bulk) · by &lt;actor&gt;".

## 9. Rules mapped to medicines

### 9.1 Groups and what they apply to

| Group               | Applies to          | Rules (short lines)                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every medicine      | all lines           | Expiry warning 90 days before · Low when below half the top-up level · Orders cover the 2-month NMS cycle plus 1 month · Over budget: trim Necessary, then Essential, never Vital. _The price rule and the payers also live in this group's dialog._                                                                                                                                    |
| Controlled          | Controlled flag     | A register at every place that holds it · Every dose or issue needs a witness on duty · Minimum gap: morphine inj 4 h, pethidine 3 h, oral morphine 4 h · Balance check: wards and dispensary daily, store weekly · Residue discarded in front of the witness · Offline entries must sync within 12 h                                                                                   |
| High-risk           | High-risk flag      | Counted blind at every handover, 08:00 and 17:00 · A count difference opens a case                                                                                                                                                                                                                                                                                                      |
| Cold chain          | Cold chain flag     | Kept at 2–8 °C in a listed fridge · Alarm above +8 °C or below −0.5 °C · 30 min or more out of range is an excursion                                                                                                                                                                                                                                                                    |
| Freeze-sensitive    | Freeze flag         | Shake test before use after a freeze alarm                                                                                                                                                                                                                                                                                                                                              |
| Cytotoxic           | Cytotoxic flag      | Prepared only in the designated area, with gloves, gown and mask · Every dose checked against body surface area by a second pharmacist · Stored apart and labelled cytotoxic · Waste and spills handled with the cytotoxic spill kit. _New group: it needs signing in Set-up › Rules before go-live._                                                                                   |
| Vaccines            | class = Vaccines    | Open vials: BCG and MR 6 h; bOPV, IPV, Penta and Td 28 days · Given free                                                                                                                                                                                                                                                                                                                |
| Prescription checks | lines that have one | Paracetamol: Children 10–15 mg/kg a dose · Amoxicillin: Children 12–30 mg/kg a dose · blocked if allergic to penicillin · Benzylpenicillin, Ampicillin: blocked if allergic to penicillin · Metronidazole: Children 7.5–10 mg/kg a dose · caution in the first trimester · Cotrimoxazole: Children 12–24 mg/kg a dose · Metformin: Stop below eGFR 30 · at most 1 g a day at eGFR 30–45 |

### 9.2 Badges and dialog

- **Badge:** "&lt;Group&gt; · &lt;n lines&gt;", plus "n to sign" when proposals are pending.
- **Dialog:** "&lt;Group&gt; rules", with the rule lines and the count. Groups that can be filtered show "8 medicines · show", which applies the filter (Handling has … / Class is Vaccines) and closes the dialog.
- **Footer:** "A change applies once the in-charge and a second signer sign. See all rules" (links to Set-up › Rules).

### 9.3 Changing a rule (everywhere it appears)

1. Each rule line has **Change**. It opens two fields: the new wording and "Why the change". **Send for signing** requires a changed wording and a reason.
2. The line then shows "Proposed: …" and "Why: … · applies once both have signed". It has the buttons **Sign as in-charge**, **Sign as second signer** and Withdraw.
3. When both have signed, the new value replaces the old one everywhere. The change is recorded in the rules history with both signers.
4. The second signer is the CSO or the medical superintendent where there is one pharmacist (PRD §6.7).
5. A proposal pending in one place shows as pending in every place that rule appears.

### 9.4 Inside the open row

"Rules that apply" lists only the groups that apply to this line's **current draft**, so ticking Controlled shows the controlled rules immediately. Each group is labelled:

- "· shared by 7 medicines": changing it changes it for all of them
- "· this medicine only": for its prescription check

**This medicine only** holds per-line rules (e.g. "Doctor's prescription only"). **+ Add a rule for this medicine** goes through the same propose-and-sign flow, and once signed the rule is listed with its own Change.

## 10. Quality checks

Compute these per line, from live data. They appear in the Checks column, the open row's "Checks to fix", the Need attention tile and view, and the Checks filter.

| Check name              | Fires when                                                                                                                                                                 | Shown text                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Missing details         | VEN not set, or no top-up level anywhere, or no cash price and not free, or no pack size and not loose                                                                     | "Missing VEN, top-up level, price"                                              |
| Duplicate line          | another line has the same generic+strength+form+route (case-insensitive)                                                                                                   | "Another line has the same medicine, strength, form and route"                  |
| Controlled flag missing | the line is on the national controlled list but not flagged                                                                                                                | "On the national controlled list but not marked Controlled"                     |
| Below cost              | cash price < last received unit cost                                                                                                                                       | "Cash price UGX 120 is below the last cost UGX 140"                             |
| Top-up cover            | store top-up ÷ average daily use < 7 or > 90 days                                                                                                                          | "Store top-up lasts 120 days of use; aim for 7–90"                              |
| Ward above store        | any non-store place's level > the store's level                                                                                                                            | "Ward 3 top-up is higher than the store's"                                      |
| Free with a price       | Free, but a cash price exists                                                                                                                                              | "Marked free but still has a cash price"                                        |
| Expires before use      | FEFO simulation: for batches sorted by expiry, the amount usable before each expiry is (use/day × days to expiry − amount already used); waste = Σ(batch qty − usable) > 0 | "About 1,200 tablets will expire before they are used"                          |
| Not moved in 90 days    | no issue or dispense for ≥ 90 days                                                                                                                                         | "Nothing issued or dispensed for 120 days"                                      |
| Review due              | last review > 90 days ago                                                                                                                                                  | "Last reviewed 134 days ago"                                                    |
| No fridge               | Cold chain line held or levelled at a place with no fridge                                                                                                                 | "Kept at a place with no fridge: OPD, Ward 3"                                   |
| Local item              | the line is local                                                                                                                                                          | "Not in any catalogue (Donation); the in-charge confirms it at the next review" |

**Other safeguards:**

- **National controlled list** (the Controlled flag is locked on): morphine injection, morphine oral solution, pethidine, diazepam injection, phenobarbital. Load it from `data/pharmacy/national-list` and confirm it against NDA.
- **LASA partners:**
  - automatic: every other stocked line with the same generic
  - named pairs: metronidazole ↔ metformin, hydralazine ↔ hydrochlorothiazide (configurable list `data/pharmacy/lasa.ts`)
  - the tooltip reads "Look-alike, sound-alike: …. Check strength and form at every pick."

## 11. Add from the catalogue (dialog)

### 11.1 The master catalogue (all known medicines, classified)

The catalogue is **not** limited to EMHSLU. It holds every medicine a hospital might stock, across every body system, including:

- anticancers (alkylating agents, anthracyclines, antimetabolites, vinca alkaloids, platinum compounds, taxanes, tyrosine kinase inhibitors, hormone therapy)
- immunosuppressants, antiretrovirals, anti-TB, antifungals, antivirals
- anticoagulants, lipid-lowering, psychiatric, dermatologicals, eye and ear
- hormones and contraceptives, thyroid, antihistamines, vitamins and minerals, anaesthetics
- everything already listed

**Classes, in this order:**

1. Antibiotics
2. Antimalarials
3. Analgesics
4. Fluids and electrolytes
5. Antihypertensives
6. Diuretics
7. Anticonvulsants
8. Antidiabetics
9. Haematinics
10. Obstetric (uterotonics)
11. Respiratory
12. Gastrointestinal
13. Anthelmintics
14. Corticosteroids
15. Vaccines
16. Antineoplastics (anticancer)
17. Immunosuppressants
18. Antiretrovirals
19. Anti-TB
20. Antifungals
21. Antivirals
22. Anticoagulants
23. Lipid-lowering
24. Psychiatric
25. Dermatologicals
26. Eye and ear
27. Hormones and contraceptives
28. Thyroid
29. Antihistamines
30. Vitamins and minerals
31. Anaesthetics

**Body system (ATC level 1):**

- A Alimentary tract and metabolism
- B Blood and blood-forming organs
- C Cardiovascular system
- D Dermatologicals
- G Genito-urinary system and sex hormones
- H Systemic hormonal preparations
- J Anti-infectives for systemic use
- L Antineoplastic and immunomodulating agents
- M Musculo-skeletal system
- N Nervous system
- P Antiparasitic products
- R Respiratory system
- S Sensory organs
- V Various

Store the full ATC code per item when known (e.g. L01AA01). The UI filters on level 1 and shows "ATC L Antineoplastic and immunomodulating agents".

**Where the data comes from** (build an importer, `scripts/import-catalogue.ts`, idempotent, keyed on identity):

1. **NDA register of human medicines (Uganda)**: what may legally be sold here. Gives generic, strength, form, route, and the brand and maker for the brand catalogue.
2. **EMHSLU**: sets the `EMHSLU` source tag (and its level-of-care and VEN where the file gives them).
3. **NMS and JMS catalogues / price lists**: set the `NMS` / `JMS` tags and the last supplier price.
4. **UNEPI schedule**: vaccines.
5. **WHO Model List of Essential Medicines**: fills gaps.
6. **ATC codes**: from the WHO ATC/DDD index. Bulk use of the WHO index needs a WHO licence. If there is none, store the ATC level-1 letter and the class, and leave `atc_code` blank.

Items on none of the lists 2–4 carry no tags and show "Master only". Lines the hospital adds by hand are **local** (§11 Local mode); they are not added to the master catalogue.

**Cytotoxic handling.** A new flag, **Cytotoxic**, for cytotoxic anticancers (cyclophosphamide, doxorubicin, methotrexate, fluorouracil, vincristine, cisplatin, paclitaxel, hydroxycarbamide, imatinib). It shows as a grid chip, a toggle card, a filter value and a rule group (§9.1). Most injectable cytotoxics are also High-risk.

### 11.2 Dialog

**List mode:**

- **Search:** "Generic name or class".
- **Catalogue chips with counts:** **Master catalogue** (everything) · EMHSLU · NMS · JMS · UNEPI. Each chip's tooltip gives the full name.
- **Filters:** Body system (ATC level 1), Class, and Sale category.
- **Each item shows:**
  - the full name
  - a sub-line with "ATC L Antineoplastic and immunomodulating agents · Antineoplastics (anticancer) · Alkylating agent · Prescription only · counted in vials"
  - tags for the lists that carry it (e.g. EMHSLU · NMS · JMS), or "Master only"
  - a note at the right
  - a tick box
- **Duplicate guard:** an item whose identity already exists among stocked lines is disabled and shows "Already stocked" or "Already stocked as Amlodipine 5 mg tablet". An item whose generic is stocked in another strength or form shows "Another strength or form is stocked".
- **Footer:**
  - **+ Not in any catalogue? Add it yourself**
  - "n medicines ticked"
  - Cancel
  - **Add n medicines**

New lines start with VEN "Not set" and the catalogue's flags, packs and classification. The toast reads "Added 3 medicines. Open each to set VEN, levels and price."

**Local mode** ("Add a medicine that isn't in a catalogue"). The search text pre-fills the generic name. Fields:

- generic name (required)
- strength (required)
- form
- route
- issued and counted per
- therapeutic class
- pack sizes ("10, 100")
- **Why it is stocked**: Specialist request · Donation · Not yet on the national list · Bought locally during a stock-out · Other

A live preview reads "Cefixime · 200 mg · Tablet · Oral · issued per tablet · marked LOCAL".

- **Validation:** the required fields must be filled. The identity must not already exist; if it does: "Already stocked as … Open that line instead."
- **On add:**
  - creates a LOCAL line with history "Added as a local item, not in any catalogue (&lt;why&gt;) · by &lt;actor&gt;"
  - filters the grid to the new name
  - toast: "Added … as a local item. Set its VEN, top-up levels and price."
- **Back to the catalogues** returns to list mode.

## 12. Live stock

- On hand comes from the ledger balance per place and line.
- **Subscribe to changes** (Supabase Realtime on movements, filtered by hospital) and update:
  - the counts
  - the tiles, bars, status and cover
  - the open row's "Stock per place" and its live line
  - "Not moved in 90 days" (it clears when a movement arrives)
- **Fall back to polling** every 30 s if Realtime is unavailable.
- The prototype simulates a movement every 4 s. **Do not ship the simulation.**

## 13. Cold chain on a line

- **Fridge per place:** comes from Places (e.g. Main store → CR-01 Main store cold room; Maternity → RF-02 ice-lined fridge; EPI → RF-03 solar fridge).
- **Per place that holds or levels the line, show:**
  - "Store: CR-01 · Main store cold room" with "4.6 °C · live 11:36" for a fridge with a sensor
  - "… · typed at 08:00" for a fridge without a sensor (the last typed reading)
  - in red: "no fridge here · Move it or add a fridge in Places" for a place with no fridge
- **Temperature colour:** green inside 2–8 °C, amber within 0.5 °C of a limit, red outside the range.
- **Data source:** the latest `pharmacy_fridge_readings`.

## 14. Data model (map onto existing tables first; see TECH-SPEC §0)

| Table                                                                   | Columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cat_items` (extend; the master catalogue of all known medicines)       | `generic`, `strength`, `form`, `route`, `issue_unit`, `atc_code` (nullable), `atc_level1`, `therapeutic_class`, `pharm_group`, `sale_category`, `sources text[]` (EMHSLU, NMS, JMS, UNEPI; empty = master only), `default_flags` (incl. `cytotoxic`), `default_packs`, `national_controlled bool`, `nda_reg_nos text[]`                                                                                                                                                            |
| `pharmacy_lines` (the hospital's stocked lines)                         | `id`, `cat_item_id` (nullable), local fields (generic, strength, form, route, issue_unit, class, group, sale_category), `is_local`, `local_reason`, `ven`, `controlled`, `high_risk`, `cold_chain`, `freeze_sensitive`, `cytotoxic`, `packs int[]`, `loose`, `free`, `reviewed_at`, `reviewed_by`, `stopped_at`. **Unique index:** `(hospital_id, lower(generic), lower(strength), form, route) WHERE stopped_at IS NULL`. This index is the database form of the duplicate guard. |
| `pharmacy_line_levels`                                                  | `line_id`, `place_id`, `top_up`, `valid_from`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pharmacy_payers`                                                       | `id`, `name`, `kind` (cash, insurance, community, employer, other)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pharmacy_prices` (extend)                                              | `line_id`, `payer_id`, `brand_id` (nullable), `ugx_per_unit`, `valid_from`, `source` (typed, rule). Append-only, with the latest `valid_from` winning.                                                                                                                                                                                                                                                                                                                             |
| `pharmacy_price_rule`                                                   | `markup_pct`, `round_to` (50), signed                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pharmacy_brands`                                                       | `id`, `line_id`, `brand`, `maker`, `nda_reg_no` (nullable) + `brand_catalogue` (`generic`, `brand`, `maker`)                                                                                                                                                                                                                                                                                                                                                                       |
| `pharmacy_rules`, `pharmacy_rule_proposals`, `pharmacy_rule_signatures` | `rule_group`, `key`, `text`, `applies_to` (all, flag, class, line); proposals with `new_text`, `reason`, `status`; signatures with `role` (in_charge, second), `signed_by`, `signed_at`. A change applies only with both signatures (DB trigger).                                                                                                                                                                                                                                  |
| `pharmacy_saved_views`                                                  | `user_id`, `name`, `conditions jsonb`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pharmacy_line_history`                                                 | Or reuse the audit event table: `line_id`, `area`, `before`, `after`, `from_date`, `actor_id`, `actor_role`, `bulk bool`                                                                                                                                                                                                                                                                                                                                                           |
| Existing                                                                | batches (expiry, qty, last received unit cost), movements (on hand, average use, last movement), places (+ fridge link, + billing flags), fridges and readings, issue requests, order drafts                                                                                                                                                                                                                                                                                       |

## 15. Derivations (pure, unit-tested; port from the prototype's `renderVals`)

| Function                                       | Purpose                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `lineIdentityKey(line)`                        | lower(generic\|strength\|form\|route)                                |
| `placeStatus(onHand, level)`                   | Out / Low / OK / Over / null                                         |
| `lineMetrics(line, balances, levels, use)`     | haveTotal, levelTotal, pct, cover, counts by status, severity, price |
| `qcChecks(line, metrics, ctx)`                 | the §10 list, in the §10 wording                                     |
| `fefoWaste(batches, usePerDay)`                | units that will expire before use                                    |
| `lasaPartners(line, lines, namedPairs)`        |                                                                      |
| `evalConditions(conds, line, metrics)`         | the §7 semantics                                                     |
| `sortLines(rows, key, dir, group)`             | the §3 keys                                                          |
| `rulesFor(draftFlags, cls, lineId, rules)`     | the §9.4 groups with "shared by n"                                   |
| `fridgeLines(line, places, fridges, readings)` | the §13 lines                                                        |
| `topUpSuggestion(level, onHand)`               | max(level − onHand, 0)                                               |

## 16. Server actions

- `saveLine(lineId, draft, fromDate)`: one transaction, writes history per area
- `stopStocking`
- `markReviewed`
- `addLinesFromCatalogue(catItemIds[])`: refuses duplicates
- `addLocalLine(fields, reason)`: refuses duplicates
- `addPayer(name, kind)`
- `setPriceRule`
- `addBrand` · `removeBrand`
- `bulkSetVen(ids, ven)` · `bulkSetLevel(ids, placeId, level)` · `bulkMarkFree(ids)`
- `requestTopUp(lineId, placeId, qty)`: creates an issue request
- `addToOrder(lineId, qty)`: creates an order-draft line
- `proposeRuleChange(ruleKey, text, reason)` · `addLineRule(lineId, text, reason)` · `signRuleProposal(id, role)` · `withdrawRuleProposal(id)`
- `saveView(name, conds)` · `deleteView`

Each action follows TECH-SPEC §4: a permission check, one transaction, an idempotency key, and an audit event.

## 17. Permissions

| Capability                                                                             | In-charge    | Pharmacist | Store keeper          | Others                                       |
| -------------------------------------------------------------------------------------- | ------------ | ---------- | --------------------- | -------------------------------------------- |
| View grid, filters, views, tiles                                                       | ✓            | ✓          | ✓                     | read-only on Stock › Medicines               |
| Edit line (VEN, flags, packs, levels, prices, brands), add or stop lines, bulk actions | ✓            | ✓          | levels and packs only |                                              |
| Mark reviewed                                                                          | ✓            |            |                       |                                              |
| Propose rule change                                                                    | ✓            | ✓          |                       |                                              |
| Sign rule change                                                                       | as in-charge |            |                       | second signer: CSO or medical superintendent |
| Request top-up / add to order                                                          | ✓            | ✓          | ✓                     | ward in-charge: request for own ward         |

## 18. Design and copy rules

- **Tide tokens only.** Figtree. Pill buttons. Cards with 22 px radius. Muted panels `#f6f7f9`. Hairlines `#dde1e9`.
- **Never use coloured side or left accent borders**, and no very dark themes.
- **Status colours always come with a word:**
  - Out / red: `#dc2626` dot, `#fde2e1` / `#9f1d1d` chip
  - Low / amber: `#d97706`, `#fef3c7` / `#92400e`
  - OK / green: `#16a34a`, `#dcfce7` / `#166534`
  - Over / blue: `#2563eb`, `#dbeafe` / `#1e40af`
  - Not set / grey: `#c5cbd8`
- **Touch targets:** at least 32 px in the dense grid and 44 px in dialogs on a phone. Below 640 px the grid becomes a card list per line: name, strength, form, route, stock bar, status, expiry, checks.
- **Copy:** all copy goes through signed content (new strings start as `draft`). Use the wording in this file and the prototype verbatim. Quantities always carry the unit ("140 tablets") and prices always say "per &lt;unit&gt;".

## 19. Acceptance (add these to the PRD scenarios)

1. Adding "Amlodipine 5 mg tablets, pack of 30" from the catalogue is refused as already stocked. Adding Amlodipine 10 mg works and shows "Also stocked: 5 mg tablet" on both lines, plus the LASA chip.
2. A local item can be added, shows LOCAL and the "Local item" check, and cannot duplicate an existing identity.
3. A filter of VEN is Vital AND Stock status any place is Low or out, saved as a view, reappears after a reload.
4. Setting Ward 3 top-up to 200 with 60 on hand shows Low and "Request 140 from store". Pressing it creates an issue request; Undo removes it.
5. Unticking Controlled on morphine is refused with the locked message.
6. A rule change applies only after both signatures, and shows as pending everywhere until then.
7. Below-cost, ward-above-store, free-with-a-price, expires-before-use, not-moved-in-90-days, review-due and no-fridge checks each fire on fixtures and clear when fixed.
8. A movement recorded on another device updates On hand, the bars, the tiles and the open row within 5 s.
9. Bulk "Top-up at OPD = 200" on 3 lines writes 3 history lines marked bulk, by the actor.
10. A price saved for Cash and a scheme shows per unit with the pack totals. Brand prices show as a range in the grid.
11. The grid works with 1,000 lines (paged, sorted, filtered) without visible lag; filtering runs client-side on the loaded page set or server-side with the same semantics.
12. At 390 px there is no horizontal page scroll; the grid becomes cards.
13. The catalogue offers medicines from every body system. Filtering "Body system = L" lists the anticancers and immunosuppressants. Adding cyclophosphamide gives a line flagged Cytotoxic and High-risk, whose "Rules that apply" include the Cytotoxic group.
14. The importer can be re-run on a new EMHSLU or NMS file without creating duplicates; it updates tags and prices only.

## 20. Prototype-only (do not ship)

- Sample data:
  - the generated stock, use, prices, costs, batches
  - review dates and last-movement dates
  - which lists carry each item, and the ~90-item sample of the master catalogue (the real one comes from the importer, §11.1)
  - the starter brand list
  - the sale categories
- Load real data from EMHSLU, NMS, JMS and UNEPI files and the ledger. The sale categories and the brand list must be checked against the NDA register before go-live.
- The simulated movement ticker and simulated fridge readings.
- The "Acting as" selector: use the session user.
- The old static boards "Edit a medicine" and "Add from the catalogue" in the design canvas are superseded by this file.
