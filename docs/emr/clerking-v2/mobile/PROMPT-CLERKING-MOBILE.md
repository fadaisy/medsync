# PROMPT: Clerking desk v2 on a phone (encounter tab, mobile restyle)

> **For Claude Code.** This is an addendum to `docs/emr/clerking-v2/PROMPT-CLERKING-DESK-V2.md` (the v2 prompt). It replaces that prompt's Section 5.12 "Phone" and nothing else. Work on the same branch as the v2 build (`feat/clerking-v2`); if v2 has merged, cut `feat/clerking-v2-mobile` from the branch it merged into. Confirm at STOP M0.
>
> First copy this pack into `docs/emr/clerking-v2/mobile/`:
> - this prompt;
> - `prototype/Phone.dc.html`, the approved phone prototype (markup and logic), and the nine `prototype/PhoneR*.dc.html` wrappers that open it in each demo state;
> - `screenshots/R01-encounter.png` to `R10-note-and-flags.png`, renders of that prototype at 390×844 (2× pixels);
> - `before/` with the three production screenshots from 27 Sep 2026 that this build fixes.
>
> **Mode:** gated, four phases (M0 to M3), each ending in a **STOP**. Documents use Stage 1 (draft, critique against the checklist, revise at most twice, present, STOP). Code uses Stage 2 (build, run the real checks, fix, re-run until green, report numbers, STOP). Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** This build changes layout and styling only. It adds no clinical content, rule or write path. If any step seems to need one, stop and ask.

---

## 0. What we are building, in one paragraph

On a phone the encounter tab is the desktop page squeezed into 390 px, and it is too cluttered to use (Section 2). This build gives the clerking desk v2 a proper phone layout. It keeps **the same structure, content, controls and wording** as the desktop v2 desk: the same ten steps, the same catalogue, the same yes/no rows, chips, steppers, "Nothing else", Details dialog, note and flags. What changes is how they are arranged and styled below the phone breakpoint: a compact app bar, a patient header with four context tiles, a sticky step bar, each form group in its own panel, one fixed bottom bar, and bottom sheets for everything that opens. The CSO rejected two more radical phone concepts (one question per card, and "the note is the form"); do not reintroduce them.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt on mechanics. Report every disagreement at STOP M0.
2. **The v2 prompt's laws (its Section 2) all apply unchanged.** In particular: clinical content is data (Law 2), store ids never labels (Law 3), missing is never normal (Law 4), decision support only (Law 6), the colour law as amended by D-CV-03 (Law 8), two identifiers (Law 9), restricted classes (Law 10), behind `CLERKING_V2` (Law 12), stack as found (Law 13), en-GB (Law 14).
3. **The phone prototype is the design authority for the phone layout**, not code to paste.
   - `prototype/Phone.dc.html` runs on a canvas runtime (`x-dc`, `sc-if`, `sc-for`, a `DCLogic` class). Its logic is the desktop prototype's `DeskLogic` plus a small `Component` subclass for phone state. Port the layout to the app's own React components and tokens.
   - The screenshots show the target at 390×844.
   - **The catalogue wins on content** wherever the prototype differs. Known differences are listed in Section 7.
4. **The desktop v2 components are the building blocks.** The phone layout must reuse them (the yes/no control, chip, stepper, property editor, flags list, note composer, context content). Do not fork a second set.

---

## 2. What is wrong today (production, 27 Sep 2026, Patient Three-3, MS-2026-00004, iPhone Safari)

