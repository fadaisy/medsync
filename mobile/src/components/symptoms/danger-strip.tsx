import type { Palette } from "@/theme/tokens";
import type { CatalogItem } from "@shared/symptom-catalog/types";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { iconFor } from "@/lib/symptoms";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** The strip's budget on S1 (PRD §7.2): two rows of tiles and the link. */
export const DANGER_TILE_HEIGHT = 48;

/**
 * Appendix A.0: the four danger signs for this audience as 2×2 compact
 * tiles — a Pressable each, ≥ 48dp, icon AND words — and "All danger signs
 * (n)". No red here: the tile is a door to the item, and the item's row
 * carries the word "Emergency". The home and S1 both draw this.
 */
export function DangerStrip({
  items,
  selected = [],
  onPress,
  allCount,
  onAll,
}: {
  /** Exactly four, in catalog order — `dangerSigns(CATALOG, audience)`. */
  items: CatalogItem[];
  selected?: string[];
  onPress: (item: CatalogItem) => void;
  /** How many emergency-tier items this audience can see. */
  allCount: number;
  onAll: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      <Text style={styles.title}>{t(CATALOG, "strip.title")}</Text>
      <View style={styles.grid}>
        {items.map((item) => {
          const label = t(CATALOG, item.labelKey);
          const chosen = selected.includes(item.key);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${label}. ${t(CATALOG, "tier.E")}`}
              onPress={() => onPress(item)}
              style={({ pressed }) => [
                styles.tile,
                chosen && styles.tileChosen,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={iconFor(item.icon)}
                size={18}
                color={chosen ? colors.accentForeground : colors.foreground}
              />
              <Text style={[styles.label, chosen && styles.labelChosen]} numberOfLines={2}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="link" onPress={onAll} hitSlop={8} style={styles.all}>
        <Text style={styles.allText}>
          {t(CATALOG, "strip.all")} ({allCount})
        </Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: { gap: space[2] },
    title: {
      fontFamily: font.bodyMedium,
      fontSize: 13.5,
      lineHeight: 18,
      color: c.mutedForeground,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
    tile: {
      width: "48.5%",
      minHeight: DANGER_TILE_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: space[2],
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tileChosen: { backgroundColor: c.accent, borderColor: c.primary },
    pressed: { opacity: 0.7 },
    label: {
      flex: 1,
      fontFamily: font.bodyMedium,
      fontSize: 12.5,
      lineHeight: 16,
      color: c.foreground,
    },
    labelChosen: { color: c.accentForeground },
    all: { minHeight: 28, justifyContent: "center", alignSelf: "flex-start" },
    allText: { fontFamily: font.body, fontSize: 13.5, color: c.primary },
  });
