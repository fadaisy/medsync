# ADR-0002: Design system adoption (warm-palette pivot to teal monochrome)

- **Status:** Accepted (the "no dark mode" decision is superseded by [ADR-0003](./0003-dark-mode.md); the rest stands)
- **Date:** 2026-05-21
- **Phase:** 0.2
- **Deciders:** Usama Fadhul

## Context

Phase 0.2 needed a confirmed design system. The Phase 0 kickoff document originally proposed a "warm cream / charcoal / terracotta" palette inspired by Claude.ai. During the Phase 0.2 sign-off review, Usama pivoted to a different visual identity: monochrome neutrals (Attio-inspired) with **teal-600 `#0D9488`** as the lone clinical accent.

This ADR records the pivot, the rationale, and the implementation strategy. The full token spec lives in [`DESIGN-medsync.md`](../../DESIGN-medsync.md) — this ADR is the decision context behind it.

## Decision

Adopt the **teal monochrome system** documented in `DESIGN-medsync.md` verbatim. Key choices:

- **Palette.** White / `gray-50` backgrounds; full neutral gray scale `50`–`950` for text, borders, and surfaces; ten-step teal scale with `teal-600` as the anchor for primary CTAs, links, active nav, focus rings.
- **Clinical status pairs.** Six explicit bg/fg pairs (`stable`, `critical`, `caution`, `admitted`, `discharged`, `pending`). Red is reserved for clinical emergencies _only_ — never decoration.
- **Typography.** Neue Haas Grotesk Display Pro (headlines) + Text Pro (UI), with `"Helvetica Neue"` fallback. Monospace `SF Mono` → `Fira Code` → `Menlo` → `Consolas` for clinical data values.
- **12-step type scale.** Display XL through Overline, each carrying spec-defined line-height/letter-spacing/weight. Headings default to weight 500 (Medium), not 700 (Bold). Bold reserved for out-of-range lab values.
- **4px base grid.** Tailwind v4's `--spacing: 0.25rem` matches one-to-one (8px → `p-2`, 16px → `p-4`, etc.).
- **Restrained elevation.** Six shadow steps; `card` (1px outline + 1px drop) is the workhorse.

## Consequences

**Positive**

- One accent color across the system reduces decision fatigue and reinforces brand. Teal-600 reads as clinical/medical without the over-used hospital blue.
- Pairing color with text on every status (never color alone) bakes color-blind accessibility into the primitive.
- Token-driven theming means later module work inherits the system for free — clinicians get visual consistency across OPD, ward, labs, follow-up.
- Tailwind v4's CSS-first `@theme` configuration means every token is hot-reloadable and IDE-introspectable; no `tailwind.config.ts` to drift from the spec.

**Negative / trade-offs**

- **Neue Haas Grotesk Pro is commercial.** Until licensed `.woff2` files are added, the fallback chain renders Helvetica Neue (faithful on macOS/iOS, acceptable on Linux/Windows). Visual fidelity is acceptable but not perfect on non-Mac platforms. Mitigation: documented swap-in plan in [`DESIGN-medsync.md`](../../DESIGN-medsync.md) §Implementation notes.
- **No dark mode.** Clinical UIs typically don't ship dark mode (low-light wards regress reading speed/comfort and contrast-perception research is mixed). Decided to omit rather than ship a half-baked variant. Tokens are structured to support `prefers-color-scheme` later if needed.
- **The kickoff's original warm palette is no longer authoritative.** Anyone reading the Phase 0 kickoff doc should treat the design direction section as superseded by [`DESIGN-medsync.md`](../../DESIGN-medsync.md). This ADR records the pivot so future readers don't get confused.
- **Variant rename touched shadcn-installed components.** The themed `Button` exposes `primary`/`secondary`/`ghost`/`tealSoft`/`emergency`/`alert` (not shadcn's default `default`/`destructive`/`outline`). `Dialog` was patched to use `secondary`/`iconSm` instead of the removed `outline`/`icon-sm`. Future `shadcn add` runs will need similar patches; we accept this cost in exchange for explicit, spec-aligned variant names.

## Alternatives considered

- **Keep the original warm palette.** Rejected by stakeholder direction. The teal monochrome system is a stronger fit for the precision/clinical-authority tone we want to project to UMDPC and PDPO reviewers.
- **Ship dark mode now.** Rejected — clinical literature is ambivalent on dark UI in medical contexts and we don't want to ship something we'll regret. Revisit when the patient-facing app surfaces a real need.
- **Use OKLCH for color tokens.** Rejected for Phase 0.2 — the spec was authored in HEX and switching color spaces invites accidental drift. We can migrate to OKLCH later for wider-gamut display support without changing utility names.
- **Adopt shadcn's variant taxonomy 1-to-1 (`default`/`destructive`/`outline`).** Rejected — `primary`/`emergency`/`tealSoft` read better in code review and match the design system's vocabulary. Worth the small ongoing cost of patching newly-installed shadcn components.

## Follow-ups

- When Neue Haas Grotesk Pro licenses arrive, drop files into `public/fonts/neue-haas/`, swap to `next/font/local`, and bump CHANGELOG.
- Phase 0.9 (auth) will exercise the Form primitive — install and theme then.
- The `/styleguide` route is the visual contract; review it on every design-token change.