| # | Finding | Seen in |
|---|---|---|
| M1 | **The top of the page is spent on chrome.** "Workspace", then cadre, "Sign out" and a large Emergency button, before any clinical content. | all three |
| M2 | **Context is a paragraph.** Allergies, active problems, critical results and vital signs are stacked label-value lines; the NEWS2 chip is the only visual signal. | encounter |
| M3 | **The step is shown twice** ("Step 1 of 10 · Complaint ▾" and again "[01] Presenting complaint · Step 1 of 10"), with Context and "Note and flags (2)" as extra buttons in between. | encounter |
| M4 | **Status text is cut off.** Every review-of-systems row reads "Not rev…" because "Nothing else" takes the space. Long names wrap ("Ear, nose, throat and eyes"). | systems |
| M5 | **Card inside card inside page,** each with its own border and padding, so content is narrow and the page is long. | all three |
| M6 | **Social history is one unbroken run of large chips** across its groups, many wrapping to three rows. There are no group boundaries. | social |
| M7 | **The browser's floating toolbar and the URL pill cover the form** (C8 in the v2 prompt). Nothing reserves space for them or for the home indicator. | all three |
| M8 | **The history-from control is a segmented bar that wraps**, leaving "Health worker" alone on a second row. | encounter |

Confirm each at M0 on a real phone or WebKit at 390×844, and write a failing Playwright test for M3 (one step label only), M4 (no truncated status) and M7 (no control overlapped by the bottom bar or viewport chrome).

---

## 3. Layout rules (below the phone breakpoint)

**Breakpoint.** Phone layout applies below 640 px viewport width. 640 to 1023 px keeps the tablet rules in the v2 prompt (5.12, tablet). 1024 px and up is the desktop desk. Use the app's existing breakpoint tokens if they differ; report at M0.

**Eight rules**
1. **Two fixed bars, one scrolling page.** The app bar is fixed at the top and the bottom bar at the bottom. Everything between them scrolls as one page. The step bar sticks to the top of that page once the patient header has scrolled away.
2. **Emergency is always visible.** It lives in the app bar, so it never scrolls away (principle: persistent emergency affordance).
3. **One step label.** "Step N of 10" and the step title appear once, in the step bar. The section intro repeats only the title and its one-line description, never the step count.
4. **Context is tiles, not text.** Four tiles in a 2×2 grid in the patient header. Tapping any tile opens the Context sheet. There is no separate Context button.
5. **Group, don't nest.** Each form group is one white panel (radius 16, hairline ring) on a light grey page. Panels never contain bordered cards. Rows inside a panel are separated by hairlines.
6. **Everything that opens is a bottom sheet.** Steps, Context, Note and flags, the complaint property editor and the symptom Details dialog. Sheets have a grab handle, a title, a close button and, where there is an action, a fixed footer.
7. **Nothing covers the form.** The bottom bar reserves its own height plus `env(safe-area-inset-bottom)`. The page uses `100dvh`. When the keyboard opens, the focused field scrolls into view above it (use `visualViewport`), and the bottom bar hides while a text field has focus.
8. **Same answers, same taps.** Every desktop control exists on the phone with the same meaning and the same accessible name. The phone may not add or remove a clinical choice.

---

## 4. Interface specification

The screenshots show the target; the notes below are the rules the pixels follow.

### 4.1 App bar (R01), fixed, 50 px
- Left: "‹ Workspace" (back to the doctor workspace).
- Right: the **Emergency** button (red outline with the siren icon, as today, 34 px tall), then an **account avatar** (34 px circle with the cadre initials, "SC").
- The avatar opens the existing account menu: name, cadre ("Senior consultant"), hospital and department, and **Sign out**. Sign out is no longer a top-level link on the phone (D-CM-01).

### 4.2 Patient header (R01), scrolls away
- **Row 1:** the patient name in the display face (25 px), then a "Draft" pill on the right.
- **Row 2:** age, sex and MRN (MRN in mono) on the left; "✓ Saved HH:MM" in teal on the right. This is the existing autosave status.
- **Row 3:** four tiles in a 2×2 grid, each with a small uppercase label, a one-line value and a one-line source:
  - **Allergies:** live from the allergy record. "No known allergies" in teal with the shield icon when NKDA is confirmed; the allergy names otherwise; "Uncoded, not checked by prescribing" as the amber source line when any allergy is uncoded (v2 prompt 5.1).
  - **Vital signs:** the NEWS2 chip text ("NEWS2 5, incomplete") and "Triage, 23:00". The tile takes the amber caution tint when NEWS2 reaches the signed trigger level or any parameter scores 3. It never uses the critical tint, even when the flag is urgent; the urgent level shows in the Flags list (Law 8 as amended by D-CV-03).
  - **Active problems** and **Critical results:** value and source, neutral.
