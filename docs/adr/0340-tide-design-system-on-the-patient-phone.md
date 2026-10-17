# ADR 0340 — Tide is the design system of the patient phone app

**Status:** Accepted — 2026-10-17. Owner decision (Tide v1 plan, decisions D2 and D5). For the patient phone app (`mobile/`) only, it supersedes ADR 0162 (MedSync Chroma). Chroma still governs the web and every staff surface.

## Context

The owner commissioned the Tide v1 design pack for the patient app: prototype boards in light (`T*`) and dark (`D*`), the TideNav, the mood faces, a design system (`design/mobile-tide-v1/tide-ds/`), a PRD and a build prompt with fourteen laws (`docs/mobile-tide/PROMPT-MOBILE-TIDE-V1.md`). Tide is warmer than Chroma and has its own structure: a navy band, a lagoon accent, the day cascade, a cradled bottom nav with a raised plus, and the red Help on every screen. Mixing it with Chroma tokens would give neither system.

## Decision

1. **The phone uses Tide.**
   - Tokens are roles in `mobile/src/theme/tide.ts` (`useTide()` / `useTideStyles()`).
   - Primitives are in `mobile/src/components/tide/`.
   - Motion presets are in `mobile/src/motion/presets.ts` (Reanimated 4 CSS animations, each with a reduce-motion form).
   - No NativeWind: StyleSheet and roles, as before (D2).
2. **Dark mode uses the PRD palette** (D4): ground `#0B1120` and cards `#151D30`. The Tide design-system artifact is updated to match.
3. **The clinical colour rules carry over unchanged:**
   - red only for Help, SOS, the danger interrupt and danger reading states (law L3);
   - amber and green only for clinical signals, always with a word (L4);
   - never colour alone.

   `src/theme/colour-laws.test.ts` scans the Tide code for raw colours and stray red. `src/features/safety/help-crawl.test.ts` holds Help on every route (L6).
4. **Motion is livelier than Chroma's.**
   - The nav and the plus use springs, and the active tab pops.
   - Every animation still marks a change of state or place.
   - The two that loop (the Now card's pills and the SOS pulse) stop under reduce motion.
5. **Legacy screens move to Tide when they are next touched.** These are the booking engine screens, household, consent, the symptom catalogue and the emergency sheets.
   - Until then, the red disc on each opens Help.
   - They use the Chroma palette and never the Tide roles.

## Consequences

- The phone and the web look different on purpose. Shared rules (clinical colour, no dosing, no fabricated data) stay in both.
- The new screens read fixture repositories (`mobile/src/data/*`) behind the shape the real data will fill. Clinical data stays demo until Gate CG is signed (`flag("mobileClinicalData")`, law L2), and every such screen shows the "Demo data" ribbon (L1).
