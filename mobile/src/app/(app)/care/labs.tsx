import { useRouter } from "expo-router";
import { Text } from "react-native";

import { Screen } from "@/components/tide";
import { useLabsSummary } from "@/data/labs";
import { LabVisitCard, RecordsStatusBlock } from "@/features/care-more/lab-parts";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * Lab tests (F-17, ADR 0342 §2). Real: the tests ordered on each shared visit,
 * newest first. No result values exist for patients anywhere in MedSync yet,
 * so the screen shows none and says when they come, in the summary's words.
 */
export default function LabsScreen() {
  const t = useTide();
  const router = useRouter();
  const s = useLabsSummary();
  return (
    <Screen back={{ label: "Care" }} title="Lab tests" gap={tSpace[3.5]} helpSource="care/labs">
      <Text style={[tType.bodyS, { color: t.ink2, marginTop: -tSpace[2] }]}>
        Tests your clinician ordered at your visits
      </Text>
      <RecordsStatusBlock
        status={s.status}
        message={s.message}
        count={s.visits.length}
        empty="No tests yet. When a clinician orders a test at a visit and shares the visit with you, it shows here."
        onRetry={s.reload}
      />
      {s.visits.map((v) => (
        <LabVisitCard
          key={v.recordId}
          visit={v}
          onOpen={() => router.push({ pathname: "/records/[id]", params: { id: v.recordId } })}
        />
      ))}
    </Screen>
  );
}
