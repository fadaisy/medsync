import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Rect } from "react-native-svg";

import { Press } from "@/components/tide/press";
import { CARD_ART } from "@/data/card-art";
import { transition } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** Bank-card proportion (ISO/IEC 7810 ID-1). */
export const CARD_RATIO = 1.586;

/**
 * The QR on the card. It encodes NOTHING: a fixed placeholder pattern (three
 * finder squares and a seeded fill) until the owner approves the signed,
 * short-lived token design (PRD Q2). The patient code alone is not an
 * authenticator, so it is deliberately not put in a scannable code.
 */
const QR_N = 21;
const QR_CELLS: readonly (readonly [number, number])[] = (() => {
  const finder = (x: number, y: number) => {
    const cx = x < 7 ? 0 : QR_N - 7;
    const cy = y < 7 ? 0 : QR_N - 7;
    const dx = x - cx;
    const dy = y - cy;
    if (dx < 0 || dx > 6 || dy < 0 || dy > 6) return null;
    return (
      dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
    );
  };
  const cells: [number, number][] = [];
  let seed = 7;
  for (let y = 0; y < QR_N; y++)
    for (let x = 0; x < QR_N; x++) {
      const inFinder = (x < 8 && y < 8) || (x > QR_N - 9 && y < 8) || (x < 8 && y > QR_N - 9);
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const on = inFinder ? finder(x, y) === true : seed % 5 < 2;
      if (on) cells.push([x, y]);
    }
  return cells;
})();

function PlaceholderQr({ size }: { size: number }) {
  const t = useTide();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Health card code, not active yet"
      style={{ width: size, height: size, padding: 3, borderRadius: 8, backgroundColor: t.onBand }}
    >
      <Svg width={size - 6} height={size - 6} viewBox={`-1 -1 ${QR_N + 2} ${QR_N + 2}`}>
        {QR_CELLS.map(([x, y]) => (
          <Rect key={`${x}.${y}`} x={x} y={y} width={1.02} height={1.02} fill={t.band} />
        ))}
      </Svg>
    </View>
  );
}

export interface HealthCardData {
  holder: string;
  /** Spaced code, or "Given at your first visit". */
  number: string;
  facility: string;
  doctor: string;
  /** Null when the patient keeps them off the card (the default, PRD Q6). */
  conditions: string | null;
  allergies: string;
  bloodGroup: string;
  contact: string;
}

/**
 * The health card (§8.6): a bank-card-sized navy front and a light back,
 * turned over by a tap (`transition.cardFlip`, backface hidden). Under reduce
 * motion it cross-fades instead of turning. Everything it shows comes in as
 * props, so the screen can draw it from the phone's cache with no network.
 */
