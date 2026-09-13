import type { WaitlistEntry } from "@/lib/notifications";
import type { Palette } from "@/theme/tokens";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { dayLabel, formatDateLong } from "@/lib/booking";
import { acceptWaitlistOffer, formatOfferExpiry, withdrawWaitlist } from "@/lib/notifications";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * A place in the line (Gate E, ADR 0090; PRD §3.3.3). Two shapes: waiting —
 * one sentence and a way out; offered — the day, "Take this place", and the
 * expiry in full words. An offer is not a hold, and the card says so.
 *
 * The state is a word ("In line" / "A place has opened"), never a colour.
 */
export function WaitlistCard({
  entry,
  onChanged,
}: {
  entry: WaitlistEntry;
  /** After an accept or a withdraw — the list re-reads; a booking is opened by its id. */
  onChanged: (result: { bookedAppointmentId?: string }) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [busy, setBusy] = useState<"accept" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offered = entry.state === "offered" && entry.offeredStartsAtIso && entry.offerExpiresAtIso;

  const accept = async () => {
    setBusy("accept");
    setError(null);
    const res = await acceptWaitlistOffer(entry.id);
    setBusy(null);
    if (!res.ok) {
      // "Someone took this place just before you…" — the server's sentence.
      setError(res.error);
      onChanged({});
      return;
    }
    onChanged({ bookedAppointmentId: res.data.appointment_id });
  };

  const withdraw = async () => {
    setBusy("withdraw");
    setError(null);
    const res = await withdrawWaitlist(entry.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChanged({});
  };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        {entry.forMember ? `For ${entry.forMember} · ` : ""}
        {offered ? "A place has opened" : "In line"}
      </Text>
      <Text style={styles.title}>{entry.serviceLineName}</Text>
      <Text style={styles.meta}>{entry.hospitalName}</Text>

      {offered ? (
        <Text style={styles.body}>
          {formatDateLong(entry.offeredStartsAtIso as string)}. This offer stays open until{" "}
          <Text style={styles.strong}>{formatOfferExpiry(entry.offerExpiresAtIso as string)}</Text>.
          The place is not held for you until you take it.
        </Text>
      ) : (
        <Text style={styles.body}>
          We will tell you when a place opens
          {entry.preferredTo
            ? ` between ${dayLabel(entry.preferredFrom)} and ${dayLabel(entry.preferredTo)}`
            : ` from ${dayLabel(entry.preferredFrom)}`}
          . Being in line does not hold a place.
        </Text>
      )}

      {error ? (
        <View style={styles.well}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
          <Text style={styles.wellText} accessibilityLiveRegion="polite">
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {offered ? (
          <Button
            label="Take this place"
            busy={busy === "accept"}
            disabled={busy === "withdraw"}
            onPress={() => void accept()}
          />
        ) : null}
        <Button
          label="Leave the list"
          variant={offered ? "link" : "secondary"}
          busy={busy === "withdraw"}
          disabled={busy === "accept"}
          onPress={() => void withdraw()}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: space[2],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    eyebrow: {
      fontFamily: font.bodyMedium,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.primary,
    },
    title: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: c.foreground },
    meta: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    body: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.foreground },
    strong: { fontFamily: font.bodyMedium },
    actions: { gap: space[2], paddingTop: space[1] },
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
