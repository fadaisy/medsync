# Clerking desk v2 on a phone: gate proposal (M1)

Status: **signed 2026-09-27 by Fadhul (CSO)**. All seven decisions as recommended.

| Id | Decision | Signed |
|---|---|---|
| D-CM-01 | Cadre, hospital, department and Sign out move into an avatar menu on the phone; Emergency stays in the app bar. | Yes, as recommended |
| D-CM-02 | The patient header scrolls away; the sticky step bar then carries name and MRN. | Yes, as recommended |
| D-CM-03 | The four context tiles open the Context sheet; no Context button on the phone. | Yes, as recommended |
| D-CM-04 | Flag badges on complaint rows and positive system items, phone only, same words and icons as the Flags list. | Yes, as recommended |
| D-CM-05 | Pop-ups (Steps, Context, Note and flags, complaint, Details) open as bottom sheets below 640 px only; ADR 0161 unchanged elsewhere. | Yes, as recommended |
| D-CM-06 | Sign and Complete live in the Note sheet footer; the last step's primary button reads "Review and sign". | Yes, as recommended |
| D-CM-07 | Chips 36 px visual with a 44 px touch target. | Yes, as recommended |

## Component map (desktop → phone, all reused)

| Desktop | Phone (below 640 px) |
|---|---|
| Page header (Workspace, cadre, Sign out, Emergency) | App bar: ‹ Workspace, Emergency, avatar menu (cadre, hospital, department, Sign out) |
| `SafetyBar` | Patient header: name, Draft, age · sex · MRN, save status, four tiles |
| `SectionBar` + step chip + Context / Note buttons | Sticky step bar: Step N of 10 + title (opens Steps), Note button with flag count, 10-segment progress, identifier line once the header has scrolled |
| Centre card with `[NN]` and step count | Section intro (title and blurb) and one panel per form group (`PANEL` class, no-op above 640 px) |
| `ComplaintBody` cards | Rows with summary and badges; the same property editor in a complaint sheet |
| `SystemsView` rows | Status on its own line (never truncated), positives line, Nothing else; items expand in place; `RosDetails` in a sheet |
| Right column (`FlagsPanel`, `NotePane`, `SignBar`) | Note and flags sheet, Complete visit and Sign note in its footer |
| `ClerkingRail` | Context sheet |
| Footer Previous / Next | Fixed bottom bar: 48 px Previous, "Next: {short}" or "Review and sign" |
| `EmrDialog` | `EmrDialog` with `sheet` below 640 px (bottom-anchored, grab handle, same focus trap) |

## Breakpoints and repo facts (M0)

- Phone is below Tailwind `sm` (640 px). 640 px and up is unchanged (the repo's desk switches at `md` 768 px and `xl` 1280 px, not 1024 px; the prompt's 1024 px desktop line is the repo's `xl`).
- No Playwright in the repo and no new dependency: the checks run in the existing CDP harness (`~/Desktop/emr-harness`, Chromium device metrics) plus Vitest.
- No bottom-sheet primitive: `EmrDialog` gains a phone-only sheet presentation on the same base-ui Dialog (focus trap, Esc, restore).
- No account menu on the desk page: the avatar uses the existing `components/ui/dropdown-menu`.
