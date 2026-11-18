/**
 * Patient app v2 shell on the phone (feature matrix 1.1, 1.3, 1.11): the Visit-mode
 * places in one pill with a sliding marker, the avatar that carries the unseen count and opens Notifications,
 * and the Tether wordmark. The web's are in components/tide/shell.tsx (PR #322).
 *
 * The plus stays a separate button beside the pill (gate A1: keep) and opens the same sheet. Care mode's
 * places (Today, Plan, My care, Me) are not here: Care mode is locked until Gate CG.
 */
import type { IconName } from "@/components/tide/icon";
import type { StyleProp, TextStyle } from "react-native";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { Avatar } from "@/components/tide/primitives";
import { EASE_OUT } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont } from "@/theme/tide";

export type VisitPlace = "home" | "book" | "visits" | "me";

export const VISIT_PLACES: readonly { key: VisitPlace; label: string; icon: IconName }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "book", label: "Book", icon: "calendarPlus" },
  { key: "visits", label: "Visits", icon: "calendarDays" },
  { key: "me", label: "Me", icon: "user" },
];

/** The pill: 64 pt tall, 6 pt inside, so each place is a 52 pt target. */
export const VISIT_NAV_H = 64;
const INSET = 6;
const PLUS = 56;
const GAP = 10;

/**
 * The Visit-mode nav: Home, Book, Visits, Me in a pill, the plus beside it. The marker slides to the current
 * place (250 ms, the system's ease-out; no movement under Reduce Motion), so where you are is told by position,
 * weight and the selected state, not by colour alone. Presentational: the tabs layout owns the navigation.
 */
export function VisitNav({
  current,
  onNavigate,
  onPlus,
  width,
}: {
  /** Null while a screen outside the four places is in front (the old Care hub). */
  current: VisitPlace | null;
  onNavigate: (place: VisitPlace) => void;
  onPlus: () => void;
  width: number;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const pillW = width - PLUS - GAP;
  const tabW = (pillW - INSET * 2) / VISIT_PLACES.length;
  const index = VISIT_PLACES.findIndex((p) => p.key === current);
  const off = t.scheme === "dark" ? t.ink2 : t.ink3;

  return (
    <View
      style={{ width, height: VISIT_NAV_H, flexDirection: "row", alignItems: "center", gap: GAP }}
    >
      <View
        accessibilityRole="tablist"
        style={{
          width: pillW,
          height: VISIT_NAV_H,
          borderRadius: VISIT_NAV_H / 2,
          padding: INSET,
          flexDirection: "row",
          backgroundColor: t.surfaceRaised,
          borderWidth: 1,
          borderColor: t.line,
          boxShadow: t.shadow.float,
        }}
      >
        {index >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              // Inside the 1 pt border, so the marker sits concentric with the pill.
              left: INSET - 1,
              top: INSET - 1,
              width: tabW,
              height: VISIT_NAV_H - INSET * 2,
              borderRadius: (VISIT_NAV_H - INSET * 2) / 2,
              backgroundColor: t.primary,
              transform: [{ translateX: index * tabW }],
              transitionProperty: "transform",
              transitionDuration: reduced ? 0 : 250,
              transitionTimingFunction: EASE_OUT,
            }}
          />
        ) : null}
        {VISIT_PLACES.map((p) => {
          const on = p.key === current;
          const color = on ? t.onPrimary : off;
          return (
            <Press
              key={p.key}
              onPress={() => onNavigate(p.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={p.label}
              style={{ width: tabW, alignItems: "center", justifyContent: "center", gap: 3 }}
            >
              <Icon name={p.icon} size={22} color={color} />
              <Text
                style={{
                  fontFamily: on ? tFont.bold : tFont.medium,
                  fontSize: 11,
                  lineHeight: 13,
                  color,
                }}
              >
                {p.label}
              </Text>
            </Press>
          );
        })}
      </View>
      <Press
        onPress={onPlus}
        accessibilityLabel="Add: log a reading, a medicine, or tell your team"
        style={{
          width: PLUS,
          height: PLUS,
          borderRadius: PLUS / 2,
          backgroundColor: t.accent,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: t.shadow.accent,
        }}
      >
        <Icon name="plus" size={26} color={t.onAccent} strokeWidth={2.4} />
      </Press>
    </View>
  );
}

/**
 * The header avatar (M4): the bell's count moves onto it, quietly (ink on the page, never red), and it opens
 * Notifications. The count is in the label too, so it never rests on the badge alone.
 */
export function AvatarCount({
  initials,
  photoUrl,
  count = 0,
  size = 44,
}: {
  initials: string;
  photoUrl?: string | null;
  count?: number;
  size?: number;
}) {
  const t = useTide();
  const router = useRouter();
  const unseen = count > 0;
  return (
    <Press
      onPress={() => router.push("/notifications")}
      accessibilityLabel={unseen ? `Notifications, ${count} new` : "Notifications"}
      style={{ width: size, height: size }}
    >
      <Avatar initials={initials} photoUrl={photoUrl} size={size} />
      {unseen ? (
        <View
          style={{
            position: "absolute",
            top: -3,
            right: -5,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: t.primary,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0px 0px 0px 2px ${t.bg}`,
          }}
        >
          <Text
            style={{ fontFamily: tFont.bold, fontSize: 11, lineHeight: 14, color: t.onPrimary }}
          >
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      ) : null}
    </Press>
  );
}

/** The Tether wordmark (M15), as on the web: one word, bold, tight, in one colour. */
export function TetherWordmark({
  size = 22,
  color,
  style,
}: {
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const t = useTide();
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          fontFamily: tFont.bold,
          fontSize: size,
          lineHeight: Math.round(size * 1.2),
          letterSpacing: -0.03 * size,
          color: color ?? t.ink,
        },
        style,
      ]}
    >
      {BRAND_V2}
    </Text>
  );
}

/** The patient-facing name in v2. The old screens keep theirs until the cutover. */
export const BRAND_V2 = "Tether";
