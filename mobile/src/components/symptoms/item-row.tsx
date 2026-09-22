import type { Palette } from "@/theme/tokens";
import type { CatalogItem } from "@shared/symptom-catalog/types";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { TIER_LABEL_KEY } from "@shared/symptom-catalog/types";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { iconFor } from "@/lib/symptoms";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** The rows' height in the category sheet (PRD §7.2 S2). */
export const ITEM_ROW_HEIGHT = 56;

/**
 * One catalog item as a row you can tick: icon, the lay label, its helper
 * line, and the tier WORD — "Get help now", "Be seen today", "Book a visit"
 * — so a screen reader hears the tier and nobody reads it from colour.
 *
 * The one red on the catalog (ADR 0098 ruling 7; tests/design/red-reserved):
 * an emergency-tier item carries the word "Emergency" on the critical pair.
 * Never a left-edge bar — a small badge beside the tier word.
 */
export function ItemRow({
  item,
  selected,
  onPress,
}: {
  item: CatalogItem;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const label = t(CATALOG, item.labelKey);
  const helper = item.helperKey ? t(CATALOG, item.helperKey) : null;
  const tierWord = t(CATALOG, TIER_LABEL_KEY[item.tier]);
  const emergency = item.tier === "E";

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}. ${emergency ? "Emergency. " : ""}${tierWord}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={styles.disc}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={iconFor(item.icon)} size={20} color={colors.placeForeground} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        <View style={styles.meta}>
          {emergency ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Emergency</Text>
            </View>
          ) : null}
          <Text style={styles.tier} numberOfLines={1}>
            {helper ? `${tierWord} · ${helper}` : tierWord}
          </Text>
        </View>
      </View>
      <View style={[styles.mark, selected && styles.markSelected]} accessibilityElementsHidden>
        {selected ? <Ionicons name="checkmark" size={16} color={colors.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      minHeight: ITEM_ROW_HEIGHT,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radius.lg,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowSelected: { backgroundColor: c.accent, borderColor: c.primary },
    pressed: { opacity: 0.7 },
    disc: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: c.place,
      alignItems: "center",
      justifyContent: "center",
    },
    text: { flex: 1, gap: 2 },
    label: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: c.foreground },
    meta: { flexDirection: "row", alignItems: "center", gap: space[2] },
    tier: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 12.5,
      lineHeight: 17,
      color: c.mutedForeground,
    },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.xs,
      backgroundColor: c.status.criticalBg,
    },
    badgeText: {
      fontFamily: font.bodyMedium,
      fontSize: 11.5,
      lineHeight: 15,
      color: c.status.criticalFg,
    },
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
  });
