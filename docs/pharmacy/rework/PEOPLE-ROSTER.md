# PEOPLE-ROSTER: Set-up › People and roster, as designed on 3 Nov 2026

This file specifies the People and roster tab. It **overrides** PRD §6.x "People" (roster and duty, prescriber list), and the `pharmacy_duty_roster` row in TECH-SPEC §3. Where this file is silent, PRD safety invariants S1–S14 still apply. S10 matters most here: a witness must be on duty, in the required role, at that place, now.

The working reference is `prototype/people-roster.dc.html`. It is a Design-canvas component:

- The markup uses `{{holes}}`, `<sc-for>` and `<sc-if>`.
- All behaviour is in `class Component`: `constructor` holds the data and constants, and `renderVals()` holds the logic and handlers. The helper methods are `avatar`, `holidays`, `phoneOf`, `dayMeds` and `readPhoto`.
- Port it **function for function**, with the same wording, thresholds, colours and flows. Rebuild the markup with Tide components.

---

## 0. What it is and where it lives

- **Route:** `/pharmacy/setup?tab=people`. The tab bar reads: Going live · Places · Medicines · Rules · **People and roster** · Messages.
- **Who edits:** the **pharmacy department** only. It holds the Main store and the dispensing points (places of kind Store or Dispensing point). The roster drives:
  - who can witness (S10)
  - who can take over at a handover
  - the named people on records
- **Doctors and nurses** are **view only**. Each ward in-charge makes their own ward's roster in the wards module. This tab reads those rosters to contact staff and to see what they prescribed or gave.
- **Page order, top to bottom:**
  1. On duty now
  2. Roster card: toolbar, who makes the roster, rule badges, coverage line, then the week, month or phone day view
  3. Swap requests
  4. Leave and days off
  5. Load and Reminders, side by side
  6. People and Prescribers, side by side
- Dialogs: slot (assign / card / contact), rules group, hand over, ask for a swap, ask for leave, add a person.

## 1. Concepts (use these exact meanings)

| Term              | Meaning                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shift             | **Day** 08:00–17:00 · **Night** 17:00–08:00 · **On call** 17:00–08:00, by phone. Each place staffs some of these: Main store = Day + On call; OPD dispensary = Day; wards = all three; EPI clinic = Day.         |
| Slot              | One place × one shift × one date. Capacity: Day/Night **2**, On call **1**.                                                                                                                                      |
| Can witness       | Cadres Pharmacist, Pharmacy technician, Nurse, Nurse in-charge, Midwife, Doctor. **Store keepers cannot witness.**                                                                                               |
| Unwitnessed shift | A Day or Night shift at a ward or pharmacy place with fewer than **2 people who can witness**. Clinics (EPI) are exempt.                                                                                         |
| Gap               | A slot with nobody, or an unwitnessed shift.                                                                                                                                                                     |
| Week              | Monday to Sunday. A week is **Draft** or **Published · locked**.                                                                                                                                                 |
| Roster maker      | The **pharmacy in-charge**, or someone the in-charge has handed it to (a delegate) for some or all pharmacy places, until an optional end date.                                                                  |
| Rest break        | Day shift the morning after a night · day and night on the same date · more than **6** Day/Night shifts in a week (on call does not count).                                                                      |
| Licence           | Practising licence: Pharmaceutical Society of Uganda for pharmacists; Allied Health Professionals Council for pharmacy technicians and dispensers. _(Confirm both with the owner.)_ Store keepers: not required. |

## 2. On duty now (card at the top)

- Heading: green dot + "On duty now". On the right: `Tue 3 Nov · 13:08 · Day shift 08:00–17:00`. Between 17:00 and 08:00 it reads `Night shift 17:00–08:00, with on call`, and before 08:00 it uses the previous date's night.
- Two panels: **PHARMACY** and **DOCTORS AND NURSES**. Each lists the people on the current shift(s) at those places:
  - a 28 px avatar
  - the name
  - `Cadre · Place` (with ` · on call` for on call)
  - for pharmacy staff only, an attendance chip: `In 07:48` green, `Late` amber, `Not in` red
  - a round **Call** link (`tel:`)
- If a panel is empty, it says "Nobody on this shift."

## 3. Roster card

### 3.1 Toolbar (left to right; wraps)