export function HealthCard({ data }: { data: HealthCardData }) {
  const t = useTide();
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const label = (s: string) => (
    <Text
      style={[
        tType.micro,
        { fontSize: 9, letterSpacing: 1.1, textTransform: "uppercase", color: t.onBand2 },
      ]}
    >
      {s}
    </Text>
  );
  const face = {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: tRadius.cardLg,
    overflow: "hidden" as const,
    backfaceVisibility: "hidden" as const,
  };
  const row = (k: string, v: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tSpace[2.5] }}>
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>{k}</Text>
      <Text
        style={[
          tType.caption,
          { fontFamily: tFont.bold, color: t.ink, textAlign: "right", flexShrink: 1 },
        ]}
      >
        {v}
      </Text>
    </View>
  );

  const front = (
    <Animated.View
      accessibilityElementsHidden={flipped}
      importantForAccessibility={flipped ? "no-hide-descendants" : "auto"}
      style={[
        face,
        { backgroundColor: t.band, boxShadow: t.shadow.float },
        reduced ? { opacity: flipped ? 0 : 1, ...transition.cardFlip(true) } : null,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 350 222"
        preserveAspectRatio="none"
        style={{ position: "absolute" }}
      >
        <Circle cx={330} cy={-10} r={120} fill={t.onBand} fillOpacity={0.05} />
        <Circle cx={300} cy={230} r={90} fill={t.accent} fillOpacity={0.12} />
      </Svg>
      <View
        style={{
          flex: 1,
          paddingVertical: tSpace[4],
          paddingHorizontal: tSpace[4.5],
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tSpace[2] }}>
          <View>
            <Text style={{ fontFamily: tFont.extrabold, fontSize: 17, color: t.onBand }}>
              Med<Text style={{ color: t.accent }}>Sync</Text>
            </Text>
            {label("Health card")}
          </View>
          <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
            <Text
              numberOfLines={1}
              style={[tType.micro, { fontFamily: tFont.semibold, color: t.onBand }]}
            >
              {data.facility}
            </Text>
            <Text style={[tType.micro, { fontSize: 10, color: t.onBand2 }]}>Home facility</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
          <View
            style={{
              width: 40,
              height: 30,
              borderRadius: 7,
              backgroundColor: CARD_ART.chip,
              borderWidth: 1,
              borderColor: CARD_ART.chipLine,
              justifyContent: "center",
            }}
          >
            <View
              style={{
                height: 14,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: CARD_ART.chipLine,
              }}
            />
          </View>
          <Text
            accessibilityLabel={`Number ${data.number}`}
            adjustsFontSizeToFit
            numberOfLines={1}
            style={
              /\d/.test(data.number)
                ? {
                    flex: 1,
                    fontFamily: tFont.monoSemibold,
                    fontSize: 20,
                    letterSpacing: 2.6,
                    color: t.onBand,
                  }
                : // No number yet: the sentence in plain type, not the code face.
                  { flex: 1, fontFamily: tFont.semibold, fontSize: 15, color: t.onBand2 }
            }
          >
            {data.number}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: tSpace[2.5],
          }}
        >
          <View style={{ flex: 1, gap: tSpace[1.5] }}>
            <View>
              {label("Card holder")}
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: tFont.bold,
                  fontSize: 15,
                  letterSpacing: 0.3,
                  color: t.onBand,
                }}
              >
                {data.holder.toUpperCase()}
              </Text>
            </View>
            <View>
              {label("Primary doctor")}
              <Text
                numberOfLines={1}
                style={[tType.bodyS, { fontFamily: tFont.semibold, color: t.onBandAccent }]}
              >
                {data.doctor}
              </Text>
            </View>
          </View>
          <PlaceholderQr size={58} />
        </View>
      </View>
    </Animated.View>
  );

  const back = (
    <Animated.View
      accessibilityElementsHidden={!flipped}
      importantForAccessibility={flipped ? "auto" : "no-hide-descendants"}
      style={[
        face,
        {
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
          boxShadow: t.shadow.float,
        },
        reduced
          ? { opacity: flipped ? 1 : 0, ...transition.cardFlip(true) }
          : { transform: [{ rotateY: "180deg" }] },
      ]}
    >
      <View style={{ height: 34, marginTop: tSpace[4], backgroundColor: t.band }} />
      <View
        style={{
          flexDirection: "row",
          gap: tSpace[3],
          paddingHorizontal: tSpace[4],
          paddingTop: tSpace[3],
        }}
      >
        <View style={{ flex: 1, gap: tSpace[1.5] }}>
          <Text
            style={[
              tType.micro,
              {
                fontFamily: tFont.bold,
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: t.accentText,
              },
            ]}
          >
            In an emergency
          </Text>
          {row("Conditions", data.conditions ?? "Hidden")}
          {row("Allergies", data.allergies)}
          {row("Blood group", data.bloodGroup)}
          {row("Contact", data.contact)}
        </View>
        <PlaceholderQr size={84} />
      </View>
      <Text
        numberOfLines={1}
        style={[
          tType.micro,
          {
            fontSize: 10,
            color: t.ink3,
            position: "absolute",
            left: tSpace[4],
            right: tSpace[4],
            bottom: tSpace[2.5],
          },
        ]}
      >
        If found, return to {data.facility}
      </Text>
    </Animated.View>
  );

  return (
    <Press
      onPress={() => setFlipped((f) => !f)}
      accessibilityLabel={
        flipped ? "Health card, back. Tap to flip" : "Health card, front. Tap to flip"
      }
      accessibilityState={{ expanded: flipped }}
      haptic
      style={{ width: "100%", aspectRatio: CARD_RATIO }}
    >
      <Animated.View
        style={[
          { flex: 1 },
          reduced
            ? null
            : {
                transform: [{ perspective: 1100 }, { rotateY: flipped ? "180deg" : "0deg" }],
                ...transition.cardFlip(false),
              },
        ]}
      >
        {front}
        {back}
      </Animated.View>
    </Press>
  );
}
