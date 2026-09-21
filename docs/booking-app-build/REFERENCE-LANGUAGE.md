# The reference language — MedSync mobile redesign contract (READ IN FULL)

The owner showed a reference: a light, airy doctor-booking app. Home: avatar + "Good morning! Name",
a big display question, a search bar, an "Upcoming Appointments" BLUE HERO CARD (doctor avatar, name,
specialty, two fact tiles "Date / Time", two pill buttons "Re-Schedule" (white) / "View Profile"
(translucent)), "Popular Doctors" with filter chips and rows (avatar, name, specialty, rating, bookmark),
and a floating tab bar. Detail screen: round back/share buttons, doctor photo + rating, "Select Date"
week strip (weekday over day-number tiles, selected = blue fill), "Select Time" grid of time chips
("8 Slots"), docked "Book an Appointment".

We adopt its VISUAL LANGUAGE — composition, card shapes, chips, tiles, the hero card, the greeting —
on top of MedSync's palette, and we keep every ADR 0084 rule. This is a redesign of composition and
styling. Copy, data calls, navigation targets and behaviour stay as they are unless this doc says otherwise.

## What the reference has that we deliberately do NOT (ADR 0084, owner-approved) — never add these

- Doctor PHOTOS, star RATINGS, review counts, "popular" ranking → §12. Use `Avatar` monograms.
- CLOCK NUMERALS ("9:30 AM", "8pm – 8:30 pm") → §10 (Luganda/Swahili dawn-anchored clock). Time is always
  a day + a day-part: `formatWhen`, `dayLabel`, `SESSION_LABEL`. Sessions are "Morning session" /
  "Afternoon session". No `time-outline` clock glyphs for a session — use `sunny-outline` (morning) /
  `partly-sunny-outline` (afternoon) or `calendar-outline` for a day.
- SLOT COUNTS ("8 Slots"), positions, wait estimates → §6, §12.
- A search bar (nothing to search), a notification bell (reminders are SMS; nothing to open),
  "How are you feeling today?" (a self-rating prompt — the emergency block names symptoms instead, §3). The
  sanctioned wording for the optional symptom selector (ADR 0095) is **"What is bothering you?"** with the lede
  "Optional. Choose anything that fits, or type your own." — it asks for a statement, not a rating, and the
  chips carry the duration so the copy never asks "how long" or "how bad".
- Video-call icons. Bookmarks. Share.

## Palette + kit (all in `mobile/src`, all themed; read each file before use)

- `theme/tokens.ts` `Palette`: background, foreground, card, muted, mutedForeground, primary (indigo),
  primaryForeground, accent (indigo tint), accentForeground, cta (MINT — the ONE primary CTA per screen),
  ctaForeground, ctaMuted, border, ring, shadow, status.\*. Use `useStyles(makeStyles)` / `useTheme()`.
  NO raw ramps or hex/rgba literals in screens (the kit derives its on-primary tints via `withAlpha(c.primaryForeground, …)`).
- `components/ui/screen.tsx` — `Screen({ title?, onBack?, footer?, scroll?, children })`. Chrome:
  round back `IconButton` on its own row when `onBack`, display title (Fraunces 28) below. No other slot.
  NO wordmark any more (the brand lives on the splash/sign-in). Pads for the tab bar automatically on tab screens.
- `components/ui/icon-button.tsx` — `IconButton({ icon, label, onPress, tone?: "card" | "onPrimary" })` round 44px.
- `components/ui/avatar.tsx` — `Avatar({ name, size?: 32|44|56|72, tone?: "accent"|"onPrimary" })` + `initialsOf(name)`.
  "Your clinician" (the fallback) draws a person glyph, not "YC".
- `components/ui/chip.tsx` — `Chip({ label, selected, onPress, disabled?, role?: "radio"|"button" })` pill;
  `ChipRow` (wrapping radiogroup); `Tile({ label, hint?, selected, onPress })` boxed pick; `TileGrid` (two per row).
- `components/ui/section.tsx` — `Section({ title, action?: {label,onPress}, children })` titled block with the
  reference's "View all" slot.
- `components/ui/hero-card.tsx` — `HeroCard({ leading?, eyebrow?, title, subtitle?, trailing?, tiles?: {icon,label,value}[], actions? })`
  the reference's blue card on `c.primary`; `HeroAction({ label, onPress, variant: "primary"|"ghost" })` — the white
  pill and the translucent one. AT MOST ONE HeroCard per screen.
- `components/ui/button.tsx` — `Button` primary (mint cta) / secondary (outlined) / link. The docked footer CTA is
  ALWAYS the kit primary (mint) — the reference's blue "Book an Appointment" maps to our mint signature, not to indigo.
- `components/ui/pill.tsx` — status chip. NEVER place a Pill on the HeroCard (its pairs are for the page);
  on the hero, say the status as a word in the eyebrow ("Your next visit · Confirmed").
