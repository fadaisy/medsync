import type { PreArrivalView } from "@/lib/emergency";
import type { Palette } from "@/theme/tokens";
import type { PreArrivalStatus } from "@shared/pre-arrival";
import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ACK_TIMEOUT_MS } from "@shared/pre-arrival";
import { useFocusEffect } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { preArrivalStatus, smsUrl, telUrl, writePendingPreArrival } from "@/lib/emergency";
import { ForcedScheme, useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * E3 — the pre-alert's status (PRD MS-PRD-SYM-001 §8.4). Polls
 * `pt-pre-arrival-status` every ten seconds while this screen is focused
 * (Realtime is the board's channel; polling is the phone's fallback and
 * needs no subscription to clean up on a dead connection). Sent → Seen by
 * hospital → Ready for you → Arrived, each a word beside its mark, never a
 * colour alone. The ack timeout (`ACK_TIMEOUT_MS`, Gate A item 4) is
 * client-side: after it, still `sent`, the screen says so and hands over
 * the call and the SMS fallback. Permanently light (Law 3).
 */
const POLL_MS = 10_000;
const STEPS: { status: PreArrivalStatus; word: string }[] = [
  { status: "sent", word: "Sent" },
  { status: "seen", word: "Seen by hospital" },
  { status: "ready", word: "Ready for you" },
  { status: "arrived", word: "Arrived" },
];
const CLOSED_WORD: Partial<Record<PreArrivalStatus, string>> = {
  cancelled: "Cancelled — you told them you are no longer coming.",
  expired: "This pre-alert has expired.",
  not_arriving: "The hospital closed this pre-alert.",
  hoax: "The hospital closed this pre-alert.",
};

export function StatusPanel(props: {
  id: string;
  token?: string;
  /** When the alert was sent — the ack timeout counts from here. */
  sentAt: string;
  smsBody?: string | null;
  onBack: () => void;
}) {
  return (
    <ForcedScheme scheme="light">
      <PanelBody {...props} />
    </ForcedScheme>
  );
}

function PanelBody({ id, token, sentAt, smsBody, onBack }: Parameters<typeof StatusPanel>[0]) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [view, setView] = useState<PreArrivalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const res = await preArrivalStatus({ pre_arrival_id: id, token });
    if (res.ok) {
      setView(res.data);
      setError(null);
    } else setError(res.error);
    setNow(Date.now());
  }, [id, token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), POLL_MS);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  const status = view?.status ?? "sent";
  const open = status === "sent" || status === "seen" || status === "ready";
  // The reporter's "We've arrived" stamps arrived_at and leaves the row open
  // for the desk to convert; the screen treats it as the last step.
  const saidArrived = open && !!view?.arrived_at;
  const live = open && !saidArrived;
  const stepIndex = saidArrived ? STEPS.length - 1 : STEPS.findIndex((s) => s.status === status);
  const unconfirmed = status === "sent" && now - Date.parse(sentAt) >= ACK_TIMEOUT_MS;

  useEffect(() => {
    if (!open) writePendingPreArrival(null);
  }, [open]);

  const act = async (action: "cancel" | "arrived") => {
    setBusy(true);
    const res = await preArrivalStatus({ pre_arrival_id: id, token, action });
    setBusy(false);
    if (res.ok) setView(res.data);
    else setError(res.error);
  };

  const phone = view?.facility.emergency_phone ?? null;
  const sms = view?.facility.emergency_sms_number ?? null;
  const call = phone ? () => Linking.openURL(telUrl(phone)).catch(() => {}) : null;

  return (
    <Screen
      onBack={onBack}
      footer={
        live ? (
          <>
            <Button label="We've arrived" busy={busy} onPress={() => void act("arrived")} />
            <Button
              variant="secondary"
              label="Cancel — I'm no longer coming"
              disabled={busy}
              onPress={() => void act("cancel")}
            />
          </>
        ) : undefined
      }
    >
      <View style={styles.column}>
        <View style={styles.head}>
          <Text style={styles.eyebrow}>
            {view?.facility.name ? `Pre-alert to ${view.facility.name}` : "Pre-alert"}
          </Text>
          {/* The header names the state in a word; red only while the alert is live. */}
          <Text accessibilityRole="header" style={[styles.title, live && styles.titleLive]}>
            {saidArrived ? "Arrived" : (STEPS.find((s) => s.status === status)?.word ?? "Closed")}
          </Text>
        </View>

        {unconfirmed ? (
          <View style={styles.warn} accessibilityRole="alert">
            <Text style={styles.warnTitle}>
              We couldn&rsquo;t confirm the hospital saw this. Please call them:
            </Text>
            {call && phone ? (
              <Button
                label={`Call ${phone}`}
                accessibilityLabel={`Call ${view?.facility.name ?? "the hospital"}, ${phone}`}
                onPress={() => void call()}
              />
            ) : (
              <Text style={styles.body}>No number is registered for this hospital yet.</Text>
            )}
            {sms && smsBody ? (
              <Button
                variant="secondary"
                label="Send the details by SMS"
                onPress={() => {
                  Linking.openURL(smsUrl(sms, smsBody)).catch(() => {});
                }}
              />
            ) : null}
          </View>
        ) : null}

        {CLOSED_WORD[status] ? <Text style={styles.body}>{CLOSED_WORD[status]}</Text> : null}
        {saidArrived ? (
          <Text style={styles.body}>
            You said you have arrived. Go to the emergency entrance — the desk will find you.
          </Text>
        ) : null}

        <View style={styles.steps} accessibilityRole="list">
          {STEPS.map((step, i) => {
            const done = stepIndex >= i;
            const current = stepIndex === i;
            return (
              <View key={step.status} style={styles.step}>
                <View style={[styles.mark, done && styles.markDone]}>
                  {done ? (
                    <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />
                  ) : null}
                </View>
                <Text
                  style={[styles.stepWord, current && styles.stepCurrent]}
                  accessibilityLabel={`${step.word}${current ? ", current" : done ? ", done" : ""}`}
                >
                  {step.word}
                </Text>
              </View>
            );
          })}
        </View>

        {view?.facility.directions ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Emergency entrance</Text>
            <Text style={styles.body}>{view.facility.directions}</Text>
          </View>
        ) : null}

        {call && phone && !unconfirmed ? (
          <Button
            variant="secondary"
            label={`Call ${phone}`}
            accessibilityLabel={`Call ${view?.facility.name ?? "the hospital"}, ${phone}`}
            onPress={() => void call()}
          />
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.body}>
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    column: { gap: space[5] },
    head: { gap: space[1] },
    eyebrow: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.mutedForeground,
    },
    title: {
      fontFamily: font.display,
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: -0.6,
      color: c.foreground,
    },
    titleLive: { color: c.status.criticalFg },
    body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: c.foreground },

    warn: {
      gap: space[3],
      padding: space[4],
      borderRadius: radius.xl,
      backgroundColor: c.status.criticalBg,
    },
    warnTitle: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 23, color: c.foreground },

    steps: { gap: space[3] },
    step: { flexDirection: "row", alignItems: "center", gap: space[3] },
    mark: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    markDone: { backgroundColor: c.primary, borderColor: c.primary },
    stepWord: { fontFamily: font.body, fontSize: 16, color: c.mutedForeground },
    stepCurrent: { fontFamily: font.bodyMedium, color: c.foreground },

    card: {
      gap: space[1],
      padding: space[4],
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    cardTitle: { fontFamily: font.bodyMedium, fontSize: 15, color: c.foreground },
  });
