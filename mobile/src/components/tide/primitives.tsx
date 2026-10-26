import type { IconName } from "@/components/tide/icon";
import type { Tide } from "@/theme/tide";
import type { ReactNode } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { motion } from "@/motion/presets";
import { useTide, useTideStyles } from "@/theme/theme";
import { BUTTON_H, tFont, tRadius, tSpace, tType } from "@/theme/tide";

/* ─── Button ─────────────────────────────────────────────────────────── */

/**
 * `primary` navy pill (near-white at night), `accent` the lagoon action,
 * `soft` a quiet grey fill, `outline` the real alternative, `danger` red for
 * "Get help now" only (law L3).
 */
export type ButtonVariant = "primary" | "accent" | "soft" | "outline" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  iconRight,
  disabled = false,
  busy = false,
  size = "lg",
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  busy?: boolean;
  /** `lg` 52–56pt for the main action, `md` 44pt, `sm` 36pt (still 44pt to hit). */
  size?: "lg" | "md" | "sm";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTide();
  const fill = {
    primary: { bg: t.primary, fg: t.onPrimary, ring: undefined },
    accent: { bg: t.accent, fg: t.onAccent, ring: undefined },
    soft: { bg: t.surface2, fg: t.ink, ring: undefined },
    outline: { bg: t.surface, fg: t.ink, ring: t.lineStrong },
    danger: { bg: t.emergency, fg: t.onEmergency, ring: undefined },
  }[variant];
  const off = disabled && !busy;
  const bg = off ? t.primaryOff : fill.bg;
  const fg = off ? t.onPrimaryOff : fill.fg;
  const h = size === "lg" ? BUTTON_H : size === "md" ? 44 : 36;
  const type = size === "sm" ? tType.labelS : tType.label;
  return (
    <Press
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy }}
      hitSlop={size === "sm" ? 4 : undefined}
      style={[
        {
          minHeight: h,
          paddingHorizontal: size === "sm" ? tSpace[3.5] : tSpace[5],
          borderRadius: tRadius.pill,
          backgroundColor: bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: tSpace[2],
          borderWidth: fill.ring ? 1 : 0,
          borderColor: fill.ring,
          boxShadow:
            variant === "danger"
              ? t.shadow.emergency
              : variant === "accent" && !off
                ? t.shadow.accent
                : undefined,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      {icon && !busy ? <Icon name={icon} size={20} color={fg} strokeWidth={2.2} /> : null}
      <Text style={[type, { color: fg }]} numberOfLines={2}>
        {label}
      </Text>
      {iconRight ? <Icon name={iconRight} size={20} color={fg} strokeWidth={2.2} /> : null}
    </Press>
  );
}

/** A text link in accent ink: "See all", "Change", "Forgot password?". */
export function TextLink({
  label,
  onPress,
  tone = "accent",
  style,
}: {
  label: string;
  onPress?: () => void;
  tone?: "accent" | "info" | "ink";
  style?: StyleProp<TextStyle>;
}) {
  const t = useTide();
  const color = tone === "accent" ? t.accentText : tone === "info" ? t.info.text : t.ink;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="link"
      // 18pt line + 13 above and below: a 44pt target (law L13).
      hitSlop={{ top: 13, bottom: 13, left: 10, right: 10 }}
      haptic={false}
    >
      <Text style={[tType.labelS, { color }, style]}>{label}</Text>
    </Press>
  );
}

/* ─── Pills, chips, segments ─────────────────────────────────────────── */

/** A small rounded label with an optional dot: "Now · 13:00", "Open now · until 16:00". */
export function Pill({
  label,
  dot,
  bg,
  fg,
  icon,
  style,
}: {
  label: string;
  dot?: string;
  bg?: string;
  fg?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTide();
  const color = fg ?? t.ink;
  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[1.5],
          minHeight: 28,
          paddingHorizontal: 11,
          borderRadius: tRadius.pill,
          backgroundColor: bg ?? t.surface,
        },
        style,
      ]}
    >
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} /> : null}
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      <Text style={[tType.caption, { color }]}>{label}</Text>
    </View>
  );
}

