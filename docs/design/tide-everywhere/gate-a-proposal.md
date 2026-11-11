# Tide everywhere: STOP 0 report and GATE A proposal

Branch `feat/tide-everywhere` (worktree `~/Desktop/medsync-tideweb`), cut from `origin/main` 7c704780. Written 21 Oct 2026.

## STOP 0: discovery

| Q   | Finding                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `feat/lab-workspace-v2` is merged into main. The lab's Tide is a CSS re-pin, `:root:has([data-lab-tide])` in `app/globals.css`, plus `app/lab/_components/v2/` (shell, kit, fields, charts, band, period picker; 3,011 lines). Figtree is already loaded as `--font-medsync-lab`.                                           |
| Q2  | 217 `page.tsx` routes: lab 36, doctor 28, patient 21, hospital-admin 21, pharmacy 17, ncd 17, admin 17, nurse 16, reception 8, emergency 5, auth 5, styleguide 5, signup 4, ipc 3, clinician 3, onboarding 2, and 1 each for about, get-started, feedback, hmis, offline, ncd-offline, not-authorised, referral-governance. |
| Q4  | 15 non-lab `.tsx` files hold a raw hex. The radius tokens sit in `@theme inline`, so they are inlined into the utilities and cannot be re-pinned by scope until they read a variable.                                                                                                                                       |
| Q5  | Shared UI: `components/ui` (shadcn), `components/medsync`, plus the lab kit.                                                                                                                                                                                                                                                |
| Q6  | Four `next/font` families load today: Bricolage Grotesque, Geist, Geist Mono and Figtree.                                                                                                                                                                                                                                   |
| Q7  | Dark mode comes from the `.dark` class, app-wide. The lab is forced light (D-UI-11).                                                                                                                                                                                                                                        |
| Q10 | There is **no Playwright** in the repo; `axe-core` is installed. The parity crawl in Section 6 needs Playwright, a new dependency, so it is flagged here and not added. Proposal: the existing CDP harness method plus axe-core.                                                                                            |
| Q11 | Pharmacy Phases 0 and 1 are built and merged.                                                                                                                                                                                                                                                                               |

**Disagreements with the prompt:**

- There are **two** systems in the web app today, not three. The original MedSync look (Fraunces) is already gone; Chroma and the lab's Tide remain.
- 55 native `type="date"` or `datetime-local` inputs remain outside the lab, and 4 `border-l-*` uses.

## GATE A: how

**Layer 1 is the lab's own technique, promoted.**

1. The lab's re-pin block becomes `:root:has([data-ds="tide"])`, in both themes, using the Navy values from `docs/design/tide/tokens.json`.
2. Figtree becomes the sans and the display face.
3. Radii read variables, so Tide's radii can apply by scope.
4. One env flag, `TIDE_SURFACES` (comma-separated group names, or `1` for all), decides which route groups' layouts carry `data-ds="tide"`.
5. Every Chroma component then renders in Tide with no edit.

The token map is the lab's block (already contrast-checked in Lab v2), extended to dark with the Tide Navy values:

| Chroma token                      | Tide, light                     | Tide, Navy            |
| --------------------------------- | ------------------------------- | --------------------- |
| `--background`                    | `bg` #f6f7f9                    | `bg` #0b1120          |
| `--card`, `--popover`             | `surface` #ffffff               | `surface` #151d30     |
| `--foreground`, `--ink-900`       | `ink` #1b2540                   | `ink` #e8ecf3         |
| `--muted-foreground`, `--ink-600` | `ink-2` #4a5574                 | `ink-2` #a9b2c7       |
| `--ink-500`                       | `ink-3` #5f6987                 | `ink-3` #8f99b3       |
| `--border`, `--ink-200`           | `line` #dde1e9                  | `line` #2c3650        |
| `--input`, `--ink-300`            | `line-strong` #c5cbd8           | `line-strong` #3a4562 |
| `--primary` (text and links)      | `accent-text` #0f766e           | `accent-text` #5eead4 |
| `--ring`                          | `focus` #0d9488                 | `focus` #5eead4       |
| `--accent`                        | `accent-tint`                   | `accent-tint`         |
| `status-*`, triage scale          | unchanged (clinical, CSO-owned) | unchanged             |

**Layer 2 is shells.**

- Each staff group gets the Tide top bar: overline, Emergency, and the acting place in plum.
- Pharmacy follows the _Pharmacy Phase 1 · Tide_ canvas: the rail, the queue table and the top bar.
- Every other group keeps its current navigation inside the Tide tokens until its own step.

## Decisions to sign

D-TW-01 to D-TW-13 as recommended in the prompt (Section 12). Added:

- **D-TW-14:** no Playwright for now; parity is checked with the CDP harness and axe-core.
- **D-TW-15:** `TIDE_SURFACES` is an env flag, like the other feature flags, rather than a new setting store.

## Rollout and test plan

Group by group: set `TIDE_SURFACES` per environment. Run the existing suites unchanged, plus the guards: red reserved (exists), native date, left bar, Emergency present. Step 10 deletes Chroma after your parity sign-off and the five-day pilot.

## Signatures

Signed by Fadhul (CSO), 21 Oct 2026, in this session:

- D-TW-01 to D-TW-13, as recommended;
- D-TW-14 (the CDP harness plus axe-core, no Playwright);
- D-TW-15 (the `TIDE_SURFACES` env flag and the re-pin method);
- the `DESIGN-medsync.md` rewrite.
