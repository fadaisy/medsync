# Clerking desk v2 on a phone: stop report

Built 2026-09-27 on `feat/clerking-v2` (`~/Desktop/medsync-release`), behind `CLERKING_V2` like the rest of v2. There is no migration and no new dependency. The owner asked for a lean run ("its just the mobile responsive version"), so M0 to M2 ran in one pass. M3 is partly done: the device trial is the owner's.

## M0: discovery

| Q | Finding |
|---|---|
| Q1 | All of v2 is built. The yes/no row, chip, stepper, property editor, flags list, note pane, Details dialog and context rail are shared components, and the phone reuses them without copies. |
| Q2 | Tailwind defaults. The desk switched at `md` (768) and `xl` (1280), with no 1024 line. Phone is now below `sm` (640), and everything from 640 up is unchanged. |
| Q3 | The desk page had no account menu. The phone avatar uses `components/ui/dropdown-menu`. |
| Q4 | There was no bottom-sheet primitive. `EmrDialog` gained a phone-only `sheet` form on the same base-ui dialog. No Vaul or other new dependency. |
| Q5 | Autosave comes from `props.save`. Allergies, problems and critical results come from `p.safetyBar`, and vitals from `p.clerking.vitals` / `vitalsAt`. |
| Q6 | There is no Playwright in the repo. The checks run in the existing CDP harness (Chromium with device metrics and axe) and in Vitest. The prompt's "failing Playwright tests" are therefore Vitest markup tests (`tests/clerking/phone.test.ts`) plus harness measures. |

**Disagreement with the prompt:** the desktop line is 1280 px (`xl`) in the repo, not 1024 px, and the tablet range is 640 to 1279 px.

## M1: decisions

D-CM-01 to D-CM-07 were signed as recommended (`gate-proposal.md`).

## M2: the build

| File | What changed |
|---|---|
| `components/clerking/phone-shell.tsx` | The patient header and tiles, the step bar, the bottom bar, `usePhone`, `useScrolledPast` |
| `app/doctor/encounters/[encounterId]/_desk/desk-top-bar.tsx` | The top bar with the phone avatar menu; `phone={false}` for the v1 desk |
| `components/emr/emr-dialog.tsx` | `sheet` / `"tall"`: bottom-anchored below 640 px, grab handle, swipe down, 250 ms |
| `components/clerking/controls.tsx` | `PANEL`, `PANEL_HEAD`, chip and yes/no phone sizes with hit slop |
| `components/clerking/flags-panel.tsx` | `InlineBadges`, `badgesAt`, `FlagCount` (red stays in this file) |
| Section bodies | Panels, phone rows, the complaint sheet, the systems status line, past-history order, Social groups |

## Numbers (§12)

Harness measurements on the chest-pain fixture (Patient Three-3), Chromium, light and dark.

| Measure | Before | Target | After |
|---|---|---|---|
| Step labels on screen at once | 2 | 1 | **1** (360, 390, 412) |
| Truncated review-of-systems statuses at 360 px | 6 | 0 | **0**. The positives line and the tile lines end in an ellipsis by design. |
| Controls overlapped by the bottom bar or sticky bars (every control, every step) | 0 to 2 | 0 | **0** at 360, 390 and 412, light and dark |
| Horizontal scroll at 360 / 390 / 412 | none | none | **none** |
| Patient header height at 390×844 | 224 (the old safety bar) | ≤ 250 | **245** |
| Sticky step bar height | n/a | ≤ 72 | **64**, or **71** with the name-and-MRN line |
| Section intro visible on first open at 390×844 | n/a | yes | **yes** |
| Full negative review of systems, taps | 12 (desktop) | ≤ 13 | **12** |
| Sheet open p95 | n/a | < 120 ms | **15 ms** (Chromium, unthrottled; not yet measured on a mid-range Android at 4× throttle) |
| Cumulative layout shift, first load | n/a | < 0.1 | **0** |
| Phone-only JavaScript, gzipped | n/a | ≤ 15 KB | **about 6 KB** (gzipped source of the phone shell and top bar, an upper bound) |
| axe, serious or critical | 0 | 0 | **0** across R01 to R10 (R04 not scanned), 4 viewports |
| Tablet (834) and desktop (1440) | baseline | unchanged | Pixel-diffed against a baseline build of the previous commit. Visually identical below the top bar. The harness now uses the real bar, so the bar itself differs by 1 px, and the diffs below it are sub-pixel text from that shift. |

Tests: `tests/clerking/phone.test.ts` (11) covers:

- one phone step label on three steps (proved to fail when a phone-hiding class is removed);
- no truncating class on any system status;
- phone-only row badges;
- the step bar's identity line, with an MRN that never truncates;
- "Review and sign" on the last step;
- the phone shell's roots are `sm:hidden`;
- the phone class constants hold only `max-sm:` rules;
- the v1 top bar has no phone classes or avatar.

Screenshots: `before/` (production, 27 Sep) and `after/` (R01 to R10, 390×844, light and dark).

## Not done (owner or later)

- A timed device trial with three clinicians (M3) and real-device performance on a mid-range Android and an iPhone with the browser toolbar.
- 200 % text size was not measured. Reduced motion is the primitive's (`motion-reduce:animate-none`), and chevrons swap without animating.
- The keyboard: the bottom bar hides while a field has focus and the field scrolls to the centre. This needs a check on a real iPhone, which the harness cannot emulate.
