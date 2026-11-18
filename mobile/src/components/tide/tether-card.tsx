/**
 * The one card on Me (owner, 18 Nov 2026): the membership card and the offline health card, folded into a single
 * card with two sides. Until now Me showed both, one above the other, with the same name and number on each.
 *
 * Front: who the holder is to Tether. The wordmark, the plan when it is known, the number large for the desk
 * to read, the name, the home hospital, age and sex.
 *
 * Back: the Medical ID, for whoever treats the holder or finds the phone (ADR 0414). The number again, the
 * allergies, the conditions only when the holder shows them, whether a next of kin is on file, who to call if
 * it is found, and the short-lived code where there is one. Everything on the back is what the health card's
 * back carried; nothing was dropped in the merge. There is no blood group: the record holds none, so the card
 * does not show an empty one.
 *
 * It draws from props alone, so the screen can show it from the phone's cache with no network. The plan and
 * the code need a connection: without them the card is the plain navy card, with no plan and no code, and
 * every other line as usual.
 *
 * Tap to turn, as the visit ticket does (ADR 0409): each face turns on its own, half a turn apart, so the face
 * turned away is hidden. Under Reduce Motion the faces cross-fade. "Turn over" is written on the card, so the
 * turn never rests on knowing to tap.
 */
import type { Tier } from "@/components/tide/v2";
import type { ReactNode } from "react";
import { useState } from "react";
import { MEMBERSHIP_COPY } from "@content/patient-app/membership";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { BRAND_V2 } from "@/components/tide/v2-shell";
import { EASE_OUT_FN } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const M = MEMBERSHIP_COPY;

/** Bank-card proportion (ISO/IEC 7810 ID-1). */
const RATIO = 1.586;

export interface TetherCardData {
  holder: string;
  /** Spaced code, or "Given at your first visit". */
  number: string;
  /** Null until the patient has a home facility. */
  facility: string | null;
  /** "34 years", from the date of birth; null when there is none. */
  age: string | null;
  /** "F" or "M"; null when not recorded. */
  sex: string | null;
  /** Null when the patient keeps them off the card (the default, PRD Q6). */
  conditions: string | null;
  /** The patient's own allergy list, "No known allergies", or "None listed". */
  allergies: string;
  /** "On file at Mulago" or "None given" (the number is encrypted, never on the phone); null: unknown. */
  nextOfKin: string | null;
  /** "If found, call Mulago on 0414 …", or return to the home facility when no number is set. */
  ifFound: string;
}

const TIER_NAME: Record<Tier, string> = {
  basic: M.tiers.basic,
  plus_family: M.tiers.plusFamily,
  plus_care: M.tiers.plusCare,
  family_care: M.tiers.familyCare,
};

