# ADR 0345 — Needs you: one inbox as a read model

**Status:** Accepted — 2026-10-19 (D-UI-05).

## Decision

- **Sources.** `lib/lab/needs-you-read.ts` reads, read only, from existing state:
  - open critical alerts (never `loadLabCriticals`, which escalates as it reads);
  - delta flags without an outcome;
  - reports holding components for QC;
  - matches waiting;
  - referrals past RF-5;
  - lots received but not accepted;
  - signed-configuration drafts this user may sign in the lead slot (or the lab-counter slot) and did not author.
- **Ordering.** `lib/lab/needs-you.ts` orders by group (Now, Waiting on the lab, Today), then oldest first, and scopes to what the viewer may act on.
- **Leaving.** An item leaves only when its source changes. Nothing is dismissed by hand.
- **One list.** The top-bar count and the page read the same list, once per request (NY-4).