- Two identifiers stay visible in the step bar once the header scrolls away (4.3).

### 4.3 Step bar (R01, R03), sticky
- Left, as one button that opens the Steps sheet: "Step N of 10" (mono, 11.5 px, indigo) above the step title (17 px, semibold) and a ▾. The title never truncates at 360 px; if it would, use the step's short name.
- Right: a **Note** button with the flag count in a pill. The pill uses the critical tint when any urgent flag is present, amber when only caution flags are present, and neutral otherwise. Its accessible name is "Note and flags, N flags, M urgent".
- Below: a thin 10-segment progress line (3 px). Current step indigo, done teal, required amber, others grey (place colour per Chroma).
- **When the patient header has scrolled away,** the step bar also shows the patient's name and MRN in one small line above "Step N of 10", so two identifiers are always on screen (Law 9). The prototype does not show this line; add it (Section 7).

### 4.4 Section intro
The step's full title (21 px) and its one-line description from the section definition. No step count, no `[NN]` code on the phone.

### 4.5 [01] Complaint (R01, R08)
- **History from** panel: the five historians as chips (Patient, Carer, Relative, Referral letter, Health worker) wrapping cleanly (fixes M8), then Language and Interpreter side by side.
- **Complaints** panel: one row per complaint with the name, the duration in mono (amber "how long?" when missing), a two-line property summary, and the complaint's flag badges when it has any. A chevron opens the **complaint sheet** (R08): the desktop property editor stacked for the phone, with Remove and Done in the footer. Below the rows: the search field and the quick-pick chips (dashed "+" style).
- Flag badges on complaint rows are a phone-only aid. **This needs D-CM-04**, because the v2 prompt keeps badges in the Flags panel only (v2 rule 6). If D-CM-04 is declined, drop them and keep badges in the Note sheet only.

### 4.6 [02] History
- **The story** panel: the text box with the helper line.
- **Also asked** panel: the yes/no rows.

### 4.7 [03] Review of systems (R03, R04, R05)
- A one-line hint above the panel: link icon, "Linked answers follow the complaint".
- **One panel, one row per system**, in catalogue order, applying sex and age filters exactly as on desktop (for a man: no Gynaecological system; breast lump asked under Skin).
- Each system row (≥ 60 px):
  - a chevron that rotates when open;
  - the system name (15.5 px, wraps to two lines if needed);
  - a status line with a 7 px dot: grey "Not reviewed", amber "Partly reviewed", pale teal "Nothing to report", teal "N positive". The status is never truncated (fixes M4);
  - when positive, the positive symptoms on one further line, truncated with an ellipsis;
  - on the right, **Nothing else** (32 px, outline), shown only while the system has unasked, non-linked items.
- **Opening a system expands it in place** (R04), one system at a time. Its items are the desktop yes/no rows, indented under the chevron. Linked items show "Yes, in complaint" as a link chip instead of the yes/no control. A positive item shows the **Details** button with its property summary, then its badge if it raises a flag.
- **Details opens a bottom sheet** (R05), full height minus the app bar, never a centred dialog on the phone (this overrides ADR 0161 below the phone breakpoint only; D-CM-05). It has a "‹ {System}" back link, the symptom name and summary, the flag badges for that symptom (deduplicated by text), the property editor, and a footer with "Answer no" and Done. Focus moves into the sheet on open and returns to the Details button on close.

