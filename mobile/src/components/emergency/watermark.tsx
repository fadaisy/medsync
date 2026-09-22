import type { Palette } from "@/theme/tokens";
import { StyleSheet, Text, View } from "react-native";

import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * Gate CS (ADR 0098 ruling 2): unsigned clinical content renders only
 * outside production, and visibly so. A quiet band — not amber (that is the
 * Urgent tier's) and never red — with the words, because the words are the
 * warning; the colour is not.
 */
export function Watermark({ children }: { children?: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.band} accessibilityRole="text">
      <Text style={styles.text}>Unsigned clinical content</Text>
      {children ? <Text style={styles.sub}>{children}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    band: {
      paddingVertical: space[2],
      paddingHorizontal: space[3],
      borderRadius: radius.md,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: "dashed",
      gap: 2,
    },
    text: {
      fontFamily: font.bodyMedium,
      fontSize: 12.5,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.mutedForeground,
    },
    sub: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: c.mutedForeground },
  });
