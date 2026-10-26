import type { PreArrivalView } from "@/lib/emergency";
import type { PreArrivalStatus } from "@shared/pre-arrival";
import { useCallback, useEffect, useState } from "react";
import { ACK_TIMEOUT_MS } from "@shared/pre-arrival";
import { useFocusEffect } from "expo-router";
import { Linking, Text, View } from "react-native";

import { Button, Card, Icon, Screen } from "@/components/tide";
import { preArrivalStatus, smsUrl, telUrl, writePendingPreArrival } from "@/lib/emergency";
import { ForcedScheme, useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

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
  const t = useTide();
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
      back={{ onPress: onBack }}
      helpSource="emergency-status"
      stagger={false}
      footer={
        live ? (
          <>
            <Button label="We've arrived" busy={busy} onPress={() => void act("arrived")} />
            <Button
              variant="outline"
              label="Cancel — I'm no longer coming"
              disabled={busy}
              onPress={() => void act("cancel")}
            />
          </>
        ) : undefined
      }
    >
      <View style={{ gap: tSpace[1] }}>
        <Text style={[tType.overline, { color: t.ink3 }]}>
          {view?.facility.name ? `Pre-alert to ${view.facility.name}` : "Pre-alert"}
        </Text>
        {/* The header names the state in a word; red only while the alert is live. */}
        <Text
          accessibilityRole="header"
          style={[tType.display, { color: live ? t.emergencyBand : t.ink }]}
        >
          {saidArrived ? "Arrived" : (STEPS.find((s) => s.status === status)?.word ?? "Closed")}
        </Text>
      </View>

      {unconfirmed ? (
        <View
          accessibilityRole="alert"
          style={{
            gap: tSpace[3],
            padding: tSpace[4],
            borderRadius: tRadius.card,
            backgroundColor: t.critical.tint,
          }}
        >
          <Text style={[tType.label, { lineHeight: 23, color: t.ink }]}>
            We couldn&rsquo;t confirm the hospital saw this. Please call them:
          </Text>
          {call && phone ? (
            <Button
              icon="phone"
              label={`Call ${phone}`}
              accessibilityLabel={`Call ${view?.facility.name ?? "the hospital"}, ${phone}`}
              onPress={() => void call()}
            />
          ) : (
            <Text style={[tType.bodyM, { color: t.ink }]}>
              No number is registered for this hospital yet.
            </Text>
          )}
          {sms && smsBody ? (
            <Button
              variant="outline"
              label="Send the details by SMS"
              onPress={() => {
                Linking.openURL(smsUrl(sms, smsBody)).catch(() => {});
              }}
            />
          ) : null}
        </View>
      ) : null}

      {CLOSED_WORD[status] ? (
        <Text style={[tType.bodyM, { color: t.ink }]}>{CLOSED_WORD[status]}</Text>
      ) : null}
      {saidArrived ? (
        <Text style={[tType.bodyM, { color: t.ink }]}>
          You said you have arrived. Go to the emergency entrance — the desk will find you.
        </Text>
      ) : null}

      <View style={{ gap: tSpace[3] }} accessibilityRole="list">
        {STEPS.map((step, i) => {
          const done = stepIndex >= i;
          const current = stepIndex === i;
          return (
            <View
              key={step.status}
              style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: done ? 0 : 1.5,
                  borderColor: t.lineStrong,
                  backgroundColor: done ? t.primary : t.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {done ? (
                  <Icon name="check" size={14} color={t.onPrimary} strokeWidth={2.6} />
                ) : null}
              </View>
              <Text
                style={[
                  tType.body,
                  current ? { fontFamily: tFont.semibold, color: t.ink } : { color: t.ink3 },
                ]}
                accessibilityLabel={`${step.word}${current ? ", current" : done ? ", done" : ""}`}
              >
                {step.word}
              </Text>
            </View>
          );
        })}
      </View>

      {view?.facility.directions ? (
        <Card padding={tSpace[4]} style={{ gap: tSpace[1] }}>
          <Text style={[tType.labelS, { color: t.ink }]}>Emergency entrance</Text>
          <Text style={[tType.bodyM, { color: t.ink }]}>{view.facility.directions}</Text>
        </Card>
      ) : null}

      {call && phone && !unconfirmed ? (
        <Button
          variant="outline"
          icon="phone"
          label={`Call ${phone}`}
          accessibilityLabel={`Call ${view?.facility.name ?? "the hospital"}, ${phone}`}
          onPress={() => void call()}
        />
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={[tType.bodyM, { color: t.ink }]}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
