# Health and laboratory supplies (EMHSLU 2023), across the pharmacy

5 Nov 2026. This adds the health supplies and laboratory supplies of the *Essential Medicines and Health Supplies List for Uganda 2023* (EMHSLU) to every pharmacy tab. Medicines and supplies share one item table, one ledger, one formulary and one set of screens. A supply is an item whose type isn't "Medicine". This spec **adds to** MEDICINES-TAB, STORE, RECEIVE and SETUP-TABS. Where they say "medicine", read "item" unless this file says otherwise.

Prototypes, all in `prototype/`:
- `medicines-tab.dc.html`
- `store.dc.html`
- `receive.dc.html`
- `rules.dc.html`
- `going-live.dc.html`

## A. Source and scope

- **Source:** EMHSLU 2023, published by the Ministry of Health.
  - Section B: General Health Supplies.
  - Section C: Specialist Health Supplies.
  - Section D: Laboratory supplies.
  - Each item carries its level of care (HC2, HC3, HC4, H, RR, NR) and VEN.
- **Load B and D** into the master catalogue (MEDICINES-TAB §11.1).
  - C (specialist: dental, ENT, eye, orthopaedic, renal, radiology) is loaded **only when the hospital turns it on**: one switch in Set-up › Medicines and supplies, off by default.
  - Keep EMHSLU's own spelling, the specification text and the level of care.
- **Item type** is a column on the item: `medicine | health_supply | lab_supply`.
  - It is set from the EMHSLU section (B and C → health supply, D → lab supply).
  - It is never typed by hand.
- **Supply categories** are the EMHSLU sub-headings. They are used where medicines use the class:

  | Code | Category |
  |---|---|
  | B1 | Administration sets, cannulas, needles and syringes |
  | B2 | Antiseptics, detergents and disinfectants |
  | B3 | Bandages and dressings |
  | B4 | Catheters and tubes |
  | B5 | Gloves |
  | B6 | Ligatures, suture materials and surgicals |
  | B7 | Protectives |
  | B9 | Ward and theatre supplies |
  | D1 | Laboratory: rapid tests |
  | D2 | Laboratory: test strips |

## B. Item attributes (new)

| Attribute | Meaning | Effect |
|---|---|---|
| `item_type` | medicine, health supply or lab supply | Filters, wording and tags everywhere |
| `level_of_care` | the lowest EMHSLU level allowed to hold it | Shown as "EMHSLU 2023 · from HC3"; the catalogue warns when the hospital's level is lower |
| `sterile` | a sterile single-use item | Receiving checks the seal (§E); put-away says "keep sealed" |
| `test_kit` | a lab kit stored at 2–30 °C | Receiving asks about storage on the way (§E); its own expiry warning rule |
| `no_expiry` | e.g. a safety box | No expiry needed at receiving, counts or batches; shown as "no expiry" |
| `free` | issued free (national programme kits) | Never billed |

**Units:** supplies count in `piece`, `pair`, `packet`, `roll`, `test`, `strip` and `bottle`. Pack sizes come from the catalogue.

**Sale:**
- Supplies are **issued, not dispensed**. They go out on requisitions and top-up runs to places, and never appear in Dispense.
- A patient is billed for a supply only when a price is set on it.

## C. Set-up › Medicines and supplies (MEDICINES-TAB changes)

- **The tab is renamed** "Medicines and supplies" everywhere: the tab bar, Going live links, and the Main store's Stock tab bar.
- **A type switch** sits beside "Add from the catalogue": `Everything · n`, `Medicines · n`, `Health supplies · n`, `Lab supplies · n`. It filters the list, the tiles and the views.
- **The first view** is "Everything", not "All medicines".
- **Tile and column wording:**
  - The Items tile reads "n medicines · n supplies".
  - The name column header is "Item", "Medicine" or "Supply", following the switch.
- **The search placeholder** is "Find a medicine, supply or class".
- **Filters** gain:
  - item type (enum)
  - the supply forms
  - sale "Supply (issued, not dispensed)"
  - handling "Sterile" and "Kit, 2–30 °C"
- **The row group** reads "EMHSLU 2023 · from <level>".
- **Flags and edit dialog:** the flag list and the edit dialog's flags gain Sterile and Kit. The unit picker gains the supply units.
- **The catalogue dialog** shows supplies under their EMHSLU categories, with the same tick-and-add flow.

## D. Stock › Main store (STORE changes)

- **Header line:** "n medicines · n supplies · UGX … on hand".
- **Stock health** gains the same type switch (`Everything · 18`, `Medicines · 11`, `Health supplies · 5`, `Lab supplies · 2` in the seed).
  - It filters the table **and** the "Months of stock in the store" chart.
  - The sub-heading follows the switch: "· health supplies".
  - Under each supply's name sits a small tag: "Health supply · sterile" (teal) or "Lab supply · 2–30 °C" (blue).
  - The first column header is "Item".