1. **Department** segmented control: `Pharmacy` | `Doctors and nurses`. Switching resets the place filter and closes any open dialog.
2. **View** segmented control: `Week` | `Month`.
3. **Period:** ‹ label ›. The week label reads `2 Nov – 8 Nov 2026`; the month label reads `November 2026`. The aria labels are Previous/Next week or month.
4. **Today:** goes to the current week and month, and picks today in the phone view.
5. **Month view only:** a Month select (January–December) and a Year number box (1900–2200). Any year works.
6. **Place filter** (funnel icon): `All places` plus the current department's places.
7. **Right side, Pharmacy + Week only:**
   - a status chip: `Draft · not published` (grey) or `Published · locked` (green)
   - **Copy last week**: copies only the places you may edit
   - **Fill gaps** (§8)
   - **Print** (icon button, §14)
   - **Publish week** (primary teal) or **Unlock to edit** (outline)
   - In Month view, the right side reads "Click a day to open its week and edit."

### 3.2 Who makes the roster (strip, Pharmacy only)

- The strip reads: `Made by` [avatar · **Grace Namutebi** · Pharmacy in-charge], then `Handed to`, then a chip for each active delegate. A chip reads [avatar · **Brian Okello** · OPD dispensary · until 30 Nov · can publish], and the in-charge sees **Take back** on it.
- On the right:
  - a note chip. When you can't edit, it reads `View only`. A delegate sees `You can change: OPD dispensary`.
  - **Acting as** select: prototype only (§20)
  - **Hand over this duty**: in-charge only
- **Doctors and nurses** shows a note instead: a `View only` chip and the line "Doctors' and nurses' rosters are made by each ward's in-charge. Click anyone to contact them, or to see what they prescribed or gave that day."

### 3.3 Rule badges (row)

- The row reads `Rules`, then one pill per group: `Scope · n`, plus an issue chip when one applies and `n to sign` when a change is pending. Issue chips are amber; rest breaks, expired licences and staff not signed in use red.
- Groups, in order: Witnessing · Shift cover · Rest and hours · Who works where · Handover · Who makes the roster · Swaps · Leave · Licences · Attendance · Publishing · Prescribers. The full text is in §11.

### 3.4 Coverage line and legend

- `81 of 91 shifts have someone · 10 with nobody · 12 without a second person who can witness, so controlled doses there need a witness from elsewhere.` It counts the current department's places for the shown week.
- Month view: `November 2026: 8 of 30 days rostered · 20 shift gaps · 22 days not rostered yet.`
- Legend: a swatch for each of Day, Night and On call, with their times.

### 3.5 Week view (≥ 761 px)

- **Grid:** `10.5rem` label column + 7 day columns (min 120 px), with horizontal scroll inside the card at a 1080 px minimum width.
- **Day header:**
  - `MON` and the date number, in teal with a teal underline on today
  - `n day · n night`
  - `n gaps` in amber, when there are any
  - the public holiday name, as a red-tint chip, when there is one
- **Pharmacy only, a first row "Leave and off":**
  - Its label reads `Approved · asked`.
  - Each day cell (grey tint) lists people on leave. Approved leave shows a grey chip with the first name. Leave still being asked for shows a white chip with an amber outline and `Name ?`. Hovering gives `Name · type · approved/waiting for approval`.
- **For each place:**
  - a header row (name + kind, top rule)
  - then one row per staffed shift: swatch, label and time
  - then 7 cells
- **A cell** holds:
  - the person cards
  - a dashed **+** when there's room and you may edit
  - a note: `Nobody on duty` (red text) or `No witness` (amber)
  - Today's column has a `#f0fdfa` tint. While dragging, valid targets get a 1.5 px teal inset ring.
- **A person card** (shift-tint background: Day `#fff1cc`, Night `#e4e7ee`, On call `#ede9fe`, with no side borders) holds:
  - a 24 px avatar (photo, or initials on a tint)
  - the name
  - a sub line, picked in this priority order:
    1. `Licence expired`
    2. `On leave · take off`
    3. `Rest rule: <reason>`
    4. `Swap requested`
    5. attendance: `In 07:52`, `Late · in 08:22`, `Not signed in`, `Did not sign in`
    6. otherwise `Cadre · 08:00–17:00`
  - a grip icon
  - Outline: a red inset ring for the first three and for not signed in; amber for late.
- **Drag and drop** moves a person between slots in editable places only. Dropping where the person doesn't work flashes `<Name> does not work at <Place>`. On success it flashes `Moved <Name> to <Shift> at <Place>`.