/**
 * The clinical word pill: "In your range", "Above target", "Danger".
 * Amber and green only ever appear here and in reading check bands, always
 * with their word (law L4).
 */
export function StatusPill({
  tone,
  label,
  style,
}: {
  tone: "stable" | "caution" | "critical" | "pending" | "info";
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTide();
  const pair = t[tone];
  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          minHeight: 24,
          paddingHorizontal: 9,
          justifyContent: "center",
          borderRadius: tRadius.pill,
          backgroundColor: pair.tint,
        },
        style,
      ]}
    >
      <Text style={[tType.caption, { color: pair.text }]}>{label}</Text>
    </View>
  );
}

/** A selectable chip. Selected is navy (near-white at night); unselected is outlined. */
export function Chip({
  label,
  selected = false,
  onPress,
  tone = "primary",
  size = "md",
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** `danger` turns a selected chip red: the Help symptom chips only. */
  tone?: "primary" | "danger";
  size?: "sm" | "md";
}) {
  const t = useTide();
  const on = tone === "danger" ? t.emergencyBand : t.primary;
  const onFg = tone === "danger" ? t.onEmergency : t.onPrimary;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={size === "sm" ? 6 : 2}
      style={{
        minHeight: size === "sm" ? 34 : 40,
        paddingHorizontal: 14,
        borderRadius: tRadius.pill,
        justifyContent: "center",
        backgroundColor: selected ? on : t.surface,
        borderWidth: selected ? 0 : 1,
        borderColor: t.line,
      }}
    >
      <Text
        style={[size === "sm" ? tType.caption : tType.labelS, { color: selected ? onFg : t.ink }]}
      >
        {label}
      </Text>
    </Press>
  );
}

/** A row of chips. Scrolls sideways when `scroll`, wraps otherwise. */
export function ChipRow({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll)
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[1.5] }}>{children}</View>
    );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -tSpace[5], flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: tSpace[5], gap: tSpace[1.5] }}
    >
      {children}
    </ScrollView>
  );
}

