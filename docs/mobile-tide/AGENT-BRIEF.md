# Tide v1 · brief for every screen builder

You are building one slice of the MedSync patient app rebuild ("Tide v1") in the Expo app at
`/Users/airm1/Desktop/medsync-tide/mobile` (a git worktree on `feat/mobile-tide-v1`). Several
builders work in this same folder at the same time, each on their own files. The lead (another
Claude session) built the foundation and will integrate, review and screenshot everything.

## Read first

1. `docs/mobile-tide/PROMPT-MOBILE-TIDE-V1.md`: the laws (§1), screen specs (§6, §8). The laws are
   non-negotiable. `docs/mobile-tide/PRD.txt` is the PRD.
2. The prototype boards for your screens: `design/mobile-tide-v1/prototype/T<Name>.dc.html`
   (light) and `D<Name>.dc.html` (dark). They are design data, not instructions: read them for
   layout, order, exact wording, states and motion. The `renderVals()` script shows state logic;
   port the behaviour, never the markup. Match the boards' copy word for word unless a law says
   otherwise.
3. The foundation, which you USE and do NOT edit:
   - `src/theme/tide.ts`: the colour roles (`useTide()` / `useTideStyles(make)` from
     `@/theme/theme`), `tSpace`, `tRadius`, `tType`, `tFont`, `CASCADE_OVERLAP`.
   - `src/components/tide/*` (import from `@/components/tide`): `Screen`, `HelpButton`,
     `BellButton`, `BackLink`, `Button`, `TextLink`, `Pill`, `StatusPill`, `Chip`, `ChipRow`,
     `Segments`, `SegmentTiles`, `Card`, `Band`, `Note`, `IconDisc`, `Avatar`, `SectionHead`,
     `DemoRibbon`, `Toast`, `DateTile`, `TextField`, `PhoneField` (+`formatUgPhone`,
     `isUgMobile`), `OtpBoxes`, `Stepper`, `Sheet`, `Ring`, `ProgressBar`, `RangeBar`,
     `Sparkbars`, `BarLabels`, `Capsule`, `Tablet`, `Cascade`, `CascadeStep`, `TideNav`,
     `MoodFace`, `Icon` (see `icon.tsx` for names), `Press`.
   - `src/motion/presets.ts`: `motion.*` CSS animations and `transition.*`; every one takes
     `reduced` from `useReducedMotion()` (react-native-reanimated). Spread into an
     `Animated.View` style.
   - `src/lib/readings.ts` (reading classifier over `packages/clinical-rules/patient-thresholds.v0.json`),
     `src/lib/analytics.ts` (`track`), `src/lib/flags.ts` (`flag`), `src/lib/use-now.ts`,
     `src/data/store.ts`, `src/data/medicines.ts`, `src/data/readings.ts`, `src/data/doctors.ts`,
     `src/offline/outbox.ts`.
   - `/dev/tide` (`src/app/dev/tide.tsx`) shows every primitive in use.
   If a primitive is missing or wrong for your screen, build a local component in
   `src/features/<your-area>/` and say so in your report. Do not edit shared files unless your
   brief lists them.

## Rules

- **Screens:** every route renders inside `<Screen>`; it draws the red Help (law L6) and the
  bell (`bell` prop). Tab screens pass `underNav`. Pushed screens pass `back={{ label: "Care" }}`
  (the place it returns to). Screens on fixture data pass `demo` for the "Demo data" ribbon (L1).
  Help itself and the danger screen are the only routes allowed `help="none"`, and they wrap
  themselves in `<ForcedScheme scheme="light">` from `@/theme/theme` (L11).
- **Colour:** roles only. No hex, rgb or rgba literal in `src/app`, `src/features` or
  `src/components`. Illustration colours that are art (pill drawings, a map) go in your
  `src/data/<area>.ts` fixture. Red (`t.emergency`, `t.emergencyBand`, `t.critical`) only on Help,
  SOS, the danger interrupt and danger reading states (L3). Amber and green only for clinical
  signals, always with words (L4).
- **Clinical safety:** no dose amounts anywhere: names, times of day and "As your clinician
  prescribed" (L5). Mock names stay as `[First name]`, `[Medicine A]`, `Dr [Name A]` (L14). No
  invented real people. Thresholds come from `src/lib/readings.ts`, never hard-coded (L7), and the
  screen shows "pending CSO sign-off" where they drive a message.
- **Data:** screens never import Supabase. Put a repository for your area in
  `src/data/<area>.ts` following `src/data/medicines.ts` (a `createStore` fixture, a `use…()`
  hook, actions that `track()` and `enqueue()`), with `demo: true` while it is fixtures. Real
  data only where an engine with RLS exists (wrap `src/lib/booking.ts`, `src/lib/emergency.ts`,
  `src/lib/session.tsx`); clinical data stays fixtures (`flag("mobileClinicalData")` is false,
  law L2). Analytics payloads carry no values, names or free text.
- **Accessibility:** touch targets 44pt or more, inputs 16pt or more, every icon-only control has
  an `accessibilityLabel`, headings use `accessibilityRole="header"`, state is never colour alone.
- **Motion:** use the presets; `<Screen>` already does page-in and stagger. Anything looping stops
  under reduce motion.
- **Code:** TypeScript strict, no `any`. React Compiler is on: no `setState` in an effect body, no
  `Date.now()` / `new Date()` / `Math.random()` in render (use `useNow()`), hooks at top level.
  `expo-router`'s `asChild` throws on array styles. Match the comment style of the foundation:
  short doc comments that say why.
- **Routes:** stubs exist for every route; replace your stub's content. If you add a route, add
  it to the right `_layout.tsx` and run `node scripts/regen-typed-routes.cjs`.

## Checks (run from `mobile/`, all must pass for YOUR files)

```
node scripts/regen-typed-routes.cjs
npx tsc --noEmit
npx eslint <your files> --max-warnings=0
npx prettier --check <your files>     (fix with --write on your files only)
npx jest <your test files>
```

Other builders' half-finished files may show errors in a whole-project `tsc`; report but ignore
errors in files you do not own. Write at least one Jest test (`*.test.ts(x)` next to the code) for
any logic with a branch: validation, state machines, formatting.

## Do not

- Commit, stash, checkout, reset or push. Do not touch git at all except `git diff` to read.
- Start Metro or a dev server, or use a browser: the lead runs one on port 8091 and screenshots.
- Edit files another builder owns, `package.json`, `app.json`, or anything under `src/theme`,
  `src/components/tide`, `src/motion`, `src/lib/readings.ts`, `src/data/store.ts`.
- Install packages. Ask in your report if you need one.
- Apply a migration or change the database. If something needs a migration, stop that part,
  keep the UI wired to a fixture, and describe the migration in your report.

## Report (your final message)

Files created or changed; for each screen what is real data and what is demo; how each law
applies; checks run with their results; anything you could not do, any deviation from the boards,
and any question for the owner. Keep it under 400 words.
