import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * A pill you can pick — a reason, a clinic, a part of the day.
 *
 * Selection is a shape as well as a colour: the fill flips to the brand and
 * the weight goes to medium, and the radio state carries it to a screen
 * reader. A row of these is a `ChipRow`; a grid is a `ChipGrid`.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  role = "radio",
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** `radio` for one-of-many (the default); `button` for a filter that toggles. */
  role?: "radio" | "button";
}) {
  const styles = useStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={
        role === "radio" ? { checked: selected, disabled } : { selected, disabled }
      }
      disabled={disabled}
      onPress={onPress}
      // A 38px pill reads lighter than a 44px one; the slop keeps the target.
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

/** Chips in a wrapping row — filters, reasons. */
export function ChipRow({ children }: { children: ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <View accessibilityRole="radiogroup" style={styles.row}>
      {children}
    </View>
  );
}

/**
 * A larger, boxed pick — a clinic day, a time. Same semantics as `Chip`, a
 * row with its label and hint on the left and a check on the right once
 * chosen, so the choice is a mark as well as a tint.
 */
export function Tile({
  label,
  hint,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  hint?: string;
  selected?: boolean;
  onPress: () => void;
  /** A pick that exists but cannot be taken — a full clinic day. The hint says why. */
  disabled?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.tileSelected,
        disabled && styles.chipDisabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.tileText}>
        <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>{label}</Text>
        {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.mark, selected && styles.markSelected]} accessibilityElementsHidden>
        {selected ? <Ionicons name="checkmark" size={16} color={colors.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

/** Tiles stacked, one to a row. */
export function TileGrid({ children }: { children: ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <View accessibilityRole="radiogroup" style={styles.grid}>
      {children}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },

    chip: {
      minHeight: 38,
      paddingHorizontal: 14,
      paddingVertical: space[2],
      borderRadius: radius.full,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: "center",
    },
    chipSelected: { backgroundColor: c.foreground, borderColor: c.foreground },
    chipDisabled: { opacity: 0.45 },
    label: { fontFamily: font.bodyMedium, fontSize: 14, color: c.foreground },
    labelSelected: { color: c.background },

    grid: { gap: space[2] },
    tile: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      minHeight: 56,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.xl,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tileSelected: { backgroundColor: c.accent, borderColor: c.primary },
    tileText: { flex: 1, gap: 2 },
    tileLabel: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: c.foreground },
    tileLabelSelected: { color: c.accentForeground },
    tileHint: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground },
    // An empty ring until chosen; the brand disc with a check after.
    mark: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    markSelected: { backgroundColor: c.primary, borderColor: c.primary },

    pressed: { opacity: 0.7 },
  });
