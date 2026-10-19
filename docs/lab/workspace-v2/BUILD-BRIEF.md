# Lab Workspace v2: build brief for the per-place builders

Read first, in order:

1. `docs/lab/workspace-v2/PROMPT-LAB-WORKSPACE-V2.md`: Laws §2, your place's section in §5, and §7.
2. `docs/lab/workspace-v2/gate-a-proposal.md`: decisions, the route map in §3, the component list in §5.
3. Your place's canvas board in `docs/lab/workspace-v2/lab-workspace-v2-canvas/*.dc.html` and `ws.css`. Rebuild it; never paste it.
4. `DESIGN-medsync.md` and the project `AGENTS.md`.

Your place's rows of the step-0 inventory (`docs/lab/workspace-v2/step-0/inventory-*.md`) are the parity list. Every action, filter, print, download, sign and count on it must stay reachable from the new route.

## What already exists (use it; do not edit these shared files)

- **Flag and context.** `labV2()` in `app/lab/_lib/places.ts` returns `{ scope, live, flags, places, tabs, visible }`. Every new page starts with `const v2 = await labV2(); if (!v2.live) notFound();`.
- **Old routes.** `redirectIfV2(target, searchParams)` in `app/lab/_lib/v2-redirect.ts`. Every **old** page you move calls it first: 308 to the new home when the flag is on, the old page when it is off. Use the targets in gate-a §3. Keep query params; the helper keeps them.
- **Shell.** `app/lab/layout.tsx` already renders the shell (rail, top bar with the place title as the h1, search, Needs you, Emergency) when v2 is live. Your page renders only the content under it.
- **Space header.** `app/lab/_components/v2/space.tsx`: `SpaceHeader`, `PillTabs`, `FilterChips`, `PrimaryLink`, `SecondaryLink`.
  - `pillTabs(v2.tabs.<place>, "<place>", counts)` in `app/lab/_lib/place-tabs.ts` builds the place's visible tabs.
  - `one()` reads a query value.
- **Kit.**
  - `app/lab/_components/v2/kit.tsx`: `Panel`, `KeyFigure`, `KeyFigureGrid`, `FigureValue` (null shows "No data"), `EmptyState` (no dashed boxes), `NotSet`, `Pill` (neutral, caution, passed, lagoon), `LatePill`, `Ident` (mono, identifiers only), `TwoIds`.
  - `app/lab/_components/v2/button.tsx`: `LabButton`. It has **no `disabled` prop**. Pass `disabledReason`, which disables the button and prints the reason. `busy` is for in-flight. `variant`: primary (lagoon, one per panel), secondary, text, quiet.
  - `app/lab/_components/v2/fields.tsx`: `DateTimeField` (value `YYYY-MM-DDTHH:mm`, the same string `datetime-local` gave), `DateField` (`YYYY-MM-DD`), `PickField` (chips for ≤ 4 options, else a combobox; options have `label` and `detail`), `NumberStepper`, `MonthCalendar`. Each posts its value under `name` in a hidden input, so `FormData` forms are unchanged.
  - `app/lab/_components/v2/view-header.tsx`: `ViewHeader` (h2). Use it in place of `PageHeader` inside v2 views, because the top bar holds the h1.
- **Tokens.** Every component inside the shell gets the Tide look from `globals.css` (`:root:has([data-lab-tide])`). Use the semantic classes and the `tide-*` utilities:
  - `bg-tide-lagoon` and `text-tide-on-lagoon`, `bg-tide-sunken`, `bg-tide-navy-900` and `text-tide-on-band`;
  - `shadow-tide-card`, `rounded-tide-card`/`-tile`/`-row`/`-field`.
  - No raw hex in components.

## Rules you must hold

- **Interface only (Law 1).** No change to any engine, store, action contract, RLS policy or migration. New reads are allowed only as pure read models in `lib/lab/*-read.ts`, with a test. If you think you need a write, stop and say so in your report.
- **Strings.** Every new or changed visible string goes in **your own** content file, `content/lab-workspace-v2-<place>.ts`, as one exported `const`. Header comment: "draft; covered by LABWS2_COPY_STATUS in content/lab-workspace-v2.ts". Do not edit `content/lab-workspace-v2.ts` or any `*_COPY_STATUS`. Existing signed copy (`content/lab*.ts`) may be reused as is.
- **Red, amber, green.**
  - No red anywhere under `app/lab`. A critical value uses `CriticalPill`/`ResultValueText` from `components/emr/status-word.tsx`.
  - Amber (`Pill tone="caution"`) only for late, held, delta waiting, overdue, quarantined and down.
  - Nothing green: passed is `Pill tone="passed"`, which is neutral with a check.
  - Never colour alone. No left-edge bars, no gradients.
  - `tests/design/red-reserved.test.ts` scans `app/lab`.
- **Field kit sweep.** In your area, leave:
  - no `type="date|datetime-local|time|month"`;
  - no visible concept id (no `obs.` placeholders or labels; pick by name with `PickField`);
  - no disabled button without a reason;
  - no mono figures unless they are identifiers;
  - no dashed empty boxes.
- **Two identifiers** wherever a patient appears.
- **One lagoon primary per region.**
- **Dialogs are centred** (`EditorDialog` or `components/ui/dialog`). No side sheets.
- **Stack as found.**
  - Server components where they fit; `useAct()` then `router.refresh()`.
  - TypeScript strict, no `any`, no new dependencies.
  - Next 16: page files export only `default`, `metadata` and route config. Put components elsewhere.
- **Moving old pages.**
  - Prefer **moving** an old page's body into a view component under the new route (for example `app/lab/send-outs/_views/manifests.tsx`), then rendering it from both:
    - the new route (inside the v2 place);
    - the old route (with its old `PageHeader`, after `redirectIfV2`), so the flag-off interface keeps working until Step 11.
  - Route-private components stay in `_components/`.
- **Shared files you must not edit**, because other builders are working in parallel:
  - `app/lab/_components/v2/*` (existing files), `app/lab/_lib/*`, `app/lab/layout.tsx`;
  - `lib/lab/places.ts`, `lib/lab/nav.ts`, `globals.css`, `content/lab-workspace-v2.ts`.
  - If you need a new shared component, add a **new** file under `app/lab/_components/v2/` with a unique name, and list it in your report.

## Checks

Other builders share this worktree and this machine has 8 GB of RAM. So:

- **Typecheck** only with `sh /private/tmp/claude-501/-Users-airm1-Desktop-medsync/8bebf33d-eb57-4676-91e4-cd2accfb3f74/scratchpad/tsc-lock.sh`. It queues for a lock and runs the whole project. Judge your own files only; errors in other builders' files are theirs.
- **Lint** your files: `./node_modules/.bin/eslint <your files>`.
- **Tests:** `./node_modules/.bin/vitest run <your test files>` and `tests/design/red-reserved.test.ts`.
- Do **not** run `next build`, `npm run test` (the whole suite) or the harness. The integrator runs them.
- Do not commit or use git commands that change state.

## Report

End with these lists:

- files created and moved;
- old route → new route;
- the parity rows covered (action names);
- anything left unreachable;
- any new shared component;
- your content file;
- the checks you ran.
