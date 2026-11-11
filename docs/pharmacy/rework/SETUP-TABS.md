# SETUP-TABS: Going live, Places, Rules and Messages, as designed on 3 Nov 2026

This file specifies the four remaining Set-up tabs. It **overrides** the matching PRD sections (§6.7 Set-up: Going live, Places, Rules, Messages; §6.x SMS reminders) and the matching TECH-SPEC rows. The Medicines tab (MEDICINES-TAB.md) and People and roster (PEOPLE-ROSTER.md) are specified separately. PRD safety invariants S1–S14 still apply.

The working references are four Design-canvas components in `prototype/`:

| File                 | Tab        |
| -------------------- | ---------- |
| `going-live.dc.html` | Going live |
| `places.dc.html`     | Places     |
| `rules.dc.html`      | Rules      |
| `messages.dc.html`   | Messages   |

In each one, the markup uses `{{holes}}`, `<sc-for>` and `<sc-if>`, and all behaviour is in `class Component`: `constructor` for data, `renderVals()` for logic and handlers. Port the behaviour **function for function**, with the same wording, thresholds, colours and flows. Rebuild the markup with Tide components.

**Shared for all four:**

- **Route:** `/pharmacy/setup?tab=<going-live|places|rules|messages>`. The tab bar reads: Going live · Places · Medicines · Rules · People and roster · Messages.
- **Page:** muted background `#f6f7f9`, with white cards (radius 22, soft shadow).
- **Colour:** no coloured side or left borders, and no very dark themes. Status colours always come with a word: OK `#dcfce7/#166534`, warning `#fef3c7/#92400e`, bad `#fde2e1/#9f1d1d`, info `#dbeafe/#1e40af`, neutral `#e4e7ee/#4a5574`.
- **Summary tiles act as filters.** Clicking one toggles it, with an active state of a teal border on `#ccfbf1`.
- **Two-signature rule changes** use the same mechanics as Medicines §9 (proposal → in-charge + second signer → applied). It is enforced by the existing DB trigger.
- **Toasts** are UI feedback only. Every action also writes an audit event.

---

## A. Going live (`going-live.dc.html`)

### A1. Readiness hero

- **Ring:** a 132 px ring with the percentage ready. The percentage is the average of each item's completion: auto items count their fraction (e.g. 41/47), manual items count 0 or 1.
  - Ring colour: teal while preparing; green when nothing blocks, and when live.
- **Status chip:** `Preparing` · `Practice day running` · `Live · parallel run` · `Live · paper retired`.
- **Headline:**
  - `n things block going live`, or `Ready to go live`, or `Live since Tue 3 Nov, 15:00.`
  - Sub line: `4 of 20 done · 1 overdue · n blockers are due after the go-live date.`
- **Go-live date** (date input, min tomorrow; disabled when live), with a countdown chip `in 13 days`. The chip turns red when 3 days or fewer are left and something still blocks.
- **Go live button:**
  - Disabled (grey, `not-allowed`) while anything blocks. The hint lists the first 3 blockers: `Opens when nothing blocks. Left: …; and n more.`
  - When enabled it opens a dialog:
    - checks: Nothing blocks · Practice day done · `n non-blocking items left, to finish during the parallel run`
    - **two signatures**: In-charge and Medical superintendent. Going live happens only when both have signed (enforced on the server).

### A2. Phases ("How the switch happens")

- **Four cards:**
  1. **Set up:** "Work through the checklist. Nothing here affects patients."
  2. **Practice day:** "Everyone signs in in practice mode and dispenses sample prescriptions. Practice data is wiped." Button: **Start practice day** / **End practice day**.
  3. **Parallel run · 2 weeks:** "MedSync is the record. Paper registers continue beside it, and differences are checked daily."
  4. **Paper retired:** "The in-charge and the medical superintendent stop the paper registers." Button: **Retire paper** (only when live).
- **States:** `Done` (green ✓) · `Now` (teal ring) · `Next`.
- **Practice mode is a real system mode.** It uses a separate practice dataset and a "Practice" banner on every screen, and it is wiped on end. Nothing in practice touches real stock or records.

