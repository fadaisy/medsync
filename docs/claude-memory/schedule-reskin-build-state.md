---
name: schedule-reskin-build-state
description: "Doctor schedule calendar reskin (Dribbble ref) built 2026-09-27 in the main tree on feat/booking-app, uncommitted; stat-rail fold and ADR pending owner"
metadata:
  node_type: memory
  type: project
  originSessionId: b9ecd4e8-0d21-4a15-817e-c7b70ce66cfd
  modified: 2026-09-27T06:49:31.385Z
---

Owner prompt PROMPT-SCHEDULE-CALENDAR-RESKIN.md, run "through all gates" 2026-09-27 in the MAIN tree
(`feat/booking-app`), uncommitted. Reference PNG was never supplied — §1 R1–R10 used as the spec.

- One colour map: `components/scheduling/calendar/tones.ts` (KIND_TONE, STATUS_TONE, HUE); chips in `chips.tsx`.
  Availability = background bands, bookings/clinic days = white cards with lane packing.
- Added Chroma sky/iris/grape hue tokens to `app/globals.css` ahead of Chroma (same values as the
  medsync-chroma worktree, ADR 0162) — merge must dedupe them.
- Pill tones `info`/`notice` removed, `sky`/`iris`/`grape` added.
- Deliberate deviations the owner may overrule: teaching+admin share neutral, leave+unavailable share
  the hatch (partly reverses ADR 0095's "every kind its own tint"; icon + word differ); cancelled cards
  recede by muted fill + dashed edge, not 60% opacity (4.5:1); rails go under the calendar below 1280px.
- Pending owner: stat-rail fold into one strip (proposed, not built); ADR for the reskin not written.
- Screenshot harness: ~/Desktop/schedule-reskin-harness (tree copy, cloned node_modules, fixture at
  /styleguide/schedule-fixture, `node cdp.mjs plan-*.json`, dev on port 3517).

**Update 2026-10-03:** committed as 633add3 on feat/calendar-reskin (Chroma-adapted) and MERGED to main via PR #186 (2026-09-28). The main folder's uncommitted calendar files are the older pre-Chroma draft — superseded, not unique work.

**Why:** next session needs to know it's uncommitted and what was a judgement call.
**How to apply:** don't re-litigate the choices above unless the owner asks; related [[booking-app-build-state]], [[chroma-design-system-build]].
