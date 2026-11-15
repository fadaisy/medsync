---
name: pharmacy-rework-build
description: "Pharmacy rework (kit from ~/Downloads/pharmacy-rework) build state: worktree, branch, phases done, owner actions"
metadata:
  node_type: memory
  type: project
  originSessionId: 1ca875d6-2fbd-4f0a-bec4-2c16af100a54
  modified: 2026-10-30T08:08:30.928Z
---

Started 30 Oct 2026. Worktree `~/Desktop/medsync-rework`, branch `feat/pharmacy-rework` cut from stock-up polish fe6f448c ([[stock-up-polish-build]]). Kit copied to `docs/pharmacy/rework/` (PRD, PROMPT, TECH-SPEC, REVIEW-FINDINGS, RECON.md). node_modules symlinked to medsync-pharmdemo; tests source the main `.env.local`.

Owner choices: replace outright (old routes redirect, deleted in P6); parallel agents for P3–P5 on disjoint folders, no agent commits; run through all gates, stop only if blocked; commit per phase.

Done: P0 6de45b08, P1 d0c416db, P2 part 1 aa4c3dc7 (0266 rx checks + count sheets, checks gate in recordHandover, Dispense page, derives in lib/pharmacy/derive; typecheck not run on it) (migration 0265 GATED unapplied, shell, `lib/pharmacy/ia.ts` href map + redirects, witness on own screen, flag tiers PHARMACY_CORE/WARDS/EPI/INSIGHTS, boot guard, copy sweep to draft).

**Why:** long multi-phase build; the next session needs the state.
**How to apply:** continue at the next phase in PROMPT.md; living doc is `docs/pharmacy/HANDOFF.md` (write in P6). Owner must: `cd ~/Desktop/medsync-rework && npm run db:migrate` (0264, 0265+), CSO-sign PHARMACY_REWORK_COPY (prod shows not-found until then) and re-sign swept copy, unset PHARMACY_DEV_HOSPITALS / DEV_SKIP_MFA before deploy ([[dev-skip-mfa]], [[pharmacy-dev-hospitals]]).

30 Oct afternoon: P2 part 2 5386d926, outbox e93adadf (count lines only, IndexedDB). P3/P4/P5 agents finished; integrated (schema index, Law 2 list, Today feed loaders, ColdChainTab, nurse witness fallback in witness-actions, count cases on approval, Set-up fridge/EPI clinic/vaccine dialogs, issue+ward detail inside Store page, 0267 index renamed pcase_open). Old redirected pages + orphans deleted (84 files, to-v2.ts gone). Playwright smoke blocked: migrations 0265–0269 unapplied in any DB. HANDOFF.md is the living note.

31 Oct: DONE. Owner applied 0264–0269 (from the rework worktree). Commits 29171b32 (P3–P5 wired, old pages gone), 26daae68 (missed-handover from first handover), 415ec99d (shell pins light Tide via `data-ds-light`). Webpack build green (`npx next build --webpack`; Turbopack panics on the symlinked node_modules). Prod-server smoke: all 37 pharmacy routes/tabs 200 with the right h1, no server errors, no overflow at 375 px. Local only, not pushed, no PR. Remaining owner items in HANDOFF.md (copy sign-off, unset dev overrides, SMS key + cron, legal Q1).
31 Oct later: pushed and MERGED to main as PR #278 (bfe2d309), opened and merged by the owner in the pane. CI had failed in 2s at merge time (runner, not tests). Prod stays not-found for the rework until PHARMACY_REWORK_COPY is signed.
