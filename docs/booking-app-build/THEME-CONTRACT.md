# Mobile theme contract (READ IN FULL before editing any screen)

The MedSync Expo app (`/Users/airm1/Desktop/medsync/mobile`) is moving from a
single dark design (brand-950 indigo ground, light-ramp values used as if they
were a dark palette) to a real light/dark theme with a toggle. The owner's words:
"I hate the purple background." The foundation is DONE and typechecks; your job is
to re-express ONE file group in the semantic palette without changing layout,
copy, behaviour or hierarchy. This is a re-skin, not a redesign.

## Foundation (already written — do not edit these files)

- `src/theme/tokens.ts` — exports `light` and `dark` (type `Palette`), raw ramps
  (`brand`, `mint`, `gray`, `status`), `withAlpha(hex, alpha)`, `space`, `radius`,
  `font`, `motion`.
- `src/theme/theme.tsx` — `ThemeProvider`, `useTheme() → { colors, preference, setPreference, ready }`,
  `useStyles(make)` where `make: (c: Palette) => T`.
- `src/components/ui/{screen,button,pill,empty}.tsx` — already themed. `Screen`
  gained a `trailing?: ReactNode` slot (one control on the wordmark row, right-aligned).
- `src/app/_layout.tsx`, `src/app/(app)/_layout.tsx` — themed; `app.json` is
  `userInterfaceStyle: "automatic"`.
- `src/app/(app)/settings.tsx` — NEW: Appearance radio group (Same as phone / Light / Dark)
  + Sign out. Typed route `/(app)/settings` already exists in `.expo/types/router.d.ts`.

## The Palette (`c` below) — the ONLY colours a screen may use

```ts
interface Palette {
  scheme: "light" | "dark";
  background: string;        // page ground                (light #ffffff  / dark #0a0a0a)
  foreground: string;        // primary text               (#171717 / #e5e5e5)
  card: string;              // raised surface: cards      (#ffffff / #171717)
  muted: string;             // sunken: wells, quiet chips (#fafafa / #111111)
  mutedForeground: string;   // secondary text             (#737373 / #a3a3a3)
  primary: string;           // brand action: links, icons, back, wordmark (#5545a8 / #b7b1ff)
  primaryForeground: string; // text on a primary fill     (#ffffff / #21164d)
  accent: string;            // brand-tinted surface: selected chip, emphasis disc (#f4f3ff / #21164d)
  accentForeground: string;  // text/icon on accent        (#5545a8 / #b7b1ff)
  cta: string;               // THE signature mint fill — one per screen (#74f4bb / #33e2a0)
  ctaForeground: string;     // headline on cta            (#21164d / #00381d)
  ctaMuted: string;          // body text on cta           (#352970 / #005933)
  border: string;            // hairlines, outlines        (#e5e5e5 / #262626)
  ring: string;              // focus                      (#8476e7 both)
  status: { stableBg, stableFg, cautionBg, cautionFg, criticalBg, criticalFg, pendingBg, pendingFg };
}
```

## The pattern (mandatory shape)

```tsx
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space, type Palette } from "@/theme/tokens";

export default function X() {
  const { colors } = useTheme();        // only if you need a colour as a PROP (icon color, placeholderTextColor, ActivityIndicator, LinearGradient)
  const styles = useStyles(makeStyles); // at the top level of the component — hooks rules apply
  ...
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({ ... every entry that carries a colour uses c.* ... });
```

- `makeStyles` is a module-level `const` at the bottom of the file (React Compiler
  memoises `make(colors)` because both inputs are stable module objects).
- Entries with NO colour may stay in a separate module-level `StyleSheet.create`
  if the file already splits that way; otherwise put everything in `makeStyles`.
- Sub-components in the same file that need colours call `useStyles(makeStyles)`
  themselves (a hook per component, never passed down as a prop unless it already is).
- Any `Record<Variant, ViewStyle>` lookup tables built from `styles.*` must move
  INSIDE the component (they were module-level because `styles` was).

## Mapping the old dark design → roles

