# ADR 0346 — Today's figures and their definitions

**Status:** Accepted — 2026-10-19 (D-UI-06, D-UI-07). The definitions need the CSO's signature (`gate-a-proposal.md` §6).

## Decision

**Engine.** `lib/lab/today.ts` (pure, `now` injected) turns these inputs into every figure:

- the 0118 indicator rows;
- the worklist;
- open referrals;
- sections;
- QC status.

**Definitions** (the comment at the top of `today.ts`):

- **Received** is the 0118 specimen rows: received or rejected, at the first event.
- **Released** is the first final version, in-house, with bedside excluded.
- **Turnaround** is receipt to first release, using downtime form times.
- **Late** only ever means past the test's own stated time.

**Comparison** is the same weekday seven days earlier, cut at the same clock time. The sparkline shows seven such points. An empty earlier window shows "No earlier data", never 0.

**Change lines** are an arrow and the amount, in ink and in words. No coloured badges.

**Section scorecard.** Totals equal the hero and the key figures; a test asserts this (`tests/lab/workspace-v2/today.test.ts`).

**Per-section QC pill.** It shows the worst status in the section, in the order failed > not run > warning > provisional > passed > no plan.

**Out of scope.** The canvas showed a section stated-time mark. There is no section-level stated time, so the mark is not drawn.

**Cache.** Per request only. A 60 s cache is added only if the TTFB budget fails.
