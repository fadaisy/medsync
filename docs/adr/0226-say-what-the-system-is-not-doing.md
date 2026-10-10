# ADR 0226 — Say what the system is not doing: the critical-flagging notice

**Status:** Accepted — 2026-10-10, Lab Phase 0 GATE A, D-LAB0-11, D-LAB0-15. Notice wording **draft** until the CSO
signs it.

## Decision

1. `lib/lab/critical-flagging.ts` `criticalFlaggingActive(hospital)`: true only when every `REF-CRIT-*` limit and the
   time frame are signed. Today: false. Lab Phase 1 replaces the body, not the callers.
2. While it is false, every lab result screen shows "Automatic critical flagging is off." with the Appendix B body:
   caution colours, a triangle, `role="status"`, no close button.
3. The wording lives in `content/lab.ts` with `status: "draft" | "signed"`. In production (`VERCEL_ENV=production`)
   `labWorkspaceLiveFor()` stays false while it is draft, whatever `LAB_WORKSPACE` says.

## Consequences

The safety gap (L7: nothing flags, and the screen said nothing) is visible to every technologist. No hospital can
see the new workspace in production until the CSO signs the wording.