| Old (dark design)                                     | Now                                                      |
|-------------------------------------------------------|----------------------------------------------------------|
| page `brand[950]`                                     | `c.background`                                           |
| headings / body `brand[50]`, `"#ffffff"`              | `c.foreground`                                           |
| secondary text `brand[200]`/`brand[300]` (metadata, eyebrows, hints) | `c.mutedForeground`                       |
| tappable label / link text in `brand[200]`            | `c.primary`                                              |
| icon tint `brand[200]`/`brand[300]`                   | `c.primary` (actionable) or `c.mutedForeground` (decorative) |
| card fill `brand[900]`                                | `c.card` + `borderWidth: 1, borderColor: c.border` (a white card on a white page needs an edge; keep the border in dark too) |
| emphasis disc / selected chip fill `brand[800]`/`brand[900]` | `c.accent` with `c.accentForeground` ink              |
| quiet well / unselected chip                          | `c.card` + `c.border` (chip) or `c.muted` (well)         |
| hairline `brand[900]`/`brand[800]`/`withAlpha(brand[200], .28)` | `c.border`                                     |
| mint door / CTA `mint[300]`                           | `c.cta`; title `brand[900]`→`c.ctaForeground`; body `brand[800]`→`c.ctaMuted` |
| focus / selection `mint[300]`                         | `c.primary` (mint on white is 1.5:1 — unusable as a rule) |
| placeholder `withAlpha(brand[200], .4)`               | `c.mutedForeground`                                      |
| amber error text `"#fcd34d"` / `status.cautionFg` on the ground | the CAUTION WELL below                         |
| disabled fill `withAlpha(mint[300], .3)`/`brand[800]` | `c.muted` + `borderWidth 1 c.border`, label `c.mutedForeground` |
| chevron on a card `brand[300]`                        | `c.mutedForeground`                                      |

**Caution well** (every error / refusal sentence — server sentences included):
```ts
well: { flexDirection: "row", gap: space[2], alignItems: "flex-start", padding: space[3], borderRadius: radius.lg,
        backgroundColor: c.status.cautionBg, borderWidth: 1, borderColor: c.status.cautionFg },
wellText: { flex: 1, fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.foreground },
// + <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} /> before the text
```
Text is `c.foreground` (not cautionFg — #d97706 on white is 2.97:1 and fails AA). The
amber is the frame and the glyph; the words carry the meaning. `accessibilityRole="alert"`
where the old code had it.

**Emergency block** (`emergency-notice.tsx`): amber ring `c.status.cautionFg` at 1px on the
page ground, disc `c.status.cautionBg` with the warning glyph in `c.status.cautionFg`, text
`c.foreground`. NEVER red. NEVER a fill behind the whole block.

## Hard rules (the verify agent greps for these)

1. Outside `src/theme/`, NO `brand[`, `mint[`, `gray[`, `status.` (the token), or hex
   literal. Exceptions, and only these: `src/app/index.tsx` (splash) and the PHOTO SCRIM in
   `src/app/sign-in.tsx` may use `withAlpha(brand[950], …)` / `brand[950]` because the
   photograph is the brand moment in either theme. `ecg-loader.tsx` is untouched.
2. Red (`c.status.critical*`) is never rendered by this app. If you find a use, replace with caution.
3. Never colour alone — every state has a word. You are not adding or removing words.
4. No left-edge accent bars. Headings stay `font.display` (Fraunces 500).
5. Press feedback is opacity, never scale. Motion unchanged.
6. Do NOT change copy, layout, spacing, sizes, navigation, data calls, accessibility props,
   or comments that are still true. DO fix comments that describe the old dark ground
   ("on this brand-950 ground…") — a comment that lies is worse than none.
7. Both themes must read. Before you finish, mentally render each surface in light
   (white page, #171717 text) AND dark (black page, #e5e5e5 text) and check every fg/bg
   pair you created is one of the sanctioned pairs above.
8. `StatusBar` is handled by `Screen`; screens that render their own `<StatusBar>` outside
   `Screen` (sign-in, splash) keep it `"light"` only while over the photo.

## Verification you must run (from `/Users/airm1/Desktop/medsync/mobile`)

```sh
npx tsc --noEmit                                  # exit 0
npx eslint <your files> --max-warnings=0          # exit 0 — React Compiler rules are on (no setState in effect body, no hooks in helpers, no Date.now()/Math.random() in render)
npx prettier --check <your files>
grep -nE "brand\[|mint\[|gray\[|status\.|#[0-9a-fA-F]{3,8}\b|\"white\"|\"black\"" <your files>   # must be empty (splash/sign-in scrim excepted)
```
Report: files changed, every mapping decision that was NOT in the table above, any
comment you rewrote, and anything you could not resolve without touching another file.
