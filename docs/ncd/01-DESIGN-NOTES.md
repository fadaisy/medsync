# NCDSync: design notes from the 7-board preview

**Summary.** I read the preview: 7 boards plus `ncd.css`, `canvas.json`, and the Chroma class names, which are not copied into the build. The repo already ships every Chroma colour and type token the boards use, so we build the module with existing components.

| Chroma role (board)                                                  | Repo token → utility                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--ink-0…950`, `--border`, `--input`, `--muted`                      | same names → `bg-ink-50`, `border-ink-150`, `text-ink-600`, `border-border`, `bg-muted`                 |
| `--primary`, `--teal-solid/-tint/-edge/-text`                        | `bg-primary`, `bg-teal-solid`, `bg-accent` / `bg-teal-tint`, `border-teal-edge`, `text-teal-text`       |
| `--{sky,iris,grape,plum,slate}-{solid,tint,edge,text,icon,on-solid}` | all present → `bg-sky-solid`, `bg-iris-tint`, `text-grape-text`… (`HUE[h]` in `lib/design/domains.ts`)  |
| `--sky-100/200/400/700/900`, `--teal-200…700`, `--iris-100`          | ramps present → `bg-sky-200`, `bg-teal-300`, `bg-iris-100` (slate has roles only, no ramp)              |
| `--status-*-bg/-fg`, `--status-caution-fg-aa`                        | `bg-status-caution-bg`, `text-status-caution-fg-aa` (the `-aa` pair is PROPOSED and needs CSO sign-off) |
| `--chart-1…5`; `--shadow-xs/-card/-control`                          | `text-chart-1`; `shadow-xs`, `shadow-card`, `shadow-control`                                            |
| fonts: Bricolage, Geist, Geist Mono                                  | already loaded in `app/layout.tsx` → `font-display`, `font-sans`, `font-mono`                           |

**Gaps for the sign-off register**

- **Roomy density.** The boards use 58px rows, 46px headers and 14px table text, 36px buttons and inputs with a 10px radius, 38px/14px nav items, and 26px/13px tags with a 7px radius. The design law says 38px rows, 13px text, 32px buttons and 22px tags. Decide which applies. The `row-touch` 44px rule is a middle option.
- **Off-scale type.** The boards use 26px for the dashboard H1, 36px and 24px mono figures, 15px condition H2s, 12.5px chart text, 11px hints, and an 18px input / 15px button size on the phone board.
- **Amber values.** Above-threshold values render as amber `status-caution-fg-aa` with an arrow, and the boards also use caution, stable and pending chips. This conflicts with the module's no-RAG rule, and DESIGN says out-of-range values should be `critical-fg-aa`, i.e. red. Pick a non-RAG treatment.
- **Kidney chart.** The G1–G5 columns are one flat grape, but the categories are ordinal. The care-band bar uses a sky ordinal ramp on what is arguably an unordered set. Both need a ruling.
- **No chart or meter primitives.** There is no chart library and no meter component. The stacked bar, trend line, cascade, columns, meters and donut are all module-local.
- **Missing controls.** There is no track-style radio segmented control (cx-seg) for form values, and no time chip (`nx-chip`).
- **Layout tokens.** `sidebar-width`, `row-table`, `topbar-height` and `content-max` are in DESIGN but not in `@theme`, so we use arbitrary values or `SIDEBAR_CLASS`.
- **SMS copy contradicts itself.** The template names the hospital, but its hint says the message "never names … the clinic".

---

## 0 · Shared shell (all desktop boards)

**Layout.** The canvas is 1440 wide. A sidebar sits on the left at `flex: 1 0 248px` with `padding 12px 8px` and a right hairline, and `main` takes the rest (1192px). In `main`, from top to bottom:

1. **Top bar** on boards 2–5 only (`min-h 48px`, `padding 6px 24px`, bottom border). It holds a breadcrumb (20px solid tile + **NCD registry** / … / page), a spacer, the sync text "All entries saved · last sync 09:41" (12px, `ink-600`, with a check icon), and a 28px user avatar. Boards 1 and 6 have no top bar.
2. **Data notice bar** (`padding 8px 32px`, `bg-ink-50`, bottom border, 12px `ink-600`). It reads "**Synthetic data.** Draft standard version 0.1. Not approved for patient data." On the dashboard it adds "Every figure here is illustrative." Board 1 right-aligns the sync text inside this bar.
3. **Content** with `padding 20–28px 32px 40px` and `max-width 1280px`. Content never reaches 1280px at 1440 because it is 1192 − 64 = 1128px wide.

**Sidebar.**

- Workspace row: a 28px mark, then "Mengo Hospital" in 17px display type.
- Search row: "Search patients" with the ⌘K hint (36px high, 10px radius).
- Groups use sentence-case 13px/500 labels, not overline, and nav rows are 38px high:
  - **NCD registry**: Today's clinic (plum solid tile, count 46), Patients (sky, 1,284), Recall (sky, 214), Reviews due (iris, 58), Dashboard (slate).
  - **My patients** (soft tiles): "BP 140/90 or above" (iris), "Review due" (grape), "Overdue" (sky).
  - **Stewardship**: Data quality, Exchange, Administration (all slate).

**Mapping.**

- Sidebar: `SIDEBAR_CLASS`, `SidebarWorkspace`, `SidebarSearch`, `SidebarGroupLabel` and `SidebarNavItem domain=…` from `components/medsync/sidebar-nav.tsx`. Use the existing shells `app/nurse/_components/nurse-shell.tsx` and `app/doctor/_components/doctor-shell.tsx` as the pattern.
- Counts: `CountDisc` (`components/medsync/panel.tsx`).
- Breadcrumb tile: `DomainTile` at size sm.
- Avatar: `Avatar` / `AvatarStack` (`components/medsync/avatar.tsx`).
- ⌘K and key hints: `components/ui/kbd.tsx`.
- Notice bar: a plain `div` with `bg-ink-50 border-b border-border text-caption text-ink-600 px-8 py-2`.

**Gaps.**

- Roomy sidebar values: the ground is `--background`, not `bg-sidebar` (`ink-25`), plus the 38px/14px nav and the 10px radius.
- Domain logic is loose. Today's clinic is plum (operations), registry pages are sky (patients), and "Review due" is grape (pharmacy and lab) even though it is a review-type list.
- The top bar is inconsistent across boards. Pick one rule.

---

## 1 · Today's clinic (1440×1020)

**Layout (top to bottom)**

1. **Notice bar**, with the sync text on the right.
2. **Title row** (wraps, gap 14/16):
   - Left: H1 "Today's clinic" (30px display), a stack of three 30px avatars (MO iris / TN teal / RO plum, `aria-label` "Team on duty: …"), then the line "Monday 05 Oct 2026 · Diabetes and hypertension clinic" (14px `ink-600`).
   - Right: secondary "Record event", primary "Find or enrol" with the `E` kbd hint, and a 36px avatar.
3. **Toolbar**:
   - Left: secondary buttons "Table ▾", "Filter" with a count badge of 2 (`nx-count`, `ink-900` disc), and "Sort".
   - Right: a search field (`flex 0 1 260px`, 36px, placeholder "Search today's list"), a progress readout, a "05 Oct 2026" date button, and a "More options" icon button.
   - Progress readout: a 26px conic donut (`teal-solid` 58% over `ink-150`) next to **18** / 31 (17px/600, with "/ 31" in `ink-400`) and the words "visits closed".
4. **Table** (`min-width 1120px`, edge-to-edge with no side borders or radius, roomy rows):
   - Columns: [checkbox 44px] · Patient · Conditions · Stage · Arrived · Last BP mmHg · Last glucose mmol/L · Review due.
   - Patient cell: 28px sky avatar, then the mono registry number "NCD-YYYY-NNNNN" as a link to the visit, then a muted "F · 54 y".
   - Conditions: sky tags "Diabetes" / "Hypertension".
   - Stage: an icon and a word. The values are "Measurements taken" (teal-text link with chevron), "With clinician", "Closed · 09:02", "Waiting", and "Not arrived" in `ink-500`.
   - Arrived: `nx-chip`, a mono time chip with a grey dot on `ink-50` and an `ink-150` border. A dash when not arrived.
   - BP and glucose: mono. Above threshold shows an arrow plus a bold value in `status-caution-fg-aa`. Glucose carries its type ("fasting"/"random") as muted text.
   - Review due: grape tags "HbA1c", "Kidney" and iris tags "Eyes", "Feet", or a muted "None due".
   - Selected row: `is-selected`, which maps to `bg-accent`.
5. **Footer row** (52px, bottom border): "+ Add a walk-in patient", linking to enrol.
6. **Footnote** (13px muted): "Showing 9 of 46. An arrow marks a last blood pressure of 140/90 or above, or a last fasting glucose of 7.0 mmol/L or above. A random glucose is shown without a mark."

**Mapping.**

- Table: `DataTable` + `DataTableToolbar` + `FilterChip` (`components/ui/data-table.tsx`). It already gives a sticky `bg-muted` header, 38px rows, `bg-accent` selection, mono columns, and `DataTableEmpty`.
- Buttons: `Button` variants `primary` / `secondary` / `ghost` / `icon`.
- Search: `Input`.
- Checkbox: `components/forms/checkbox.tsx`.
- Tags: `Tag hue="sky|grape|iris"` (`components/medsync/tag.tsx`).

**Copy to keep:** "Find or enrol", "Record event", "visits closed", "Add a walk-in patient", the stage words, and the footnote above, which explains the threshold arrow.

**Status colour.** Seven amber (`status-caution-fg-aa`) values are on this board. The no-RAG rule needs a replacement, for example an `ink-900` bold value with an arrow and the word "above".

**Gaps.** The conic donut has no meter component. The `nx-chip` time chip and the `nx-count` dark count disc do not exist; `CountDisc` is `ink-100`.

---

## 2 · Search and enrol (1440×1180)

**Layout**

1. **Top bar** with the crumb "NCD registry / Patients / Find or enrol" (sky tile).
2. **Notice bar.**
3. **H1** "Find or enrol a patient", with the sub-line "A search runs before any new record can be created."
4. **Search row**:
   - A 44px search field (12px radius) with a focused ring (`border ring` plus a 3px `teal-tint` halo), a mono value, a ↵ kbd hint, and the screen-reader label "Search by name, phone or hospital number".
   - A 12px muted line: "Search by name, phone or hospital number · run 09:44 · 3 possible records".
5. **Two columns** (gap 16):
   - **Left `flex 3 1 560px`: card "New patient"** (padding 20, `shadow-xs`). The sub-line reads "One screen. Only the registry number is mandatory, and the system issues it." It has overline sections:
     - **Identity**: an auto-fit grid with `minmax(190px,1fr)`, gap 12. Fields: Given name; Family name; Sex (segmented Female/Male); Date of birth or age (hint "Stored as birth year 1972, marked estimated."); Hospital number (mono, "Optional"); National ID number (mono, hint "Never required.").
     - **Contact and residence**: Phone 1, Phone 2, Next of kin, Next of kin phone, District, Sub-county or division, Parish, and Village (hint "Free text. Never blocks enrolment."). The phone fields are mono with `inputmode=tel`.
     - **Registration**: two sky-tint condition cards (`sky-edge` border, 12px radius, `minmax(300px,1fr)`). Each has a checkbox title (Diabetes / Hypertension). The type control is a segmented control on a `sky-100` track: Type 1/Type 2/Other/Unknown, or Primary/Secondary/Unknown. Below it, a 1fr:2fr grid holds "Year of diagnosis" (mono) and "Basis of diagnosis".
     - **Baseline**: Height cm (120px wide), plus segmented Tobacco (Never/Former/Current) and Alcohol (None/Occasional/Regular).
     - **Notice and contact preferences**: checkboxes for "Privacy notice given (draft version 0.1)", "SMS reminders" and "Phone calls".
     - **Footer** (top border): the hint "Resolve the possible records before enrolling.", a ghost "Cancel", and a primary "Enrol and start visit" that is **disabled** until duplicates are resolved.
   - **Right `flex 1 1 340px`: "Possible existing records" panel** (`bg-muted`, count 3). The hint reads "Compared on name, sex, birth year, phone and hospital number. No definite match."
     - Each candidate is a card with a match tag (`iris` "Probable" or `slate` "Possible"), an avatar, the mono registry number, and a mono line "F · born 1972 · Parish, District".
     - Below that are slate reason tags: "Same phone", "Similar name", "Same sex", "Same birth year", then a small secondary button "Open this record".
     - The panel ends with a checkbox: "None of these is the same person." The hint under it reads "The confirmation is logged with your name and the time."

**Mapping.**

- Cards: `Card` or `Panel`.
- Fields: `Field` (`components/forms/field.tsx`) + `Input`, with labels as `text-label` and hints as `text-caption text-muted-foreground`.
- Overlines: `text-overline`.
- Match tags: `Pill tone="notice"` (iris) and `tone="neutral"` (slate).
- Condition cards: `HUE.sky.band` (`bg-sky-tint border-sky-edge`).
- Segmented controls: see the gap below.

**Status colour:** none. This board is clean.

**Gaps.**

- `components/forms/segmented-control.tsx` is a bordered radio-card control that still uses legacy `brand-*` tokens. `ViewSwitcher` matches the Chroma look (`bg-ink-100` track, `bg-card shadow-control` for the selected option) but has `tablist` semantics. A `radiogroup` variant of the ViewSwitcher look is needed.
- The tinted `sky-100` track inside the sky cards.

---

## 3 · Visit capture (1440×1300)

**Layout**

1. **Top bar** with the plum crumb "**NCD registry** / Today's clinic / Visit 05 Oct 2026".
2. **Notice bar.**
3. **Patient band** (a `sky-tint` card with a `sky-edge` border, padding 14/16):
   - Left: a large avatar, then the H1 registry number (22px `heading-l`) as a link to the record. Under it, tags "Diabetes · type 2" and "Hypertension" (sky), a slate care-band tag "Both, without complications", and the mono line "F · 54 y · arrived 08:12".
   - Right: a "Visit type" segmented control on a `sky-100` track: Scheduled/Unscheduled/Refill only/Remote.
4. **Trajectory**: H2 "Trajectory", with "Last 6 visits, oldest first".
   - The table is dense (`min-width 980px`). Columns: Measure | six date columns (mono "10 Sep 2025"…) | Trend | At last visit.
   - Rows: Blood pressure mmHg, Fasting glucose mmol/L, HbA1c %, Weight kg, eGFR mL/min/1.73 m². Units are muted 12px beside the measure name. The last value is set at 600 weight, and a dash means no value.
   - Trend: an 80×20 sparkline polyline in `chart-1`, stroke 1.5. A row with only one result shows the text "One result" instead.
   - At last visit:
     - BP and glucose: caution chips "140/90 or above" and "Fasting 7.0 to 11.0".
     - HbA1c: a slate tag "Due · last 10 Sep 2025".
     - Weight: "31.6 BMI kg/m²".
     - eGFR: "G2 category from latest result".
5. **Two columns** (gap 16):
   - **Left `flex 1 1 380px`**, holding two stacked cards:
     - **Measurements card.** It has an iris soft tile, the title, and "Saved by triage nurse · 08:26" on the right.
       - Grid `minmax(130px,1fr)`: Weight kg, Blood pressure 1, Blood pressure 2, Blood pressure 3 (Optional).
       - A vital strip with two values: "Visit blood pressure 150/92 mmHg · Mean of 2 readings" and "Body mass index 31.5 kg/m² · Height 163 cm".
       - A row with Glucose mmol/L, a segmented Fasting/Random/After meal, and a segmented Capillary/Laboratory.
       - HbA1c % ("If resulted") and HbA1c result date ("DD MMM YYYY").
     - **Review items card.** It has a soft button "Open annual review" and an attribute list (`minmax(120px,150px) 1fr`) with rows for HbA1c, Eyes, Lipids, Kidney and Feet. Each value is a slate "Due" tag with mono "Last 10 Sep 2025" or "No result recorded", or mono "Done 11 Mar 2026".
   - **Right `flex 1.5 1 480px`: Clinician entries card.** It has an iris soft tile and "Not yet saved" on the right.
     - "Medicines after this visit", hint "Carried forward from 14 Jul 2026", then grape tags with medicine names only. Below them: a soft "Confirm unchanged" with the `U` kbd hint, a ghost "Edit list", and the hint "Names only. Doses are not recorded in this version."
     - Three segmented controls:
       - "Missed doses in the past 7 days": None / 1 to 2 days / 3 or more days / Not asked.
       - "Hypoglycaemia since last visit": None / Mild, self-treated / Severe, needed help / Not asked.
       - "Medicines obtained today": Full / Partial / None / Not applicable. Hint: "Not yet recorded. Partial or none asks for a reason: stock-out, cost or other."
     - "Next appointment": a mono input (150px), small buttons for 4 / **8** (soft, selected) / 12 weeks, and the link "Transfer or discharge instead".
     - Footer (top border): "Completeness" with "7 of 9 core fields", a bar at 78% in `teal-solid`, and the hint "Still needed: medicines confirmed, medicines obtained." Then a secondary "Save draft" and a primary "Close visit" with the ⌘↵ kbd hint.

**Mapping.**

- Patient band: `RecordHeader` is band-plus-head; or build a `Card` with `HUE.sky.band`.
- Vitals: `VitalStrip` + `VitalStat` (`components/medsync/vital-stat.tsx`).
- Review items: `AttributeList`.
- Trajectory table: `DataTable` with `mono` columns.
- Sparkline: inline SVG with `text-chart-1`.
- Completeness bar: a meter (gap). `StatCard share` has the same look.

**Status colour.** Two caution chips (`cx-s--caution`, amber) in the Trajectory "At last visit" column. Replace them with a non-RAG treatment.

**Copy to keep:** "Carried forward from …", "Names only. Doses are not recorded in this version." (this is CSO-relevant: no dosing), "Not asked" as an explicit option on every adherence control, "Mean of 2 readings", and "category from latest result".

---

## 3b · Nurse capture on phone, offline (390×844)

**Layout:** a fixed 390×844 column with no sidebar.

1. **Header**: a 44px ghost back button ("Back to today's clinic"), a 32px avatar, a mono registry number (15px/600), and "F · 54 y · diabetes, hypertension" (12px muted).
2. **Offline status bar** (`role=status`, `bg-ink-50`, 12px `ink-700`): "**Offline.** 2 entries waiting to sync · last sync 08:02". It uses a neutral grey, not amber.
3. **Scrolling body** (padding 16, gap 16):
   - The overline "Measurements" with "Visit 05 Oct 2026 · synthetic data".
   - Weight kg. Inputs on this board are 48px high, 18px mono. The hint shows the previous value: "Last 84.0 kg · 14 Jul 2026".
   - A two-column BP 1 / BP 2.
   - A soft "Add a third reading" button (44px), with "Last 148/92 · 14 Jul 2026".
   - A two-column vital strip (visit BP mean, BMI).
   - Glucose mmol/L, with "Last 9.4 fasting · 14 Jul 2026".
   - A full-width three-column segmented Fasting/Random/After meal with 44px options.
4. **Sticky footer** (top border, `bg-card`, padding 12/16/20): a full-width primary "Save measurements" (52px, 15px). The hint under it reads "Saved on this phone now. Sent when the connection returns."

**Mapping.**

- Footer: `BottomActionBar` (`components/responsive/bottom-action-bar.tsx`).
- Fields: `Field`/`Input` with `inputMode="decimal|numeric"`.
- Back button: `Button size="iconLg"` (44px).
- Vitals: `VitalStrip`.
- Phone padding: `px-4`, per `page-pad-mobile` 16.

**Copy to keep:** the offline line, the "Last … · date" hints on each field, and the save hint.

**Gaps.** The 48px/18px phone inputs, the 52px/15px primary button, and the 44px segmented options are off the type scale. `row-touch` is 44px, so the 44px options fit it; the 48px and 52px sizes are the issue.

---

## 4 · Patient record (1440×1040)

**Layout**

1. **Top bar** with the crumb "NCD registry / Patients / NCD-2025-00184".
2. **Notice bar.**
3. **Record header** (`cx-rec`): a sky band, a large avatar, the crumb "Registered 03 Feb 2025 · 9 visits", and the title (the registry number).
   - Actions: secondary "Record event" and primary "Open today's visit".
   - Meta row: a **teal tag "Active in care"**, sky condition tags, the slate care-band tag, and the mono line "F · 54 y · MRN-2019-04471".
4. **Tabs**: Overview | Visits `9` | Annual review `2 due` | Events `1` | Edit history.
5. **Two columns** (gap 20):
   - **Left `flex 1 1 340px`: Details card.** An attribute list with icons and these rows: Registry number, Hospital number (mono), Diabetes ("Type 2 · diagnosed 2019 · fasting glucose"), Hypertension, Care band (tag), Phone (masked "0772 ••• 314" with a "Show number" link), Contact ("SMS and calls allowed"), Parish, Appointment (mono uppercase "05 OCT 2026 · ARRIVED 08:12"), and Privacy notice ("Draft version 0.1 · given 03 Feb 2025"). The hint reads "Showing a phone number is written to the audit log."
   - **Right `flex 2 1 520px`**, in two parts:
     - **Annual review.** Sub-line: "Each part is dated on its own. Categories come from the latest result and are not a diagnosis." Four stat tiles (`minmax(170px,1fr)`), each with a tile, label, value, hint and date:
       - Kidney: "67 eGFR · Category G2 · creatinine … · dipstick negative · Done 11 Mar 2026" (grape tile).
       - Eyes: "No apparent retinopathy · Dilated fundoscopy · worse eye · Due · Last 02 Aug 2025" (iris).
       - Feet: "0 risk category" (iris).
       - Lipids: "No result recorded · Total and LDL cholesterol · Due" (grape).
     - **Timeline**: a bordered list with 12/16 rows, each with a 28px tile, a title, a 12px `ink-600` detail and a right-hand mono date.
       - The first row, "Visit in progress", has a solid iris tile and `bg-accent`.
       - Visits use soft iris tiles. The "Event · admission" row uses plum and reads "Main reason: severe hypoglycaemia · reported by the medical ward". The annual-review visit uses grape.

**Mapping.**

- Header: `RecordHeader domain="patients"` (props `crumb`, `title`, `monogram`, `actions`, `meta`).
- Tabs: `UnderlineTabs` (`components/medsync/view-switcher.tsx`).
- Details: `AttributeList`.
- Annual-review tiles: `StatCard` needs a `domain` and requires a `hint`. The Eyes and Lipids tiles have text instead of a number, so they need a text-value variant or a plain `Card`.
- "Active in care": `Pill tone="active"` (teal tag).
- Timeline: a `ul` inside a `Card`, with `DomainTile` sm/md.

**Status colour:** none. The admission event is plum (place), not red. Keep it that way.

**Copy to keep:** "Categories come from the latest result and are not a diagnosis.", "Showing a phone number is written to the audit log.", and the Due / Done date pattern.

---

## 5 · Recall (1440×1160)

**Layout**

1. **Top bar** with the crumb "NCD registry / Recall".
2. **Notice bar.**
3. **H1** "Recall", with "Overdue list as at 05 Oct 2026 · longest overdue first".
4. **Three stat tiles** (`cx-stats`), each with a sky solid tile, a value with "/ denominator", a sky-solid share bar, and a hint:
   - "Overdue on 01 Oct" **214** / 1,112: "Patients under care with a missed appointment".
   - "Called this month" **23** / 214: "Unique overdue patients called since 01 Oct".
   - "Returned to care" **9** / 23: "Visit within 15 days of the first call".
5. **Two columns** (gap 16):
   - **Left `flex 3 1 560px`: toolbar plus table.**
     - Toolbar: a segmented filter "To call 191 | Called 23 | No phone 17", a small secondary "Condition" filter button, a spacer, and "Showing 8 of 214".
     - Table (roomy, `min-width 940px`). Columns: Patient (avatar plus mono registry number) | Days overdue (mono) | Missed (mono date) | At last visit (status chip) | Phone (masked "•••• 418", "No phone recorded", or "Number flagged invalid") | Last call ("No answer · 01 Oct", "Call later · 02 Oct", "Will return · 08 Oct", "Wrong number · 03 Oct", or a muted "Not called" or dash). The selected row uses `bg-accent`.
   - **Right `flex 1 1 320px`: "Log a call" card** (`shadow-card`). From the top:
     - The overline, avatar, mono number, and "48 days overdue · missed 18 Aug 2026 · hypertension".
     - A masked phone row on `bg-muted` with a "Show number" button.
     - "Outcome": a two-column grid of seven 44px secondary buttons: Will return / Call later / No answer / Wrong number / Moved or transferred / Declined / Died. The hint reads "One tap logs the call. Moved, transferred or died opens the event form and stops every reminder."
     - Top border, then "Missed-visit SMS" with a slate tag "Draft template". Below it is a dashed-border mono 12px template box. The hint reads "None sent. A template is sent only after two people approve it. It never names a condition, a medicine or the clinic."

**Mapping.**

- Stat tiles: `StatCard` with `domain="patients"` and `share` (the sky bar). This is an exact fit. The value shows "/ denominator" as `hint` text or a small span.
- Filter: `ViewSwitcher` (the filter is a view, so `tablist` is correct here) or `FilterChip`s.
- Table: `DataTable` + `DataTableToolbar`.
- Card: `Card`.
- Outcome grid: `Button variant="secondary" size="lg"`. `lg` is 40px; 44px needs `h-11`.

**Status colour.** The "At last visit" column has 4 caution chips (amber): "140/90 or above", "Fasting 11.1 or above", "Fasting 7.0 to 11.0". It has 3 stable chips (green): "Below 140/90", "Fasting below 7.0". It has 1 pending chip (grey): "Random glucose only". This is the board most affected by the no-RAG rule. Text plus a neutral tag works, because the words already carry the meaning.

**Copy flag.** The SMS body says "at Mengo Hospital" while its hint promises it never names the clinic. Fix one of them before CSO review. Also, "Died" is a one-tap outcome; it must route to the event form as the hint says, and must never be a silent log.

---

## 6 · Dashboard (1440×1000, one screen, no scroll)

**Frame.** The sidebar is 248px. `main` is 1192px, with the notice bar (~33px) at the top and no top bar. The content area has `padding 20px 32px 32px` and is a column with **gap 16**, giving a usable width of **1128px**. The three bands below sit under the title row. The estimated vertical budget is notice 33 + 20 + header ~36 + 16 + strip ~106 + 16 + conditions ~330 + 16 + cards ~260 + 32 ≈ **865px**, which leaves about 135px of slack within 1000.

### Header row (flex, wrap, gap 10/12, centred)

- H1 "Dashboard" at **26px** display/600, −0.03em. This is off scale: use `font-display text-display-s` (30px) or accept the gap.
- Secondary "September 2026 ▾" (a calendar month picker) and secondary "Filter".
- 13px `ink-600` text: "Snapshot not yet signed by the registry lead". This is the sign-off state, so keep it.
- A spacer, then a segmented **Charts | Table** (`ViewSwitcher`), secondary "Export CSV", and primary "Open monthly report".

### Band 1: headline strip

- One card: `border`, `rounded-lg`, `shadow-xs`, `overflow-hidden`, flex row.
- **Four figure cells**, each `flex 1 1 150px` (about 169px at 1128), with `padding 12px 16px`, gap 4, and a right border in `ink-150`. Each cell holds an overline label, a **24px mono/500** figure (−0.02em; a "%" suffix is 14px `ink-500`), and a 12px muted basis line:
  - "Under care" **1,112**: "29 more than August".
  - "New in September" **41**: "1,284 registered in all".
  - "Lost to follow-up" **10%**: "134 with no visit in 12 months".
  - "Back after a call" **45%**: "39 of 86 called, within 15 days".
- **Care-band cell** (`flex 2.6 1 400px`, about 450px):
  - The overline reads "Care bands · share of 1,112 under care".
  - Below it is a **segmented bar 22px high**: flex with a 2px gap, the outer ends at 4px radius, and the % printed inside each segment (12px mono/600, `padding-left 8px`). The segments are `sky-200` 49% (`ink-900` text), `sky-400` 17% (`ink-900` text), `sky-700` 20% (white), and `sky-900` 14% (white).
  - The legend is 12px `ink-600`, with 9px swatches (radius 3) and mono counts: "Hypertension only 548 · Diabetes only 194 · Both 217 · With complications 153". It wraps to two lines.
  - Grid equivalent: `grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2.66fr)]`.
- **Flags.** The ramp turns these bands into an ordinal scale ("complexity"). If the set is ruled unordered, use place hues instead (sky / iris / grape / plum `*-solid` with `*-on-solid` text). In dark mode the ramps flip, so the `ink-900` and `#fff` text pairs would fail contrast; use `*-on-solid` or put labels outside the bar.

