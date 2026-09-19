import type { ClinicianOption } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/ui/avatar";
import { dayLabel } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * A clinician as a carousel card — the reference design's home-screen doctor
 * card, in this palette: the photo (or monogram) on the brand's lightest
 * tint, the name and department on a panel beneath, the rating or "No ratings
 * yet", and the circular arrow. Same component, same name, on the web.
 *
 * `DoctorRow` remains the list form for "View all"; this is the glance.
 */
export function ProviderCard({
  option,
  seenBefore = false,
  onPress,
}: {
  option: ClinicianOption;
  seenBefore?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const nextOpen = Object.keys(option.slotsByDate).sort()[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.fullName}, ${option.departmentName}`}
      accessibilityHint="Opens this clinician"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.photoWrap}>
        {option.photoUrl ? (
          <Image
            source={{ uri: option.photoUrl }}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <View style={[styles.photo, styles.monogram]}>
            <Avatar name={option.fullName} size={56} />
          </View>
        )}
        {seenBefore ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Seen you before</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.name} numberOfLines={1}>
          {option.fullName}
        </Text>
        <Text style={styles.dept} numberOfLines={1}>
          {option.specialty ?? option.departmentName}
        </Text>

        <View style={styles.foot}>
          <View style={styles.footText}>
            {option.rating ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color={colors.primary} />
                <Text style={styles.rating}>{option.rating.average.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>· {option.rating.count}</Text>
              </View>
            ) : (
              <Text style={styles.ratingCount}>No ratings yet</Text>
            )}
            <Text style={styles.next} numberOfLines={1}>
              {nextOpen ? `Next ${dayLabel(nextOpen)}` : "No days open yet"}
            </Text>
          </View>
          <View style={styles.arrow} accessibilityElementsHidden>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      width: 200,
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    pressed: { opacity: 0.88 },
    photoWrap: { position: "relative" },
    photo: { width: "100%", aspectRatio: 4 / 3, backgroundColor: c.accent },
    monogram: { alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: space[2],
      right: space[2],
      paddingHorizontal: space[2],
      paddingVertical: 3,
      borderRadius: radius.full,
      backgroundColor: c.card,
    },
    badgeText: { fontFamily: font.bodyMedium, fontSize: 11.5, color: c.accentForeground },

    panel: { padding: space[3], gap: 2 },
    name: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: c.foreground },
    dept: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground },
    foot: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: space[2],
      marginTop: space[2],
    },
    footText: { flex: 1, gap: 2 },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    rating: { fontFamily: font.mono, fontSize: 12.5, color: c.foreground },
    ratingCount: { fontFamily: font.body, fontSize: 12.5, color: c.mutedForeground },
    next: { fontFamily: font.body, fontSize: 12.5, color: c.mutedForeground },
    // The reference's dark circle: the brand's deepest ramp, never a ground.
    arrow: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
  });