### 3.6 Month view

- A 7-column grid of cells (from Monday). Days outside the month are dimmed. Today has a teal ring and a filled teal date.
- **A day cell** shows:
  - the date
  - the holiday name (red, truncated)
  - a lock icon if that week is published
  - `Day n`, `Night n`
  - up to 3 overlapping faces + `+n`
  - `n gaps` in amber
  - or `Not rostered`
- Clicking a day opens that week in Week view, with that day picked.
- **Phones (≤ 760 px):** each cell shrinks to its date and a dot: green when covered, amber when there are gaps.

### 3.7 Phone day view (≤ 760 px)

- A row of 7 day chips (picked = tint `#ccfbf1`). Under it, for each place, its shifts with full-width cards, a `+ Assign` button and notes (`No witness on this shift`).

## 4. Slot dialog

- **Assign** (`+`):
  - Title `Assign to <Place>`. Sub line: `Tue 3 Nov · Day 08:00–17:00`.
  - Lists everyone who works at the place and isn't already in the slot, sorted unblocked first, then by **score** (§8). Each row has:
    - a 36 px avatar
    - the name
    - `Cadre · can witness` or `cannot witness`
  - Chips:
    - **Best fit**: teal; on the top row, if it is unblocked and its score is under 100
    - `Already on <shift> at <place>` or `Asked for leave`: amber
    - `Rest rule: <reason>`: red
    - the block reason, dark: `On leave`, `Licence expired`, `No licence recorded`, `Already on day`
  - Blocked rows are at 55 % opacity. Picking one flashes `<Name>: <reason> on this date.`
  - Picking an allowed row assigns them and flashes. The flash adds `Breaks a rest rule: …` or `Note: also on …` when that applies.
- **Card** (click a pharmacy card):
  - a 44 px avatar, the name, `date · shift · place`
  - a line on witnessing
  - a rest-rule alert, if any
  - **Remove from this shift** and **Replace with someone else**. Both are blocked when the week is locked or you can't edit: `This week is published. Unlock it to change.` or `View only. You are not making the roster for this place.`
  - **Ask a colleague to swap or cover**: own card only, not in the past, and no request already pending
  - "Tip: drag a card onto an empty slot to move it."
- **Contact** (click a ward card):
  - `<Cadre> at <Place>. Ward rosters are made by the ward in-charge, so you can see and contact, not change.`
  - The phone number, with **Call** (`tel:`), **SMS** (`sms:`) and **Message in MedSync**. The MedSync message is inline: an input + Send, then a flash `Message sent to <Name> in MedSync`.
  - **Doctors and clinical officers:** "Prescriptions written · <date>", each row with:
    - the time
    - the medicine
    - a `CD` chip for controlled drugs
    - `Bed n · A.B. · route`
    - a status: `Dispensed` green, `At pharmacy` amber, `Part dispensed` blue
  - **Nurses and midwives:** "Doses given · <date>", each row with the time, medicine, route, `· witnessed by <Name>` for controlled drugs, and `Given`.
  - Today shows `n … so far`. Future shifts say "This shift has not happened yet." An empty shift says "Nothing recorded on this shift."
  - **Real data:** prescriptions come from prescribing, and doses from administration records (MAR). Patients appear as bed + initials only.

## 5. Who makes the roster: hand over

- Only the in-charge sees **Hand over this duty**. Dialog "Hand over making the roster", sub line "You stay responsible for it, and you can take it back at any time." Fields:
  - **Hand it to:** pharmacy staff other than the in-charge
  - **For:** `All pharmacy places`, or individual pharmacy places. Choosing places switches publishing off.
  - **Until:** optional date (min today). "Leave blank to keep it until you take it back."
  - **May also publish and unlock weeks:** checkbox
  - Errors: `Pick who to hand it to.` · `Pick at least one place, or All places.` · `The end date has already passed.`
- One handover per person; a new one replaces their old one.
- History lines read `3 Nov 2026 · Grace Namutebi handed OPD dispensary to Brian Okello until 30 Nov, without publishing` or `… took the roster back from …`. The dialog shows the latest 5.
- **Permissions that follow:**
  - The in-charge edits all pharmacy places.
  - A delegate edits only their places, while the handover is active. A handover stops after its end date.
  - Publishing and unlocking need the in-charge or a delegate with publishing.
  - Everyone else is view only.
  - Ward places are never editable here.

