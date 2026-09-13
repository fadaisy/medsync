import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useStyles } from "@/theme/theme";
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
 * A larger, boxed pick — the reference's time grid. Same semantics as `Chip`,
 * squarer, and it fills its cell so a grid of them lines up.
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
      <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>{label}</Text>
      {hint ? (
        <Text style={[styles.tileHint, selected && styles.tileLabelSelected]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

/** Tiles two to a row. */
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
      // A 44px target, like every other tappable thing.
      minHeight: 44,
      paddingHorizontal: space[4],
      paddingVertical: space[2],
      borderRadius: radius.full,
      backgroundColor: c.accent,
      justifyContent: "center",
    },
    chipSelected: { backgroundColor: c.primary },
    chipDisabled: { opacity: 0.45 },
    label: { fontFamily: font.body, fontSize: 14.5, color: c.accentForeground },
    labelSelected: { fontFamily: font.bodyMedium, color: c.primaryForeground },

    grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
    tile: {
      // Two per row inside a 20px-gutter page with a 12px gap.
      flexBasis: "47%",
      flexGrow: 1,
      minHeight: 56,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    tileSelected: { backgroundColor: c.accent, borderColor: c.primary },
    tileLabel: { fontFamily: font.bodyMedium, fontSize: 15, color: c.foreground },
    tileLabelSelected: { color: c.accentForeground },
    tileHint: { fontFamily: font.body, fontSize: 12.5, color: c.mutedForeground },

    pressed: { opacity: 0.7 },
  });
