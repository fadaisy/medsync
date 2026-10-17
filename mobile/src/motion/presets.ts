import type { ViewStyle } from "react-native";
import type { CSSAnimationProperties, CSSTransitionProperties } from "react-native-reanimated";
import { cubicBezier, Easing } from "react-native-reanimated";

/**
 * The Tide motion presets (build prompt §5), as data.
 *
 * Each one is a Reanimated 4 CSS animation or transition, so it runs on the
 * UI thread and a screen only spreads it into an `Animated.View` style. Every
 * preset takes `reduced`: with the phone's "reduce motion" on it becomes a
 * short fade with no movement, scale or loop (law L13). `reduced-motion.test`
 * holds every preset to that.
 *
 * Tide's motion is livelier than Chroma's single curve on purpose (ADR 0340):
 * springs on the nav and the plus, a pop on the active tab. Every preset still
 * marks a change of state or of place; none runs for its own sake except the
 * two the boards ask for (the Now card's floating pills and the SOS pulse),
 * and both stop under reduce motion.
 */

/** easeOutExpo — the house curve for anything entering. */
export const EASE_OUT = cubicBezier(0.16, 1, 0.3, 1);
/** The same curve for `withTiming` (worklet animations). */
export const EASE_OUT_FN = Easing.bezier(0.16, 1, 0.3, 1);

/** A small overshoot for things that pop into place. */
export const OVERSHOOT = cubicBezier(0.34, 1.56, 0.64, 1);
/** The nav's spring (damping ~14), drawn as a curve. */
export const NAV_SPRING = cubicBezier(0.34, 1.4, 0.64, 1);

/** Typed against `ViewStyle` so the keyframes fit `Animated.View`'s style (and `Animated.Text`'s). */
export type Anim = CSSAnimationProperties<ViewStyle>;
export type Trans = CSSTransitionProperties<ViewStyle>;

const FADE_MS = 120;

/** What every preset becomes under reduce motion: an opacity change, nothing else. */
export function fade(delay = 0): Anim {
  return {
    animationName: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: FADE_MS,
    animationDelay: delay,
    animationFillMode: "both",
  };
}

/** Nothing at all: used where a looping flourish would otherwise run. */
const STILL: Anim = { animationName: "none" };

const STAGGER_MS = 40;
const STAGGER_CAP = 9;