### Band 2: per-condition rows

- One card (`border`, `rounded-lg`, `shadow-xs`) with **two rows**, Hypertension then Diabetes, separated by an `ink-150` rule.
- Each row is a grid of `repeat(auto-fit, minmax(220px,1fr))` with **gap 16px 28px** and `padding 16px 20px`. This resolves to **4 columns of about 250px** (1084 − 3×28)/4. For a fixed build, use `grid-cols-4 gap-x-7 gap-y-4 px-5 py-4`.

**a. Leading class.** Column layout, gap 2:

- H2 condition name: **15px**/600, off scale; `text-heading-s` is 14px.
- Big figure **36px mono/500** (−0.03em) with an 18px `ink-500` "%".
- Descriptor at 500 weight: "below 140/90 at latest visit" or "glucose in range at latest visit".
- 12px muted basis: "440 of 846 · up 1 point on August".

**b. Stacked category bar plus legend.** Column layout, gap 8:

- The overline reads "Latest visit, Jul to Sep 2026".
- The bar is **14px high**, segments with a 2px gap, outer radius 4.
- Legend rows (12.5px, gap 4): a 9px swatch, a mono 600 % in a **30px** column, a flex label, and a right muted mono count.
- **The "No visit in 3 months" count is a `text-teal-text` link to Recall.**
- HTN segments: `teal-700` "Below 140/90", `teal-300` "140/90 or above", `ink-300` "No visit in 3 months".
- DM segments, in order:
  - `teal-700` "Fasting below 7.0 or HbA1c below 7%"
  - `teal-400` "Fasting 7.0 to 11.0 or HbA1c 7 to 8.9%"
  - `teal-200` "Fasting 11.1 or above, or HbA1c 9% or above"
  - `ink-400` "Random glucose only"
  - `ink-300` "No visit in 3 months"
