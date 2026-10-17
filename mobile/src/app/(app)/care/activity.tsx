import { useState } from "react";
import { Text, View } from "react-native";

import { Screen, Segments } from "@/components/tide";
import { ACTIVITY_NOTE } from "@/data/activity";
import { EatPanel, MovePanel } from "@/features/care-more/activity-parts";
import { useToast } from "@/features/care-more/use-toast";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

const TABS = [
  { key: "move", label: "Move" },
  { key: "eat", label: "Eat" },
] as const;

/**
 * Move and eat (F-18, board TActivity). Minutes walked and glasses of water
 * are the patient's own log (ADR 0342); the plate guide is education. The
 * amber safety card carries its words and the one red "Get help" (laws L3,
 * L4). Steps, food and meal photos have no source yet, so they are not shown.
 */
export default function ActivityScreen() {
  const t = useTide();
  const now = useNow();
  const [tab, setTab] = useState<"move" | "eat">("move");
  const { toast, show } = useToast();
  return (
    <View style={{ flex: 1 }}>
      <Screen
        back={{ label: "Care" }}
        title="Move and eat"
        gap={tSpace[3.5]}
        helpSource="care/activity"
      >
        <Segments options={TABS} value={tab} onChange={setTab} />
        {tab === "move" ? (
          <MovePanel key="move" now={now} onToast={show} />
        ) : (
          <EatPanel key="eat" now={now} onToast={show} />
        )}
        <Text
          style={[
            tType.caption,
            { fontFamily: tType.bodyS.fontFamily, color: t.ink3, textAlign: "center" },
          ]}
        >
          {ACTIVITY_NOTE}
        </Text>
      </Screen>
      {toast}
    </View>
  );
}
