# Q4–Q6 discovery — medsync-labws2 (branch feat/lab-workspace-v2), read-only

## Q4 Tokens

**Where they live**

- `app/globals.css:15-340` `@theme inline` (colour utilities → CSS vars; fonts 212-220; type scale 222-306; radii 308-316; shadows 318-327; ease/duration 329-339). Values in `:root` (light, from ~342) and `.dark` (shadow values 687-697). Header says generated from Chroma `tokens.json` — **no Chroma tokens.json is in this repo** (only `design/mobile-tide-v1/tide-ds/tokens.json`, the Tide one).
- `DESIGN-medsync.md` (406 lines) is authoritative.

**What DESIGN-medsync.md says today**

- Type (§Typography, 203-243): display = Bricolage Grotesque (marketing, workspace page titles `display-s` 30px, wordmark only); sans = **Geist** for all product UI; mono = **Geist Mono** for vitals/labs/MRNs/timestamps/kbd. Scale: display-xl 72 / l 56 / m 40 / s 30; heading-l 22, heading-m 17, heading-s 14 (all 600); body-l 16, body-m 14 (default staff text), body-s 13; label 13/500; caption 12/500; overline 11/600; stat 28 mono 500; vital 22 mono 500; mono-s 12; kbd 11. Headings 600 from token; 700 only for out-of-range values. "Never": Inter, Roboto, Space Grotesk (Figtree not named).
- Colour jobs (§Colour 31-200): ~85% `ink-*` neutral ground; **teal is the one action colour** (light primary = teal-700 `#0f766e`, dark `#2dd4bf`); place hues per domain — Patients sky, Clinical iris, **Pharmacy & lab grape**, Operations plum, Admin slate — six roles each (`-solid/-on-solid/-tint/-edge/-text/-icon`). Place hue never on buttons, links, focus, counts, status. Red/amber/green = patient clinical state only; workflow states = square cool `Tag`. Never colour alone. No gradients, **no glows**, no left-edge bars.
- Radii/shape (265-280): xs 4, sm 6 (tags, status pills, inputs), md 8 (buttons, nav), lg 12 (cards, panels, tables), xl 16 (dialogs, command bar), 2xl 24 (marketing), full 9999 (avatars, dot, switches). Borders 1px. Shadows ring+short drop; nothing heavier than `shadow-popover`.
- Density (§Principles 16, §Spacing 245-263): "Dense and calm" — 13–14px UI text, 38px table rows (44 touch), 1px hairlines; sidebar 248, topbar 48, content-max 1280, page pad 32/16, grid gap 16. Buttons 32px (sm 26 / lg 40), inputs 34px.
- Pop-ups (Components table, ~line 322): every pop-up is a centred landscape `EditorDialog` (`components/medsync/editor-dialog.tsx`, `wide` 5xl / `medium` 3xl), ≤88svh body; nothing slides from an edge except the phone nav menu (ADR 0161).
- Motion (324-328): expo-out, 100/150/250/400ms, 40ms stagger, no decorative animation.

**Tide in the web app?** No. Precise grep of `app components lib app/globals.css` for Tide token names (`lagoon|accent-on|on-band|area-medicines|area-lab|cascade-*|surface-sunken|surface-raised|shadow-float|navy-NNN|Figtree`) → **zero hits**; only prose mentions (`app/api/mobile/patient-signup/route.ts:16`, `tests/design/red-reserved.test.ts:541-544`). Tide lives only in `mobile/src/theme/tide.ts` (+ `tokens.ts`, `theme.tsx`, `tide.test.ts`, `colour-laws.test.ts`) and `design/mobile-tide-v1/` (tide-ds + prototype). ADR 0340:3 scopes Tide to `mobile/` only: "Chroma still governs the web and every staff surface."

- `design/mobile-tide-v1/tide-ds/tokens.json` ≠ the canvas `tide-tokens.json`: the canvas one is the newer "Dark" column synced to the PRD (bg dark `#0b1120` vs `#1b2540`, surface dark `#151d30` vs `#24304f`, etc.).
- Canvas `ws.css:3-20` has `:root` only — **no dark block**. It adds `--area-lab: #7c3aed` (not in tide-tokens.json; = Tide area-medicines light) and `--caution-edge: #f59e0b`.

