# MedSync Design System

**Status:** Active (Phase 0.2)
**Last updated:** 2026-05-21
**Owner:** Usama Fadhul

This document is the authoritative source for every visual and interactive decision in MedSync. The design system wins on all visual disagreements. Components, layouts, and styles must follow these tokens and rules exactly.

> Adapted from the Attio design language — precision-first, monochrome base, with teal as the clinical accent.

---

## Core Philosophy

- **Clinical Precision.** Pixel-perfect alignment, tight letter-spacing on headlines, engineered for trust in medical contexts.
- **Calm Authority.** Monochrome base with teal accents. Confidence without alarm. Never cold, never decorative.
- **Data Density.** Compact vitals, labs, patient rows. Every pixel serves the clinician. Information-rich without clutter.
- **Compassionate UX.** Warm neutral tones, clear hierarchy, human-centered. Progressive disclosure — summaries expand to full charts.
- **Motion with Purpose.** `cubic-bezier(0.16, 1, 0.3, 1)` for all transitions. Never decorative animation.
- **Systematic Scale.** 4px base grid, constrained type scale, token-driven theming across all modules.

---

## Color Tokens

### Neutrals (primary palette — use for 90%+ of UI)

| Token      | Hex       |
| ---------- | --------- |
| `black`    | `#000000` |
| `white`    | `#FFFFFF` |
| `gray-50`  | `#FAFAFA` |
| `gray-100` | `#F5F5F5` |
| `gray-150` | `#EFEFEF` |
| `gray-200` | `#E5E5E5` |
| `gray-300` | `#D4D4D4` |
| `gray-400` | `#A3A3A3` |
| `gray-500` | `#737373` |
| `gray-600` | `#525252` |
| `gray-700` | `#404040` |
| `gray-800` | `#262626` |
| `gray-900` | `#171717` |
| `gray-950` | `#0A0A0A` |

### Text colors

- **Primary text:** `#171717` (gray-900)
- **Secondary text:** `#525252` (gray-600)
- **Tertiary/muted text:** `#737373` (gray-500)
- **Disabled text:** `#A3A3A3` (gray-400)
- **Placeholder text:** `#A3A3A3`

### Background colors

- **Page:** `#FFFFFF`
- **Raised/sidebar:** `#FAFAFA` (gray-50)
- **Hover state:** `#F5F5F5` (gray-100)
- **Active/pressed:** `#EFEFEF` (gray-150)
- **Teal-tinted hover:** `#F0FDFA` (teal-50) — for clinical elements
- **Overlay:** `rgba(0,0,0,0.5)`

### Border colors

- **Default:** `#E5E5E5` (gray-200)
- **Subtle:** `#EFEFEF` (gray-150)
- **Strong/hover:** `#D4D4D4` (gray-300)
- **Active/focus:** `#14B8A6` (teal-500)
- **Teal subtle:** `#CCFBF1` (teal-100)

### Primary Teal (clinical accent — trust, calm, medical authority)

| Token      | Hex       | Usage                                       |
| ---------- | --------- | ------------------------------------------- |
| `teal-50`  | `#F0FDFA` | Hover backgrounds, soft fills               |
| `teal-100` | `#CCFBF1` | Teal borders, badge backgrounds             |
| `teal-200` | `#99F6E4` | Light accents                               |
| `teal-300` | `#5EEAD4` | Decorative accents (rare)                   |
| `teal-400` | `#2DD4BF` | Charts, progress bars                       |
| `teal-500` | `#14B8A6` | Focus rings, toggles                        |
| `teal-600` | `#0D9488` | **Primary CTA**, links, active nav ← anchor |
| `teal-700` | `#0F766E` | Hover state on primary CTA                  |
| `teal-800` | `#115E59` | Dark teal text on teal backgrounds          |
| `teal-900` | `#134E4A` | Dark CTA backgrounds                        |

### Clinical Status Colors

Use ONLY for patient status indicators, clinical badges, and validation states.

| Status         | Background | Text      | When to use                        |
| -------------- | ---------- | --------- | ---------------------------------- |
| **Stable**     | `#DCFCE7`  | `#15803D` | Patient stable, vitals normal      |
| **Critical**   | `#FEE2E2`  | `#DC2626` | Emergency, critical vitals, alerts |
| **Caution**    | `#FEF3C7`  | `#D97706` | Warning, borderline vitals         |
| **Admitted**   | `#CCFBF1`  | `#0F766E` | Currently admitted patients        |
| **Discharged** | `#F3E8FF`  | `#7C3AED` | Discharged patients                |
| **Pending**    | `#F5F5F5`  | `#525252` | Awaiting action, unconfirmed       |

