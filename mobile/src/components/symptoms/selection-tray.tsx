import type { Palette } from "@/theme/tokens";
import type { CatalogItem } from "@shared/symptom-catalog/types";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { TIER_LABEL_KEY } from "@shared/symptom-catalog/types";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** The tray's budget on S1 (PRD §7.2) — docked, so it rides over the content, not in it. */
export const TRAY_HEIGHT = 64;

/**
 * "2 selected · Continue" (PRD §6.1), docked at the bottom once anything is
 * ticked. The count is a button: it opens the list to review and remove;
 * Continue is the third of the three interactions to any item.
 */
export function SelectionTray({
  items,
  onRemove,
  onContinue,
}: {
  items: CatalogItem[];
  onRemove: (item: CatalogItem) => void;
  onContinue: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const n = items.length;
  if (n === 0) return null;

  return (
    <View style={styles.tray}>
      {expanded ? (
        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.key} style={styles.entry}>
              <View style={styles.entryText}>
                <Text style={styles.entryLabel} numberOfLines={2}>
                  {t(CATALOG, item.labelKey)}
                </Text>
                <Text style={styles.entryTier}>{t(CATALOG, TIER_LABEL_KEY[item.tier])}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${t(CATALOG, item.labelKey)}`}
                onPress={() => onRemove(item)}
                hitSlop={8}
                style={styles.remove}
              >
                <Ionicons name="close" size={18} color={colors.foreground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${n} selected. ${expanded ? "Hide" : "Review"} the list`}
          onPress={() => setExpanded((e) => !e)}
          hitSlop={8}
          style={styles.count}
        >
          <Text style={styles.countText}>{n} selected</Text>
          <Ionicons
            name={expanded ? "chevron-down" : "chevron-up"}
            size={16}
            color={colors.mutedForeground}
          />
        </Pressable>
        <Button label="Continue" onPress={onContinue} style={styles.continue} />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    tray: { gap: space[3] },
    row: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: TRAY_HEIGHT - 12 },
    count: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[1],
      minHeight: 44,
      flexShrink: 0,
    },
    countText: { fontFamily: font.bodyMedium, fontSize: 15, color: c.foreground },
    continue: { flex: 1, alignSelf: "auto" },
    list: { gap: space[2] },
    entry: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radius.lg,
      backgroundColor: c.muted,
    },
    entryText: { flex: 1, gap: 1 },
    entryLabel: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 19, color: c.foreground },
    entryTier: { fontFamily: font.body, fontSize: 12.5, lineHeight: 16, color: c.mutedForeground },
    remove: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
    },
  });