### A3. Checklist (20 items, 4 groups)

- **Groups:**
  - Legal answers and safety switches
  - Places and stock
  - People and training
  - Rules, wording and reports
- Each group header shows `n of m` and a mini bar.
- **Filters:** `All · 20` · `Blocking · n` · `Overdue · n` · `Checked automatically` · `Done · n`.
- **Item kinds:**
  - **record:** a decision. **Record answer** opens a dialog with:
    - optional radio choices
    - Details (or "The answer" when there are no choices)
    - Decided by (required)
    - Errors: `Pick an answer.` · `Type the answer.` · `Say who decided.`
    - The answer shows in quotes under the item, and becomes the Rules value where it maps to one (e.g. witness by cadre).
  - **mark:** **Mark done** / **Undo**, recording who and when.
  - **auto:** computed from live data, with a progress bar `41 of 47 medicines · checked automatically`. There is no manual tick, only **Check again** to re-run the query.

| Item                                                         | Blocks | Auto source (query)                       |
| ------------------------------------------------------------ | ------ | ----------------------------------------- |
| Who may dispense and hand over when no pharmacist is on duty | yes    | record (3 choices)                        |
| The controlled-drug register                                 | yes    | record (2 choices)                        |
| Who may witness a controlled dose, by cadre                  | yes    | record → Rules › Controlled drugs         |
| Two-step sign-in on every pharmacy account                   | yes    | accounts with MFA / pharmacy accounts     |
| Development overrides unset                                  | yes    | mark (support)                            |
| Demo data kept in its own project                            | yes    | mark (support)                            |
| Places, devices and handover times                           | no     | open places with a device and slots       |
| Top-up levels for every medicine at every place              | yes    | lines with levels at each stocked place   |
| A price for every medicine stocked                           | no     | lines with a Cash price                   |
| Opening stock counted at every place                         | yes    | places with a signed opening count        |
| A sensor on every fridge, or typed readings set up           | no     | fridges with a sensor                     |
| Suppliers and the NMS cycle                                  | no     | mark                                      |
| Roster published for the first two weeks                     | yes    | published weeks from the go-live date (2) |
| A current licence for every pharmacist and technician        | yes    | `licState = ok/soon` among pharmacy staff |
| Prescriber list, with who may prescribe controlled drugs     | no     | mark (medical superintendent)             |
| Everyone trained on a practice day                           | yes    | staff who completed a practice dispense   |
| Workspace wording signed                                     | no     | mark                                      |
| Every rule group signed                                      | yes    | signed groups / groups                    |
| Luganda SMS templates checked                                | no     | mark                                      |
| HMIS 105 and NDA return columns confirmed                    | no     | record (2 choices)                        |

- **Item row:**
  - a tick circle (✓ green when done, `%` blue when in progress, empty ring otherwise)
  - the name, and a `BLOCKS GO-LIVE` chip (dark) for blockers
  - why
  - the progress bar or the answer
  - meta: `Done by … · when · Owner: … · due Fri 6 Nov (in 3 days)`. A late item reads `was due … (1 day late)`; a blocker due after the go-live date adds `· due after the go-live date`.
  - a status chip: `Done`, `In progress`, `Overdue` (red) or `To do`
  - **Open <tab>** link, the action button, and **Owner and date**. The last one opens inline: an Owner select (In-charge, Medical superintendent, Store keeper, IT officer, Records officer, MedSync support, A Luganda speaker, Ward in-charges), a Due date, and **Done**.
- When live, the action buttons are hidden. The checklist stays as a record.

### A4. Activity

- The latest 8 events: `3 Nov, 15:00 · Grace Namutebi recorded the answer to "…"`. It covers going live, the practice day, the go-live date, marks, answers and completions.

---

## B. Places (`places.dc.html`)

### B1. Header, rules, tiles, stock flow

- **Title:** `Places that hold stock · 6 open · 1 closed`, then **Add a place**.
- **Rule badges** (see §C for the dialog):
  - Handover: `n missed today` (red)
  - Cold chain: `n to act on · n no fridge` (red if out of range)
  - Billing
  - Supply: `n order due soon`
  - Opening and closing