**CRITICAL:** Red (`#DC2626`) is reserved exclusively for clinical alerts and critical states. Never use red for general UI decoration or non-emergency states.

---

## Typography

### Font families

- **Display/Headlines:** `"Neue Haas Grotesk Display Pro", "Helvetica Neue", Helvetica, Arial, sans-serif`
- **Body/UI:** `"Neue Haas Grotesk Text Pro", "Helvetica Neue", Helvetica, Arial, sans-serif`
- **Monospace:** `"SF Mono", "Fira Code", Menlo, Consolas, monospace`

### Type scale

| Name       | Size | Weight | Line-height | Letter-spacing |
| ---------- | ---- | ------ | ----------- | -------------- |
| Display XL | 72px | 500    | 1.0         | -0.04em        |
| Display L  | 56px | 500    | 1.05        | -0.035em       |
| Display M  | 44px | 500    | 1.1         | -0.03em        |
| Display S  | 36px | 500    | 1.15        | -0.025em       |
| Heading L  | 28px | 500    | 1.2         | -0.02em        |
| Heading M  | 22px | 500    | 1.3         | -0.015em       |
| Heading S  | 18px | 500    | 1.4         | -0.01em        |
| Body L     | 17px | 400    | 1.6         | -0.006em       |
| Body M     | 15px | 400    | 1.6         | -0.004em       |
| Body S     | 13px | 400    | 1.5         | 0              |
| Caption    | 11px | 500    | 1.4         | 0.02em         |
| Overline   | 11px | 600    | 1.4         | 0.08em         |

### Weight usage

- **400 (Regular):** Clinical notes, descriptions, body text
- **500 (Medium):** Patient names, headlines, nav items, labels, button text — workhorse weight
- **600 (Semibold):** Overlines, lab column headers, emphasis, alerts
- **700 (Bold):** Rare — critical vitals only (e.g., out-of-range lab values)

### Medical data typography rules

- **Vital signs:** Use monospace, `font-variant-numeric: tabular-nums`, large size (20–28px), weight 500
- **Lab values out-of-range:** Red-700 `#DC2626`, bold (700), monospace
- **Lab values normal:** Primary text `#171717` or Green-700 `#15803D`, regular weight
- **Patient IDs (MRN):** Always monospace, gray-500 `#737373`, letter-spacing 0.02em
- **Timestamps:** 24-hour format, monospace, gray-400 `#A3A3A3`
- **Units of measurement:** Smaller font size than the value, gray-400

### Critical typography rules

- Headlines ALWAYS use negative letter-spacing
- Body text uses near-zero tracking
- Overlines: ALL-CAPS, 11px, weight 600, letter-spacing 0.08em, color gray-400
- Medium (500) is the default heading weight, NOT bold (700)
- Never use font sizes between the defined scale steps

---

## Spacing & Layout

### Base grid: 4px

### Spacing scale (px)

`0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 120, 160`

### Layout constants

| Token                  | Value  |
| ---------------------- | ------ |
| Sidebar width          | 240px  |
| Sidebar collapsed      | 56px   |
| Content max-width      | 1200px |
| Nav bar height         | 52px   |
| Patient row height     | 44px   |
| Compact row height     | 32px   |
| Page padding (desktop) | 32px   |
| Page padding (mobile)  | 16px   |
| Card padding           | 24px   |
| Module gap             | 64px   |
| Grid gap (default)     | 16px   |
| Vitals gap             | 12px   |

### Border radii

| Token  | Value  | Usage                 |
| ------ | ------ | --------------------- |
| `xs`   | 4px    | Badges, small tags    |
| `sm`   | 6px    | Inputs, small buttons |
| `md`   | 8px    | Buttons, dropdowns    |
| `lg`   | 12px   | Cards, panels         |
| `xl`   | 16px   | Large cards, modals   |
| `2xl`  | 20px   | Hero sections         |
| `full` | 9999px | Avatars, pills        |

### Shadows / Elevation

| Token     | Value                                                                |
| --------- | -------------------------------------------------------------------- |
| `xs`      | `0 1px 2px rgba(0,0,0,0.04)`                                         |
| `sm`      | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`             |
| `md`      | `0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)`   |
| `lg`      | `0 10px 15px -3px rgba(0,0,0,0.06), 0 4px 6px -4px rgba(0,0,0,0.04)` |
| `card`    | `0 0 0 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)`             |
| `popover` | `0 0 0 1px rgba(0,0,0,0.06), 0 12px 24px -4px rgba(0,0,0,0.12)`      |

---

## Components

### Buttons

- **Primary (teal):** bg `#0D9488`, text `#fff`, radius 8px, font-weight 500
- **Secondary:** bg `#fff`, border `1px solid #E5E5E5`, text `#171717`, radius 8px
- **Ghost:** bg transparent, no border, text `#737373`, radius 8px
- **Teal Soft:** bg `#F0FDFA`, border `1px solid #CCFBF1`, text `#0D9488`, radius 8px
- **Emergency:** bg `#DC2626`, text `#fff`, radius 8px — clinical emergencies ONLY
- **Alert:** bg `#FEF2F2`, border `1px solid #FEE2E2`, text `#DC2626`, radius 8px