- **Compliant.** This is one ordinal teal ramp with greys for not_recorded and no_visit, which is the rule. Note that the ramp flips in dark mode (`teal-700` becomes light), which keeps the darkest-on-light / lightest-on-dark salience.

**c. 12-month trend.** The overline reads "In range, past 12 months".

- The chart is a grid of `30px | 1fr | 34px` with a 6px column gap, **84px tall**, 11px mono `ink-500`. A 4px gap separates it from the x labels.
- The middle column holds an SVG with `viewBox 0 0 220 84` and `preserveAspectRatio=none`:
  - 12 points at x = 0, 20 … 220.
  - **y = 80 − pct × 76/60**, which is a **shared 0–60% scale**: 0% sits at y 80 and 60% at y 4.
  - A baseline rule at `top 95.2%` (y 80), 1px `ink-300`.
  - An area polygon in `teal-700` at 10% opacity.
  - A `teal-700` polyline at stroke 2 with `vector-effect: non-scaling-stroke`.
- The end dot is 9px, `teal-700`, with a 2px `card` ring, drawn at the last point.
- The left column carries the start % at its y position. The right column carries the end % at 12px/600 `foreground`.
- X labels "Oct 2025" and "Sep 2026" sit at the ends.
- The Diabetes row adds an 11px muted caption: "Both trend charts share one 0 to 60% scale."

