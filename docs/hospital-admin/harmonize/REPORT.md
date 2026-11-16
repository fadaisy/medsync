# One admin workspace: phase 1 report (16 Nov 2026)

Branch `claude/funny-shannon-i7xgwp`, from `main` c40ede0f. ADR 0520. No migration, no Edge Function, no flag.

## Source

- Prototype and critique: canvas "Tether admin, harmonized" (https://claude.ai/artifact/HarTXgkAUCwG4rcDSRV5r3), built on the Tether Clinics & Schedule canvas (https://claude.ai/artifact/DsGesqF3pfLyE4nkWJj7i4).
- Decisions: taken 16 Nov on the owner's standing ruling "use all your recommendations"; recorded in ADR 0520 and on the canvas's critique board.

## Built (phase 1)

| What                                                                 | Where                                                                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| One frame for every admin page, in the desk shell                    | `components/hospital-admin/admin-frame.tsx`, `app/hospital-admin/_components/hospital-shell.tsx`, `layout.tsx`              |
| One menu, drawn by the frame and the Clinics & schedule rail         | `lib/hospital-admin/admin-nav.ts`, `components/hospital-admin/admin-nav-groups.tsx`, `app/hospital-admin/_lib/admin-nav.ts` |
| Requests: waiting for a clinician + copies of results                | `app/hospital-admin/requests/**`                                                                                            |
| Pending out of Reports; records-requests forwards (308)              | `reports/page.tsx`, `records-requests/page.tsx`                                                                             |
| `/hospital-admin` opens Clinics & schedule                           | `app/hospital-admin/page.tsx`                                                                                               |
| Staff directory lists non-clinical staff                             | `staff/page.tsx`, `directory-table.tsx`, `directory-detail-sheet.tsx`                                                       |
| ⌘K: clinics open Clinics & schedule; Requests added; no placeholders | `departments/palette-actions.ts`, `_lib/features.ts`, `hospital-command-palette.tsx`                                        |
| Field inputs no longer collapse in the desk's dialogs                | `components/clinics-schedule/cs.module.css`                                                                                 |
| Wording (draft)                                                      | `content/hospital-admin/admin-nav.ts`                                                                                       |

Removed: the old sidebar, mobile sheet and "More" group (`hospital-sidebar-item.tsx`, `mobile-sidebar.tsx`, `clinics/_lib/more.ts`, `content/clinics-schedule/more.ts`), `reports/_components/pending-dialog.tsx`, the records-requests action and button.

## Checks

See the STOP note in the PR: typecheck, lint, the full Vitest suite and `npm run build`. Screens were checked on a temporary fixture (not committed) at 1280 × 853 and 390 × 844: the frame, the menu with both badges, Requests on both tabs, the Mark sent dialog, and no sideways scroll on a phone.

Not checked: a signed-in admin on a real database (the copy-request update and the directory query run only against Supabase).

## For the owner

1. Sign the draft wording in `content/hospital-admin/admin-nav.ts`.
2. Merge, then deploy. No migration.
3. Check signed in on the tablet: the menu on Staff, Departments and Reports; Requests; Mark sent on a real copy request; a receptionist or records officer now shows in Staff › Directory.

## Phase 2 (next)

Today (replacing Overview, reusing `fetchStats` and the staff count); People with To review, Invitations and Admins; Emergency and support as one page; Activity over `sa_audit_log`, `records_requests` and the two histories; Remind (one Edge Function); Tether summaries of wards and set-up; the old pages rebuilt in the desk's components; Intake deleted once the desk covers every arrival type.