- **Tiles:**
  - Places: `3 wards · 3 other`
  - Fridges in range: `3 of 3`, sub `2 places need a fridge`
  - Handovers missed today: with place names
  - Places with medicines out: `n lines out in all`
  - The tiles filter the grid: Fridges → places with a fridge or cold stock; Missed → places with a missed handover; Out → places with out lines.
- **Stock flow strip:** `NMS · JMS → Main store → OPD dispensary, Ward 3, Maternity, Paediatrics | UNEPI → EPI clinic`, built from each place's "Supplied from". Suppliers are grey chips, the store is teal, places are white.
- **Kind chips:** `All · n` · Store · Dispensing point · Ward · Clinic · Theatre · `Closed · n`. Plus a search.

### B2. Grid

- **Columns:** Place · Supplied from · Stock · Fridge · Handover today · On duty now.
  - **Place:** chevron + name + `Kind · billing (dispensing) · hours`, and a `CLOSED` chip.
  - **Stock:** `94 lines` + `2 out` (red) + `6 low` (amber), or `All OK` (green).
  - **Fridge:** `CR-01` + a live temperature chip (green, amber or red). With no fridge: `No fridge · cold stock here` (amber) if cold-chain lines are kept there, otherwise `None`.
  - **Handover today:** one chip per slot.
    - States: `08:00 ✓` (green; amber with `· n diff` when there are differences), `missed` (red, 30 minutes after the slot with no start), `now` (blue), `due` (grey).
    - Hovering gives the people, the time and the differences.
  - **On duty now:** up to 4 overlapping avatars, from the roster (current shift).
- Below 760 px the header hides and the cells wrap 2-up.

### B3. Open row (one page, muted panel, indented)

1. **About** (editable):
   - Name; Kind (Store, Dispensing point, Ward, Clinic, Theatre); Open (24 hours · Day only, 08:00–17:00 · Weekdays, 08:00–17:00)
   - Supplied from: Main store, or direct NMS, JMS / UNEPI / JMS. A Store cannot be supplied from itself.
   - Worked from (device)
   - Device status chip:
     - `Online · seen just now` / `n min ago` (under 15 minutes)
     - `Offline · last seen 3 h 40 min ago · entries will sync when back`
     - `Not in use`
   - **Dispensing points only:** "Billing at this point · from today", with Free point and Pay before collecting ("An emergency or an admitted patient is never held."). This moved here from Medicines.
2. **Stock here:**
   - `94 lines · 6 low · 2 out · UGX 8.9 m on hand`. EPI reads `vaccines, counted in doses`.
   - The low and out lines, with chips.
   - **Open in Medicines**, filtered to this place.
3. **Handover:**
   - slot chips 08:00 / 17:00 / 20:00, toggle to set them
   - the last 3 handovers: `3 Nov, 08:00 · Brian Okello → Joseph Ssemakula`, with `08:12 · 1 difference` (amber), `no differences` (green) or `Missed` (red)
4. **Cold chain:**
   - each fridge kept here: temperature chip, then `Sensor SN-44A1 · live 14:52 · today 4.1–5.2 °C`, or `No sensor · typed at 08:00 · …` with **Record a reading**
   - If there's no fridge but cold-chain lines are kept here, a warning: `No fridge here, but Insulin (soluble) 100 IU/mL is kept here. Add a fridge below and keep it at this place, or move the stock.` The same check feeds Medicines' "No fridge" check.
5. **On duty today:** a chip per person (`Name · Day` / `On call`), and **Open the roster**.

- **Footer:**
  - **Close this place** / **Reopen this place**, with these guards:
    - stock lines > 0 → `Move or issue out its stock first: 94 lines are still here.`
    - a handover open now → `A handover is open. Finish it first.`
  - A closed place keeps its history, e.g. `Closed 3 Nov 2026 by Grace Namutebi`.
  - **Cancel** · **Save changes**. Validation: `Give the place a name.` · `A place with this name already exists.` · `A store cannot be supplied from itself. Pick its supplier.` A billing change flashes `… Billing changes apply from today.`