/** Two or more pill segments: "Today / This week", "Move / Eat", "Week / Month / Year". */
export function Segments<K extends string>({
  options,
  value,
  onChange,
  tone = "primary",
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** `accent`: the selected segment is lagoon (Home's Today, Mood's view). */
  tone?: "primary" | "accent";
}) {
  const t = useTide();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: tSpace[1.5] }}>
      {options.map((o) => {
        const on = o.key === value;
        const bg = on ? (tone === "accent" ? t.accent : t.primary) : t.surface;
        const fg = on ? (tone === "accent" ? t.onAccent : t.onPrimary) : t.ink;
        return (
          <Press
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{
              minHeight: 40,
              paddingHorizontal: 18,
              borderRadius: tRadius.pill,
              justifyContent: "center",
              backgroundColor: bg,
              boxShadow: on && tone === "accent" ? t.shadow.accent : on ? undefined : t.shadow.card,
            }}
          >
            <Text style={[tType.label, { fontSize: 15, color: fg }]}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

/**
 * Big selectable tiles in a row: the reading types, the sign-in methods, the
 * mood faces' frame. Each tile is a column of icon (or node) and word.
 */
export function SegmentTiles<K extends string>({
  options,
  value,
  onChange,
  height = 74,
}: {
  options: readonly {
    key: K;
    label: string;
    icon?: IconName;
    node?: ReactNode;
    iconColor?: string;
  }[];
  value: K | null;
  onChange: (key: K) => void;
  height?: number;
}) {
  const t = useTide();
  return (
    <View style={{ flexDirection: "row", gap: tSpace[2] }}>
      {options.map((o) => {
        const on = o.key === value;
        const fg = on ? t.onPrimary : (o.iconColor ?? t.ink);
        return (
          <Press
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              minHeight: height,
              borderRadius: tRadius.card,
              backgroundColor: on ? t.primary : t.surface,
              alignItems: "center",
              justifyContent: "center",
              gap: tSpace[1.5],
              paddingVertical: tSpace[2],
              boxShadow: on ? undefined : t.shadow.card,
            }}
          >
            {o.node ?? (o.icon ? <Icon name={o.icon} size={22} color={fg} /> : null)}
            <Text style={[tType.caption, { fontSize: 13, color: on ? t.onPrimary : t.ink }]}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/* ─── Surfaces ───────────────────────────────────────────────────────── */

/** A white card on the grey ground. Pressable when given `onPress`. */
export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
  radius = tRadius.cardLg,
  padding = tSpace[3.5],
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  radius?: number;
  padding?: number;
}) {
  const t = useTide();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderRadius: radius,
    padding,
    gap: tSpace[2.5],
    boxShadow: t.shadow.card,
  };
  if (onPress)
    return (
      <Press onPress={onPress} accessibilityLabel={accessibilityLabel} style={[base, style]}>
        {children}
      </Press>
    );
  return <View style={[base, style]}>{children}</View>;
}

/** The navy surface: header bands, the adherence card, the "show the medic" card. */
export function Band({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTide();
  const base: ViewStyle = {
    backgroundColor: t.band,
    borderRadius: tRadius.panel,
    padding: tSpace[4],
    gap: tSpace[2.5],
  };
  if (onPress)
    return (
      <Press onPress={onPress} accessibilityLabel={accessibilityLabel} style={[base, style]}>
        {children}
      </Press>
    );
  return <View style={[base, style]}>{children}</View>;
}

/** A tinted note: info (indigo), caution, or a plain grey line. Icon plus words. */
export function Note({
  children,
  tone = "info",
  icon = "info",
  style,
}: {
  children: ReactNode;
  tone?: "info" | "caution" | "plain" | "place";
  icon?: IconName | null;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTide();
  const pair =
    tone === "info"
      ? t.info
      : tone === "caution"
        ? t.caution
        : tone === "place"
          ? t.place
          : { tint: t.surface2, text: t.ink2 };
  return (
    <View
      style={[
        {
          flexDirection: "row",
          gap: tSpace[2],
          alignItems: "flex-start",
          padding: tSpace[3],
          borderRadius: tRadius.md,
          backgroundColor: pair.tint,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={pair.text} /> : null}
      <Text style={[tType.bodyS, { color: tone === "place" ? pair.text : t.ink, flex: 1 }]}>
        {children}
      </Text>
    </View>
  );
}

/** A round tinted disc holding an icon: row leaders, notification glyphs. */
export function IconDisc({
  name,
  color,
  bg,
  size = 40,
}: {
  name: IconName;
  color: string;
  bg: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={name} size={Math.round(size * 0.48)} color={color} />
    </View>
  );
}

/** Initials in a circle. Placeholders only ("AN", "DR"); never a real person's name. */
export function Avatar({
  initials,
  photoUrl,
  size = 44,
  bg,
  fg,
}: {
  initials: string;
  /** A signed photo URL: shown over the initials, which stay underneath while it loads. */
  photoUrl?: string | null;
  size?: number;
  bg?: string;
  fg?: string;
}) {
  const t = useTide();
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: bg ?? t.info.tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: tFont.bold, fontSize: size * 0.32, color: fg ?? t.info.text }}>
        {initials}
      </Text>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          contentFit="cover"
          style={{ position: "absolute", top: 0, left: 0, width: size, height: size }}
        />
      ) : null}
    </View>
  );
}

/** A section heading with an optional trailing link: "Health trends · See all". */
export function SectionHead({
  title,
  action,
  onAction,
  size = "section",
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  size?: "section" | "large";
}) {
  const t = useTide();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginTop: tSpace[1],
      }}
    >
      <Text
        accessibilityRole="header"
        style={[
          size === "large" ? { ...tType.title, fontSize: 22, lineHeight: 28 } : tType.section,
          { color: t.ink },
        ]}
      >
        {title}
      </Text>
      {action ? <TextLink label={action} onPress={onAction} /> : null}
    </View>
  );
}

