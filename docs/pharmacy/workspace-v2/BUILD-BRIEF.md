# Pharmacy Workspace v2: build brief for place builders

Worktree `~/Desktop/medsync-pharmws2`, branch `feat/pharmacy-workspace-v2`. Next.js 16, so read `node_modules/next/dist/docs/` before using an API you are unsure of. Read first:

- `AGENTS.md`;
- `DESIGN-medsync.md` § Laboratory workspace (the Tide desk);
- `docs/pharmacy/workspace-v2/gate-a-proposal.md`, the spec; §1 lists the board items that are dropped;
- `step-0/data-sources.md`, the real reads;
- your boards in `pharmacy-workspace-v2-canvas/boards/*.html`, read as source; they load support.js.

## Laws (any breach fails review)

1. **Interface only.** No new writes, tables, migrations, RLS policies or server actions that write. New *read* code is allowed:
   - a pure projection in `lib/pharmacy/workspace-v2/<name>.ts` with a test in `tests/pharmacy/workspace-v2/<name>.test.ts`;
   - its DB read in `app/pharmacy/_lib/<name>.ts` (`import "server-only"`).
   Reuse the existing loaders listed in data-sources.md before writing a query.
2. **Nothing lost.** Every action, filter, view, print and count on an old page stays reachable. The easiest way: a tab renders the old page's own body.
   - Pattern: in the old `page.tsx`, rename its default export to an exported `XBody`, unchanged.
   - Add a new default export that first runs `await toV2("/pharmacy/<new>", sp)` (from `app/pharmacy/_lib/to-v2.ts`) and then returns `<XBody …/>`.
   - Your new tab renders `<XBody …/>` inside the v2 layout.
   - Restyle only where the board asks and the data exists.
3. **Old URLs keep working.** Detail, print and form routes are not redirected. Only the list pages that GATE A §3 names are redirected.
4. **Show rules, never decide them.** Late, out, overdue and similar states come from the engines' own fields.
5. **Patients.** Wherever a patient appears, show two identifiers (name + MedSync number). Identities come only through the existing `identitiesFor(scope, ids, purpose)` (it audits), never by joining names yourself.
6. **"No data", 0 and "Not set" are different.** Use `NotSet` for unsigned or unconfigured, "No data" for unreadable or flag off, and 0 for a real zero.
7. **Colour.**
   - Red is for the Emergency link only.
   - Nothing is green.
   - Amber always comes with a glyph and a word: `Pill tone="caution"`, or the `WorkRow` `late` prop.
   - One lagoon (primary) action per region.
   - No left-edge accent bars, no gradients.
   - Headings use the type tokens (`text-heading-s` and so on), with no `font-bold` or `font-medium` on headings.
8. **Copy.**
   - Every visible string goes in your own file, `content/pharmacy-workspace-v2-<place>.ts`. Start it with a comment that it shares `PHWS2_COPY_STATUS` (draft). Never edit any `*_COPY_STATUS`.
   - Never copy board placeholders in brackets ("[target]", "[dose]", "[strength]").
   - No doses.
   - No role words: never "Pharmacist", "Doctor", "Nurse" and so on in pharmacy source (Law 4). Use cadre or place words, for example "the prescriber" is fine.
   - Dates in en-GB, in `DEFAULT_TIME_ZONE` from `@/supabase/functions/_shared/slots`.
9. **No new dependencies.** Pop-ups are centred `EditorDialog`s. There are no side sheets.
10. **Never claim "updates live".** There is no pharmacy realtime channel. Say "As of {time}" and give a refresh link.

## Kit (import, do not copy)

- **Lab v2 kit** (`app/lab/_components/v2/`):
  - `kit.tsx`: `Pill`, `LatePill`, `EmptyState`, `NotSet`, `FigureValue`, `Panel`, `KeyFigure`, `KeyFigureGrid`, `Ident`, `TwoIds`;
  - `space.tsx`: `PillTabs`, `FilterChips`, `SpaceHeader`, `PrimaryLink`, `SecondaryLink`;
  - `button.tsx`: `LabButton` (primary is lagoon; `disabledReason`);
  - `charts.tsx`: `Sparkline`, `StageBar`, `HourlyFlowChart`, `Histogram`, `BulletBar`;
  - `loading.tsx`: `PlaceLoading`, `TabbedLoading`, `ViewLoading`, `CardBone`, `Bone`;
  - `fields.tsx`: `DateField`, `PickField`, `NumberStepper`.
  These take their words as props or use generic LABWS2 words. Pass pharmacy words where they accept them.
- **Pharmacy v2** (`app/pharmacy/_components/v2/`):
  - `pieces.tsx`: `WorkRow`, `WorkGroup`, `MoreMenu`, `FlowStrip`, `InboxRow`, `LimitsLineView`;
  - `limits-line.tsx`: server `LimitsLine`;
  - `shell.tsx`: `PLACE_HREF`.
- **Context:**
  - `app/pharmacy/_lib/v2.ts`: `pharmacyV2()` returns scope, live, flags, permissions, navIds, places, tabs, points and acting; also `hasTab(v2, place, key)`.
  - The tab list and words: `lib/pharmacy/workspace-v2/places.ts`, `PHWS2.tabs` in `content/pharmacy-workspace-v2.ts`, and `app/pharmacy/_lib/tab-words.ts`.
- **Each new place page:**
  - If `!v2.live`, call `notFound()`.
  - Refuse a tab the viewer lacks: fall back to their first tab, or `notFound()`.
  - Give each place folder a `loading.tsx` (`PlaceLoading`/`TabbedLoading`), an `error.tsx` ("use client"; `PHWS2.kit.error` + retry) and a `not-found.tsx`.

## Machine rules (8 GB)

- **Typecheck only through** `/private/tmp/claude-501/-Users-airm1-Desktop-medsync/86d2ddf2-f3cb-4d6f-8e69-ab088d0f9685/scratchpad/tc.sh "<grep pattern for your files>"`. It queues on a lock. Never run `npx tsc`, `npm run build`, `npm run typecheck` or the dev server yourself.
- **Tests:** `cd ~/Desktop/medsync-pharmws2 && npx vitest run tests/pharmacy/workspace-v2/<your>.test.ts` (one file at a time).
- **Lint** only your own files: `npx eslint <files>`.
- **Files:** touch only the files your task owns, plus the old pages it names. Do not edit `shell.tsx`, `pieces.tsx`, `v2.ts`, `places.ts`, `content/pharmacy-workspace-v2.ts` or `layout.tsx`. If one of them needs a change, say so in your report.
- **Git:** never commit, stash, reset or switch branches.
- **Report:** at most 400 words: files created and changed, old pages wired with `toV2`, board items left out and why, anything you could not verify.