### B4. Add a place (dialog)

- Fields: Name, Kind, Open, Supplied from, Worked from. Kind sets the default device (Store → Store desk, Dispensing point → OPD station, Ward → Ward tablet, Clinic → EPI tablet, Theatre → Shared station). Choosing Store sets "Supplied from" to NMS, JMS.
- Hint: "Handover times are set from the opening hours: 24 hours → 08:00 and 17:00; day only → 08:00. …"
- On save, the new row opens, with the flash `Added … Set its top-up levels on Medicines.`

### B5. Cold chain (section, "Live")

- **Per fridge:**
  - `CR-01 · Main store cold room`, where it is kept, and the sensor or `no sensor, typed readings`
  - a large temperature, and a state chip: `In range` (2.5–7.5 °C) · `Near limit` (within 0.5 °C of 2 or 8) · `Out of range` (<2 or >8). The thresholds come from Rules › Stock and cold chain.
  - a **gauge**, 0–10 °C: red | amber | green 2.5–7.5 | amber | red, with a dark marker at the current value
  - `Today 4.1–5.2 °C · n excursions in 7 days`
  - for typed fridges, a reading chip per check (08:00, 17:00): `08:00 · 6.1 °C` (green), `due` (grey), `not typed` (red, 30 minutes after the check)
  - **Record a reading**, **Link a sensor** / **Unlink sensor**, and **Kept at** <place select> (moves the fridge)
  - the excursion lines (amber)
- **Record a reading** (dialog):
  - Time (HH:MM, prefilled with now). A reading within 90 minutes of 08:00 or 17:00 counts for that check.
  - Temperature °C (−30 to 40).
  - "If outside 2–8 °C: what did you do?", required when out of range. A red note shows: `Outside 2–8 °C. Saving opens an excursion; say what you did below.`
  - Saving out of range creates an excursion and alerts the in-charge.
- **Add a fridge:** ID (upper-cased, unique) + kind. It starts unplaced.
- **Link a sensor:** sensor ID. Readings arrive every 15 minutes, live through Realtime.

### B6. Suppliers (section)

- **Per supplier:**
  - name, plus a chip: `Order due in 6 days` (amber, ≤ 14 days) or `Order now` (red, ≤ 3 days). The due date is the next cycle − 7 days (Rules › Ordering › Order due).
  - what they supply
  - `Every 2 months · next cycle 16 Nov · lead time 21 days`
  - a budget bar: `UGX 31.2 m of UGX 48 m this cycle · 65%`. Teal; amber at 75 %; red at 90 %.
  - the contact, and **Call** (only when a phone number is saved)
- **Edit / Add:** name, what they supply, order cycle (months; 0 = as needed), next cycle date, lead time (days), budget (UGX), used so far, budget period, contact, phone. Validation: `Used so far is more than the budget.`
- **Do not invent supplier phone numbers.** Leave them empty until the owner enters them.

---

## C. Rules (`rules.dc.html`)

### C1. Header

- `Every rule MedSync enforces · 46 rules in 10 groups`, a one-line explanation, and a search (rule, wording, applies to, group).
- **Tiles:**
  - Rules in force
  - Waiting for signatures: `n with one signature`
  - Groups not signed: names (amber)
  - Last change
  - The tiles filter the group list: pending → groups with proposals; unsigned → unsigned groups.

### C2. Waiting for signatures

- **Each proposal:**
  - `GROUP · RULE`
  - **old** (struck through, red tint) → **new** (green tint)
  - `Why: …`
  - meta: `Proposed by … · when · applies to … · 1 of 2 signatures`
  - **Sign as in-charge** / **Sign as second signer**. **The proposer cannot be the second signer**: the button is disabled with that tooltip, and the server enforces it.
  - **Reject**: inline "Why (shown to the proposer)", required (`Say why, so the proposer knows.`), then a history entry `Rejected`.
  - **Withdraw**.
