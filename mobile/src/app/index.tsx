import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Button, Icon, Press, Screen } from "@/components/tide";
import { useSplashSequence } from "@/hooks/use-splash-sequence";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/session";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const WORD = "MedSync";
/** Letters before this index are white, the rest lagoon: "Med" + "Sync". */
const SPLIT = 3;
/** Where the wordmark sits, as a share of the screen height (the board's 340 of 844). */
const WORDMARK_AT = 0.4;

const STATUS = [
  "Checking your records",
  "Syncing your readings and medicines",
  "Ready · works offline too",
] as const;
const BAR = ["14%", "58%", "100%"] as const;

/** `app_open` is once per cold start, not once per visit to this screen. */
let appOpenSent = false;

/**
 * Splash (Tide v1 F-01, board TSplash/DSplash).
 *
 * The wordmark rises letter by letter on navy with a soft lagoon glow while
 * the stored session resolves. The session is what the wait is for: a
 * signed-in patient leaves for the app as soon as it resolves (the root
 * gate drops this screen), so Sign in and Create an account appear only once
 * `useSplashSequence` says the wait is over and nobody is signed in.
 */
export default function SplashScreen() {
  const t = useTide();
  const reduced = useReducedMotion();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { status } = useSession();
  const { stage } = useSplashSequence(status !== "loading");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!appOpenSent) {
      appOpenSent = true;
      track("app_open");
    }
    const id = setTimeout(() => setSyncing(true), 1500);
    return () => clearTimeout(id);
  }, []);

  const ready = stage === "ready";
  const line = ready ? 2 : syncing ? 1 : 0;

  return (
    <Screen
      background={t.band}
      scroll={false}
      stagger={false}
      helpSource="splash"
      topBand={<Glow color={t.accent} at={height * WORDMARK_AT} />}
      contentStyle={{ justifyContent: "space-between", paddingBottom: tSpace[10] }}
    >
      <View
        style={{
          alignItems: "center",
          gap: 14,
          paddingTop: Math.max(0, height * WORDMARK_AT - 120),
        }}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${WORD}. Your care, in sync.`}
      >
        {/* Light glyphs on navy in both themes; mounted after Screen's own, so it wins. */}
        <StatusBar style="light" />
        <View style={{ flexDirection: "row", overflow: "hidden", paddingHorizontal: 6 }}>
          {WORD.split("").map((ch, i) => (
            <Animated.View key={i} style={motion.splashLetter(i, reduced)}>
              <Text
                style={{
                  fontFamily: tFont.extrabold,
                  fontSize: 56,
                  lineHeight: 64,
                  letterSpacing: -2,
                  color: i < SPLIT ? t.onBand : t.accent,
                }}
              >
                {ch}
              </Text>
            </Animated.View>
          ))}
        </View>
        <Animated.View style={motion.rise(1050, reduced)}>
          <Text style={[tType.bodyM, { fontSize: 17, color: t.onBand2 }]}>Your care, in sync.</Text>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          { alignItems: "center", gap: 14, paddingHorizontal: tSpace[5] },
          motion.rise(1100, reduced),
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[2],
            minHeight: 34,
            paddingHorizontal: 14,
            borderRadius: tRadius.pill,
            backgroundColor: t.bandGlass,
          }}
        >
          <Icon name="building" size={15} color={t.onBand} />
          <Text style={[tType.caption, { fontSize: 13, color: t.onBand }]}>
            Made for Ugandan hospitals
          </Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={STATUS[line]}
          style={{
            alignSelf: "stretch",
            height: 4,
            borderRadius: 2,
            backgroundColor: t.bandGlass,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={{
              height: "100%",
              width: BAR[line],
              borderRadius: 2,
              backgroundColor: t.accent,
              transitionProperty: "width",
              transitionDuration: reduced ? 0 : 900,
              transitionTimingFunction: "ease-out",
            }}
          />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          style={[tType.caption, { fontFamily: tFont.medium, color: t.onBand2, opacity: 0.78 }]}
        >
          {STATUS[line]}
        </Text>
        {/* Reserved whether or not the actions show, so nothing jumps when they arrive. */}
        <View style={{ alignSelf: "stretch", minHeight: 52 + 14 + 44 }}>
          {ready && status !== "signedIn" ? (
            <Animated.View style={[{ gap: 14, alignItems: "center" }, motion.rise(0, reduced)]}>
              <Button
                label="Sign in"
                variant="accent"
                iconRight="arrowRight"
                onPress={() => router.push("/sign-in")}
                style={{ alignSelf: "stretch" }}
              />
              <Press
                onPress={() => router.push("/sign-up")}
                accessibilityRole="link"
                accessibilityLabel="New here? Create an account"
                haptic={false}
                style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: tSpace[2] }}
              >
                <Text style={[tType.labelS, { color: t.onBand }]}>
                  New here? <Text style={{ color: t.onBandAccent }}>Create an account</Text>
                </Text>
              </Press>
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </Screen>
  );
}

/** The soft lagoon glow behind the wordmark. Still: it marks the brand, not a state. */
function Glow({ color, at }: { color: string; at: number }) {
  const { width } = useWindowDimensions();
  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={at + 260}
      style={{ position: "absolute", left: 0, top: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="0.62" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={width / 2} cy={at} r={260} fill="url(#glow)" />
    </Svg>
  );
}