- `components/ui/empty.tsx` — empty/error state.
- `components/patient/day-strip.tsx` — to be RESTYLED by the book agent (see below); keep its API and its
  wrap-not-scroll rule (a chip off the edge is a day the patient never sees — HCI4D evidence in its header).
- `components/patient/emergency-notice.tsx` — RESTYLE only (see home). Copy is CSO-provisional; byte-identical to web.

## Type scale (Fraunces 500 for display, Geist for everything else)

display 28/34 (screen title, the home question) · section title 16.5/22 medium · card title 17/23 medium ·
body 14.5/21 · meta 13.5/19 muted · eyebrow 12.5 letterSpacing .3 muted · tile value 14 medium.
Radii: cards 20 (`radius["2xl"]`), tiles 12 (`lg`), chips/buttons full. Gutter 20 (`space[5]`). Card padding 16.
Cards on the page: `c.card` + 1px `c.border` (in light a white card needs its edge). Sunken inputs: `c.muted`
fill, no border, radius `lg`, 48 tall, `c.foreground` text, `c.mutedForeground` placeholder, focused: 1px `c.primary`.

## Screen-by-screen composition

### Home `(tabs)/index.tsx` (+ restyle `emergency-notice.tsx`) — the reference's screen 1

1. Greeting row (no Screen title): `Avatar(name, 44)` · "Good morning" / "Good afternoon" / "Good evening" by the
   HOSPITAL's clock (`localWeekdayAndMinutes(new Date(), DEFAULT_TIME_ZONE).minutesOfDay`: <720 morning, <1020
   afternoon, else evening — import from `@shared/slots`) as 13.5 muted, then the first name (16 medium) from
   `session.user.user_metadata.full_name` exactly the way `ticket.tsx` reads it; no name → the greeting alone.
   Right side: nothing.
2. `EmergencyNotice` — restyle as a card in the language: radius 2xl, 1px `c.status.cautionFg` ring, 36px
   `c.status.cautionBg` disc with `warning-outline` in `c.status.cautionFg`, lead 15 medium `c.foreground`,
   symptoms 14.5 `c.foreground`, the Call control = kit Button secondary full width. Same words. Never red. Never a fill.
3. Eyebrow = hospital name (12.5 muted, uppercase letterSpacing .4); display heading "What do you need today?"
   (28/34 Fraunces, `c.foreground`). No hospital → heading alone.
4. `Section title="Coming up"` with ONE `HeroCard` when there is something in motion (the existing
   next-visit / live-ticket logic decides which):
   - next visit: leading `Avatar(clinicianName, 56, "onPrimary")`; eyebrow "Your next visit · {Pill word}";
     title clinician name (or "Your clinician"); subtitle "{department} · {hospital}"; tiles
     [{calendar-outline, "Day", dayLabel-or-"Mon 14 Sep"}, {sunny/partly-sunny, "Session", "Morning" | "Afternoon"}];
     actions: HeroAction primary "See this visit" → visit/[id]; ghost "Move it" → visit/[id] with `move: "1"` param
     (the visits agent makes visit/[id] open its move panel when `move === "1"`). Hide "Move it" when status ∉ RESCHEDULABLE.
   - live ticket: eyebrow "Your place today"; title department; subtitle the existing INTAKE_TITLE sentence;
     tiles [{pricetag-outline, "Patient code", code}, {footsteps-outline, "Stage", stage word}]; action primary
     "Open your ticket" → ticket.
     Nothing in motion → no section (not an empty card).
5. `Section title="Get seen"`: the two doors, unequal (§2/§11):
   - primary door = mint card (`c.cta`), radius 2xl, padding 20: 40px disc `withAlpha(c.ctaForeground, .12)`
     with `walk-outline` in `c.ctaForeground`; title (Fraunces 21) "Coming to the hospital today"; body (14.5,
     `c.ctaMuted`) verbatim; chevron-forward in `c.ctaForeground` at right.
   - secondary door = `c.card` + 1px `c.border`, radius 2xl, padding 16: 40px `c.accent` disc with
     `calendar-outline` in `c.accentForeground`; title 16 medium `c.foreground` "Ask for a day — the clinic
     confirms"; body 14 muted "Choose from the days the clinic has open."; chevron muted.
     Both are Pressables (role button), opacity on press.
6. Loading / error / not-patient states keep their current logic; error uses `Empty`.
   No "Your visits" link, no gear (they are tabs).

### Book `book.tsx` (+ restyle `day-strip.tsx`) — the reference's screen 2

- Keep the three steps, the step titles, the announce-on-step logic, the footer CTA (kit primary) and every data call.
- Step 0 (reason): the options as a `ChipRow` of `Chip`s (radio) — title words only, the hint under the row as a
  13.5 muted line for the selected reason if the data has one; the note as a sunken input (see type scale).