- When both have signed, the change applies immediately: the checks read the new parameter. Flash: `Both signed. The checks use the new value from now.`

### C3. Groups and rules

- **Left list:** group title, `Shows on …` (tabs), the rule count, and a flag: `Not signed` or `n waiting`.
- **Right:**
  - the title, `Shows on` link chips, and `Signed` / `Not signed`
  - Unsigned groups get a banner: "Not signed yet. The checks use these prototype defaults until the in-charge and a second signer sign the group." Plus the two sign buttons.
  - **Table:** Rule (+ `Signed 12 Oct · …` / `Changed …` / `Prototype default`) · What it says (+ a teal parameter chip, e.g. `90 days`; + `Change waiting`) · Applies to · **Change**.
- **Change (inline):**
  - **Parameter rules:** a number with − / + stepping by `step`, the unit, and `allowed min–max`. Errors: `Type a number.` · `Keep it between 30 and 365 days.` · `That is the current value.`
  - **Text rules:** the new wording. Error: `That is the current wording.`
  - `Will read: <full sentence>`, Why (required), and `Applies to: … Shows on …`.
  - **Send for signing**.
- **+ Add a rule to this group:** rule name, what it says, why. It goes through the same signing; the proposal is shown as `<name> (new)`.
- **Groups and parameters** (default values; the units are stored with them):

| Group (shows on)                                        | Parameter rules (n, unit, min–max, step)                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Controlled drugs (Medicines, Dispense, Controls)        | Offline entries 12 hours (1–48)                                                                                                                                    |
| Shift handover (Places, Controls)                       | Missed 30 minutes (10–120, 5)                                                                                                                                      |
| Investigations (Controls)                               | Deadline high 24 h (4–72); medium 48 h (12–120)                                                                                                                    |
| Prescription checks (Dispense, Medicines), **unsigned** | none (text)                                                                                                                                                        |
| Stock and cold chain (Medicines, Places)                | Expiry warning 90 days (30–365, 15); Near the limit 0.5 °C (0.1–2, 0.1); Excursion 30 minutes (5–120, 5)                                                           |
| Ordering (Stock, Places), **unsigned**                  | Order covers + 1 month buffer (0–3); Order due 7 days (1–30)                                                                                                       |
| Prices and billing (Medicines, Places)                  | Price rule cost + 25 % (0–100), rounded to UGX 50                                                                                                                  |
| Roster and people (People)                              | People per shift 2 (1–4); Shifts a week 6 (3–7); Late 10 min (0–60, 5); Not signed in 15 min (5–60, 5); Leave notice 7 days (0–30); Licence warning 30 days (7–90) |
| Swaps and who makes the roster (People)                 | none                                                                                                                                                               |
| Messages (Messages)                                     | Per patient 3 SMS a week (1–7); Monthly cap 100 % (50–100, 5)                                                                                                      |

- The full text of every rule is in the prototype's `constructor`. Copy it verbatim.
- **This is the one registry.** The rule badges on Medicines, Places and People read from it, and the checks across the app read their parameters from it. Nothing is hard-coded.

### C4. History

- Filter: `All groups` | `This group only`.
- Each entry: date · `Group · Rule` · ~~from~~ → **to** · `Proposed by … · signed by …` or `rejected by …: "…"` · a kind chip (`Changed` and `Added` green; `Rejected` red; `Group signed` grey).

---

## D. Messages (`messages.dc.html`)

### D1. SMS this month

- The header has a `Connected` / `Not connected` chip, and rule chips: `Quiet 20:00–07:00` · `At most 3 a week per patient` · `Stops at 100% of budget`. The chips come from Rules › Messages.
- **Tiles:** Sent · Delivered % · Failed (`retried once automatically`) · Queued (`held by quiet hours`) · Opted out (`of 3,412 who agreed`). Delivered, Failed and Queued filter the outbox.
- **Budget bar:** `UGX 35,840 of 60,000 · 60%`. Teal; amber at 80 %; red at 100 % with `· sending stopped`. There's an editable **Monthly budget UGX**. The spend is the parts sent × cost per SMS.

