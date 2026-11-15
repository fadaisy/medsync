---
name: medsync-owner-rules
description: Standing constraints the owner (Usama Fadhul, founder + CSO) has set for MedSync work — secrets, .env.example, migrations, deploys, fabricated data, ADR supersession
metadata:
  type: feedback
---

- `.env.example` carries the owner's uncommitted NCD work — never stage or commit it.
- Migrations are owner-applied (`npm run db:migrate`) and Edge Functions owner-deployed; list exact names and order after each
  gate, and never assume they ran.
- **Where to run migrations (2026-10-05):** `db:migrate` applies the folder it runs in. The owner kept getting "No new
  migrations" because they ran it in the main folder (old branch) while the new file lived only in a worktree. Fixed in
  b6e6e00 (worktrees borrow main's `.env.local`; the run names the folder/branch/newest and says when it's behind).
  **How to apply:** always hand over the exact `cd <worktree> && npm run db:migrate`, never just "run db:migrate".
- The service role key never reaches the mobile bundle; emergency phone numbers are never invented (Mulago's must be verified).
- No fabricated data anywhere: ratings only from real post-visit ratings, monograms until a photo exists, "No ratings yet".
- The owner overrode ADR 0084's presentation rules on purpose (photos, ratings, clock times, slot counts, home question,
  emergency tab → ADR 0085; any hospital → 0086; dark theme toggle stays). Do not re-argue; record reversals as new ADRs.
- Ponytail plugin: laziest correct solution, reuse before building, `ponytail:` comments for deliberate ceilings.

**Why:** each was stated or reaffirmed explicitly during the booking build.

**How to apply:** treat these as settled; when a new PRD conflicts with a committed ADR, surface the conflict and ask for a
ruling rather than silently picking a side.
Related: [[booking-app-build-state]]

- **Agent cost (2026-09-20):** the owner asked whether 60–70-agent review workflows were necessary and whether they would use up session credits. Answer given: no. **How to apply:** no review fleets (find + N refuters) unless the owner asks; triage findings myself. Parallel BUILD lanes (2–3 agents, disjoint files, no commits) are fine for large disjoint work when the owner has asked for it.

- **Build it yourself (2026-09-24):** for the doctor workspace the owner said "dont use agents, do it yourself". **How to apply:** default to building directly; spawn subagents or workflows only when the owner asks for them.
