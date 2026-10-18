import { Text, View } from "react-native";

import { Button, Card, Press } from "@/components/tide";
import { activityRepo, GLASSES, PLATE_ART, useActivity } from "@/data/activity";
import { PlateGuide } from "@/features/care-more/plate-guide";
import { savedLine } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

function Heading({ children }: { children: string }) {
  const t = useTide();
  return (
    <Text
      accessibilityRole="header"
      style={[tType.heading, { fontSize: 18, lineHeight: 24, color: t.ink }]}
    >
      {children}
    </Text>
  );
}

/* ─── Eat ────────────────────────────────────────────────────────────── */

/** The plate guide (education), water from the patient's own log, and meals not yet available. */
export function EatPanel({ now, onToast }: { now: Date; onToast: (text: string) => void }) {
  const t = useTide();
  const act = useActivity(now);
  const swatch = (c: string) => (
    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
  );
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <Card
        padding={tSpace[4]}
        style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3.5] }}
      >
        <PlateGuide />
        <View style={{ flex: 1, gap: tSpace[1] }}>
          <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Your plate guide</Text>
          {(
            [
              [PLATE_ART.greens, "Half: greens and vegetables"],
              [PLATE_ART.starch, "Quarter: matooke, posho, rice"],
              [PLATE_ART.protein, "Quarter: beans, fish, chicken"],
            ] as const
          ).map(([c, text]) => (
            <View
              key={text}
              style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}
            >
              {swatch(c)}
              <Text style={[tType.bodyS, { color: t.ink2, flex: 1 }]}>{text}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Heading>Meals</Heading>
        <Button
          label="Snap your plate"
          variant="accent"
          size="sm"
          icon="camera"
          onPress={() => onToast("Not available yet")}
        />
      </View>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>
        Writing down your meals is not available yet.
      </Text>

      <Card padding={tSpace[4]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Water</Text>
          <Text style={[tType.caption, { fontSize: 13, color: t.ink2 }]}>
            {act.loading ? "Loading…" : `${act.water} of ${GLASSES} glasses`}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: tSpace[1.5] }}>
          {Array.from({ length: GLASSES }, (_, i) => {
            const full = i < act.water;
            return (
              <Press
                key={i}
                onPress={async () => {
                  const r = await activityRepo.tapGlass(act.water, i);
                  if (r !== "sent") onToast(savedLine(r));
                }}
                accessibilityLabel={`Glass ${i + 1}${full ? ", drunk" : ""}`}
                accessibilityState={{ checked: full }}
                hitSlop={{ top: 2, bottom: 2 }}
                style={{
                  flex: 1,
                  height: 44,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 14,
                  borderBottomRightRadius: 14,
                  backgroundColor: full ? PLATE_ART.water : t.surface,
                  borderWidth: 1.5,
                  borderColor: full ? PLATE_ART.waterEdge : t.lineStrong,
                }}
              >
                <View />
              </Press>
            );
          })}
        </View>
      </Card>
    </View>
  );
}