## 6. Swap requests (section)

- **Header:** "Swap requests", plus `n needs you`/`n need you` (amber) when anything waits on you. Sub line: "Ask a colleague to swap or cover a shift. They accept first, then the in-charge approves. The roster changes only once it is approved." Then the **Ask for a swap** button.
- **Filters:** `Needs me · n` · `Pending · n` (default) · `All · n`.
- **The form** ("Ask for a swap"):
  - **Your shift:** your shifts in the shown week and the next, not in the past
  - **Kind:** `Ask them to cover it` | `Swap with one of theirs`
  - **Colleague:** works at that place, isn't on the same shift that date, isn't on approved leave, and their licence hasn't expired
  - **You take their shift:** swaps only. Their shifts at places you work, where you aren't on that shift.
  - **Reason:** optional
  - A preview, e.g. `Esther Achieng works your Day · Thu 5 Nov · OPD dispensary.`
  - A rest-rule warning: `This would break a rest rule. … The in-charge sees this before approving.`
  - Errors for each missing field.
- **States** (chip colours):

| State                                    | Chip  | Who acts                                                                                     |
| ---------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `colleague` → "Waiting for <first name>" | amber | colleague: **Accept** / **Decline** (optional "Why")                                         |
| `incharge` → "Waiting for in-charge"     | blue  | roster maker for **both** places: **Approve** / **Reject** (optional "Why")                  |
| `approved`                               | green | nobody; the roster changes **now**. Log `… · published week, both told by SMS` if published. |
| `declined`, `rejected`                   | red   | nobody                                                                                       |
| `withdrawn`                              | grey  | the person who asked can withdraw while it is `colleague` or `incharge`                      |
| `expired` (derived)                      | grey  | the shift started before an answer: "the shift started before anyone answered"               |
| `stale` (derived)                        | grey  | the roster no longer matches: "the roster was changed, so this no longer applies"            |

- **Approval only after acceptance:**
  - While a request is `colleague`, the approver sees **Approve** disabled (greyed out, `cursor:not-allowed`, title `Waits for <Name> to accept first`). Beneath it: `You can approve once <first name> accepts.`
  - The Approve handler re-checks the status, and so does the server.
- **A row** shows:
  - two overlapping avatars
  - `<A> asks <B> to cover` or `to swap`
  - the slot text (`Gives … · takes …` for swaps)
  - the reason in quotes
  - a red rest-rule warning
  - **progress steps**: `✓ Asked` → `2 · Esther accepts` → `3 · In-charge approves`. Done steps are green with ✓, the current one amber, and declined or rejected red with ✕. A declined request shows two steps.
  - the trail: `Asked 2 Nov, 16:05 · Prossy Nakato accepted 2 Nov, 18:20 · …`
- Cards in a pending request show `Swap requested`.

## 7. Leave and days off (section)

- **Header:** "Leave and days off", plus `n to approve` when you can approve. Sub line: "The in-charge approves. Once approved, the person's shifts on those days are freed and nobody can be rostered on them." Then the **Ask for leave or a day off** button.
- **The form:**
  - Kind: `Annual leave` · `Day off` · `Study leave` · `Sick leave`
  - From, and To (blank means one day; min today)
  - Reason
  - A clash note: `You are rostered on n shifts in these days: … Once approved, they become gaps for the in-charge to fill.`
  - Errors: `Pick the first day.` · `The first day has already passed.` · `The last day is before the first day.`
  - Asking less than 7 days ahead (except sick leave) is allowed but flagged: `asked less than 7 days ahead`.