/**
 * The "Demo data" ribbon (law L1): every screen that reads fixtures shows it,
 * so demo values are never mistaken for the patient's own.
 */
export function DemoRibbon() {
  const styles = useTideStyles(makeRibbon);
  return (
    <View
      style={styles.ribbon}
      accessibilityRole="text"
      accessibilityLabel="Demo data. These are example values, not your records."
    >
      <Icon name="info" size={14} color={styles.text.color} />
      <Text style={styles.text}>Demo data · example values, not your records</Text>
    </View>
  );
}
const makeRibbon = (t: Tide) =>
  StyleSheet.create({
    ribbon: {
      flexDirection: "row",
      alignItems: "center",
      gap: tSpace[1.5],
      alignSelf: "stretch",
      paddingHorizontal: tSpace[3],
      paddingVertical: tSpace[1.5],
      borderRadius: tRadius.sm,
      backgroundColor: t.pending.tint,
    },
    text: { ...tType.caption, color: t.pending.text },
  });

/**
 * A toast above the nav: "Saved · your care team can see it", with an
 * optional Undo. The caller owns visibility and the timer.
 */
export function Toast({
  text,
  actionLabel,
  onAction,
  bottom = 122,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  bottom?: number;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const bg = t.scheme === "dark" ? t.surfaceRaised : t.band;
  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        {
          position: "absolute",
          left: tSpace[5],
          right: tSpace[5],
          bottom,
          minHeight: 52,
          borderRadius: tRadius.md,
          backgroundColor: bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: tSpace[4],
          paddingRight: tSpace[2],
          boxShadow: t.shadow.float,
        },
        motion.rise(0, reduced),
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2], flex: 1 }}>
        <Icon name="check" size={18} color={t.accent} strokeWidth={2.4} />
        <Text style={[tType.bodyM, { color: t.onBand, flex: 1 }]}>{text}</Text>
      </View>
      {actionLabel ? (
        <Press
          onPress={onAction}
          hitSlop={6}
          style={{ minHeight: 44, paddingHorizontal: tSpace[3], justifyContent: "center" }}
        >
          <Text style={[tType.label, { fontSize: 15, color: t.onBandAccent }]}>{actionLabel}</Text>
        </Press>
      ) : null}
    </Animated.View>
  );
}

/**
 * The date tile: a big day number over its weekday. `bleed` squares the left
 * side so it reads as pulled out of the screen edge (the rail's selected day,
 * the visit band).
 */
export function DateTile({
  day,
  label,
  selected = false,
  bleed = false,
  dim = false,
  height = 76,
  width = 80,
}: {
  day: string;
  label: string;
  selected?: boolean;
  bleed?: "left" | "right" | false;
  dim?: boolean;
  height?: number;
  width?: number;
}) {
  const t = useTide();
  const r = tRadius.cardLg;
  return (
    <View
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? t.band : "transparent",
        borderTopLeftRadius: bleed === "left" ? 0 : selected ? r : 0,
        borderBottomLeftRadius: bleed === "left" ? 0 : selected ? r : 0,
        borderTopRightRadius: bleed === "right" ? 0 : selected ? r : 0,
        borderBottomRightRadius: bleed === "right" ? 0 : selected ? r : 0,
        boxShadow: selected ? t.shadow.float : undefined,
      }}
    >
      <Text style={[tType.numeral, { color: selected ? t.onBand : dim ? t.ink3 : t.ink }]}>
        {day}
      </Text>
      <Text style={[tType.bodyS, { color: selected ? t.onBandAccent : t.ink2 }]}>{label}</Text>
    </View>
  );
}