### 4.8 [04] Past history (R07)
Panels in this order: **Allergies** (the allergy record, "Add an allergy"), **Medicines** (rows with summary, adherence badge and remove; quick-add chips), **Conditions** (yes/no rows with locks on restricted items), **Operations and transfusions**. Medicines and allergies keep writing through the existing immediate-commit actions (v2 Law 5).

### 4.9 [05] Family
One panel of yes/no rows, then one "{condition}: who" panel per positive with relation chips.

### 4.10 [06] Social (R06)
One panel per catalogue group, in catalogue order: **Tobacco** (status chips; when former or current, the two steppers for cigarettes a day and years, then pack-years in mono, derived and never typed), **Alcohol** (pattern chips; types when not "None"), **Other substances**, **Home and activity** (Lives, Activity), **Occupation** (text field plus hint chips), **Travel**, **Diet**. This fixes M6 by giving every group a boundary, not by removing options.

### 4.11 Examination, Summary, Impression, Plan
Their current content inside the phone shell, unchanged. The examination phone design comes with the examination prompt.

### 4.12 Bottom bar (all screens), fixed
- A 48 px square **Previous** button and a primary **"Next: {short name}"** button that fills the rest.
- On the last step, the primary button reads "Review and sign" and opens the Note sheet.
- Sign and Complete live in the **Note sheet footer**, not in the bottom bar (D-CM-06).

### 4.13 Sheets
- **Steps** (R02): the two groups (History; Examination and plan) with numbered circles, ticks, statuses and the current step highlighted indigo; "N of 10 done" as the subtitle.
- **Context** (R09): allergies with who confirmed and when; vital signs with the message for any parameter scoring 3, per-row NEWS2 badges and arrows; active problems; critical results.
- **Note and flags** (R10): the Flags list (badges, symptom words only, urgent first, each tappable to jump to its step) above the note, with Complete visit and Sign note in the footer.
- **Complaint** (R08) and **Details** (R05): as above.
- Sheets open over a 38 % scrim, close on scrim tap, swipe down or the close button, trap focus, and restore focus.

---

## 5. Sizing, touch and type

| Item | Visual | Touch target |
|---|---|---|
| Chips | 36 px tall, radius 10, 14 px text | 44 px: add 4 px hit slop top and bottom; keep ≥ 8 px gaps so slop never overlaps |
| Yes/No segmented control | 32 px inside a row ≥ 48 px | each half ≥ 44×44 via hit slop |
| Steppers | 40 px | 44 px buttons |
| Bottom-bar buttons | 48 px | 48 px |
| "Nothing else" | 32 px | 44 px via hit slop |

- Type: body 15 to 16 px (inputs 16 px so iOS does not zoom); labels 12.5 to 13.5 px; nothing below 12 px except the uppercase tile labels (11 px, semibold, letter-spaced).
- Tokens: MedSync Chroma as merged (D-CV-11). Page background is the light neutral surface; panels are the base surface with a hairline ring; no left-edge accent bars.
- Dark mode: supported with the same structure. Clinical colours keep their meanings.
- The prototype's iOS-style status bar is a mock-up of the device, not part of the app. Do not build it.

---

## 6. Budgets (measured at M0, met by M3)

| Measure | Target |
|---|---|
| Horizontal scroll at 360, 390 and 412 px widths | none |
| Patient header height at 390×844 | ≤ 250 px |
| Sticky step bar height | ≤ 72 px (with the identifier line) |
| Section intro visible without scrolling on first open at 390×844 | yes |
| Controls overlapped by the bottom bar, keyboard or browser chrome (Playwright check across all steps) | 0 |
| Truncated status text in the review of systems at 360 px | 0 |
| Taps for a full review of systems with nothing to report | ≤ 13, the same as desktop |
| Taps and keystrokes for the standard visit | equal to desktop (v2 budget) |
| Sheet open | < 120 ms p95 on a mid-range Android at 4× CPU throttle |
| Cumulative layout shift on first load | < 0.1 |
| Phone-only JavaScript added | ≤ 15 KB gzipped |