- **States:** `pending` → "Waiting for in-charge" (blue) · `approved` (green) · `declined` (red) · `withdrawn` (grey; also shown when a pending request's dates have passed).
- **Who can approve:** the in-charge, or a delegate with publishing. **Approve** removes the person from every slot in the range, and logs `· n shifts freed`. It flashes `Approved. 1 shift is now open: Day · Thu 5 Nov · OPD dispensary. Try Fill gaps.`
- **Effects:**
  - Approved leave blocks assigning (`On leave`) and blocks being a swap colleague.
  - A card on a leave day shows `On leave · take off` in red.
  - Pending leave adds the `Asked for leave` warning, plus a score penalty.

## 8. Fill gaps and the best-fit score

`judge(R, week, day, place, shift, person, currentCell)` returns `{block, score, breaks}`.

- **block**, checked in order:
  1. not at this place
  2. on approved leave that date
  3. licence expired on that date
  4. licence required but not recorded
  5. already on the same shift elsewhere that date
- **score**:

| Adds                   | When                                                        |
| ---------------------- | ----------------------------------------------------------- |
| 100 × new rest breaks  | from `breaksFor`, using the same rules as §1                |
| +40                    | pending leave that date                                     |
| +25                    | on another shift that date                                  |
| +1 per shift           | in the last 5 weeks (load)                                  |
| +4 per Day/Night shift | this week                                                   |
| +60                    | the slot already has one person and this one cannot witness |

- **Best fit** = the lowest unblocked score under 100.
- **Fill gaps** (toolbar):
  - Applies to the shown week only: from today on, or the whole of a future week. A past week flashes `That week is over.`
  - Editable pharmacy places only.
  - Fills each slot up to its capacity with the best unblocked candidate scoring under 100. It works on a running copy, so each pick counts toward the next.
  - It never breaks a rule. Flash: `Filled n slots with the best fit. Check, then publish.` If any are left, it adds `n still open: nobody fits without breaking a rule.`

## 9. Load table ("Who carries the load")

- Sub line: "Pharmacy staff, 5 Oct – 8 Nov 2026 (the last 5 weeks). Flags anyone well above or below the average." In the build, use the 5 weeks ending with the shown week.
- **Columns:** Person · Day · Night · On call · Weekend (Sat/Sun) · Holiday · Total, with a bar. Sorted by total, descending.
- **Flags:**
  - `Heavy` when total ≥ 1.25 × average: amber bar and chip
  - `Light` when total ≤ 0.75 × average: grey
  - otherwise a teal bar
- Bars are inline progress bars, not side borders.

## 10. Licences

- **People list:** each licensed person gets a line like `PSU · PSU/P/1093 · expires 20 Nov 2026`, plus a chip:
  - `Current` green
  - `Expires soon` amber: 30 days or fewer
  - `Expired` red
  - `Not recorded` red
- **Record renewal** (in-charge, when the licence is soon, expired or missing): an inline date (must be after today) + Save. Flash: `Renewal recorded for <Name>. Valid to 31 Oct 2027.`
- **Effects:**
  - Rostering is blocked for any date after expiry: assign, fill and swap colleague.
  - Existing cards after expiry show `Licence expired` with a red ring.
  - The Licences badge reads `1 expired · 1 due`. Its "This week" lines read `<Name>: expired 31 Oct. Cannot be rostered until renewed.` and `<Name>: expires 20 Nov (17 days)`.
- **Reminder:** 30 days before expiry, to the person and the in-charge (§13).

## 11. Rules (badges + dialog)

- Same mechanics as Medicines §9:
  - The dialog lists each rule with **Change** (new wording + why, then **Send for signing**). It applies once the **in-charge and a second signer** have both signed.
  - "+ Add a rule here" adds a rule through the same flow.
  - Pending proposals show as `Proposed: … · Why: … · applies once both have signed`, with signer buttons and Withdraw.
  - A "This week" block lists the current problems.
  - Footer: "A change applies once the in-charge and a second signer sign. See all rules" (link to Rules).
- **Groups and default text (verbatim):**
  - **Witnessing** (Every ward and the pharmacy):
    - On a ward: a second nurse on shift, the nurse in-charge or the doctor on duty
    - In the pharmacy: a pharmacy technician, a second pharmacist or the in-charge
    - Store keepers cannot witness
    - Nobody witnesses a dose they gave
    - The witness approves on their own device
  - **Shift cover** (Every staffed shift):
    - Every staffed shift has at least one person
    - Ward and pharmacy day and night shifts have two people who can witness, so a controlled dose is witnessed on the shift
    - On call is one person, reachable by phone
    - At most two people on a shift at one place
  - **Rest and hours** (Every person on the roster):
    - No day shift the morning after a night shift
    - No day and night shift on the same date
    - At most 6 day or night shifts a week per person (on call does not count)
  - **Who works where:**
    - Only people listed at a place can be rostered there
    - A person is at one place per shift
  - **Handover:**
    - Controlled and high-risk medicines are counted blind at every handover
    - The outgoing and incoming person both sign the count
    - You hand over only the place you are working at
  - **Who makes the roster:**
    - The pharmacy in-charge makes and publishes the roster
    - The in-charge can hand this duty to someone else, for all places or only some, with an end date
    - Someone handed only some places can change only those places
    - Publishing and unlocking need the in-charge, or someone handed that too
    - The in-charge can take the duty back at any time; every handover is logged
  - **Swaps:**
    - Anyone on the roster can ask a colleague who works at the same place to swap or cover a shift
    - The colleague accepts first; only then can the in-charge (or whoever makes the roster for that place) approve
    - Nothing changes on the roster until the request is approved
    - Rest rules are checked before approval
    - A request not answered before the shift starts expires
  - **Leave:**
    - Leave and days off are asked for here and approved by the in-charge
    - Once approved, the person is taken off their shifts on those days
    - Nobody can be rostered on a day they are on approved leave
    - Ask at least 7 days ahead, except sick leave
  - **Licences:**
    - Pharmacists need a current practising licence from the Pharmaceutical Society of Uganda
    - Pharmacy technicians and dispensers need a current licence from the Allied Health Professionals Council
    - Nobody can be rostered on a date after their licence expires
    - The in-charge is warned 30 days before a licence expires
  - **Attendance:**
    - Everyone signs in at the start of their shift on the pharmacy device
    - Signing in more than 10 minutes after the start counts as late
    - The in-charge is alerted if someone has not signed in 15 minutes after the start
    - The person who signed in signs the handover count
  - **Publishing:**
    - Publish the week by the Thursday before it starts
    - A published week is locked; unlocking it is logged
    - People get an SMS when their shift changes after publishing
  - **Prescribers:**
    - Controlled entries pick the prescriber from the Prescribers list
    - Changes to that list are confirmed by the medical superintendent
    - A prescriber limit (e.g. "Oral morphine only") blocks other controlled drugs
- **Issue chips:**

| Group          | Chip                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| Witnessing     | `n unwitnessed`                                                        |
| Shift cover    | `n gaps`                                                               |
| Rest and hours | `n breaks` (red)                                                       |
| Swaps          | `n open`                                                               |
| Leave          | `n to approve`                                                         |
| Licences       | `n expired · n due` (red if any expired)                               |
| Attendance     | `n late · n not in`, for today, Pharmacy only (red if any not in)      |
| Publishing     | `Not published`, for the current or a future draft week, Pharmacy only |

- **Rules are enforced, not just displayed.** The numbers they use (2 per shift, 6 a week, 10 and 15 minutes, 30 days, 7 days) are stored as parameters on the signed rule, so a signed change actually changes the check.

## 12. Attendance

- Sign-in happens on the pharmacy device (or MedSync login at that place) at shift start. It is stored per person, date and shift.
- **Status:**
  - `ok`: signed in within 10 minutes of the start → `In HH:MM`
  - `late`: more than 10 minutes after the start → `Late · in HH:MM`
  - `none`: no sign-in → `Not signed in` today, or `Did not sign in` for past shifts. Today's `none` shows only from 15 minutes after the start.
- On call has no sign-in.
- **Alerts:** the in-charge is alerted at start + 15 minutes. The handover count is signed by the person who signed in.

## 13. Reminders (section)

- Sub line: "Sent by SMS through Messages." with a link "Edit wording and Luganda versions" to the Messages tab.
- **Switches:**
  - **Evening before each shift:** everyone on tomorrow's roster, at the chosen time (17:00 / 18:00 / 19:00 / 20:00; default 18:00)
  - **When a published shift changes:** both people are told, e.g. after a swap or leave is approved
  - **Next week not published by Thursday:** reminds the in-charge and any delegates
  - **30 days before a licence expires:** reminds the person and the in-charge
- Example SMS: `MedSync: Hello Brian, you are on Day shift tomorrow, Wed 4 Nov, at OPD dispensary, 08:00–17:00. (sent at 18:00)`
- Opt-outs and the provider are handled by the Messages tab.

## 14. Public holidays and printing

- **Holidays, any year:**
  - **Fixed:** 1 Jan New Year's Day · 26 Jan Liberation Day · 16 Feb Janani Luwum Day · 8 Mar Women's Day · 1 May Labour Day · 3 Jun Martyrs' Day · 9 Jun Heroes' Day · 9 Oct Independence Day · 25 Dec Christmas Day · 26 Dec Boxing Day.
  - **Computed:** Good Friday and Easter Monday (Gregorian computus, as in `holidays(y)`).
  - **Eid al-Fitr and Eid al-Adha** are gazetted each year. Store them in `public_holidays` with `confirmed=false` until the owner confirms. The prototype's 2026–27 dates are estimates.
  - Holidays show in the week headers and month cells, and count in the load table.
- **Print:**
  - landscape, the week grid only
  - the title `Pharmacy roster · 2 Nov – 8 Nov 2026 · Draft|Published`
  - the `+` buttons hidden
  - everything else hidden through print CSS

## 15. People and Prescribers

- **People:** "People · n", "Pharmacy staff who can be rostered, and where." Then **Add a person**. Each row has:
  - an avatar
  - the name
  - `Cadre · places`
  - the licence line (§10)
  - `Can witness` or `Cannot witness`
- **Photos:** only the person themselves can add or change their photo, so the **Add my photo** / **Change my photo** button appears on your own row only. Other rows show `No photo yet`. The server rejects anyone else's upload. Without a photo, initials show on a stable tint.
- **Add a person:**
  - Full name, Cadre (Pharmacist, Pharmacy technician, Dispenser, Store keeper), and Works at (pharmacy places).
  - A note: "They add their own photo after they sign in. Until then the roster shows their initials."
  - Errors: `Type their full name.` · `Pick at least one place they work at.`
- **Prescribers** (unchanged from the prototype):
  - Each prescriber has "May prescribe controlled drugs", and "Limited to" (blank = all).
  - "Changes here are confirmed by the medical superintendent."
  - The "Who may witness" box mirrors the Witnessing rules.

## 16. Data model (map onto existing tables first; see TECH-SPEC §0)

| Table                                                                 | Columns                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pharmacy_duty_roster` (replace the date range with one row per duty) | `id`, `hospital_id`, `staff_id`, `place_id`, `duty_date`, `shift` (day, night, call), `source` (pharmacy, ward_module). **Unique:** `(staff_id, duty_date, shift)`, so a person is at one place per shift. **Check (trigger):** at most 2 per slot (1 for call). Writes are allowed only for pharmacy places, by the roster maker; ward rows are read-only.                               |
| `roster_weeks`                                                        | `hospital_id`, `dept`, `week_start`, `status` (draft, published), `published_by`, `published_at`. Unlocking writes an event.                                                                                                                                                                                                                                                              |
| `roster_delegations`                                                  | `id`, `from_staff_id`, `to_staff_id`, `places text[]` (empty = all pharmacy places), `until` (nullable), `can_publish`, `created_at`, `revoked_at`, `revoked_by`                                                                                                                                                                                                                          |
| `roster_swap_requests` + `roster_request_events`                      | Requests: `id`, `from_id`, `to_id`, `kind` (cover, swap), `give_date`, `give_place`, `give_shift`, `take_*` (nullable), `reason`, `status` (colleague, incharge, approved, declined, rejected, withdrawn). Events: `request_id`, `actor_id`, `action`, `note`, `at`. **Trigger:** `approved` requires a prior accept by `to_id`, and an approver who is the roster maker for both places. |
| `staff_leave` + events                                                | `id`, `staff_id`, `type`, `date_from`, `date_to`, `status`, `reason`, `late bool`, `decided_by`, `decided_at`                                                                                                                                                                                                                                                                             |
| `staff_licences`                                                      | `staff_id`, `body`, `number`, `expires_on`, `recorded_by`, `recorded_at` (append-only; the latest wins)                                                                                                                                                                                                                                                                                   |
| `staff_photos`                                                        | `staff_id`, `storage_path`. Policy: insert/update only when `auth.uid()` is that staff member.                                                                                                                                                                                                                                                                                            |
| `shift_attendance`                                                    | `staff_id`, `place_id`, `duty_date`, `shift`, `signed_in_at`, `device_id`                                                                                                                                                                                                                                                                                                                 |
| `roster_reminder_settings`                                            | `hospital_id`, `eve_on`, `eve_time`, `change_on`, `unpub_on`, `lic_on`                                                                                                                                                                                                                                                                                                                    |
| `public_holidays`                                                     | `date`, `name`, `kind` (fixed, computed, gazette), `confirmed`                                                                                                                                                                                                                                                                                                                            |
| Existing                                                              | `pharmacy_rules` / proposals / signatures (the groups in §11, with a `params jsonb`), prescribers, places, staff, messages/SMS queue, prescriptions, MAR / administration records                                                                                                                                                                                                         |

## 17. Derivations (pure, unit-tested; port from `renderVals`)

`canWitness`, `needsWitness(cell, shift, place)`, `coverage(week, places)`, `breaksFor(R, week, staff)`, `restWhy(staff, day, shift, adding)`, `judge(...)`, `fillGaps(R, week, editablePlaces, today)`, `effStatus(request, roster, today)`, `canApprove(request, actor)`, `leaveOn(staff, date, statuses)`, `licState(staff, date)`, `attendanceOf(staff, date, shift, now)`, `load(staff, weeks)`, `holidays(year)` (incl. computus), `onDutyNow(now)`, `monthCells(year, month, places)`, `canEditPlace(actor, place, delegations, today)`.

## 18. Server actions

`assignToSlot`, `removeFromSlot`, `moveBetweenSlots`, `copyLastWeek`, `fillGaps` (returns a draft diff; applying it is one action), `publishWeek`, `unlockWeek(reason)`, `handOver`, `takeBack`, `askSwap`, `acceptSwap`, `declineSwap(note)`, `approveSwap`, `rejectSwap(note)`, `withdrawSwap`, `askLeave`, `approveLeave` (frees the shifts in the same transaction), `declineLeave`, `withdrawLeave`, `recordLicenceRenewal`, `uploadOwnPhoto`, `addPerson`, `signIn` (attendance), `setReminders`, `sendStaffMessage`, plus the rules proposal and sign actions from Medicines.

- Every action re-checks permission and rules on the server. Each writes an audit event. A change to a published week queues the SMS when "When a published shift changes" is on.

## 19. Permissions

| Actor                  | Can                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pharmacy in-charge     | Everything on pharmacy places. Hand over and take back. Approve leave and swaps. Record renewals.                                                             |
| Delegate               | Edit their places while active. Publish and unlock only with `can_publish`. Approve swaps and leave only if their places cover them and `can_publish` is set. |
| Pharmacy staff         | View. Ask for swaps and leave. Accept or decline swaps addressed to them. Sign in. Upload their own photo.                                                    |
| Ward staff (seen here) | Nothing here. They are contact-only.                                                                                                                          |
| Medical superintendent | Confirms prescriber list changes (existing flow).                                                                                                             |

## 20. Acceptance (add to the PRD scenarios)

1. Pharmacy view shows only the Main store and OPD dispensary. Doctors and nurses shows the wards, with no `+`, no drag and no publish. Clicking a ward card opens the contact card with prescriptions or doses for that shift.
2. A delegate for OPD can edit OPD only. The Store shows no `+`, and opening a Store card says "View only…". After the end date they are view only.
3. Publish locks the week. Unlock needs the in-charge or a delegate who can publish.
4. A swap: ask → colleague accepts → in-charge approves → the roster changes. Before acceptance, Approve is disabled, and the server refuses.
5. A swap whose shift has started shows Expired. A roster edit makes it "Roster changed".
6. Approving leave frees the person's shifts in the range. They can't be assigned on those dates (`On leave`).
7. An expired licence blocks assignment for dates after expiry. Recording a renewal clears it.
8. Fill gaps never creates a rest break, never assigns someone blocked, and leaves impossible slots open, with the message.
9. Rest-rule cards get a red ring and the reason. The assign list shows the rule chip.
10. "No witness" appears when a Day/Night ward or pharmacy shift lacks 2 people who can witness (the store keeper doesn't count). EPI is exempt.
11. Month view works for any month and year. Clicking a day opens its week. Holidays show, with Easter computed.
12. Only the owner can upload their photo (enforced in the UI and the DB).
13. The attendance chips and badge match the sign-ins. "Not in" appears only from start + 15 minutes.
14. Print shows only the week grid, in landscape.
15. At 390 px: the day view and month dots work, with no horizontal page scroll. At 1440 px: the week grid fits without inner scroll.
16. A rule change applies only after two signatures, and the checks use the new parameters.

## 21. Prototype-only (do not ship)

- **Acting as** selector: use the session user.
- Simulated data:
  - the fixed date `2026-11-03`
  - the generated sample roster, requests, leave and licences
  - `dayMeds` (generated prescriptions and doses)
  - the hashed phone numbers and attendance
  - the deliberate rest break
- Seed fixtures go only in `scripts/seed-pharmacy-dev.ts`.
- **Photo upload as a data URL:** use storage with signed URLs.
- **Toasts as the only notification:** keep them as UI feedback, and also write events and SMS.