**d. Care cascade.** The overline reads "Care cascade · share of registered".

- The grid is `96px | 1fr | 76px`, **gap 9px 8px**, 12.5px text.
- Labels are `ink-600`; the last label is at 600 weight.
- Bars are **10px high**, radius `0 4px 4px 0`, with width equal to the share of registered. The first three bars are `ink-300` and the final outcome bar is **`teal-700`**.
- The right column is a mono right-aligned "count · %"; the first row shows the count only.
- HTN steps: Registered 1,046 → Under care 902 · 86% → Seen in 3 months 741 · 71% → **Below 140/90 440 · 42%**.
- DM steps: Registered 624 → Under care 548 · 88% → Seen in 3 months 456 · 73% → **In range 123 · 20%**.

### Band 3: four compact cards

- Grid of `repeat(auto-fit, minmax(250px,1fr))`, gap 16, which gives **4 × 270px**.
- Each card has `padding 14px 16px`, gap 12, `rounded-lg`, `shadow-xs`. The title is 14px/600 with a 12px muted subtitle, and the body is 12.5px.

1. **Complication screening**: "Done in the past 12 months".
   - Five **meters**, row gap 10. Each label row has the label at 500, an 11px muted mono "n of N", and a **30px** right-aligned 600 %.
   - Under each label row is an **8px** track in `iris-100` with an `iris-solid` fill, radius `0 4 4 0`.
   - Rows: HbA1c tested 171 of 548 (31%), Kidney review 489 of 1,112 (44%), Eye examination 121 of 548 (22%), Foot examination 258 of 548 (47%), Statin on list, age 40+ 270 of 466 (58%).
   - The 11px hint gives the denominator rule: "Of patients with diabetes, except kidney review, which is of everyone under care."
