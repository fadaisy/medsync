import type { Palette } from "@/theme/tokens";
import type { CatalogItem } from "@shared/symptom-catalog/types";
import { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import * as Haptics from "expo-haptics";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { telUrl } from "@/lib/emergency";
import { emergencyEvent } from "@/lib/symptoms";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * PRD §5.4: ticking an emergency-tier item opens this at once — it does
 * not wait for Continue. A full-screen Modal, one haptic (Warning) as it
 * appears, the item's own words, a call to the hospital's registered number
 * when one is known (ADR 0084 §3: the one trusted number), "Get help now"
 * into the Emergency sheet, and the one way back to booking — "This is not
 * happening now", logged as `declined` with the item key. The item stays
 * ticked either way; the weight is on getting help.
 *
 * Red (tests/design/red-reserved allowlist, ADR 0098 ruling 7): the header
 * band and the call button, each carrying its words.
 */
export function EmergencyInterrupt({
  item,
  hospitalName,
  emergencyPhone,
  submissionId,
  onGetHelp,
  onNotNow,
}: {
  /** Null hides the interrupt. */
  item: CatalogItem | null;
  hospitalName: string | null;
  emergencyPhone: string | null;
  submissionId?: string | null;
  onGetHelp: () => void;
  onNotNow: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const itemKey = item?.key ?? null;
  // PRD §5.5: a self-harm item interrupts calmly — no red, no haptic — and
  // its next step is the crisis screen, not the numbers.
  const calm = item?.flags?.includes("crisis_route") ?? false;

  useEffect(() => {
    if (!itemKey) return;
    if (!calm)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    emergencyEvent({ event: "interrupt_shown", itemKey, submissionId });
  }, [itemKey, submissionId, calm]);

  const call = () => {
    if (!emergencyPhone) return;
    emergencyEvent({ event: "call_tapped", itemKey: itemKey ?? undefined, submissionId });
    void Linking.openURL(telUrl(emergencyPhone)).catch(() => {});
  };
  const notNow = () => {
    emergencyEvent({ event: "declined", itemKey: itemKey ?? undefined, submissionId });
    onNotNow();
  };

  if (calm) {
    return (
      <Modal visible={item !== null} animationType="fade" onRequestClose={notNow}>
        <View
          style={[
            styles.root,
            { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[5] },
          ]}
        >
          <View style={styles.body}>
            <Text accessibilityRole="header" style={styles.item}>
              You don’t have to go through this alone.
            </Text>
            <Text style={styles.lede}>
              Talking to someone now can help. These people are there to listen.
            </Text>
          </View>
          <View style={styles.actions}>
            <Button label="Someone to talk to" onPress={onGetHelp} />
            <Button variant="link" label="This is not happening now" onPress={notNow} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={item !== null} animationType="fade" onRequestClose={notNow}>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[5] },
        ]}
      >
        <View style={styles.band} accessibilityRole="header">
          <Ionicons name="alert-circle" size={26} color={colors.status.criticalFg} />
          <Text style={styles.bandText}>{t(CATALOG, "tier.E")}</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.eyebrow}>Because you chose</Text>
          <Text style={styles.item}>{item ? t(CATALOG, item.labelKey) : ""}</Text>
          <Text style={styles.lede}>
            This can be an emergency. Get help now — call, or go to the nearest hospital.
          </Text>
        </View>

        <View style={styles.actions}>
          {emergencyPhone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${hospitalName ?? "the hospital"} on ${emergencyPhone}`}
              onPress={call}
              style={({ pressed }) => [styles.call, pressed && styles.pressed]}
            >
              <Ionicons name="call-outline" size={22} color={colors.status.criticalFg} />
              <View style={styles.callText}>
                <Text style={styles.callLabel}>Call {hospitalName ?? "the hospital"}</Text>
                <Text style={styles.callNumber}>{emergencyPhone}</Text>
              </View>
            </Pressable>
          ) : null}
          <Button label={t(CATALOG, "tier.E")} onPress={onGetHelp} />
          <Button variant="link" label="This is not happening now" onPress={notNow} />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, paddingHorizontal: space[5], gap: space[6], backgroundColor: c.background },
    band: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.xl,
      backgroundColor: c.status.criticalBg,
    },
    bandText: {
      fontFamily: font.display,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: -0.4,
      color: c.status.criticalFg,
    },
    body: { flex: 1, gap: space[2] },
    eyebrow: { fontFamily: font.body, fontSize: 13, letterSpacing: 0.3, color: c.mutedForeground },
    item: {
      fontFamily: font.display,
      fontSize: 24,
      lineHeight: 30,
      letterSpacing: -0.3,
      color: c.foreground,
    },
    lede: {
      fontFamily: font.body,
      fontSize: 16,
      lineHeight: 23,
      color: c.foreground,
      marginTop: space[2],
    },
    actions: { gap: space[3] },
    call: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      minHeight: 64,
      paddingHorizontal: space[5],
      paddingVertical: space[3],
      borderRadius: radius.full,
      backgroundColor: c.status.criticalBg,
      borderWidth: 1.5,
      borderColor: c.status.criticalFg,
    },
    callText: { flex: 1, gap: 1 },
    callLabel: { fontFamily: font.bodyMedium, fontSize: 16, color: c.status.criticalFg },
    callNumber: { fontFamily: font.mono, fontSize: 15, color: c.foreground },
    pressed: { opacity: 0.85 },
  });
