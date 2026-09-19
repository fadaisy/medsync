import type { Palette } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";

import { useStyles, useTheme } from "@/theme/theme";
import { radius, withAlpha } from "@/theme/tokens";

/**
 * A round 44px control carrying one glyph — the back arrow, a share, a call.
 *
 * The glyph has no visible word, so `label` is required: it is what Voice
 * Control and a screen reader call the control. Opacity on press, never
 * scale.
 */
export function IconButton({
  icon,
  label,
  onPress,
  tone = "card",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /**
   * `card` sits on the page; `onPrimary` sits on the teal hero; `critical`
   * is the red disc, and it is drawn ONLY by `EmergencyButton` — red on a
   * MedSync surface means the emergency affordance and nothing else (ADR 0085 §5).
   */
  tone?: "card" | "onPrimary" | "critical";
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.disc,
        tone === "onPrimary" && styles.discOnPrimary,
        tone === "critical" && styles.discCritical,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={22}
        color={
          tone === "onPrimary"
            ? colors.primaryForeground
            : tone === "critical"
              ? colors.status.criticalFg
              : colors.foreground
        }
      />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    disc: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 2px 8px ${c.shadow}`,
    },
    discOnPrimary: {
      backgroundColor: withAlpha(c.primaryForeground, 0.18),
      borderWidth: 0,
      boxShadow: "none",
    },
    discCritical: { backgroundColor: c.status.criticalBg, borderColor: c.status.criticalFg },
    pressed: { opacity: 0.6 },
  });
