---
name: clerking-v2-build-state
description: Clerking desk v2 (PROMPT-CLERKING-DESK-V2) DONE 2026-09-27 on feat/clerking-v2 in ~/Desktop/medsync-release (from release/emr); GATE A signed; 0076 GATED unapplied; CLERKING_V2 flag; not pushed
metadata:
  node_type: memory
  type: project
  originSessionId: 623d3ce8-ef37-406d-9dbd-b375e44643b5
  modified: 2026-09-27T10:54:15.514Z
---

Built 2026-09-27, all 8 gates (STOP 0–7) in `docs/emr/clerking-v2/STOP-REPORTS.md`; owner said "go through all gates", few agents (2 UI agents used).

- Branch `feat/clerking-v2`, worktree `~/Desktop/medsync-release`, cut from `release/emr` @ 1f5937c; HEAD de45b7f. Not pushed.
- GATE A signed by owner (Fadhul, CSO): all D-CV as recommended, D-CV-11 = today's tokens (Chroma later), all 75 rules + 19 refs. Sign-off pinned by hash in `data/clerking/catalogue-signoff.v1.json` (withheld list turns rules off).
- Engines `lib/clerking/*` (pure), UI `components/clerking/*`, loader block `lib/clerking/desk-load.ts`, template `data/clerking/note-template.adult-v2.json`, token map `data/clerking/token-map.v1.json`.
- Migration 0076 GATED: must be applied BEFORE deploying (loader reads new medication columns even with flag off).
- H13: family history commits at signing (not "at once"). Only 12/96 symptoms chart until CFC v1.2 finding addendum signed (`cfc-v1.2-addendum.md`, 84 concepts).
- Show all complaints pop-up (a31aabf, b6b4d8e, 2026-09-27); ops pick list + CAGE + typed pack-years + instant meds/allergies + X removes (7c51d9e). Ops/CAGE data files are draft, awaiting CSO. Not pushed/deployed.
- Legacy symptom conversion (owner brief): signature table at docs/emr/clerking-v2/legacy-conversion-proposal.md + artifact https://claude.ai/artifact/G9JWyCvC6prZepj8vXFup6; STOPPED awaiting CSO signature before building legacy-conversion.v1.json. Live convert.ts narrows 7 codes silently (D1).
- Phone layout (PROMPT-CLERKING-MOBILE) built 2026-09-27, eec6f5c, ADR 0169, D-CM-01..07 signed as recommended; <640px only (max-sm:/sm:hidden), EmrDialog `sheet` prop; report docs/emr/clerking-v2/mobile/STOP-REPORT.md; device trial is owner's. Harness plan plans/phone.json (fixture uses real DeskTopBar).
- Full suite needs SKIP_ENV_VALIDATION=1 EMR_PGLITE=1 in medsync-release (no .env.local).
- Report artifact: https://claude.ai/artifact/Pzc21mnYhiKjj7hGidbGMW. Harness screen `desk-v2` in ~/Desktop/emr-harness (plans/v2.json, shots-v2).
- ADRs 0163–0168 (0162 is Chroma's in another worktree).

**How to apply:** owner pushes/applies/deploys; clinician trial is the owner's (protocol `clinician-trial.md`).
Related: [[emr-engine-build-state]] [[medsync-owner-rules]] [[chroma-design-system-build]]