### D2. SMS provider

- **Fields:** Provider · Sender ID (upper-case, A–Z 0–9 and space, max 11) · API key (password) · Cost per SMS (UGX) · Facility name in SMS. The fields are locked while connected.
- **Connect:**
  - Validation: `Fill in the provider, sender ID and API key.` · `Type the cost per SMS, so the budget works.`
  - Flash: `Connected. Send a test SMS, then turn the messages back on below.`
- **Disconnect** turns every message off.
- **Test SMS:**
  - Accepts a Ugandan mobile number (`+256 7xx xxx xxx` or `07xxxxxxxx`) and normalises it.
  - It appears in Recent messages as `Test`.
- **Store the API key server-side only** (encrypted secret). Never send it to the client after saving; show it masked.

### D3. What gets sent (templates)

- **Audience chips:** All · Patients · Staff.
- **Patients:**
  - Refill due (3 days before)
  - Missed refill (1, 7 days after)
  - Antibiotic course (day 3)
  - Immunisation visit tomorrow (1 day before)
  - Missed immunisation (3, 14 days after; off by default)
- **Staff:**
  - Shift tomorrow (18:00 the evening before)
  - Shift changed (at once)
  - Next week not published (Thursday 16:00)
  - Licence expiring (30 days before)
  - The staff messages are the same switches as People › Reminders, so keep them in one setting.
- **Each row:**
  - an on/off switch. It's blocked when disconnected: `Connect the SMS provider first.`
  - the name, and `timing label: value` (`Off · …` when off)
  - language chips: `English`; `Luganda`, `Luganda · not checked` (amber) or `No Luganda` (grey)
  - `n this month`
  - **Edit**
- **Editor** (inline, muted):
  - the timing input
  - English | Luganda tabs and a textarea
  - insert chips: `{facility} {first name} {date} {medicine} {child name}` for patients; `{first name} {date} {shift} {place} {time}` for staff
  - a count: `124 characters with sample details · 1 SMS · about UGX 35 each`. GSM-7 is 160 per SMS, then 153 per part; any non-GSM character switches to 70, then 67.
  - **Warnings:**
    - more than 2 parts
    - non-GSM characters ("halve the length")
    - a patient message without "STOP"
    - Luganda empty: "Patients who chose Luganda get the English one."
  - Luganda: "Checked by a native Luganda speaker. Until then this message goes in English only." Editing the Luganda text clears the checked flag.
  - **Preview:** an SMS bubble with sample details, `From MEDSYNC · sent between 07:00 and 20:00` (or `quiet hours now: held until 07:00`, or the staff time).
  - **Send this to the test number** · **Reset wording**.
- **Do not write Luganda text.** It is entered and checked by a native speaker.

### D4. Recent messages (outbox)

- **Filters:** All · Failed · Queued · Delivered, with counts.
- **Each row:** the time · type · masked number `+256 7•• ••• 093` · language and note (e.g. `Phone switched off`, `Quiet hours: goes at 07:00`) · a status chip (Delivered green, Sent blue, Failed red, Queued amber) · **Retry** for failed ones.
- Delivery status comes from the provider callback.

### D5. Consent and opt-outs

- **Consent bar:** `3,412 of 4,020 patients agreed · 85%`. "Patients are asked at registration. Replying STOP opts them out at once. Opting back in is done at the desk, with the patient present."
- **Opt out:**
  - a phone number, plus a reason: Asked at the desk · Wrong number · Patient has died · Shared phone, privacy
  - Duplicates are refused.
  - The list shows the masked number and `reason · date`. **Opt back in** flashes `Note it in the patient's record.`
- An inbound `STOP` (provider webhook) opts out instantly.

---

## E. Data model (map onto existing tables first; see TECH-SPEC §0)

