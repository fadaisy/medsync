import type { Palette } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * Gate CS (ADR 0098 ruling 2): draft clinical content is never shown as if
 * it were signed. Amber is the clinical-signal colour for "caution", and the
 * words carry the meaning; a signed build never mounts this.
 */
export function Watermark() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.band} accessibilityRole="text">
      <Ionicons name="alert-circle-outline" size={16} color={colors.status.cautionFg} />
      <Text style={styles.text}>Unsigned clinical content — draft, for review only.</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    band: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[2],
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radius.md,
      backgroundColor: c.status.cautionBg,
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    text: {
      flex: 1,
      fontFamily: font.bodyMedium,
      fontSize: 12.5,
      lineHeight: 17,
      color: c.foreground,
    },
  });
