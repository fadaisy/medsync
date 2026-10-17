import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Card, Icon, Pill, Screen } from "@/components/tide";
import { useRecords } from "@/data/records";
import { RecordsStatusBlock } from "@/features/care-more/lab-parts";
import { formatDateLong } from "@/lib/booking";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * Visit records (ADR 0342 §2): the visit summaries a clinician shared with
 * this patient, newest first. Real, through the web's route; the last good
 * list stays on the phone for reading offline.
 */
export default function RecordsScreen() {
  const t = useTide();
  const router = useRouter();
  const r = useRecords();
  return (
    <Screen back={{ label: "Me" }} title="Visit records" gap={tSpace[3]} helpSource="records">
      <Text style={[tType.bodyS, { color: t.ink2, marginTop: -tSpace[2] }]}>
        What your clinicians shared with you after each visit
      </Text>
      <RecordsStatusBlock
        status={r.status}
        message={r.message}
        count={r.items.length}
        empty="No visit records yet. After a visit, your clinician can share a summary with you, and it shows here."
        onRetry={r.reload}
      />
      {r.items.map((v) => {
        const day = formatDateLong(v.startedAt);
        return (
          <Card
            key={v.id}
            onPress={() => router.push({ pathname: "/records/[id]", params: { id: v.id } })}
            accessibilityLabel={`${day}, ${v.hospitalName}. ${v.outcome}${v.updated ? " Updated." : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[tType.label, { color: t.ink }]}>{day}</Text>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>
                {v.hospitalName}
                {v.clinician ? ` · ${v.clinician}` : ""}
              </Text>
              <Text style={[tType.bodyS, { color: t.ink }]}>{v.outcome}</Text>
              {v.updated ? (
                <Pill label="Updated" bg={t.surface2} style={{ marginTop: tSpace[1] }} />
              ) : null}
            </View>
            <Icon name="forward" size={20} color={t.ink3} />
          </Card>
        );
      })}
    </Screen>
  );
}
