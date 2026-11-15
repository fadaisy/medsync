---
name: multi-account-build
description: "Several accounts in one browser (ADR 0280) — cf404abd on origin/main, deployed to prod 2026-10-11 (medsync-htzbsl0ss)"
metadata:
  node_type: memory
  type: project
  originSessionId: 7312837c-7ce4-47f4-ae64-440b6d68af20
  modified: 2026-10-11T07:49:32.129Z
---

2026-10-11: owner asked to sign into multiple accounts in one browser; chose the Google-style switcher (one active account for all tabs) over per-tab accounts. Built on `feat/multi-account` in worktree `~/Desktop/medsync-main` (branched from origin/main), commit cf404abd, fast-forwarded onto origin/main by Claude at the owner's "push and deploy"; Vercel prod `medsync-htzbsl0ss` (alias medsync-six) Ready; owner confirmed it works in prod (entry point: "Switch account" → /accounts → "Add another account"). ADR 0280 claimed in docs/NUMBERS.md.

- Cookie slots 0–4 (`lib/supabase/accounts.ts`), `ms-account` = active slot; `/accounts` page + `POST /accounts/switch`; sign-out ends the active account only.
- The stale copy in the main folder was reverted 2026-10-11 (backup patch in that session's scratchpad).
- Sign-out links (GET → 405) fixed as `SignOutButton` form POST: a527a62 on local branch `fix/sign-out-links` (medsync-main), committed, NOT pushed/deployed yet. Unmerged `fix/tab-account-guard` (31d124c, reload tab when account changed) complements this.
- Worktree checks need `NODE_OPTIONS=--max-old-space-size=8192` and main's env sourced (`set -a; source ~/Desktop/medsync/.env.local`), never copied.

Related: [[cloud-handoff]] [[medsync-owner-rules]] [[dev-skip-mfa]]