- Step 1 (day): a "clinic card" at top: `c.card`+border, `Avatar(chosen.fullName, 56)`, name 17 medium,
  "{department} · {hospital}" muted; when `clinics.length > 1` the clinic pick is a `ChipRow` of clinics
  (role radio) under the disclosure link exactly as today. Then `Section title="Select a day"` → `DayStrip`
  RESTYLED: each day a vertical tile 56w×64h, radius lg: weekday abbreviation (12.5) over the day number
  (18 medium) — derive both from the dateKey with `Intl.DateTimeFormat` in `DEFAULT_TIME_ZONE` (weekday:
  "short", day: "numeric"); "Today"/"Tomorrow" become a 10px caption under the number (from `dayLabel`);
  unselected `c.card`+border+`c.foreground`; selected `c.primary` fill + `c.primaryForeground` text; wrap in
  rows (gap 8), never horizontal scroll. Then `Section title="Which part of the day?"` → `TileGrid` of `Tile`s
  ("Morning session" hint "Come when the clinic opens." / "Afternoon session").
- Step 2 (check): ONE `HeroCard` as the review: leading Avatar, eyebrow "You are asking for", title
  clinician, subtitle department · hospital, tiles [Day, Session], no actions; then a card with the reason
  and note rows. Footer: "Ask for this day" / "Confirm this day" as today.
- Confirmation: `Empty`-style centred: 72px `c.accent` disc with `checkmark` in `c.accentForeground`, the existing
  title/sentence, footer "Done".
- Errors/refusals: the existing caution well recipe.

### Today `today.tsx` + Ticket `ticket.tsx`

- Today: back IconButton, display title as now, lede; departments as a list of cards (`c.card`+border, radius 2xl,
  44px `c.accent` disc with `medkit-outline`, name 16 medium, the openNow word 13.5 muted ("Open now" /
  "Not open for same-day visits right now" — whatever the file already says), chevron). Selected department:
  `c.accent` fill + 1px `c.primary` border. Footer CTA unchanged.
- Ticket: ONE `HeroCard` at top: eyebrow "Your place today", title department, subtitle hospital, tiles
  [Patient code, Stage word]; below it the stage list as a vertical timeline card: each stage a row with a
  24px disc (done: `c.primary` fill + checkmark in `c.primaryForeground`; current: `c.accent` fill + 1px
  `c.primary` ring; future: 1px `c.border` ring), the stage word 15 (current = medium `c.foreground`, others
  muted), a 1px `c.border` connector between discs. Words carry state, never colour alone. Actions as today.

### Visits `(tabs)/visits.tsx` + Visit `visit/[id].tsx`

- Visits: display title "Your visits"; if the file has an upcoming/past split, express it as a `ChipRow` of two
  `Chip`s (role "button", `selected`); month headings as `Section` titles; rows = the reference's doctor rows:
  `c.card`+border radius 2xl padding 12, `Avatar(clinicianName, 56)`, name 16 medium, "{department}" 13.5 muted,
  "{formatWhen}" 14 `c.foreground`, `Pill` under it, chevron muted. Empty state via `Empty`.
- Visit detail: ONE `HeroCard` header (leading Avatar onPrimary 56, eyebrow "Visit · {Pill word}", title
  clinician, subtitle department · hospital, tiles [Day, Session]; actions: primary "Move this visit" (opens the
  move panel; ALSO opens when the `move` search param === "1" — read it with `useLocalSearchParams`), ghost
  "Cancel visit" — each only when the status allows, exactly as the file already decides). Below: a details card
  (reason, note, patient code if shown). Move panel = the SAME DayStrip + TileGrid as book. Reason inputs = sunken.

### Settings `(tabs)/settings.tsx`

- Top: a profile card (`c.card`+border): `Avatar(name, 56)`, name 17 medium (from user_metadata like ticket.tsx),
  "Patient code {patientCode}" 13.5 muted (from `fetchPatientProfile` — if the screen does not have it, fetch it
  the way home does; failure → omit the line). Then the Appearance group and Sign out as they are.

## Hard rules

1. Tokens only. Grep: `brand\[|mint\[|gray\[|#[0-9a-fA-F]{3,8}\b|rgba\(` must be empty in your files.
2. Copy is frozen: every patient-facing sentence that exists today stays byte-identical unless this doc gives a
   new one. No new sentences beyond the ones listed here.
3. Both themes. Every fg/bg pair must be one of the sanctioned pairs (foreground/mutedForeground on
   background/card/muted; accentForeground on accent; primaryForeground on primary; ctaForeground/ctaMuted on cta;
   status pairs; the hero's ink-tinted tiles).
4. Accessibility: roles and states preserved; 44px targets; headings keep `accessibilityRole="header"`;
   decorative discs/glyphs hidden; Avatar is decorative (name is beside it).
5. Motion: none new. Press = opacity.
6. React Compiler lint is on: no setState in an effect body, no hooks in helpers, no `Date.now()`/`Math.random()`
   in render. `useStyles(makeStyles)` at component top level; `makeStyles` module-level.
7. Do not touch files outside your group. If a kit component needs a change, describe it in `needsOtherFile`.

## Verify (from /Users/airm1/Desktop/medsync/mobile)

npx tsc --noEmit · npx eslint <files> --max-warnings=0 · npx prettier --check <files> · the grep above.
