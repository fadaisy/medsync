/**
 * The new-admin guide (ADR 0522): where a walkthrough's spotlight goes, where its words sit, and the curved arrow
 * from the words to the target's edge. Pure: rectangles in, numbers and SVG path data out. No DOM, so the maths is
 * tested on its own; the provider measures the page and passes the numbers in.
 */

/** A box on the screen, as `getBoundingClientRect` gives it. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The spotlight: its centre, its size, the overlay's size, and whether it is a circle. */
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The overlay's width and height. */
  W: number;
  H: number;
  round: boolean;
}

export type Side = "right" | "left" | "below" | "above" | "card" | "mid";

export interface Arrow {
  /** The quadratic curve from the words to the target's edge. */
  d: string;
  /** The arrowhead, two short strokes meeting on the target. */
  head: string;
}

export interface Placement {
  side: Side;
  /** The words' top-left corner, in overlay pixels (0, 0 for `mid`, which CSS centres). */
  x: number;
  y: number;
  arrow: Arrow | null;
}

/** A target this small or smaller (an icon button) gets a circle; anything bigger is hugged by its own shape. */
export const ICON_MAX = 56;
/** The words' box: 400 wide, about 250 tall, never wider than the screen less 16 a side. */
export const TEXT_W = 400;
export const TEXT_H = 250;
/** Room left between the spotlight and the words for the arrow. */
export const GAP = 64;

/** The spotlight round a target: a circle only round an icon-sized one, otherwise its shape plus a small margin. */
export function spotFor(r: Rect, W: number, H: number): Spot {
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const round = r.width <= ICON_MAX && r.height <= ICON_MAX;
  if (round) {
    const s = Math.max(r.width, r.height) + 20;
    return { x, y, w: s, h: s, W, H, round };
  }
  const w = Math.min(W - 16, r.width + 16);
  const h = Math.min(H * 0.7, r.height + 16);
  // A target taller than the cap (a whole panel) is lit from its top, where it starts, not cut through its middle.
  const top = h < r.height + 16 ? Math.max(8, r.top - 8) : r.top - 8;
  return { x, y: top + h / 2, w, h, W, H, round };
}

/** The words' width on a screen this wide. */
export const textWidth = (W: number) => Math.max(200, Math.min(TEXT_W, W - 32));

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A gentle curve from `a0` (beside the words) to `a1` (the target's edge), bowed to one side, with the arrowhead on
 * the target. The control point sits off the midpoint by 30% of the run, so the line never crosses the words.
 */
export function arrowPath(a0: readonly [number, number], a1: readonly [number, number]): Arrow {
  const dx = a1[0] - a0[0];
  const dy = a1[1] - a0[1];
  const cx = (a0[0] + a1[0]) / 2 - dy * 0.3;
  const cy = (a0[1] + a1[1]) / 2 + dx * 0.3;
  const ang = Math.atan2(a1[1] - cy, a1[0] - cx);
  const L = 13;
  const spread = 0.5;
  const h1 = [a1[0] - L * Math.cos(ang - spread), a1[1] - L * Math.sin(ang - spread)];
  const h2 = [a1[0] - L * Math.cos(ang + spread), a1[1] - L * Math.sin(ang + spread)];
  return {
    d: `M${r1(a0[0])} ${r1(a0[1])} Q${r1(cx)} ${r1(cy)} ${r1(a1[0])} ${r1(a1[1])}`,
    head: `M${r1(h1[0]!)} ${r1(h1[1]!)} L${r1(a1[0])} ${r1(a1[1])} L${r1(h2[0]!)} ${r1(h2[1]!)}`,
  };
}

/**
 * Where the words go: beside the spotlight (right, then left), below it, or above it, whichever has room, with an
 * arrow to the target's nearest edge. With no room anywhere they become a dark card in the corner away from the
 * target, with no arrow. With no spotlight (the target is not on the page) they sit in the middle.
 */
export function placeText(sp: Spot | null, tw: number = TEXT_W, th: number = TEXT_H): Placement {
  if (!sp) return { side: "mid", x: 0, y: 0, arrow: null };
  const left = sp.x - sp.w / 2;
  const right = sp.x + sp.w / 2;
  const top = sp.y - sp.h / 2;
  const bottom = sp.y + sp.h / 2;
  const clampY = (y: number) => Math.max(20, Math.min(y, sp.H - th - 20));
  const clampX = (x: number) => Math.max(20, Math.min(x, sp.W - tw - 20));
  let side: Side;
  let tx: number;
  let ty: number;
  let a0: [number, number];
  let a1: [number, number];
  if (sp.W - right >= tw + GAP + 40) {
    side = "right";
    tx = right + GAP + 40;
    ty = clampY(sp.y - 70);
    a0 = [tx - 14, ty + 18];
    a1 = [right + 10, sp.y];
  } else if (left >= tw + GAP + 40) {
    side = "left";
    tx = left - GAP - 40 - tw;
    ty = clampY(sp.y - 70);
    a0 = [tx + tw + 14, ty + 18];
    a1 = [left - 10, sp.y];
  } else if (sp.H - bottom >= th + 40) {
    side = "below";
    tx = clampX(sp.x - tw / 2);
    ty = bottom + 72;
    a0 = [tx + 24, ty - 12];
    a1 = [sp.x, bottom + 10];
  } else if (top >= th + 40) {
    side = "above";
    tx = clampX(sp.x - tw / 2);
    ty = top - th - 56;
    a0 = [tx + 24, top - 52];
    a1 = [sp.x, top - 10];
  } else {
    // No room beside, below or above: a card in the half of the screen the target is not in.
    return {
      side: "card",
      x: clampX(sp.W - tw - 24),
      y: sp.y > sp.H / 2 ? 24 : Math.max(20, sp.H - th - 24),
      arrow: null,
    };
  }
  return { side, x: tx, y: ty, arrow: arrowPath(a0, a1) };
}

/** The spotlight's box, as CSS pixel values (left, top, width, height) and its corner radius. */
export function spotBox(sp: Spot): {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: string;
} {
  return {
    left: sp.x - sp.w / 2,
    top: sp.y - sp.h / 2,
    width: sp.w,
    height: sp.h,
    radius: sp.round ? "50%" : "14px",
  };
}

/**
 * The demo cursor's point on a target: a little in from the left of a wide one (where its label starts), the middle
 * of a narrow one, and no lower than 28px from its top.
 */
export function cursorPoint(r: Rect): { x: number; y: number } {
  return {
    x: r.width > 220 ? r.left + Math.min(60, r.width / 3) : r.left + r.width / 2,
    y: r.top + Math.min(r.height / 2, 28),
  };
}

/** The motion every guide move uses (DESIGN-medsync.md): 400 ms on the system curve, none under reduced motion. */
export const GUIDE_MOTION = { ms: 400, ease: "cubic-bezier(0.16, 1, 0.3, 1)" } as const;

/** The transition for a moving property, or none when the person asked for reduced motion. */
export function transitionFor(props: readonly string[], reduced: boolean): string {
  if (reduced) return "none";
  return props.map((p) => `${p} ${GUIDE_MOTION.ms}ms ${GUIDE_MOTION.ease}`).join(", ");
}