| Table                     | Columns                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `golive_items`            | `key`, `group`, `name`, `why`, `blocks`, `kind` (record, mark, auto), `owner_role`, `due_on`, `status`, `answer`, `answer_choice`, `decided_by`, `done_by`, `done_at`, `link_tab`; plus `golive_state` (`target_date`, `phase` (setup, practice, parallel, retired), `live_at`, `sign_in_charge`, `sign_ms`) and `golive_events`                                                 |
| `practice_sessions`       | `started_by`, `started_at`, `ended_at`; practice data in a separate schema, wiped on end                                                                                                                                                                                                                                                                                         |
| `places` (extend)         | `kind`, `hours`, `supplied_from` (place id or supplier ids), `device_id`, `handover_slots time[]`, `free`, `pay_first`, `closed_at`, `closed_by`, `closed_note`                                                                                                                                                                                                                  |
| `devices`                 | `id`, `place_id`, `label`, `last_seen_at`                                                                                                                                                                                                                                                                                                                                        |
| `fridges` (extend)        | `code`, `name`, `place_id` (nullable), `sensor_id` (nullable)                                                                                                                                                                                                                                                                                                                    |
| `fridge_readings`         | `fridge_id`, `at`, `temp_c`, `source` (sensor, typed), `slot` (08:00, 17:00, null), `typed_by`, `note`                                                                                                                                                                                                                                                                           |
| `fridge_excursions`       | `fridge_id`, `started_at`, `ended_at`, `peak_c`, `action_note`, `checked_by`                                                                                                                                                                                                                                                                                                     |
| `suppliers` (extend)      | `name`, `what`, `cycle_months`, `next_cycle_on`, `lead_days`, `budget_ugx`, `budget_period`, `contact`, `phone`                                                                                                                                                                                                                                                                  |
| `handover_sessions`       | Existing. Used for the today chips and the history (`place_id`, `slot`, `started_at`, `from_id`, `to_id`, `differences`).                                                                                                                                                                                                                                                        |
| `pharmacy_rules` (extend) | `group_key`, `key`, `name`, `text_template` (with `{n}`), `applies_to`, `params jsonb` (`n`, `unit`, `min`, `max`, `step`), `signed bool`; groups table with `shows_on text[]`, `signed`, signatures; proposals with `kind` (change, new), `new_value`, `reason`, `proposed_by`, `status`, `reject_note`; signatures with `role`. **Trigger:** the proposer ≠ the second signer. |
| `sms_provider`            | `name`, `sender_id`, `api_key_secret_ref`, `cost_ugx`, `facility_label`, `connected`                                                                                                                                                                                                                                                                                             |
| `sms_templates`           | `key`, `audience`, `name`, `timing`, `on`, `text_en`, `text_lg`, `lg_checked_by`, `lg_checked_at`                                                                                                                                                                                                                                                                                |
| `sms_outbox`              | `template_key`, `to_phone` (encrypted), `lang`, `parts`, `cost_ugx`, `status` (queued, sent, delivered, failed), `note`, `provider_msg_id`, `created_at`, `sent_at`, `delivered_at`                                                                                                                                                                                              |
| `sms_optouts`             | `phone`, `reason`, `source` (stop_reply, desk), `at`, `by`                                                                                                                                                                                                                                                                                                                       |
| `sms_settings`            | `monthly_budget_ugx`                                                                                                                                                                                                                                                                                                                                                             |

## F. Derivations (pure, unit-tested; port from each `renderVals`)

- **Going live:** `itemStatus`, `readiness%`, `blockersLeft`, `overdue`, `canGoLive`, `phaseIndex`.
- **Places:**
  - `handoverToday(place, now)`: done, missed (start + 30 min, from Rules), now, due
  - `fridgeState(temp, rules)`: ok, near, out
  - `readingSlot(time)`: within 90 minutes
  - `typedDue(fridge, now)`
  - `deviceStatus(lastSeen)`: under 15 minutes = online
  - `orderDue(supplier, rules)`
  - `budgetPct`
  - `stockFlow(places)`
  - `canClose(place)`
  - `coldWithoutFridge(place)`