2. **New hypertension patients (quarterly cohorts)**: "Blood pressure one quarter after registering".
   - Four rows, gap 9. Each has the quarter label at 500 (the latest at 600) and "n registered" (11px muted).
   - Each row has a **16px** stacked bar: `teal-700` (with the % inside, 11px mono/600, white), then `teal-300`, then `ink-300`.
   - The hint reads "Dark: below 140/90. Light: 140/90 or above. Grey: no visit. The Jul to Sep 2026 group of 74 reports after 31 Dec." This is the immature-cohort note, so keep it.
3. **Kidney function categories**: "489 reviewed in 12 months · from eGFR".
   - Six columns: `grid-cols-6 gap-1.5`, a **134px** plot with an `ink-300` baseline.
   - Bars are **22px wide**, max **110px** tall, radius `4 4 0 0`, in `grape-solid`.
   - The count sits above each bar in 11px mono, with the modal bar's count at 600.
   - X labels G1 G2 G3a G3b G4 G5 are 11px mono `ink-600`.
   - The hint reads "From the latest result. Not a diagnosis."
   - **Flag:** G1–G5 is ordinal. Under the outcome-chart rule, use the teal ordinal ramp (or one hue with an ordinal lightness ramp), not a flat place hue. Treating it as a count distribution in one colour is also defensible. Rule on it.
