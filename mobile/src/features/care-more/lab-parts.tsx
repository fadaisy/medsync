import type { LabVisit } from "@/data/labs";
import type { RecordsStatus } from "@/data/records";
import { ActivityIndicator, Text, View } from "react-native";

import { Button, Card, Icon, Note, TextLink } from "@/components/tide";
import { formatDateLong } from "@/lib/booking";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * Loading, error, off and empty for the records lists (Labs, Records): a
 * quiet spinner, then plain words, with Retry wherever another try could help.
 * Draws nothing extra when there is a fresh list to show.
 */
export function RecordsStatusBlock({
  status,
  message,
  empty,
  count,
  onRetry,
}: {
  status: RecordsStatus;
  message: string | null;
  /** What a new patient sees when the list is empty. */
  empty: string;
  count: number;
  onRetry: () => void;
}) {
  const t = useTide();
  if (status === "loading" && count === 0)
    return (
      <View style={{ paddingVertical: tSpace[6], alignItems: "center" }}>
        <ActivityIndicator color={t.ink3} accessibilityLabel="Loading" />
      </View>
    );
  if (status === "off") return <Note tone="plain">{message}</Note>;
  if (status === "error")
    return (
      <View style={{ gap: tSpace[3] }}>
        <Note tone="plain">{message}</Note>
        <Button label="Try again" variant="soft" size="md" icon="replay" onPress={onRetry} />
      </View>
    );
  return (
    <>
      {/* Ready, but read from the phone's copy: say so once, with a way to try again. */}
      {message ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
          <Text style={[tType.bodyS, { color: t.ink2, flex: 1 }]}>{message}</Text>
          <TextLink label="Try again" onPress={onRetry} />
        </View>
      ) : null}
      {count === 0 ? <Note tone="plain">{empty}</Note> : null}
    </>
  );
}

/** One visit's tests: when and where, the names, the summary's own sentence, and the way to the record. */
export function LabVisitCard({ visit, onOpen }: { visit: LabVisit; onOpen: () => void }) {
  const t = useTide();
  return (
    <Card padding={tSpace[3.5]} style={{ gap: tSpace[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
        <Icon name="flask" size={19} color={t.area.medicines} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[tType.label, { color: t.ink }]}>
            {formatDateLong(visit.startedAt)}
          </Text>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>{visit.hospitalName}</Text>
        </View>
      </View>
      {visit.tests.map((test) => (
        <View
          key={test.id}
          style={{ paddingVertical: tSpace[2], borderTopWidth: 1, borderTopColor: t.surface3 }}
        >
          <Text style={[tType.labelS, { color: t.ink }]}>{test.name}</Text>
        </View>
      ))}
      <Note style={{ padding: tSpace[2.5] }}>{visit.note}</Note>
      <TextLink label="Open the visit record" onPress={onOpen} />
    </Card>
  );
}