**Tide → web mapping** (= exact web token, ≈ near, ✗ no web equivalent)
| Tide | light / dark | web |
|---|---|---|
| bg | #f6f7f9 / #0b1120 | ≈ ink-50 #f6f7f8; dark ✗ (web ground #0f1012) |
| surface | #fff / #151d30 | = card/ink-0 light; dark ✗ |
| surface-raised | #fff / #2f3d5f | = popover light; dark ✗ |
| surface-sunken | #e4e7ee / #1c2539 | ≈ ink-200 #e3e5e8; dark ✗ |
| ink, ink-2, ink-3 | navy #1b2540 #4a5574 #5f6987 / #e8ecf3 #a9b2c7 #8f99b3 | ✗ (web ink is neutral grey) |
| line, line-strong | #dde1e9 #c5cbd8 / #2c3650 #3a4562 | ✗ (≈ ink-200/300) |
| accent (lagoon) | #2dd4bf both | = teal-400 ramp step, but ✗ as a light-theme action fill (web light primary = teal-700) |
| accent-pressed | #14b8a6 / #5eead4 | = teal-500 / teal-300 |
| accent-on | #1b2540 | ✗ (web dark on-teal is #042f2e) |
| accent-text | #0f766e / #5eead4 | = teal-text (both themes) |
| accent-tint | #ccfbf1 / rgba(45,212,191,.16) | = teal-100/teal-edge light; dark ✗ (web teal-tint is #f0fdfa / #0b2926) |
| focus | #0d9488 / #5eead4 | = teal-600 (shadow-focus ring); dark ≈ (web #2dd4bf) |
| navy-950/900/800/700/600 | #121a2c… #3f4f74 | ✗ |
| cascade-2/3/next | #2f4a6d #296a89 #a7f3e4 | ✗ |
| on-band, on-band-2 | #fff #e8ecf3 | ✗ (#fff only) |
| area-readings | #0284c7 / #7dd3fc | = sky-600 / sky-icon light; dark ≈ sky-text |
| area-medicines (= ws.css area-lab) | #7c3aed / #a78bfa | = grape-solid / grape-icon (dark grape-solid #a78bfa) |
| area-visits | #a21caf / #e879f9 | ✗ (fuchsia; web plum #9f2f7e differs) |
| area-team | #4f46e5 / #a5b4fc | = iris-solid / iris-text dark |
| area-me | #64748b / #94a3b8 | ✗ (Tailwind slate; web slate-icon #6c717b) |
| status-stable bg/fg | #dcfce7 #15803d / #052e16 #4ade80 | = status-stable-\* |
| status-caution bg/fg | #fef3c7 #92400e / #451a03 #fcd34d | bg =; fg = `status-caution-fg-aa` (still "PROPOSED, needs CSO sign-off") |
| caution-edge (ws.css) | #f59e0b | ✗ |
| status-critical bg/fg | #fee2e2 #b91c1c / #450a0a #fca5a5 | bg =; fg = `status-critical-fg-aa` (PROPOSED) |
| status-pending bg/fg | #e4e7ee #4a5574 / #222c42 #a9b2c7 | ✗ (web #f5f5f5 #525252 / #262626 #a3a3a3) |
| emergency / on-emergency | #dc2626 / #fff | = red-600 emergency button (alert-fg / status-critical-fg light) |

- Radii: Tide sm 10, md 14, lg 22, xl 28, pill 999 (ws.css also uses 9, 16, 18) → **none** match web 4/6/8/12/16/24; only pill = radius-full.
- Shadows: Tide shadow-card (navy-tinted, 0 10px 24px -14px) ✗ differs from web shadow-card; shadow-float ✗; shadow-accent ✗ **and DESIGN "Never… glows"**; shadow-emergency ✗.
- Type: Tide is all-Figtree: display 36/500, numeral 30/600, title 24, heading 18, body 17, body-s 15, label 16/600, caption 13/500, overline 12/600, code 26 mono — none equals a web style (closest: Tide caption 13/500 ≈ web label 13/500). Tide is phone-sized (body 17) vs DESIGN "dense, 13–14px".
- Spacing: Tide touch-min 48, button-h 52, nav-h 72, gutter 20 — ✗ (web row-touch 44, button 32, page-pad 32/16).

## Q5 Fonts

- Loaded only in `app/layout.tsx:2,18-33` via `next/font/google` (only file importing next/font):
  - `Bricolage_Grotesque` — subsets `["latin"]`, `axes: ["opsz"]`, no `weight` → variable (wght 200–800 + opsz), var `--font-medsync-display`, `display: "swap"`.
  - `Geist` — `["latin"]`, no weight → variable 100–900, `--font-medsync-sans`, swap.
  - `Geist_Mono` — `["latin"]`, no weight → variable 100–900, `--font-medsync-mono`, swap. **Geist Mono: yes, loaded.**
  - Wired to `--font-sans/--font-display/--font-mono` at `app/globals.css:212-220`.
