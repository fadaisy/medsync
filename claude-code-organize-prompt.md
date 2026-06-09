# Prompt for Claude Code

Copy everything below into Claude Code from the repo root.

---

Organize and clean up this repository. It's a Next.js 16 App Router + TypeScript + Supabase + Drizzle app with role-based route areas. The structure is mostly sound — the goal is removing cruft and resolving duplicated/legacy code, NOT a rewrite. Work in phases, commit after each phase, and run `npm run typecheck && npm run lint && npm run test` after every phase (plus `npm run build` at the end). Never modify `supabase/migrations/`, `db/schema/`, or `docs/adr/` content.

## Phase 1 — Hygiene

1. Delete all `.DS_Store` files and `components/forms/.combobox.tsx.swp`. Add `.DS_Store`, `*.swp`, and `supabase/.temp/` to `.gitignore` if missing; `git rm --cached` anything already tracked.
2. Delete unused default Next.js assets in `public/` (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) — grep for references first, keep any that are used.

## Phase 2 — Resolve duplicate route trees (investigate before deleting)

For each pair below, determine which is live by tracing links/redirects from `app/page.tsx`, `middleware`/`proxy`, and grepping for hrefs and `redirect()` calls. Present findings and a deletion plan to me BEFORE removing anything:

1. `app/(auth)/sign-up` + `app/(auth)/sign-in` vs `app/signup/{patient,clinical,hospital,non-clinical}` — two signup systems.
2. `app/(auth)/onboarding/` vs `app/onboarding/`.
3. `app/clinician/` vs `app/doctor/` — both have schedule + availability; check `lib/clinician/` and `lib/scheduling/` usage too.
4. Dead/preview routes: `app/v1/page.tsx`, `app/signup/preview/primitives/`.
   After approval, delete the dead trees and any `lib/` modules, components, tests, and edge functions that become orphaned.

## Phase 3 — Landing components

`components/landing/` mixes a numbered set (`01-announcement-bar` … `17-footer`), `v2-*` files, and `_stub`/`_mock` helpers. Determine which set the live homepage renders, delete the unused generation and unused stubs, drop numeric prefixes from surviving filenames, and update `components/landing/index.ts` and all imports.

## Phase 4 — Consistency pass

1. Ensure route-private code consistently uses `_components/` and `_lib/` folders (some routes have loose `_form.tsx`, `_wizard.tsx`, `_catalog.ts` files — move them into `_components/`/`_lib/` and fix imports).
2. Move any duplicated per-route `features.ts` / `scope` logic into `lib/` if two or more route areas copy it.
3. Keep changes mechanical — no behavior changes.

## Phase 5 — Documentation

Replace the boilerplate `AGENTS.md` (keep the existing nextjs-agent-rules block) with a real project map: tech stack, directory layout (app route areas, lib domains, db/schema, supabase functions/migrations, tests, docs/adr), all npm scripts, and conventions (route-private `_` folders, ADR process, migration immutability).

## Final verification

`npm run typecheck && npm run lint && npm run test && npm run build` must all pass. Summarize everything deleted/moved with before/after file counts.
