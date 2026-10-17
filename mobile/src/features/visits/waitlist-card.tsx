import type { WaitlistEntry } from "@/lib/notifications";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button, Card, Note } from "@/components/tide";
import { dayLabel, formatDateLong } from "@/lib/booking";
import { acceptWaitlistOffer, formatOfferExpiry, withdrawWaitlist } from "@/lib/notifications";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * A place in the line (Gate E, ADR 0090; PRD §3.3.3), in Tide. Two shapes:
 * waiting, with one sentence and a way out; offered, with the day, "Take this
 * place" and the expiry in full words. An offer is not a hold, and the card
 * says so. The state is a word, never a colour.
 */
export function WaitlistCard({
  entry,
  onChanged,
}: {
  entry: WaitlistEntry;
  /** After an accept or a withdraw: the list re-reads; a booking is opened by its id. */
  onChanged: (result: { bookedAppointmentId?: string }) => void;
}) {
  const t = useTide();
  const [busy, setBusy] = useState<"accept" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offered = entry.state === "offered" && entry.offeredStartsAtIso && entry.offerExpiresAtIso;

  const accept = async () => {
    setBusy("accept");
    setError(null);
    const res = await acceptWaitlistOffer(entry.id);
    setBusy(null);
    if (!res.ok) {
      // "Someone took this place just before you…": the server's sentence.
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
    <Card style={{ borderWidth: offered ? 2 : 0, borderColor: t.accent }}>
      <Text style={[tType.overline, { color: offered ? t.accentText : t.ink3 }]}>
        {entry.forMember ? `For ${entry.forMember} · ` : ""}
        {offered ? "A place has opened" : "In line"}
      </Text>
      <View style={{ gap: 2 }}>
        <Text style={[tType.heading, { color: t.ink }]}>{entry.serviceLineName}</Text>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{entry.hospitalName}</Text>
      </View>
      {offered ? (
        <Text style={[tType.bodyM, { color: t.ink }]}>
          {formatDateLong(entry.offeredStartsAtIso as string)}. This offer stays open until{" "}
          <Text style={tType.label}>{formatOfferExpiry(entry.offerExpiresAtIso as string)}</Text>.
          The place is not held for you until you take it.
        </Text>
      ) : (
        <Text style={[tType.bodyM, { color: t.ink }]}>
          We will tell you when a place opens
          {entry.preferredTo
            ? ` between ${dayLabel(entry.preferredFrom)} and ${dayLabel(entry.preferredTo)}`
            : ` from ${dayLabel(entry.preferredFrom)}`}
          . Being in line does not hold a place.
        </Text>
      )}
      {error ? (
        <Note tone="plain" icon="alert">
          {error}
        </Note>
      ) : null}
      <View style={{ gap: tSpace[2] }}>
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
          variant={offered ? "soft" : "outline"}
          size="md"
          busy={busy === "withdraw"}
          disabled={busy === "accept"}
          onPress={() => void withdraw()}
        />
      </View>
    </Card>
  );
}
