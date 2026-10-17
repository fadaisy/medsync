import { Text, View } from "react-native";

import { Screen } from "@/components/tide";
import { LABS_NOTE, labsRepo, PANELS, useLabsSummary } from "@/data/labs";
import { HbA1cPanel, PanelCard, SummaryTiles } from "@/features/care-more/lab-parts";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * Lab results (F-17, board TLabs). Demo data (law L2). One line per result:
 * name with its target, a range bar, the value and a word (law L4). No "ask
 * the team" button here: the chat carries the lab card.
 */
export default function LabsScreen() {
  const t = useTide();
  const s = useLabsSummary();
  return (
    <Screen
      back={{ label: "Care" }}
      title="Lab results"
      demo={labsRepo.demo}
      gap={tSpace[3.5]}
      helpSource="care/labs"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: -tSpace[2] }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.area.medicines }} />
        <Text style={[tType.bodyS, { color: t.ink2 }]}>Released {s.releasedOn}</Text>
      </View>
      <SummaryTiles needReview={s.needReview} healthy={s.healthy} visit={s.visit} />
      <HbA1cPanel />
      {PANELS.map((p) => (
        <PanelCard key={p.id} panel={p} />
      ))}
      <Text
        style={[
          tType.caption,
          { fontFamily: tType.bodyS.fontFamily, color: t.ink3, textAlign: "center" },
        ]}
      >
        {LABS_NOTE}
      </Text>
    </Screen>
  );
}
