import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Press } from "@/components/tide/press";
import { Button } from "@/components/tide/primitives";
import { clearOf } from "@/components/tide/screen";
import { TetherWordmark } from "@/components/tide/v2-shell";
import { WelcomePreview } from "@/features/auth/welcome-previews";
import { HONEST } from "@/features/visits/parts";
import { BRAND } from "@/lib/brand";
import { fade, motion, transition } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tSpace, tType } from "@/theme/tide";

/**
 * The splash and the welcome (owner's approved onboarding prototype, 18 Nov 2026).
 *
 * One idea: the name. A tether is a line. One line draws across the screen, the letters of the wordmark
 * rise out of it, and what is left under the word is the loading line, which moves on with the app's own
 * status words. When the wait is over and nobody is signed in, the wordmark moves to its corner and the
 * welcome arrives around it: three slides, each shown with a still drawing of a real screen.
 *
 * No percent and no countdown: the app does not know how long the wait is. Under reduce motion every
 * state is the same and each change is a plain fade (law L13).
 */

/** The loading line's words, in the order the wait reaches them. */
export const SPLASH_STATUS = [
  "Checking your records",
  "Syncing your readings and medicines",
  "Ready · works offline too",
] as const;

/**
 * The three slides. Headlines are draft wording until the Clinical Safety Officer signs them; the first
 * two carry the wording signed on 19 Nov 2026.
 */
export const SLIDES = [
  {
    name: "Book from anywhere",
    lead: "Book from anywhere.",
    rest: "Pick a clinic and a day that suits you.",
  },
  {
    name: "Your ticket, on your phone",
    lead: "Your ticket, on your phone.",
    rest: "Show it at the desk, then see where you are in your visit.",
  },
  {
    name: "Book for your family",
    lead: "Book for your family.",
    rest: "A parent or a child, in the same app.",
  },
] as const;

export type SlideIndex = 0 | 1 | 2;
const INDEXES: readonly SlideIndex[] = [0, 1, 2];

const WORD_SIZE = 56;
/** The row the letters rise into: it clips them until they are up. */
const WORD_BOX = 54;
/** The wordmark's size in its corner, as on Sign in and the web. */
const WORD_SMALL = 22;
const SCALE = WORD_SMALL / WORD_SIZE;
/** Where the top of the wordmark sits on the splash, as a share of the screen's height (283 of 844). */
const WORD_AT = 0.335;
/** The loading line sits this far under the top of the wordmark. */
const LINE_UNDER = 59;
const LINE_H = 3;
const BAR_H = 48;
/** How much of the line is filled at each of the three status lines. */
const FILLS = [0.34, 0.67, 1] as const;
/** A sideways move shorter than this is a tap, not a swipe. */
const SWIPE_MIN = 24;