/** A colour at about 12 %: the quiet chips on the card's own material. */
const soft = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}1F` : hex);

export function TetherCard({
  data,
  tier,
  qr,
}: {
  data: TetherCardData;
  /** The plan held; null while it is not known (loading, or no connection). */
  tier: Tier | null;
  /** The short-lived Medical ID code, drawn; null when there is none to show. */
  qr: ReactNode | null;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const turn = useSharedValue(0);
  const flip = () => {
    const next = !flipped;
    setFlipped(next);
    turn.value = withTiming(next ? 1 : 0, { duration: reduced ? 150 : 450, easing: EASE_OUT_FN });
  };
  const frontStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 - turn.value : 1,
    transform: [{ perspective: 1100 }, { rotateY: `${reduced ? 0 : turn.value * 180}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: reduced ? turn.value : 1,
    transform: [{ perspective: 1100 }, { rotateY: `${reduced ? 0 : turn.value * 180 + 180}deg` }],
  }));

  // The card's material follows the plan (M10: decorative, never a clinical state); navy until it is known.
  const material =
    tier === null
      ? { bg: t.band, fg: t.onBand }
      : {
          basic: { bg: t.tier.basic, fg: t.tier.onBasic },
          plus_family: { bg: t.tier.plusFamily, fg: t.tier.onTier },
          plus_care: { bg: t.tier.plusCare, fg: t.tier.onTier },
          family_care: { bg: t.tier.familyCare, fg: t.tier.onTier },
        }[tier];
  const fg = material.fg;
  const gold = tier === "family_care";
  const hasNumber = /\d/.test(data.number);
  const about = [data.age, data.sex].filter(Boolean).join(" · ");

  const face = {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: tRadius.panel,
    overflow: "hidden" as const,
    backfaceVisibility: "hidden" as const,
  };
  const small = (s: string, color: string) => (
    <Text
      style={[tType.micro, { fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", color }]}
    >
      {s}
    </Text>
  );
  const row = (k: string, v: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tSpace[2.5] }}>
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>{k}</Text>
      <Text
        numberOfLines={1}
        style={[
          tType.caption,
          { fontFamily: tFont.bold, color: t.ink, textAlign: "right", flexShrink: 1 },
        ]}
      >
        {v}
      </Text>
    </View>
  );
  /** "Turn over" and "Turn back", written on the card: the whole card takes the tap. */
  const turnHint = (label: string, color: string, bg: string) => (
    <View
      style={{
        height: 30,
        paddingHorizontal: tSpace[2.5],
        borderRadius: tRadius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[1],
        backgroundColor: bg,
      }}
    >
      <Icon name="replay" size={13} color={color} />
      <Text style={[tType.caption, { color }]}>{label}</Text>
    </View>
  );

  const front = (
    <Animated.View
      accessibilityElementsHidden={flipped}
      importantForAccessibility={flipped ? "no-hide-descendants" : "auto"}
      style={[face, { backgroundColor: material.bg, boxShadow: t.shadow.float }, frontStyle]}
    >
      {/* Two soft discs in the card's own ink, so the material has depth without a second colour. */}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 350 222"
        preserveAspectRatio="none"
        style={{ position: "absolute" }}
      >
        <Circle cx={330} cy={-10} r={120} fill={fg} fillOpacity={0.06} />
        <Circle cx={300} cy={236} r={92} fill={fg} fillOpacity={0.07} />
      </Svg>
      <View style={{ flex: 1, padding: tSpace[5], justifyContent: "space-between" }}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Text style={{ fontFamily: tFont.bold, fontSize: 20, letterSpacing: -0.6, color: fg }}>
            {BRAND_V2}
          </Text>
          {tier ? (
            <View
              style={[
                {
                  height: 28,
                  paddingHorizontal: tSpace[3],
                  borderRadius: tRadius.pill,
                  justifyContent: "center",
                },
                gold ? { borderWidth: 1, borderColor: t.tier.gold } : { backgroundColor: soft(fg) },
              ]}
            >
              <Text style={[tType.caption, { fontSize: 13, color: gold ? t.tier.gold : fg }]}>
                {TIER_NAME[tier]}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 2 }}>
          {small(M.card.member, fg)}
          <Text
            accessibilityLabel={`Number ${data.number}`}
            adjustsFontSizeToFit
            numberOfLines={1}
            style={
              hasNumber
                ? { fontFamily: tFont.monoSemibold, fontSize: 22, letterSpacing: 2.6, color: fg }
                : // No number yet: the sentence in plain type, not the code face.
                  { fontFamily: tFont.semibold, fontSize: 15, color: fg }
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
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[tType.heading, { color: fg }]}>
              {data.holder}
            </Text>
            <Text numberOfLines={1} style={[tType.bodyS, { color: fg, opacity: 0.86 }]}>
              {[data.facility ?? "No home facility yet", about].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {turnHint(M.card.turnOver, fg, soft(fg))}
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
        backStyle,
      ]}
    >
      <View
        style={{
          flex: 1,
          paddingVertical: tSpace[3],
          paddingHorizontal: tSpace[4],
          gap: tSpace[1.5],
        }}
      >
        <View style={{ flexDirection: "row", gap: tSpace[3] }}>
          <View style={{ flex: 1, gap: tSpace[1] }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: tSpace[2],
              }}
            >
              <Text style={[tType.label, { color: t.ink }]}>{M.card.back.title}</Text>
              {turnHint(M.card.turnBack, t.ink2, t.surface2)}
            </View>
            <Text
              accessibilityLabel={`${BRAND_V2} number ${data.number}`}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={
                hasNumber
                  ? {
                      fontFamily: tFont.monoSemibold,
                      fontSize: 18,
                      letterSpacing: 2.2,
                      color: t.ink,
                    }
                  : { fontFamily: tFont.semibold, fontSize: 14, color: t.ink2 }
              }
            >
              {data.number}
            </Text>
          </View>
          {qr ? <View style={{ alignSelf: "flex-start" }}>{qr}</View> : null}
        </View>
        {/* Under the code, at its own edge: the note is about the code, not about the number beside it. */}
        {qr ? (
          <Text numberOfLines={1} style={[tType.micro, { color: t.ink3, textAlign: "right" }]}>
            {M.card.back.qrNote}
          </Text>
        ) : null}

        <View style={{ gap: tSpace[1] }}>
          {row(M.card.back.allergies, data.allergies)}
          {row(M.card.back.conditions, data.conditions ?? "Hidden by the card holder")}
          {data.nextOfKin ? row(M.card.back.nextOfKin, data.nextOfKin) : null}
        </View>

        <View style={{ flex: 1 }} />
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          style={[tType.caption, { fontFamily: tFont.semibold, color: t.ink }]}
        >
          {data.ifFound}
        </Text>
        <Text numberOfLines={1} style={[tType.micro, { fontSize: 11, color: t.ink3 }]}>
          Written by the card holder · not confirmed by a clinician
        </Text>
      </View>
    </Animated.View>
  );

  return (
    <Press
      onPress={flip}
      accessibilityLabel={
        flipped
          ? `${BRAND_V2} card, ${M.card.back.title}. ${M.card.turnBack}`
          : `${BRAND_V2} card, front. ${M.card.turnOver}`
      }
      accessibilityState={{ expanded: flipped }}
      haptic
      style={{ width: "100%", aspectRatio: RATIO }}
    >
      {front}
      {back}
    </Press>
  );
}
