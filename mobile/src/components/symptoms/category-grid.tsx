import type { Palette } from "@/theme/tokens";
import type { Category } from "@shared/symptom-catalog/types";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { iconFor } from "@/lib/symptoms";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** 3×4, 84px rows (PRD §7.2). */
export const CATEGORY_ROW_HEIGHT = 84;

/**
 * The twelve categories as a 3×4 grid, icon over a two-line label — the
 * first of the three interactions to any item (PRD §7.3). A count on a tile
 * says how many of its items are ticked, so the sheet can close and the
 * choice still shows.
 */
export function CategoryGrid({
  categories,
  counts,
  onOpen,
}: {
  categories: Category[];
  /** category key → items ticked in it. */
  counts: Record<string, number>;
  onOpen: (category: Category) => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {categories.map((category) => {
        const label = t(CATALOG, category.labelKey);
        const n = counts[category.key] ?? 0;
        return (
          <Pressable
            key={category.key}
            accessibilityRole="button"
            accessibilityLabel={n > 0 ? `${label}. ${n} chosen` : label}
            onPress={() => onOpen(category)}
            style={({ pressed }) => [
              styles.tile,
              n > 0 && styles.tileActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={iconFor(category.icon)}
              size={22}
              color={n > 0 ? colors.accentForeground : colors.placeForeground}
            />
            <Text style={[styles.label, n > 0 && styles.labelActive]} numberOfLines={2}>
              {label}
            </Text>
            {n > 0 ? <Text style={styles.count}>{n} chosen</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
    tile: {
      // Three across with two 8px gaps.
      width: "31.5%",
      minHeight: CATEGORY_ROW_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      gap: space[1],
      paddingHorizontal: space[1],
      paddingVertical: space[2],
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tileActive: { backgroundColor: c.accent, borderColor: c.primary },
    pressed: { opacity: 0.7 },
    label: {
      fontFamily: font.bodyMedium,
      fontSize: 12,
      lineHeight: 15,
      color: c.foreground,
      textAlign: "center",
    },
    labelActive: { color: c.accentForeground },
    count: { fontFamily: font.body, fontSize: 11, lineHeight: 14, color: c.accentForeground },
  });