Button sizes:

- **Small:** padding `5px 10px`, font-size 11px, radius 6px
- **Medium:** padding `8px 18px`, font-size 13px, radius 8px
- **Large:** padding `11px 24px`, font-size 14–15px, radius 8px

All buttons: font-weight 500, letter-spacing -0.01em, transition `all 150ms cubic-bezier(0.16, 1, 0.3, 1)`

### Inputs

- Padding: `8px 10px`
- Font-size: 13px
- Border: `1px solid #E5E5E5`
- Border-radius: 6px
- **Focus:** border `#14B8A6` (teal-500), box-shadow `0 0 0 2px rgba(20,184,166,0.15)`
- **Error:** border `#DC2626`, bg `#FEF2F2`, box-shadow `0 0 0 2px rgba(220,38,38,0.1)`
- Labels: 11px, weight 500, color `#525252`, margin-bottom 4px

### Clinical Status Badges

- Padding: `2px 10px`
- Font-size: 11px, weight 500
- Border-radius: 5px
- Use status color pairs from the Clinical Status Colors table

### Patient Summary Card

- Container: border `1px solid #E5E5E5`, radius 12px, shadow `card`
- Header row: avatar (36px circle, teal-100 bg, teal-700 initials), patient name (15px, weight 500), demographics (11px, gray-500), status badge
- Vitals strip: grid of 4 columns, each with overline label, large mono value, and unit
- Vitals use monospace, 20px, weight 500, tabular-nums

### Patient Records Table

- Header: bg `#FAFAFA`, border-bottom `1px solid #E5E5E5`, font-size 10px, weight 600, uppercase, letter-spacing 0.04em, color `#737373`
- Rows: padding `9px 12px`, border-bottom `1px solid #F5F5F5`, hover bg `#FAFAFA`
- Avatar column: 26px circle, background = status color bg, initials in status color text
- MRN column: monospace, gray-500
- Status column: inline badge
- Vitals column: monospace, red + bold (600) for critical patients, regular for others

### Cards

- **Standard:** bg `#fff`, border `1px solid #E5E5E5`, shadow `card`, radius 12px, padding 24px
- **Muted:** bg `#FAFAFA`, border `1px solid #EFEFEF`, no shadow, radius 12px
- **Teal-tinted:** bg `#F0FDFA`, border `1px solid #CCFBF1`, radius 12px — for clinical highlights

---

## Interaction & Motion

### Easing

- **Primary (expo-out):** `cubic-bezier(0.16, 1, 0.3, 1)` — most transitions
- **Symmetric:** `cubic-bezier(0.45, 0, 0.55, 1)` — looping/reversible animations

### Duration

- **Fast (100ms):** Hover, focus, vitals refresh
- **Normal (150ms):** Buttons, inputs, badges
- **Slow (250ms):** Panels, patient drawer, modals
- **Reveal (400ms):** Dashboard staggered animations

### Stagger: 40ms between sibling items

### Hover states

- **Cards/rows:** bg shifts to `#FAFAFA`, border to `#D4D4D4`
- **Clinical elements:** bg shifts to `#F0FDFA`, border to `#CCFBF1`
- **Buttons:** Primary teal → `#0F766E`
- **Links:** Underline on hover, color stays `#0D9488`

### Focus ring

- `box-shadow: 0 0 0 2px rgba(20,184,166,0.4)` — teal-tinted focus ring
- Applied to all interactive elements on keyboard focus

---

## Patterns & Conventions

### Section numbering

Bracket-number format: `[01]`, `[02]` — teal-600 color (`#0D9488`), font-size 13px, weight 600, teal-50 background, teal-100 border.

### Clinical separators

Module path notation: `/ patient → vitals`, `/ ward ⋮ bed 12`, `/ labs · hematology`. Monospace font, teal-600 color.

### Iconography

- Default size: 16px | Nav: 20px | Inline: 14px
- Stroke: 1.5px, round line-cap and line-join
- Style: Outlined only (never filled), geometric, minimal
- Color: Teal-600 for medical/clinical icons, gray-600 for general UI
- Medical icon set: Pulse/heartbeat, heart, shield (security), user (patient), pill (medication), clipboard (records)

