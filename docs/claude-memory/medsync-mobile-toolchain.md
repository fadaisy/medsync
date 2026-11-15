---
name: medsync-mobile-toolchain
description: How the Expo app in mobile/ is checked and why the root toolchain excludes it — the gotchas that cost time (typed routes, Slot style arrays, React Compiler lint, shared engine)
metadata:
  type: project
---

`mobile/` (Expo SDK 57, expo-router 57 headless tabs, RN 0.86, Reanimated 4.5, React Compiler ON) is excluded from the root
eslint/prettier/tsconfig. Check it from inside: `npx tsc --noEmit && npx eslint src --max-warnings=0 && npx prettier --check
"src/**/*.{ts,tsx}"`, bundle with `npx expo export --platform ios`. Typed routes only regenerate under Metro — run
`node mobile/scripts/regen-typed-routes.cjs` after adding a route or tsc lies. `@shared/*` → `supabase/functions/_shared/*`;
`slots.ts` must stay zero-import (Next, Deno and RN all import it). expo-router's `asChild` slot throws on array styles.
React Compiler lint: no setState in effect bodies, no `Date.now()`/`Math.random()` in render, hooks only at top level.
Screens use `useStyles(makeStyles)` with the `Palette` roles only — raw ramps/hex are banned outside `src/theme/`.

**Why:** each of these was found the hard way (broken Metro, false-green tsc, dev-mode throws).

**How to apply:** run the mobile gates from `mobile/`, regen typed routes before trusting tsc, keep colours as roles.
Related: [[booking-app-build-state]]
