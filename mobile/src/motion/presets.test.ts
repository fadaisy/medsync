import { fade, motion, transition } from "@/motion/presets";

type Anim = ReturnType<typeof fade> | { animationName: "none" };

const all = (reduced: boolean): [string, Anim][] => [
  ["pageIn", motion.pageIn(reduced)],
  ["staggerUp", motion.staggerUp(3, reduced)],
  ["cascadeIn", motion.cascadeIn(2, reduced)],
  ["navRise", motion.navRise(reduced)],
  ["tabPop", motion.tabPop(reduced)],
  ["plusIn", motion.plusIn(reduced)],
  ["sheetUp", motion.sheetUp(reduced)],
  ["scrimIn", motion.scrimIn(reduced)],
  ["fanRise", motion.fanRise(1, 116, 93, reduced)],
  ["pinDrop", motion.pinDrop(reduced)],
  ["ticketPop", motion.ticketPop(reduced)],
  ["splashLetter", motion.splashLetter(4, reduced)],
  ["rise", motion.rise(200, reduced)],
  ["sosPulse", motion.sosPulse(900, reduced)],
  ["bob", motion.bob(3000, 0, reduced)],
];

/** Law L13: with "reduce motion" on, every preset is an opacity change or nothing. */
describe("reduced motion", () => {
  it.each(all(true))("%s only fades", (_name, a) => {
    if (a.animationName === "none") return;
    const frames = Object.values(a.animationName as Record<string, Record<string, unknown>>);
    for (const frame of frames) expect(Object.keys(frame)).toEqual(["opacity"]);
    expect((a as { animationIterationCount?: unknown }).animationIterationCount).not.toBe(
      "infinite",
    );
  });

  it("loops stop", () => {
    expect(motion.sosPulse(0, true).animationName).toBe("none");
    expect(motion.bob(3000, 0, true).animationName).toBe("none");
  });

  it("transitions do not move", () => {
    expect(transition.press(true).transitionDuration).toBe(0);
    expect(transition.cardFlip(true).transitionProperty).toBe("opacity");
  });

  it("full motion moves", () => {
    const frames = Object.values(
      motion.pageIn(false).animationName as Record<string, Record<string, unknown>>,
    );
    expect(frames.some((f) => "transform" in f)).toBe(true);
  });
});
