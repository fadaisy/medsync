import type { Palette } from "@/theme/tokens";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { joinWaitlist } from "@/lib/notifications";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * "Tell me if a place opens" (Gate E, ADR 0090; PRD §3.3.3) — on a clinic
 * page when every day inside the target is full, or none is open. Disabled
 * until a reason is picked: the line will carry it onto the booking. One
 * tap; the answer is the honest position and the sentence that it holds
 * nothing. "Already on the list" is a fact, not a failure.
 */
export function WaitlistJoin({
  clinicName,
  input,
}: {
  clinicName: string;
  /** Null until the patient has picked a reason. */
  input: {
    serviceLineId: string;
    reason: string;
    preferredFrom: string;
    preferredTo?: string;
    forProvisionalId?: string;
  } | null;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "joined"; position: number | null }
    | { kind: "refused"; error: string }
  >({ kind: "idle" });

  const join = async () => {
    if (!input || busy) return;
    setBusy(true);
    const res = await joinWaitlist(input);
    setBusy(false);
    if (res.ok) setState({ kind: "joined", position: res.data.position });
    else if (/already on/i.test(res.error)) setState({ kind: "joined", position: null });
    else setState({ kind: "refused", error: res.error });
  };

  if (state.kind === "joined") {
    return (
      <View style={styles.card}>
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
          <Text style={styles.done} accessibilityLiveRegion="polite">
            {state.position === null
              ? "You are already in line"
              : `You are in line — position ${state.position}`}
          </Text>
        </View>
        <Text style={styles.body}>
          We will tell you when a place opens at {clinicName}. Being in line does not hold a place;
          you take it when we offer it.
        </Text>
        <Button
          variant="link"
          label="See it under Visits"
          onPress={() => router.replace("/(app)/(tabs)/visits")}
        />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.body}>
        Want a place at {clinicName} if one opens? We will message you, and you take it in one tap.
      </Text>
      {!input ? <Text style={styles.hint}>Pick why you are coming first.</Text> : null}
      <Button
        variant="secondary"
        label="Tell me if a place opens"
        busy={busy}
        disabled={!input}
        onPress={() => void join()}
      />
      {state.kind === "refused" ? (
        <View style={styles.well}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
          <Text style={styles.wellText} accessibilityLiveRegion="polite">
            {state.error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: space[3],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    body: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.foreground },
    hint: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    doneRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
    done: {
      fontFamily: font.bodyMedium,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.primary,
      flex: 1,
    },
    well: {
      flexDirection: "row",
      gap: space[2],
      alignItems: "flex-start",
      padding: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.status.cautionBg,
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    wellText: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
    },
  });