- **Store value by VEN class:** the legend sub-lines say "n items".
- **Shelves:**
  - `E` holds health supplies (sterile consumables, PPE).
  - `L` holds lab supplies kept at 2–30 °C.
  - Both are counted like any other shelf.
- **Requisitions** from wards carry supply lines (gloves, malaria RDTs, cannulas, AD syringes). They are shared, issued and dispatched exactly like medicine lines.
- **Issue and loss dialogs:** the picker label is "Medicine or supply". Picker options for supplies are prefixed `[Supply]` or `[Lab]`.
- **Expiry:** a `no_expiry` batch shows "no expiry" and never appears in Expiry or At risk.

## E. Stock › Receive a delivery (RECEIVE changes)

- **Line tags:** "Health supply" or "Lab supply", plus "Sterile", "Kit · 2–30 °C" or "No expiry". Put-away tags read "Sterile · keep sealed" and "Kit · 2–30 °C".
- **Sterile lines** show "Packaging and sterile seal on the packs", a choice of `Intact, dry and in date` or `Broken, wet or torn`.
  - **Not answered:** "Line n: check the packaging and sterile seal on the packs."
  - **Broken:**
    - The line's word is "Sterile seal broken".
    - The note is "A broken, wet or torn sterile pack is not sterile. Tick Some are not accepted, count the broken packs as damaged, and give them back to the driver."
    - The problem is "Line n: the sterile seal is broken. It cannot go into stock: reject the broken packs as damaged."
    - It blocks while any accepted packs remain.
- **Test kits** show "Were the test kits kept at 2–30 °C on the way?", a choice of `Yes, 2–30 °C` or `No, it got hot`.
  - **Not answered:** "Line n: confirm the test kits were kept at 2–30 °C."
  - **Hot:**
    - The word is "Kits kept above 30 °C".
    - The note is "Test kits kept above 30 °C can give false results. Keep them apart and ask the supplier, or reject them."
    - The problem is "Line n: the kits were kept above 30 °C. Reject them, or keep them apart until the supplier answers."
- **No-expiry items:**
  - The expiry label is "Expiry (none for this item)", and no expiry is required.
  - The note is "This item has no expiry date. Give the batch or lot number only."
- **The catalogue picker:**
  - The search label is "Find a medicine or supply".
  - The chips are `Everything`, `Medicines`, `Health supplies`, `Lab supplies`.
  - The sub-line adds the type, "Sterile" and "Kit, 2–30 °C".
  - The empty text is "Nothing by that name in your medicines and supplies."
- **Data:** add `seal` (`ok|broken`) and `kit_temp` (`ok|hot`) to the receipt line. The database refuses a stock-in of a sterile line with `seal = broken` and accepted > 0, or a kit line with `kit_temp = hot` and accepted > 0, each with a guard test.

## F. Rules (SETUP-TABS changes)

A new group, **Health and lab supplies**, applies to Medicines and Stock. It is unsigned until signed, and each rule is a "Prototype default":

| Rule | Value | Applies to |
|---|---|---|
| Sterile packs | A broken, wet or torn sterile pack is rejected as damaged, never stocked | Sterile health supplies |
| Test kits | Kept at 2–30 °C; kits that got hotter are kept apart until the supplier answers | Laboratory test kits |
| Kit expiry warning | Warn {n} before a test kit expires (60 days, 30–180, step 15) | Laboratory test kits |
| No expiry | Received by batch or lot only, with no expiry date | Safety boxes and items marked no expiry |
| Issued, not sold | Go out to places on requisition; patients are billed only when a price is set | Health and lab supplies |

The Medicines tab's rule groups gain `sterile` and `kit`, mapped to the items with those flags.

## G. Going live (SETUP-TABS changes)

Two items are added under **Places and stock**:
- "Health and lab supplies loaded from EMHSLU 2023": Sections B and D, checked automatically from the item count, owned by the store keeper.
- "Top-up levels for health and lab supplies": checked automatically, owned by the store keeper.

## H. Acceptance

1. Set-up shows 28 supplies (21 health, 7 lab) beside 47 medicines. The type switch counts are right and filter the list.
2. The Main store's Stock health switch filters the table and the months-of-stock chart together.
3. A ward requisition with gloves and RDTs is shared, issued and confirmed like any medicine line.
4. Receiving:
   - A sterile line can't be added to stock until the seal is answered.
   - A broken seal blocks until the packs are rejected as damaged.
   - A kit marked hot blocks until rejected or kept apart.
   - A safety box needs no expiry.
5. Supplies never appear in Dispense, and are never billed without a price.
6. Section C items appear only after the switch is turned on.