### CTA blocks

Dark CTA sections use: bg `#134E4A` (teal-900), white headline (22–28px, weight 500), teal-200 subtitle, white primary button + ghost button with `border: 1px solid #0F766E`.

### Clinical data display

- Vitals always in a horizontal strip, monospace, large numbers
- Out-of-range values immediately visible in red with bold weight
- Normal values in black or green — never green for "good" on its own (color-blind safety: pair with ✓ or context)
- Units always present, always smaller than the value
- MRN format: `MRN-YYYY-NNNNN`
- All dates in DD MMM YYYY format (Ugandan convention)
- All times in 24-hour format

---

## Anti-patterns (NEVER do these)

- ❌ Purple/rainbow gradients or decorative color backgrounds
- ❌ Bold (700) for headlines — use Medium (500)
- ❌ Red for non-critical UI — red = clinical emergency ONLY
- ❌ Decorative animation without functional purpose
- ❌ Shadows heavier than the defined scale
- ❌ Font sizes outside the defined type scale
- ❌ Borders thicker than 1px
- ❌ Emojis in clinical UI — use outlined icons instead
- ❌ Color alone to convey status (always pair with text label for accessibility)
- ❌ Generic fonts (Inter, Roboto, Space Grotesk)
- ❌ Bright/saturated backgrounds on page sections (stay white/gray-50/teal-50)

---

## Implementation notes (Phase 0.2)

The above spec is verbatim from the design system handoff. The notes below capture _how_ Phase 0.2 implements it.

### Tokens live in CSS (Tailwind v4)

Tailwind v4 uses a CSS-first config — there is no `tailwind.config.ts`. All tokens (colors, fonts, radii, shadows, type scale) are declared inside an `@theme` block in [`app/globals.css`](app/globals.css). Tailwind generates the corresponding utilities automatically (`bg-teal-600`, `text-gray-900`, `rounded-md`, `shadow-card`, `text-display-l`, etc.).

### Type scale as Tailwind text-\* utilities

The type scale is exposed as `text-display-xl`, `text-display-l`, `text-display-m`, `text-display-s`, `text-heading-l`, `text-heading-m`, `text-heading-s`, `text-body-l`, `text-body-m`, `text-body-s`, `text-caption`, `text-overline`. Each carries its own line-height, letter-spacing, and weight defaults (see `@theme` block).

### Status pairs as semantic utilities

Each clinical status exposes `bg-status-<name>` and `text-status-<name>`:

- `stable` (#DCFCE7 / #15803D)
- `critical` (#FEE2E2 / #DC2626)
- `caution` (#FEF3C7 / #D97706)
- `admitted` (#CCFBF1 / #0F766E)
- `discharged` (#F3E8FF / #7C3AED)
- `pending` (#F5F5F5 / #525252)

The `<ClinicalBadge status="critical">…</ClinicalBadge>` component is the canonical consumer.

### Fonts — fallback chain pending license

`Neue Haas Grotesk Display Pro` and `Neue Haas Grotesk Text Pro` are commercial typefaces (Linotype). Until Usama drops licensed `.woff2` files into `public/fonts/`, the cascade renders the spec's fallbacks (`"Helvetica Neue", Helvetica, Arial, sans-serif`), which is faithful to the intended character on macOS/iOS (renders Helvetica Neue natively) and acceptable everywhere else.

When licensed files arrive:

1. Drop `.woff2` into `public/fonts/neue-haas/`
2. Replace the `--font-sans` and `--font-display` declarations in `app/globals.css` with `next/font/local` setup in `app/layout.tsx`
3. Bump CHANGELOG and tag a new ADR if the visual change is meaningful

Monospace falls through SF Mono → Menlo → Consolas → generic monospace. No web font loaded (the chain covers Mac, Linux, Windows natively).

### Dark mode

Not in scope for Phase 0.2. Clinical UIs typically don't ship dark mode (reading-comfort regressions in low-light wards). Tokens are structured so we could add it later via `prefers-color-scheme`, but no `.dark` variant ships yet.

### Spacing

Tailwind v4's spacing scale is anchored to `--spacing: 0.25rem` (4px), matching the spec's base grid. The spec's px values map to standard utilities: `8 → p-2`, `12 → p-3`, `16 → p-4`, `24 → p-6`, `32 → p-8`, `48 → p-12`, `64 → p-16`, `96 → p-24`, `160 → p-40`. The non-standard `120` uses `p-30` (auto-generated) or `p-[120px]`.

### Live preview

[`/styleguide`](app/styleguide/) renders the full token set, typography scale, button gallery, input states, clinical status badges, vital-stat strip, card variants, and section numbering. This page is the visual contract — review it whenever tokens change.
