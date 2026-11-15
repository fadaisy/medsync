---
name: lab-signup-department
description: "2026-10-09 lab sign-up auto-picks the LABORATORY department; worktree medsync-labsignup, uncommitted"
metadata:
  node_type: memory
  type: project
  originSessionId: e5c7a422-6dfa-4ba4-bcd5-f0970ac425dd
  modified: 2026-10-09T11:26:10.342Z
---

Owner felt lab techs shouldn't choose a department at sign-up. `staff_affiliations.department_id` is NOT NULL, so instead the lab professions carry `department: "LABORATORY"` (lib/onboarding/profession.ts) and the clinical form auto-picks the hospital's live LABORATORY department (read-only field); the select returns if the hospital has none.

Worktree ~/Desktop/medsync-labsignup, branch fix/lab-signup-department off origin/main 9d863bd, uncommitted. node_modules is symlinked from the main folder (missing jsdom etc., so full typecheck/tests show unrelated failures). Lab roadmap artifact: https://claude.ai/artifact/SQPdW66RcaAnu3QWQTYVTw

**Why:** first step before the lab roadmap work.
**How to apply:** commit/PR only when the owner asks; radiographer/pharmacist could get the same treatment.
