# Tether landing, Step 7 report

13 Nov 2026 · branch `feat/landing-tether` · measured on `next build` + `next start` of `cdcd680d` with
`LANDING_TETHER=1`. Steps 3–6 are in `steps-3-6-report.md`.

**Where it stands:** built, checked and committed behind the flag. Step 7 items 1–3 (parity signature, two days
on in production, deleting the old page and the flag) are Fadhul's. Item 4 (harden) is done below.

## Section 10

| Metric                       | Step 0      | Target                                | Result                                                                                                     |
| ---------------------------- | ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| LCP (throttled, median of 5) | 2.47 s (H1) | ≤ 2.5 s, no worse than Step 0         | **2.41 s** (headline span; runs 2.38–2.59) ✓                                                               |
| INP (tap Menu)               | 32 ms       | ≤ 200 ms                              | **80 ms** (runs 80–88) ✓                                                                                   |
| CLS                          | 0           | ≤ 0.05                                | **0.008** ✓                                                                                                |
| JS for `/` (transfer)        | 266 KB      | page's own ≤ 120 KB (STOP 2 ruling 1) | 271 KB in all; **page's own 26 KB** ✓                                                                      |
| CSS for `/`                  | 60 KB       | no worse than today (STOP 2 ruling 3) | **64.4 KB**: page's own 2.9 KB; the old landing styles leave at deletion                                   |
| HTML for `/` (gzip)          | 33 KB       | report                                | **21 KB**                                                                                                  |
| Fonts                        | 127 KB      | report                                | **157 KB**: Figtree 30 + Geist Mono 23, plus root preloads Bricolage 75 + Geist 29 (STOP 2 ruling 2: kept) |
| axe serious or critical      | 0           | 0                                     | **0** at 1440 / 1024 / 834 / 390, light and dark ✓                                                         |
| Guard failures               | —           | 0                                     | **0** (`tests/tether-landing`, 19 tests) ✓                                                                 |
| Parity destinations lost     | —           | 0                                     | **0 unexplained.** 2 renamed, 10 dropped with reasons, 4 of them OPEN (below); unsigned                    |
| Old landing files remaining  | 15          | 0                                     | **15**: deletion waits for two days on in production (Step 7.3)                                            |
| Strings outside `content/`   | —           | 0                                     | **0** (guard LP8) ✓                                                                                        |

Throttle: 412 × 823 at DPR 1.75, CPU ×4, Slow 4G, cold cache, as Step 0. Five runs, not three, because single
runs moved by ±0.2 s while other sessions were building on the machine. Blocking the two unused root fonts did
not move LCP (2.55 s against 2.55 s in one five-run pair), so ruling 2 stands.

## Browser scenarios (`scripts/landing/scenarios.mjs`, production build)

S1–S14 and S16: **24 of 24 pass**. S15 does not apply, because the future link is hidden (D-LP-10). S16b
(stores a row) and S17 (anon cannot read) wait for migration 0293, and a static test covers S17 until then.

## Fixed during hardening (`cdcd680d`)

- **LCP** was on the ticket, not the headline. There were three causes:
  - the ticket's drop-shadow filter: Chrome measures text under a filter as the whole box;
  - the headline's fade-in at first paint;
  - a positioned underline span that split the headline into separate records.

  Now the ticket uses a box shadow, the headline paints as plain text first, and the underline is plain.

- **Contrast:**
  - The red emergency question is now the red text token (`pw-critical-text`). It was 4.39 : 1 in light and
    3.16 : 1 in dark.
  - The fourth phone step card leans toward cascade-3. White body text on cascade-4 was 3.4 : 1; it is now
    4.7 : 1.
- **Keyboard:** the phone "Coming" cards scroll, so they are now a focusable, named region.
- **Hydration:** the menu's Dark mode switch rendered "off" on the server and "on" in a dark browser. It now
  reads the theme after hydration.
- **The statement** lit its last words just after the centre. It now finishes by the centre.
- **axe method:** axe reads the finished page (reduced motion, finite animations done), because scroll-led text
  is dim until it scrolls in. S9 checks that it reaches full.

## Screenshots

`step-7/`: top and scrolled at 1440 / 834 / 390, plus the phone menu and Help, in both themes.
`step-7/sections/`: every section and the footer at 1440 and 390, light and dark (32 images).

## Needs Fadhul

1. **Apply 0293:** `cd /Users/airm1/Desktop/medsync/.claude/worktrees/landing-tether-09c47a && npm run db:migrate`.
   Then the form stores a row; S16b and S17 can run.
2. **Sign parity** (`tests/parity/landing/renames.json`). There are four OPEN questions:
   - Book a visit has no real booking target yet. It scrolls to Ways to book, as in the canvas.
   - `/about` is not linked.
   - `/signup/clinical` is not linked.
   - `/get-started` is not linked.
3. **Two design calls made at hardening:** the fourth phone card's blended colour, and the red text token on the
   emergency question. Both were needed to reach AA.
4. **Copy** stays draft. No `*_COPY_STATUS` was touched.
5. **Cutover**, when ready:
   - turn `LANDING_TETHER` on in production and watch errors and LCP for two days;
   - then a session deletes the 15 old files, their tests and the flag, keeping the 308s.

Not deployed. Not pushed.

## Checks

- `tsc` 0 errors; `npm run lint` 0 errors (the 14 warnings were already there); `npm run build` green.
- `vitest`: 12,024 tests pass. 7 files fail to load: clerking ×4, patient-web ×2, pharmacy ×1. These are the
  same 7 as at Step 2, from an env read under jsdom, and none is a landing test.
