# ADR 0516: One admin workspace: every admin page in the Tether desk, one menu

**Status:** Accepted, 16 Nov 2026. Fadhul approved the harmonized admin prototype (canvas "Tether admin, harmonized", built on the Tether Clinics & Schedule canvas) and said "build". The three open decisions were taken on the owner's standing ruling "use all your recommendations" and are recorded below. This is phase 1.

## Context

Clinics & schedule (ADR 0501) is a Tether desk; the other admin pages were the older MedSync console, so the "More" links (ADR 0514) left the Tether look. The critique on the canvas found jobs done in two or three places, dead ends (Pending in Reports, placeholders, an unlisted copy-requests page), and rule breaks.

## Decision

- **One frame.** Every `/hospital-admin` page renders in the desk shell (`DeskShell`) through `components/hospital-admin/admin-frame.tsx`; the page scrolls inside the shell. Clinics & schedule keeps drawing its own desk, and the frame steps aside there (ADR 0514).
- **One menu**, defined once in `lib/hospital-admin/admin-nav.ts` and drawn by both the frame and the Clinics & schedule rail: the workspace's seven views, then **Hospital** (Departments, Emergency and support, Staff, Hospital profile, and Intake off the Tether domain only) and **Follow-up** (Requests, Reports). Staff shows "n to review", Departments "n unavailable", in words. Nothing on the menu leads to a placeholder: Overview, Admins and Audit are off it, and `/hospital-admin` goes to Clinics & schedule on both domains until a Today page replaces it.
- **Requests** (`/hospital-admin/requests`): booking requests waiting for a clinician, moved from Reports' Pending tile, and patients' copies of results, moved from the unlisted `/hospital-admin/records-requests`, which now answers 308 to `?tab=copies`. The clinician list stays read-only and in arrival order; its action is "Open in week plan". "Urgent" and "Over 2 days" are neutral tags, not red (the design rule that red, amber and green never mark a workflow state; this reverses the red Urgent pill of the old dialog).
- **Mark sent** for a copy of results now needs a note of 8 characters or more, closes only an open request at this hospital, and says so when nothing changed or the save failed. The request row keeps the note with who and when (`fulfilled_by`, `fulfilled_at`); no migration.
- **Decisions taken (owner's standing ruling, 16 Nov):**
  1. Intake leaves the menu on Tether now; it is deleted once the desk covers all six arrival types (walk-in, booked, referral, emergency, transfer, follow-up).
  2. Pending requests get a **Remind** action (phase 2, one small Edge Function). There is no Hand over: moving a booking changes who is responsible, the fee band and the places.
  3. Wards and beds, and the lab and pharmacy set-up, stay on MedSync's clinical site (ADR 0499); Tether shows a summary in phase 2.
- **Fixes:** the Staff directory lists non-clinical staff (left joins on clinician profile and council); ⌘K's clinic results open Clinics & schedule; ⌘K offers Requests and no placeholder; a field's `.in` input no longer collapses in a column (also the live Add a person dialog).

## Consequences

- The old pages (Staff, Departments, Profile, Reports, Intake) keep their own content and Chroma styling inside the Tether frame until phase 2 rebuilds them in the desk's components.
- Phase 2: Today (replacing Overview), People with To review, Invitations and Admins, Emergency and support as one page, Activity reading every admin record, Remind, the Tether summaries of wards and set-up, and deleting Intake once the desk covers it.
- New wording is a draft (`content/hospital-admin/admin-nav.ts`).
