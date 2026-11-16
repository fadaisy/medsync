---
name: clinics-schedule-build
description: Clinics & schedule hospital-admin workspace (ADRs 0501–0507) built 15 Nov 2026 on feat/clinics-schedule; 0296 GATED unapplied; nothing signed
metadata:
  type: project
---

Clinics & schedule workspace built 15 Nov 2026 in worktree `.claude/worktrees/clinics-schedule-940aa4`, branch `feat/clinics-schedule` (cut from feat/clinic-floor), committed locally as 9d1171ec, NOT pushed. Owner signed everything in chat 15 Nov 2026 (GATE A, copy, bands, templates, D-CS-21, ADRs, parity) — recorded in f520be24. Flag `CLINICS_SCHEDULE`; route `/hospital-admin/clinics?view=…`; fixture `/styleguide/clinics-schedule`. Migration 0296 GATED, unapplied. Read `docs/clinics-schedule/REPORT.md` first.

**Why:** owner ran the prompt "go through all gates"; every GATE A answer is provisional (Section 11 recommendations), copy/bands/templates/D-CS-21 draft.

**How to apply:** owner steps are in REPORT.md (migrate from that worktree, signatures, pilot, cron, 308s, delete old pages). Open gap: doctors can't send leave requests yet (availability sheet lacks "Ask for leave"). Repo screenshot harness `scripts/patient-web/harness.mjs` has a load-event race; use a patched copy. Builds on [[clinic-floor-build-state]].

Cut-over done 15 Nov 2026 on the owner's word, before the pilot (e4ac2bab, ADR 0508): old Scheduling + Departments › Clinics deleted (308s), booking policy → Departments › Booking policy, Pending → Reports, CLINICS_SCHEDULE flag removed. Owner applied 0296; migration 0298 (cs_publish allow-list for the moved fields) applied by the owner 15 Nov. Cron in vercel.json (b8c2d129).

15 Nov evening (cloud main chat, branch claude/funny-shannon-i7xgwp): production showed the workspace inside the old HospitalShell (two sidebars, desk top bar hidden). Fixed by ADR 0514: `ShellFrame` (components/medsync/shell-frame.tsx) drops the old frame on `/hospital-admin/clinics`, and on `/reception` when the desk is live; the rail gained a "More" group (copy draft in content/clinics-schedule/more.ts). Production host for Tether: medsync-tether-site.vercel.app.