4. **Events in 12 months**: "Per 1,000 under care · count in grey".
   - A ranked list (descending): grid `92px | 1fr | 54px`, **gap 11px 8px**.
   - Bars are **8px**, `slate-solid`, radius `0 4 4 0`, with width relative to the maximum.
   - The right column shows the rate in 600, then a muted "· count".
   - Rows: Admission 55 · 61, Death 24 · 27, New foot ulcer 20 · 22, Stroke 13 · 14, Dialysis start 8 · 9, Amputation 5 · 6.
   - Deaths stay slate. Do not use red.

**Mapping.**

- Every chart is a module-local `div` grid or inline SVG. There is no chart library in `package.json`, and none is needed.
- Colours via utilities: `bg-teal-700`, `bg-teal-300`, `bg-teal-400`, `bg-teal-200`, `bg-ink-300`, `bg-ink-400`, `bg-iris-100`, `bg-iris-solid`, `bg-grape-solid`, `bg-slate-solid`, `bg-sky-200`, `bg-sky-400`, `bg-sky-700`, `bg-sky-900`. SVG uses `stroke-teal-700` and `fill-teal-700/10`.
- Figures: `font-mono tabular-nums`. The 24px and 36px sizes are off scale: the nearest tokens are `text-stat` (28px) and `text-display-m`. The latter is display-only, so 36px needs a gap entry or should become `text-stat`.
- Overlines: `text-overline text-muted-foreground`.
- Every bar needs an `aria-label` or a visually-hidden table. The "Table" toggle provides that view.

**Status colour:** none. The board uses no red, amber or green, and death is slate. The only rulings needed are the kidney ordinal ramp and the care-band ramp.
