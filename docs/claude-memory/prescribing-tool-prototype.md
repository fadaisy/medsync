---
name: prescribing-tool-prototype
description: "11 Nov 2026 one-prescribing-tool → pharmacy queue prototype (Design canvas, Tide), verdict pending; no repo code"
metadata:
  node_type: memory
  type: project
  originSessionId: 4447b9ea-2702-4cfa-8195-ea87bd4bd3f9
  modified: 2026-11-11T05:50:35.634Z
---

Owner wants pharmacy wired into encounters + every prescribing surface; first a prototype. Built 11 Nov 2026 as a Design canvas: https://claude.ai/artifact/7dc6FpZPw2qM58G47uTURs (Main = clickable prescriber↔pharmacy flow, Map = today's surfaces). Sample data, dose placeholders only. No repo code changed. Verdict pending; build nothing real until the owner says so.

Map findings (feat/pharmacy-supplies): only `lib/emr/write/plan.ts` and `lib/emr/write/prescriptions.ts` write `prescriptions`; pharmacy reads that table (no send step). Resus, NCD, old prescribe page, MAR, med history never reach pharmacy. Two check engines (plan-checks.ts vs engine.ts), two drug lists. No "held" line state in pharmacy code. Full map in side-session notes `prescribing-map.md`.

Related: [[pharmacy-supplies-build]], [[clerking-v2-build-state]], [[feedback-cso-signoff-in-chat]]
