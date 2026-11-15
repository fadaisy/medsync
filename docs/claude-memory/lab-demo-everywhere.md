---
name: lab-demo-everywhere
description: 19 Oct 2026 feat/lab-demo-everywhere (on fix/lab-demo-errors): catalogue fill from research + demo data on every lab page; 0158 unapplied; local only
metadata:
  type: project
---

Branch `feat/lab-demo-everywhere` (main folder ~/Desktop/medsync), stacked on `fix/lab-demo-errors` (pushed, ebc95330).
Commits: 15a0a2cf (Test catalogue "Fill missing units and codes" from docs/lab/catalogue-research: CFC canonical unit
else research unit, decimals, LOINC only verified+ACTIVE; migration 0158 GATED adds 94 LOINC codes + mIU/L) and
62f10866 ("Load a demo lab" fills every lab page; lib/lab/demo.ts orchestrator + lib/lab/demo-sections.ts).

Owner decisions (18 Oct): lead-pressed button for catalogue; demo staff ("Demo lab lead", "Demo CSO"… banned
accounts, no superadmin) sign settings in demo hospitals only; demo on every lab page. Ranges = research's published
Ugandan bands (one adult band per sex, both-ends + confidence ranked). Pushed 19 Oct (no PR). Harness: lab5-harness seed is
now the demo seed (old Phase 5 seed kept as seed/serve-p5.test.ts; plans/make-demo.js).

**Why:** owner wanted presentable lab pages and standard units/LOINC. **How to apply:** apply 0158 before relying on
LOINC fill; demo needs a doctor with a department and the hospital marked in lab_demo_hospitals. See [[lab-phase-5-build]].
