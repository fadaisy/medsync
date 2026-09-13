import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** One alternative the rule offers — a clinician, or the same clinic elsewhere. */
export interface WaitOption {
  key: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

/**
 * The no-silent-wait rule (PRD §2.4): when nothing is open within the
 * facility's own target lead time, the app never silently offers a later
 * date. It presents, in this order — another clinician in the same service
 * here; the same service at another hospital; the same-day walk-in door;
 * and only then the days beyond the window, labelled plainly as beyond the
 * facility's target.
 *
 * An ACCESS decision on facility-published policy. Nothing here judges the
 * patient; `targetDays` is the line's own number, and every option is a
 * real row the data layer returned.
 */
export function NoSilentWait({
  targetDays,
  sameService,
  elsewhere,
  children,
}: {
  targetDays: number;
  /** Other clinicians in this service at this hospital with a day inside the window. */
  sameService: WaitOption[];
  /** The same service at other hospitals with a day inside the window. */
  elsewhere: WaitOption[];
  /** The beyond-window picker, drawn under its label. */
  children: ReactNode;
}) {
  const router = useRouter();
  const styles = useStyles(makeStyles);
  const target = targetDays === 1 ? "1 day" : `${targetDays} days`;

  return (
    <View style={styles.stack}>
      <Text style={styles.lead} accessibilityLiveRegion="polite">
        Nothing is open within this clinic&rsquo;s target of {target}.
      </Text>
      {sameService.length > 0 ? (
        <Section title="Another clinician here">
          <View style={styles.rows}>
            {sameService.map((o) => (
              <OptionRow key={o.key} option={o} />
            ))}
          </View>
        </Section>
      ) : null}
      {elsewhere.length > 0 ? (
        <Section title="The same clinic at another hospital">
          <View style={styles.rows}>
            {elsewhere.map((o) => (
              <OptionRow key={o.key} option={o} />
            ))}
          </View>
        </Section>
      ) : null}
      <Button
        variant="secondary"
        label="Coming to the hospital today"
        onPress={() => router.replace("/(app)/today")}
      />
      <Text style={styles.beyond}>Beyond this clinic&rsquo;s target of {target}</Text>
      {children}
    </View>
  );
}

function OptionRow({ option }: { option: WaitOption }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={option.onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {option.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {option.subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.mutedForeground}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: { gap: space[5] },
    rows: { gap: space[3] },
    lead: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22, color: c.foreground },
    beyond: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pressed: { opacity: 0.88 },
    text: { flex: 1, gap: 2 },
    title: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: c.foreground },
    subtitle: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
  });