export const motion = {
  /** Every screen mount: fade, settle from 0.985 and 10pt down. */
  pageIn(reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { opacity: 0, transform: [{ translateY: 10 }, { scale: 0.985 }] },
        to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
      },
      animationDuration: 500,
      animationTimingFunction: EASE_OUT,
      animationFillMode: "both",
    };
  },

  /** The nth child of a scrolling column rises 16pt, 40ms apart, capped at nine. */
  staggerUp(index: number, reduced: boolean): Anim {
    const delay = (Math.min(index, STAGGER_CAP - 1) + 1) * STAGGER_MS;
    if (reduced) return fade();
    return {
      animationName: {
        from: { opacity: 0, transform: [{ translateY: 16 }] },
        to: { opacity: 1, transform: [{ translateY: 0 }] },
      },
      animationDuration: 550,
      animationDelay: delay,
      animationTimingFunction: EASE_OUT,
      animationFillMode: "both",
    };
  },

  /** Home's "Here is your day": each card slides up 100ms after the one before. */
  cascadeIn(index: number, reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { opacity: 0, transform: [{ translateY: 26 }, { scale: 0.97 }] },
        to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
      },
      animationDuration: 600,
      animationDelay: 180 + Math.min(index, 3) * 100,
      animationTimingFunction: EASE_OUT,
      animationFillMode: "both",
    };
  },

  /** The floating nav rises with a bounce. */
  navRise(reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { opacity: 0, transform: [{ translateY: 40 }] },
        to: { opacity: 1, transform: [{ translateY: 0 }] },
      },
      animationDuration: 600,
      animationDelay: 200,
      animationTimingFunction: NAV_SPRING,
      animationFillMode: "both",
    };
  },

  /** The active tab's pill pops in. */
  tabPop(reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        "0%": { opacity: 0, transform: [{ scale: 0.6 }] },
        "70%": { opacity: 1, transform: [{ scale: 1.08 }] },
        "100%": { opacity: 1, transform: [{ scale: 1 }] },
      },
      animationDuration: 450,
      animationTimingFunction: OVERSHOOT,
      animationFillMode: "both",
    };
  },

  /** The centre plus spins in. */
  plusIn(reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { transform: [{ rotate: "-90deg" }, { scale: 0.4 }] },
        to: { transform: [{ rotate: "0deg" }, { scale: 1 }] },
      },
      animationDuration: 600,
      animationDelay: 250,
      animationTimingFunction: OVERSHOOT,
      animationFillMode: "both",
    };
  },

  /** A sheet slides up from below. The scrim fades with `scrimIn`. */
  sheetUp(reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { transform: [{ translateY: 600 }] },
        to: { transform: [{ translateY: 0 }] },
      },
      animationDuration: 360,
      animationTimingFunction: EASE_OUT,
      animationFillMode: "both",
    };
  },

  scrimIn(reduced: boolean): Anim {
    return reduced ? fade() : { ...fade(), animationDuration: 200 };
  },

  /** One bubble of the Plus fan, rising out of the plus by (dx, dy). */
  fanRise(index: number, dx: number, dy: number, reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { opacity: 0, transform: [{ translateX: dx }, { translateY: dy }, { scale: 0.4 }] },
        to: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] },
      },
      animationDuration: 420,
      animationDelay: 60 + index * 50,
      animationTimingFunction: OVERSHOOT,
      animationFillMode: "both",
    };
  },

  /** The map pin drops into place. */
  pinDrop(reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        "0%": { opacity: 0, transform: [{ translateY: -40 }] },
        "60%": { opacity: 1 },
        "100%": { opacity: 1, transform: [{ translateY: 0 }] },
      },
      animationDuration: 500,
      animationTimingFunction: OVERSHOOT,
      animationFillMode: "both",
    };
  },

  /** A queue or visit ticket pops in when issued. */
  ticketPop(reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { opacity: 0, transform: [{ scale: 0.92 }] },
        to: { opacity: 1, transform: [{ scale: 1 }] },
      },
      animationDuration: 350,
      animationTimingFunction: EASE_OUT,
      animationFillMode: "both",
    };
  },

  /** One letter of the splash wordmark. Blur is not animatable here, so it rises and fades. */
  splashLetter(index: number, reduced: boolean): Anim {
    if (reduced) return fade();
    return {
      animationName: {
        from: { opacity: 0, transform: [{ translateY: 40 }, { scale: 0.9 }] },
        to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
      },
      animationDuration: 700,
      animationDelay: 250 + index * 90,
      animationTimingFunction: EASE_OUT,
      animationFillMode: "both",
    };
  },

  /** Rise into place after a delay (the splash's lower half, the sign-in words). */
  rise(delay: number, reduced: boolean): Anim {
    if (reduced) return fade(delay);
    return {
      animationName: {
        from: { opacity: 0, transform: [{ translateY: 14 }] },
        to: { opacity: 1, transform: [{ translateY: 0 }] },
      },
      animationDuration: 600,
      animationDelay: delay,
      animationTimingFunction: EASE_OUT,
      animationFillMode: "both",
    };
  },

  /** The SOS button's expanding ring. Two run, 0.9s apart. Still under reduce motion. */
  sosPulse(delay: number, reduced: boolean): Anim {
    if (reduced) return STILL;
    return {
      animationName: {
        from: { opacity: 0.55, transform: [{ scale: 1 }] },
        to: { opacity: 0, transform: [{ scale: 1.75 }] },
      },
      animationDuration: 1800,
      animationDelay: delay,
      animationIterationCount: "infinite",
      animationTimingFunction: "ease-out",
    };
  },

  /** The Now card's floating pill drawings. Still under reduce motion. */
  bob(duration: number, delay: number, reduced: boolean): Anim {
    if (reduced) return STILL;
    return {
      animationName: {
        "0%": { transform: [{ translateY: 0 }] },
        "50%": { transform: [{ translateY: -5 }] },
        "100%": { transform: [{ translateY: 0 }] },
      },
      animationDuration: duration,
      animationDelay: delay,
      animationIterationCount: "infinite",
      animationTimingFunction: "ease-in-out",
    };
  },
} as const;

/** Transitions: the property eases when a style value changes. */
export const transition = {
  /** Pressables shrink to 0.96 while held. */
  press(reduced: boolean): Trans {
    return {
      transitionProperty: "transform",
      transitionDuration: reduced ? 0 : 160,
      transitionTimingFunction: "ease-out",
    };
  },
  /** The health card turns over. */
  cardFlip(reduced: boolean): Trans {
    return {
      transitionProperty: reduced ? "opacity" : "transform",
      transitionDuration: reduced ? FADE_MS : 800,
      transitionTimingFunction: cubicBezier(0.34, 1.3, 0.64, 1),
    };
  },
  /** Colour and fill changes on chips, segments and tiles. */
  colour(reduced: boolean): Trans {
    return {
      transitionProperty: ["backgroundColor", "borderColor", "opacity"],
      transitionDuration: reduced ? 0 : 200,
      transitionTimingFunction: "ease-out",
    };
  },
} as const;

/** Rings and progress bars fill over 800ms (driven with `withTiming` on the SVG stroke). */
export function ringFillMs(reduced: boolean): number {
  return reduced ? 0 : 800;
}
