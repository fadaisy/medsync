# ADR-0003: Dark mode adoption

- **Status:** Accepted
- **Date:** 2026-05-21
- **Phase:** 0.2-dark
- **Deciders:** Usama Fadhul
- **Supersedes:** the "no dark mode" decision in [ADR-0002](./0002-design-system.md). The rest of ADR-0002 (palette, typography, primitives, font-license deferral) stands.

## Context

ADR-0002 (accepted same day, earlier in Phase 0.2) intentionally excluded dark mode, citing low-light ward research as ambivalent. During the same review session, Usama provided a complete dark-mode handoff — a full surface-mapping system with brightened teal accent, softened clinical reds, and stronger shadows tuned for low-light contexts. The new spec is detailed enough that we no longer ship a "half-baked variant" if we adopt it; the original concern is addressed.

This ADR records the pivot.

## Decision

Adopt the dark mode spec documented in [`DESIGN-medsync.md` §Dark Mode](../../DESIGN-medsync.md#dark-mode-1). Implementation choices:

- **Library:** [`next-themes`](https://github.com/pacocoursey/next-themes) v0.4. Industry-standard for Next.js, ~3 KB, prevents the flash-of-unstyled-content via a synchronous script the package injects in `<head>`.
- **Attribute strategy:** `attribute="class"` (adds `.dark` to `<html>`) — required for Tailwind v4's `@custom-variant dark` to fire.
- **Default theme:** `system` — respects OS preference on first paint, with a per-user override stored as `medsync-theme` in `localStorage`.
- **Token strategy:** every semantic token (`--background`, `--card`, `--primary`, `--accent`, …), every clinical-status pair (`--status-*-bg/fg`), and every shadow now lives as a plain CSS variable in `:root` (light) and `.dark` (dark) blocks. [`app/globals.css`](../../app/globals.css) declares them to Tailwind via `@theme inline { --color-primary: var(--primary); }`, so utilities like `bg-primary` resolve to the right colour per theme at runtime — no rebuild needed to switch.
- **Scale tokens also flip.** `gray-*` and `teal-*` are themselves CSS-variable-backed. Components that say `bg-gray-50` get the light `#FAFAFA` in light and the dark spec's `#111111` in dark automatically; no `dark:` variant needed for the common cases. `dark:` variants are reserved for the few asymmetric cases (Button `emergency` shifts from `bg-destructive`/white to a soft-red outline; Button `secondary` strong-border in dark).
- **`<ThemeToggle>`** ([`components/theme-toggle.tsx`](../../components/theme-toggle.tsx)) — Sun/Moon icon crossfade. Light ↔ dark switch only (system preference is honoured on first paint but the user's explicit choice persists once they toggle).
- **`/styleguide` palette swatches use static inline `style={{backgroundColor: hex}}`** so the reference display remains accurate regardless of which mode is active. Both the light and dark scales are rendered as separate sections.
- **Mobile chrome:** `<meta name="theme-color">` is set per `prefers-color-scheme` so the browser address bar matches.

## Consequences

**Positive**

- Clinicians on night shifts (Mulago ward rounds are 24-hour) get a non-eye-straining UI.
- Token-driven architecture means future modules inherit dark mode automatically — no second pass needed.
- Single source of truth (`:root` + `.dark` in [`globals.css`](../../app/globals.css)) makes audits, accessibility checks, and contrast-ratio tooling straightforward.
- Status pairs are explicitly tuned per mode (red softens from `#DC2626` to `#FCA5A5`), keeping clinical alerts visible without "retina-searing at 3am" — Usama's spec language.

**Negative / trade-offs**

- Adds an external dependency (`next-themes`). Small (~3 KB) but it's another package to monitor.
- Slight initial-paint cost: the `<script>` `next-themes` injects runs synchronously to set the class before hydration; this is the trade-off to avoid the flash-of-wrong-theme.
- `<html suppressHydrationWarning>` is required — slightly weakens React's ability to flag genuine hydration mismatches elsewhere on `<html>`. Acceptable; the warning is class-only.
- Some Button variants need `dark:` overrides for asymmetric mappings (emergency, secondary border-strong). Modest cost, but `Button.tsx` is now more verbose than the light-only version.
- The scale token flip is _almost_ a perfect inversion but not exactly (e.g., `gray-100` is "hover" in light but `card surface` per the dark spec). For ~90% of usages the visual outcome is correct because the hierarchy is preserved (darker→lighter); for the remaining edge cases components use semantic tokens (`bg-muted`, `bg-card`) which always pick the spec-correct value.

## Alternatives considered

- **Roll our own theme hook** (no dependency). Rejected — re-implementing SSR-safe theme persistence with no FOUC is non-trivial and `next-themes` is the de-facto Next.js standard.
- **`prefers-color-scheme` only (no toggle).** Rejected — clinicians often want to override the OS preference (a doctor on day shift may still want dark mode for prolonged screen reading, and vice versa).
- **Separate dark `.css` file loaded conditionally.** Rejected — runtime swap via CSS variables is faster and avoids a flash.
- **Use `data-theme` attribute.** Rejected — Tailwind v4 expects `.dark` class for its `dark:` variant; using `data-theme` would require a custom variant declaration and complicate component classes.

## Follow-ups

- When Neue Haas Grotesk Pro licensed files arrive, confirm the dark-mode rendering still feels right (the Helvetica fallback is slightly heavier; the real Pro variant may need a small weight tweak per mode).
- Phase 0.5 will write contrast-ratio tests (WCAG AA) against both palettes once tests/ infrastructure is in place.
- Phase 0.9 sign-up/sign-in flows should render correctly in both modes — verify on first build.
- Consider an `auto` theme preference (matches system) being explicitly visible in the ThemeToggle UI later (currently it's the default but invisible after first override).