- **Figtree: not loaded on web** (no import, no CSS). Mobile only: `mobile/package.json:7` `@expo-google-fonts/figtree ^0.4.1`; `mobile/src/app/_layout.tsx:4-9,44-…` loads 400/500/600/700/800. Next's bundled metadata (`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`) has Figtree: weights 300–900 + variable, wght axis 300–900, subsets latin/latin-ext → `import { Figtree } from "next/font/google"` works with no new dependency.
- **Figtree latin woff2 size** (measured from fontsource static builds found locally, same Google latin subset): 400 = 11,384 B, 500 = 11,432 B, 600 = 11,544 B → **34,360 B (~33.6 KiB)** for three statics. If loaded with no `weight` (variable, like Geist today) next/font fetches one variable file instead — its size not measured here (no network), so unknown; expect larger than one static, plausibly less than three.

## Tests

- `tests/design/red-reserved.test.ts` (806 lines). Mechanism: `walk()` (36-42) collects `.ts/.tsx` under named dirs; `tree()` (46-49) strips comments; `WEB_RED_FILL` regex (106-124) = `*-status-critical`, `bg/border/ring…-destructive`, `destructive-foreground`, `variant="emergency|alert|destructive"`, a `"critical"` string literal (tone), `-(red|rose)-N` utilities, `*-alert-(bg|border|fg)`, and any raw Tailwind red/rose hex (`RED_ROSE_HEX` 102-103: incl. `#dc2626 #b91c1c #fee2e2 #fca5a5 #450a0a`).
  - Lab block (294-338): scans `app/lab`, `lib/lab`, `app/not-authorised`, `content/lab.ts`, `content/lab-criticals.ts` (must be >15 files). `lib/lab/*` is checked with the `"critical"`-literal clause removed (engines may hold "critical" as data). Only allowance: `LEGACY_RED = ["app/lab/_components/result-row-actions.tsx"]`. Also bans `(text|bg|border|ring)-(red|rose|green|emerald)-N` and left bars (`border-l-N`, `border-l-(grape|plum|teal|amber)`). Asserts `turnaround-cell.tsx` uses `bg-status-caution-bg` + `<ClockIcon` and `flagging-notice.tsx` uses `<CautionNotice`.
  - Critical-alert block (640-683): `app/lab/criticals`, `app/lab/setup`, mark-panel, lab-result-entry etc. may not carry red; tint allowed only in `app/doctor/_components/critical-alerts.tsx`, `app/doctor/criticals/[alertId]/page.tsx`, `app/doctor/_components/doctor-shell.tsx`, each must use `<StatusWord tone="critical"`. Strips `event: "critical"` (realtime event name).
  - Phase 2 block (685-725): `components/lab` + listed files; no red/green utilities.
  - **Phase 3 block (727-805) = the existing no-green test**: dirs `app/lab/{stock,equipment,quality,_lib,hmis,register,reports}`, `app/nurse/bedside`, `app/hmis` + listed files; "S51: no green" (783-790) bans `(text|bg|border|ring|fill|stroke)-(green|emerald|lime|mint)-N` and `status-stable|success|tone="(ok|stable|success)"`; also no `status-critical|tone="critical"|destructive`; reduced-motion check for `transition`/`animate-*`; In stock / Use first are neutral `StatusWord` with CheckIcon. Other no-green: pharmacy block (356-365), `tests/lab/ui.test.ts:203-207` (rendered HTML: no `status-critical|-red-N|-green-N|bg-destructive`).
  - Implication: a Tide-styled lab page writing raw `#dc2626/#b91c1c/#fee2e2` hexes, `status-critical`, or `status-stable` (in Phase-3 dirs incl. `app/lab/quality`) fails these tests; a new dir under `app/lab` is auto-scanned.
- Playwright: **not configured** — no `playwright.config.*`, no `@playwright` in node_modules, not in package.json.
- Fake clock: no shared helper. 7 test files use `vi.useFakeTimers()/vi.setSystemTime()` inline (lab: `tests/lab/turnaround.test.ts:109-110`, `tests/lab/ui.test.ts`). Engines take `now` as an argument instead (`lib/lab/turnaround.ts:90 now: Date`, `lib/lab/indicators.ts:59 now: Date`) — pure functions are tested with a fixed `NOW`.
