# ADR 0025 — Responsive patient primitives (one codebase, mobile-first)

**Status:** Accepted (2026-05-27)
**Context:** Scheduling feature, GATE C. Patient surfaces must "reflow to a mobile-native shape at small breakpoints" (PRD Part 3).

## Decision

**One set of React components, responsive by breakpoint.** Mobile-first Tailwind: build the mobile shape as the base, layer desktop enhancements at `md:`. NOT a separate mobile app. NOT duplicated components.

Five new primitives at `components/responsive/`:

| Primitive                  | Mobile (default)                                                | Desktop (md+)                       | First consumer                            |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| `ResponsiveSheet`          | bottom-anchored full-height sheet with drag handle              | right-anchored side sheet           | (none yet — booking uses StepWizardShell) |
| `BottomActionBar` + spacer | sticky to viewport bottom, safe-area padded                     | in-flow, right-aligned              | booking wizard CTA                        |
| `MobileTabBar` + spacer    | bottom tab bar, thumb-reachable                                 | hidden (sidebar replaces)           | patient layout                            |
| `StepWizardShell`          | single-decision-per-screen with back chevron + top progress bar | identical, with more breathing room | booking wizard                            |

`ResponsiveTable` from the PRD isn't built yet — the appointments list uses card stack natively (cards are correct on both mobile and desktop here). When a real tabular patient surface lands, the primitive joins.

## Why

The PRD's "smart, correct way": same components, same auth, same scope — only the _presentation_ reflows. The cost of getting this wrong is doing the patient surfaces twice (once for mobile, once for desktop) and having them drift.

Concretely:

- Patients are overwhelmingly on phones; staff/admin on laptops. Patient surfaces are mobile-first; staff surfaces (Attio shell from the existing hospital-admin work) are desktop-first. They share primitives but commit to their primary form factor.
- Responsiveness never alters data access. The same auth, same scope, same RLS. (Captured in tests: `tests/scheduling/tenant-isolation.test.ts` proves a patient sees their own appointments only — the responsive layer has no say in that.)
- The "build once" principle catches drift at PR review. A change to ResponsiveSheet shows up everywhere it's used; no quiet divergence between a mobile flavour and a desktop flavour of the same idea.

## What this is NOT

- Not a UI kit. These five primitives are domain-of-one: patient surfaces. The Attio shell components (sheet, data-table, sidebar) own the staff/admin surfaces. The two intersect only where they share base primitives (`Sheet`, `Button`).
- Not a layout-shift smokescreen. The mobile bottom sheet motion respects `prefers-reduced-motion`; the tab bar uses safe-area-inset for iOS; spacers prevent content sliding under fixed bars.
- Not patient-app-only. A future "clinician on a phone" experience could pick up `MobileTabBar` + `BottomActionBar` for the same reasons — but that's a separate ADR if we make that call.

## Consequences

- New patient features use these primitives by default. Adding a new patient page that doesn't follow the mobile-first pattern is a code review red flag.
- When the booking wizard reveals a missing pattern (e.g. a date scroller that doesn't reflow well), the fix lives in the primitive, not the wizard. Other patient features that land later inherit the fix.
- The primitives have minimal stylistic opinions — they reflow shape and position, not voice / colour / motion (those live in `globals.css` tokens and the existing component library).
