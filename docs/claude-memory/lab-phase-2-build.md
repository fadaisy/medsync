---
name: lab-phase-2-build
description: Lab Phase 2 (catalogue v2 + one menu) merged to main; 0107–0111 applied; copy signed 13 Oct; v1.6 addendum unsigned
metadata:
  type: project
---

Lab Phase 2 both prompts DONE 2026-10-12 in worktree ~/Desktop/medsync-lab1, branch `feat/lab-one-menu`, last commit
8a9fb944; follow-up ca0bbe86 (2026-10-13) closed PC-9, doctor bedside entry, 'Also at the bedside', high-risk row action. Since merged to `main`; per docs/lab/HANDOFF.md (17 Oct) 0107–0111 are applied, copy signed
13 Oct, wording review done; the v1.6 catalogue addendum still awaits the lab lead then the CSO. Final report at docs/lab/phase-2/FINAL-REPORT.md (gaps + owner actions).

- Migrations 0107–0111 (applied). ADRs 0251–0259.
- Eight per-hospital flags, blocked in prod while `LAB2_COPY_STATUS` is draft (content/lab-phase-2.ts).
- CSO decided 2026-10-13 (artifact HxcV7qKXZg2XswqJa2iMqd): NF-8 set aside (pack keeps its reader, revisit at pack
  go-live); four reversed unit factors added back inverted in v1.6 data (no SQL). Perf: scripts/lab/bench-timing.js.
- Next migration 0112+, next ADR 0260+ (pharmacy reserved 0260+; check docs/NUMBERS.md).

**Why:** the owner asked to run both prompts through all gates, with my recommendations as decisions.
**How to apply:** ask before pushing or opening a PR; the owner applies migrations and signs the CSO items.
Related: [[lab-phase-1-build]], [[medsync-owner-rules]].
