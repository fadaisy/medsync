# ADR 0508 — Clinics & schedule cut-over

**Status:** Accepted — on the owner's word in chat, 15 Nov 2026 ("work on these"), before the pilot. Supersedes the
"old pages stay until cut-over" parts of ADRs 0501–0507.

## Decision

The workspace (`/hospital-admin/clinics`) is the only place clinics and their weeks are edited, for every hospital.

- The old pages' last engine settings become draft fields in the workspace: capacity mode, time to care, continuity,
  reason codes, hospital default line, payment posture and deposit on the clinic; interleave, overbooking and runs
  on public holidays on the session. Migration 0298 (GATED) lets `cs_publish` write those columns; nothing else
  changes in it.
- A payment posture other than "No payment" needs a flat fee (`service_lines_fee_required`); with band or free fees
  it is written as "No payment". Making a clinic the default clears the old default in the same publish, ordered
  first (one default per hospital, unique index).
- Publishing materialises the clinic days at once, as "set live" did on the old page.
- Department booking policy moves to Departments & services › Booking policy; the Pending list moves to Reports.
- 308s from `/hospital-admin/scheduling` and `/hospital-admin/departments/clinics`; the old pages, their actions and
  the `CLINICS_SCHEDULE` flag are deleted.

## Consequences

Rolling back means reverting the cut-over commit and redeploying. Until 0298 is applied, any publish that touches a
clinic or a session is refused by `cs_publish`.