export function SplashView({
  line,
  status,
  tagline,
  welcome,
  initialSlide = 0,
  help,
  onSignIn,
  onGetStarted,
}: {
  /** Which of the three status lines the wait has reached. */
  line: 0 | 1 | 2;
  /** That line's words. */
  status: string;
  tagline: string;
  /** The wait is over and nobody is signed in: the wordmark moves to its corner and the welcome arrives. */
  welcome: boolean;
  initialSlide?: SlideIndex;
  /** The red Help (law L6). The route draws it, so the Help crawl can see that it does. */
  help: ReactNode;
  onSignIn: () => void;
  onGetStarted: () => void;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The wordmark's own width, and how full the line was when it was measured: where the drawn line
  // comes to rest. Read once, so the drawing never starts again.
  const [word, setWord] = useState<{ w: number; fill: number } | null>(null);

  const barTop = insets.top + 6;
  const wordTop = Math.round(height * WORD_AT);
  const w = word?.w ?? 170;
  const lineLeft = (width - w) / 2;
  const lineTop = wordTop + LINE_UNDER;
  // Full motion: the one wordmark travels to its corner. Reduce motion: it fades where it stands and the
  // corner's own wordmark fades in.
  const travels = welcome && !reduced;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />

      {welcome ? (
        <WelcomeSlides top={barTop + BAR_H} initial={initialSlide} onGetStarted={onGetStarted} />
      ) : null}

      {/* The splash's words and its line. They fade out as the welcome arrives. */}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden={welcome}
        importantForAccessibility={welcome ? "no-hide-descendants" : "auto"}
        style={[
          StyleSheet.absoluteFill,
          { opacity: welcome ? 0 : 1 },
          transition.fade(150, reduced),
        ]}
      >
        {word ? (
          <>
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: lineLeft,
                  top: lineTop,
                  width: w,
                  height: LINE_H,
                  borderRadius: 2,
                  backgroundColor: t.lineStrong,
                },
                motion.appear(1100, reduced),
              ]}
            />
            {/* The filled part. It waits under the drawn line, then is all that is left of it. */}
            <Animated.View
              accessibilityRole="progressbar"
              accessibilityLabel={status}
              style={[
                { position: "absolute", left: lineLeft, top: lineTop, width: w, height: LINE_H },
                motion.appear(700, reduced),
              ]}
            >
              <Animated.View
                style={[
                  { width: w * FILLS[line], height: LINE_H, backgroundColor: t.ink },
                  transition.grow(reduced),
                ]}
              />
            </Animated.View>
            {reduced ? null : (
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: 0,
                    top: lineTop,
                    width,
                    height: LINE_H,
                    backgroundColor: t.ink,
                    transformOrigin: "0% 50%",
                  },
                  motion.threadDraw(width, { left: lineLeft, width: w * word.fill }, reduced),
                ]}
              />
            )}
          </>
        ) : null}
        <Animated.View
          style={[
            {
              position: "absolute",
              left: tSpace[5],
              right: tSpace[5],
              top: wordTop + 89,
              alignItems: "center",
              gap: tSpace[6],
            },
            motion.appear(1100, reduced),
          ]}
        >
          <Text style={[tType.body, { lineHeight: 24, textAlign: "center", color: t.ink2 }]}>
            {tagline}
          </Text>
          <Animated.Text
            key={line}
            accessibilityLiveRegion="polite"
            style={[
              tType.bodyS,
              { fontFamily: tFont.semibold, lineHeight: 20, textAlign: "center", color: t.ink2 },
              fade(),
            ]}
          >
            {status}
          </Animated.Text>
        </Animated.View>
      </Animated.View>

      {/* The wordmark: one object, large in the middle while the app opens, then small in its corner. */}
      <Animated.View
        pointerEvents="none"
        accessible
        accessibilityRole="header"
        accessibilityLabel={welcome ? BRAND : `${BRAND}. ${tagline}`}
        accessibilityElementsHidden={welcome && reduced}
        importantForAccessibility={welcome && reduced ? "no-hide-descendants" : "auto"}
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            top: wordTop,
            alignItems: "center",
            transformOrigin: "50% 0%",
            opacity: welcome && reduced ? 0 : 1,
            transform: travels
              ? [
                  { translateX: tSpace[5] + (w * SCALE) / 2 - width / 2 },
                  { translateY: barTop + (BAR_H - WORD_BOX * SCALE) / 2 - wordTop },
                  { scale: SCALE },
                ]
              : [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
          },
          transition.swap(reduced),
        ]}
      >
        <View
          onLayout={(e) => {
            const measured = e.nativeEvent.layout.width;
            if (!word && measured > 0) setWord({ w: measured, fill: FILLS[line] });
          }}
          style={{ flexDirection: "row", height: WORD_BOX, overflow: "hidden" }}
        >
          {BRAND.split("").map((ch, i) => (
            <Animated.View
              key={i}
              // The "e" tucks under the arm of the "T", as the web's wordmark kerns it.
              style={[motion.wordRise(i, reduced), i === 1 ? { marginLeft: -3.7 } : null]}
            >
              <Text
                style={{
                  fontFamily: tFont.bold,
                  fontSize: WORD_SIZE,
                  lineHeight: 64,
                  letterSpacing: -1.68,
                  color: t.ink,
                }}
              >
                {ch}
              </Text>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      {/* The header row: the wordmark's corner on the left, Sign in once the welcome is here, and Help. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: tSpace[5],
          right: tSpace[5],
          top: barTop,
          height: BAR_H,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View pointerEvents="none">
          {welcome && reduced ? (
            <Animated.View style={fade()}>
              <TetherWordmark size={WORD_SMALL} />
            </Animated.View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1] }}>
          {welcome ? (
            <Animated.View style={motion.appear(120, reduced)}>
              <Press
                onPress={onSignIn}
                accessibilityLabel="Sign in"
                style={{ height: BAR_H, paddingHorizontal: tSpace[3.5], justifyContent: "center" }}
              >
                <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Sign in</Text>
              </Press>
            </Animated.View>
          ) : null}
          {help}
        </View>
      </View>
    </View>
  );
}

/** The welcome under the header row: the drawing, the headline, the three bars and the one way in. */
function WelcomeSlides({
  top,
  initial,
  onGetStarted,
}: {
  top: number;
  initial: SlideIndex;
  onGetStarted: () => void;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [slide, setSlide] = useState<SlideIndex>(initial);
  // Where a touch on the drawing began, and whether it turned into a swipe.
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);

  /** A layer that is on shows; the others wait a little to the side they would arrive from. */
  const layer = (i: SlideIndex, shift: number) => ({
    opacity: i === slide ? 1 : 0,
    transform: [{ translateX: i === slide || reduced ? 0 : i < slide ? -shift : shift }],
  });

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          paddingTop: top + tSpace[3.5],
          paddingBottom: Math.max(insets.bottom, tSpace[4]) + tSpace[2],
        },
      ]}
    >
      <Animated.View style={[{ flex: 1 }, motion.rise(120, reduced)]}>
        {/* Decoration for the headline: hidden from screen readers, and nothing in it can be pressed. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
        >
          {INDEXES.map((i) => (
            <Animated.View
              key={i}
              style={[StyleSheet.absoluteFill, layer(i, 28), transition.swap(reduced)]}
            >
              <View
                style={{
                  marginTop: tSpace[3.5],
                  marginLeft: 28,
                  marginRight: tSpace[6],
                  transform: [{ rotate: "-3deg" }],
                  transformOrigin: "50% 0%",
                }}
              >
                <WelcomePreview index={i} />
              </View>
            </Animated.View>
          ))}
          {/* The drawing fades into the page at its lower edge. */}
          <LinearGradient
            colors={[clearOf(t.bg), t.bg]}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "46%" }}
          />
        </View>
        {/* Tap for the next slide; a sideways swipe goes either way and stops at the ends. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Next: ${SLIDES[(slide + 1) % 3].name}`}
          style={StyleSheet.absoluteFill}
          onPressIn={(e) => {
            startX.current = e.nativeEvent.pageX;
            swiped.current = false;
          }}
          onPressOut={(e) => {
            if (startX.current === null) return;
            const dx = e.nativeEvent.pageX - startX.current;
            startX.current = null;
            if (Math.abs(dx) < SWIPE_MIN) return;
            swiped.current = true;
            const to = Math.max(0, Math.min(2, slide + (dx < 0 ? 1 : -1))) as SlideIndex;
            if (to !== slide) setSlide(to);
          }}
          onPress={() => {
            if (swiped.current) {
              swiped.current = false;
              return;
            }
            setSlide(((slide + 1) % 3) as SlideIndex);
          }}
        />
      </Animated.View>

      <Animated.View
        style={[
          { minHeight: 102, marginTop: tSpace[4], marginHorizontal: tSpace[5] },
          motion.rise(160, reduced),
        ]}
      >
        {INDEXES.map((i) => (
          <Animated.Text
            key={i}
            accessibilityRole="header"
            accessibilityElementsHidden={i !== slide}
            importantForAccessibility={i === slide ? "auto" : "no-hide-descendants"}
            style={[
              tType.display,
              {
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                fontSize: 30,
                lineHeight: 34,
                letterSpacing: -0.9,
                textAlign: "center",
                color: t.ink3,
              },
              layer(i, 12),
              transition.swap(reduced),
            ]}
          >
            <Text style={{ fontFamily: tFont.semibold, color: t.ink }}>{SLIDES[i].lead}</Text>{" "}
            {SLIDES[i].rest}
          </Animated.Text>
        ))}
      </Animated.View>

      <Animated.View
        style={[
          { height: 48, marginTop: tSpace[2], flexDirection: "row", justifyContent: "center" },
          motion.rise(200, reduced),
        ]}
      >
        {INDEXES.map((i) => (
          <Press
            key={i}
            onPress={() => setSlide(i)}
            accessibilityLabel={`Slide ${i + 1} of 3: ${SLIDES[i].name}`}
            accessibilityState={{ selected: i === slide }}
            haptic={false}
            style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Animated.View
              style={[
                {
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: i === slide ? t.ink : t.lineStrong,
                },
                transition.colour(reduced),
              ]}
            />
          </Press>
        ))}
      </Animated.View>

      <Animated.View
        style={[
          { marginTop: tSpace[1], paddingHorizontal: tSpace[5], gap: tSpace[3.5] },
          motion.rise(240, reduced),
        ]}
      >
        <Button
          label="Get started"
          variant="accent"
          iconRight="arrowRight"
          onPress={onGetStarted}
        />
        <Text style={[tType.bodyS, { lineHeight: 17, textAlign: "center", color: t.ink2 }]}>
          {HONEST}
        </Text>
      </Animated.View>
    </View>
  );
}