- **Rules:** `ruleText(rule, n)` (unit pluralising, `%` with no space), `validateParam`, `applyProposal`, `canSecondSign(proposal, actor)`, `searchRules`.
- **Messages:**
  - `smsParts(text)` (GSM-7 / UCS-2)
  - `fillSample`, `templateWarnings`, `isQuiet(now, rules)`, `spend(month)`
  - `normalisePhoneUG`, `maskPhone`
  - `canSendLuganda(template)`

## G. Server actions

- **Going live:** `setGoLiveDate`, `recordAnswer`, `markItem`, `unmarkItem`, `setItemOwner`, `startPractice`, `endPractice` (wipes practice data), `signGoLive(role)` (live when both have signed), `retirePaper`.
- **Places:** `addPlace`, `updatePlace`, `closePlace` / `reopenPlace` (guards), `setHandoverSlots`, `addFridge`, `moveFridge`, `linkSensor` / `unlinkSensor`, `recordReading` (opens an excursion when out of range), `upsertSupplier`.
- **Rules:** `proposeChange`, `proposeNewRule`, `signProposal(role)`, `rejectProposal(note)`, `withdrawProposal`, `signGroup(role)`.
- **Messages:** `connectProvider`, `disconnectProvider`, `sendTest`, `toggleTemplate`, `updateTemplate`, `markLugandaChecked`, `retry`, `optOut`, `optIn`, `setBudget`, plus the provider webhooks for delivery status and STOP.
- **The scheduler** (cron) sends due reminders. It respects consent, opt-outs, quiet hours (holding until 07:00), the per-patient weekly cap and the monthly budget cap.

## H. Permissions

| Actor                                       | Can                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Pharmacy in-charge                          | Everything here. Signs as in-charge (rules, go-live). Approves practice and paper retirement. |
| Second signer (a pharmacist named in Rules) | Signs rule changes as second signer, except their own proposals.                              |
| Medical superintendent                      | Signs go-live. Owns the legal answers and the prescriber list.                                |
| Store keeper                                | Records fridge readings, edits suppliers, opening counts.                                     |
| Other pharmacy staff                        | View. Record fridge readings. Propose rule changes.                                           |
| MedSync support                             | Marks support items.                                                                          |

## I. Acceptance (add to the PRD scenarios)

1. **Go live:** stays disabled while any blocker is open. With none, it needs both signatures; one alone does not switch on. The server refuses otherwise.
2. **Auto items** reflect live data (adding a price moves `41 of 47`) and cannot be ticked by hand.
3. **Practice day** data never appears in real stock or records, and is wiped on end.
4. **Places:** a missed handover shows red 30 minutes after its slot (the Rules value). Changing the rule to 45 minutes moves it.
5. **Cold-chain lines** at a place with no fridge show the warning on Places and the check on Medicines.
6. **A typed reading** outside 2–8 °C needs a note and opens an excursion. One within 90 minutes of a check satisfies it.
7. **Closing a place** with stock is refused, with the message. Reopening restores it, with its history.
8. **Rules:** a parameter outside min–max is refused. The proposer can't second-sign. After both signatures, the dependent checks (e.g. expiry warning at 120 days) change at once.
9. **Rejecting** needs a note, and shows in History.
10. **Messages:**
    - an em dash or curly quote switches to a 70-character SMS and shows the warning
    - a patient template without STOP warns
    - Luganda isn't sent until it's checked
11. **Quiet hours** hold messages until 07:00. At 100 % of the budget, sending stops.
12. **Opt-outs:** STOP opts out instantly, and desk opt-outs refuse duplicates.
13. **At 390 px:** no horizontal page scroll, every dialog works by keyboard, axe is clean, and there are no console errors.

## J. Prototype-only (do not ship)

- The fixed date `2026-11-03` and the actor `Grace Namutebi`.
- Sample data:
  - the checklist progress and the "Check again" increments
  - handover history, the duty list and device last-seen
  - fridge temperatures, and the 4 s jitter ticker (use Realtime)
  - supplier budgets
  - the 1,024 SMS figures, the 94 % delivered and 3 % failed rates, the outbox rows and the consent counts
  - the sample proposals and history
- The masked API key placeholder.
- Seed fixtures go only in `scripts/seed-pharmacy-dev.ts`.
