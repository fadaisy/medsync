import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useStyles } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/**
 * A titled block of the page: "Upcoming", "Your visits", "Select a day".
 *
 * The title is the section's heading for a screen reader. `action` is the
 * reference's "View all" — a small link on the title's row, only when there
 * is somewhere it goes.
 */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const styles = useStyles(makeStyles);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="link"
            onPress={action.onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { gap: space[3] },
    head: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: space[3],
    },
    title: {
      fontFamily: font.bodyMedium,
      fontSize: 16.5,
      lineHeight: 22,
      color: c.foreground,
    },
    action: { minHeight: 32, justifyContent: "center" },
    actionLabel: { fontFamily: font.body, fontSize: 13.5, color: c.primary },
    pressed: { opacity: 0.6 },
  });