---

## 7. Known differences: prototype against the catalogue and the laws

Build to the right-hand column.

| Prototype shows | Build instead | Why |
|---|---|---|
| The lock only on "Injecting drugs" in Other substances | The whole Other substances group is restricted (catalogue `sensitivity: mental_health`): lock on the group, clinical views only, excluded from prints and exports | Catalogue wins; Law 10 |
| "No known drug allergies, confirmed by M. J. Nayiga" as fixed text | Live from the allergy record, with who and when | Law 5, one owner per fact |
| "Hypertension" as the active problem | Live from the problem list | Demo data |
| No identifier line in the step bar | Name and MRN line once the header scrolls away | Law 9 |
| Social history defaults (Retired, local brew, and so on) | Empty until answered | Demo data; Law 4 |
| Flag badges on complaint rows and under positive system items | Only if D-CM-04 is signed | v2 rule 6 |
| Details as a bottom sheet | Bottom sheet on the phone only, if D-CM-05 is signed | ADR 0161 |

---

## 8. Accessibility

- WCAG 2.2 AA in light and dark at 390×844 and at 200 % text size (the layout reflows; no clipped labels).
- Landmarks: the app bar is a `banner`, the step bar a `navigation` labelled "Clerking steps", the page `main`, and the bottom bar a `navigation` labelled "Step controls".
- The step-bar button's accessible name is "Step 3 of 10, Review of systems, 9 positive, 4 to do. Open all steps".
- System rows: the expand button has `aria-expanded` and controls the item list; "Nothing else" has the accessible name "Nothing else in {system}".
- Sheets: `role="dialog"`, `aria-modal="true"`, labelled by the sheet title (Details sheets by the symptom name plus the patient's name and MRN, Law 9); focus trapped and restored; closes on Escape.
- Tiles are buttons whose names include label and value ("Vital signs, NEWS2 5, incomplete. Open context").
- Reduced motion: sheets appear without sliding; chevrons do not animate.
- Colour is never the only signal: status dots always sit beside status text; badges always carry an icon and text.

---

## 9. Phases and gates

### Phase M0: discovery and baseline (no product changes)
- **Q1** Where the v2 build is: which v2 phases are merged, and whether its components (yes/no control, chip, stepper, property editor, flags list, note, Details dialog) exist as reusable components.
- **Q2** The breakpoint tokens and how the desk switches layout today.
- **Q3** The account menu: does one exist to hold cadre, hospital and Sign out?
- **Q4** Whether a bottom-sheet primitive exists (Radix, Vaul or the app's own). **Do not add a dependency without stopping to flag it.**
- **Q5** The autosave status source and the allergy, problem and critical-result sources for the tiles.
- **Q6** Playwright device projects available (WebKit iPhone, Chromium Android) and whether axe runs in them.

**Baseline:** screenshots at 360×740, 390×844 and 412×915 in light and dark for every step; the Section 6 measures; the three failing tests (M3, M4, M7).

**STOP M0.** Report Q1 to Q6, the baseline, the failing tests and every repo disagreement.

### Phase M1: GATE proposal (documents only)
Write `docs/emr/clerking-v2/mobile/gate-proposal.md`: the component map (desktop component → phone arrangement, all reused), the sheet primitive choice, the breakpoint plan, the test plan, and the Section 10 decision table with a signature block.

**STOP M1.** Nothing proceeds without signatures.

### Phase M2: shell and sections (behind `CLERKING_V2`)
The app bar with the account menu, the patient header and tiles, the sticky step bar with the identifier line, the bottom bar, the five sheets, then every section's phone arrangement (4.5 to 4.11), safe areas and keyboard handling.

**STOP M2.** Screenshots against R01 to R10 at 390×844 (light and dark) and at 360 and 412 widths; the three M0 tests now green; the overlap check at 0; axe 0 serious or critical; the red-scarcity tests extended to every phone component and green; the desktop and tablet screenshots unchanged from before the phase.

### Phase M3: hardening and a device trial
- Performance budgets (Section 6) on a mid-range Android and an iPhone, both in the real browser with its toolbar.
- 200 % text size, dark mode, reduced motion, offline (the existing optimistic queue).
- **A timed trial on phones** with three clinicians: the standard visit and one chest-pain visit, desktop against phone, reporting median time, taps, keystrokes and errors.
- The ADR (Section 11).

**STOP M3 (final).** The Section 12 table, filled in.

---

## 10. GATE decisions (Fadhul owns; recommendations given)

| Id | Decision | Recommendation |
|---|---|---|
| D-CM-01 | Account controls on the phone | Cadre, hospital and Sign out move into an avatar menu; Emergency stays in the bar. |
| D-CM-02 | Patient header behaviour | Scrolls away; the step bar sticks and carries name and MRN once it has. |
| D-CM-03 | Context entry point | The four tiles open the Context sheet; no Context button. |
| D-CM-04 | Flag badges on complaint rows and positive system items (phone) | **Yes, on the phone only**, same text and icons as the Flags list. On a phone the Flags list is a sheet away, so the signal has to sit where the answer is. Desktop keeps v2 rule 6. |
| D-CM-05 | Details on the phone | A bottom sheet instead of a centred dialog, below the phone breakpoint only (narrow exception to ADR 0161). |
| D-CM-06 | Where Sign lives on the phone | In the Note sheet footer; "Review and sign" on the last step opens it. |
| D-CM-07 | Chip size | 36 px visual with a 44 px touch target, instead of 44 px visual. |

---

## 11. ADR (next free number)
- Clerking desk v2 phone layout: two fixed bars, a sticky step bar, grouped panels and bottom sheets; the phone reuses desktop components; the D-CM decisions.

---

## 12. Numbers to report at the final STOP

| Measure | Before | Target | After |
|---|---|---|---|
| Step labels on screen at once | 2 | 1 | |
| Truncated ROS statuses at 360 px | all rows | 0 | |
| Controls overlapped by chrome or bottom bar | (M0) | 0 | |
| Horizontal scroll at 360 / 390 / 412 | (M0) | none | |
| Patient header height at 390×844 | (M0) | ≤ 250 px | |
| Full negative ROS taps | (M0) | ≤ 13 | |
| Standard visit on a phone: median time, taps, keystrokes | (M0) | ≤ desktop | |
| Sheet open p95 (mid-range Android, 4× throttle) | n/a | < 120 ms | |
| CLS | (M0) | < 0.1 | |
| Phone-only JS gzipped | n/a | ≤ 15 KB | |
| axe serious or critical | (M0) | 0 | |

---

## 13. Out of scope
- The examination phone design (the examination prompt).
- Any change to catalogue content, flag rules, reference entries or composer wording.
- The two rejected phone concepts (one question per card; the note as the form).
- Native apps. This is the responsive web desk.

## 14. Definition of Done
- [ ] M1 to M8 fixed and proven by tests or screenshots.
- [ ] Every desktop control is present on the phone with the same meaning and accessible name.
- [ ] Two identifiers on screen at all times; Emergency always visible.
- [ ] Nothing is covered by the bottom bar, the keyboard or the browser toolbar on an iPhone and an Android phone.
- [ ] Restricted groups are locked and excluded exactly as on desktop.
- [ ] axe clean; red-scarcity tests green; 200 % text reflows; reduced motion honoured.
- [ ] Desktop and tablet screenshots are unchanged; with `CLERKING_V2` off, the current desk is unchanged.
- [ ] The ADR is written, the device trial is reported and the Section 12 table is filled in.

## 15. Parallel reminders (flag if touched)
- The v2 prompt's reminders still apply (NCD diabetes engine fixtures, monitoring engine, IPC link).
- Pharmacy Board of Uganda, never PSU.
