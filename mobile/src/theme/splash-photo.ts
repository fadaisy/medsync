import type { ImageSourcePropType } from "react-native";

/**
 * The photograph behind the splash.
 *
 * Swap the FILE at that path to change the image; this module should not need
 * to change again.
 *
 * It is a module rather than an inline `require` in the screen because Metro
 * resolves `require` statically: a require pointing at a file that is not
 * there yet fails the BUNDLE, not just the screen. Keeping it here means the
 * app runs on the gradient alone until the asset lands, and enabling it is one
 * line in one file.
 *
 * When it is null the splash renders the indigo gradient by itself, which is a
 * deliberate design that stands on its own — not a broken state.
 *
 * Licence note: whatever ships here needs a licence that permits commercial
 * redistribution inside an app binary. Record it in the repo when the final
 * image is chosen; "free to use" on a stock site is not always the same thing.
 */
export const splashPhoto: ImageSourcePropType | null =
  require("../../assets/images/splash-bg.jpg") as ImageSourcePropType;

/**
 * How hard the indigo wash sits on the photograph.
 *
 * Tuned for a low-key clinical photograph with warm window light behind a cool
 * foreground. Two things drive these numbers:
 *
 *   - This photograph is LOW-KEY: a dark table, dark surroundings, and only
 *     the window carrying light. An opacity tuned for a bright image buries it
 *     completely — the first pass ran 0.62 at the top and the photo was
 *     invisible on device, reading as a plain gradient. Dark source, light
 *     wash.
 *   - The bottom has to reach effectively solid, because the wordmark, the
 *     tagline and the CTA all sit over it and text on a photograph is a
 *     contrast problem you cannot test your way out of.
 *
 * Raising the top figure buys brand coherence and loses the photograph;
 * lowering it does the reverse. 0.22 → 0.96 keeps the stethoscope and the
 * window light legible across the upper two-thirds, and reaches flat colour
 * exactly where the photograph ends so there is no visible seam.
 */
export const photoWashOpacity = { top: 0.22, bottom: 0.96 } as const;
