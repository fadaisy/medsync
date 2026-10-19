import type { AppointmentReason } from "@/lib/booking";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t as sayCatalog, visibleCategories } from "@shared/symptom-catalog/classify";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Button, Card, Icon, IconDisc, Press } from "@/components/tide";
import { PLANNED_GROUPS } from "@/features/visits/book-reasons";
import { StepTitle } from "@/features/visits/parts";
import { useCatalogMode } from "@/lib/symptoms";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

export type Door = "wrong" | "planned";

/**
 * "Why are you coming?" (board "C · Two doors first", owner 19 Oct 2026),
 * shared by Book a visit and Ask for a day. "Something is wrong" shows the
 * symptom checker's body areas and opens it on the one tapped; "Planned
 * care" lists every other Appendix A reason in plain words, grouped. The
 * "Something is wrong" card draws its own red Help, so a screen showing it
 * hides the header Help (`door === "wrong"`).
 */
export function WhyComing({
  n,
  door,
  onDoor,
  reason,
  onReason,
  onSymptoms,
}: {
  /** The step number, when the screen numbers its steps. */
  n?: number;
  door: Door | null;
  onDoor: (door: Door) => void;
  reason: AppointmentReason | null;
  onReason: (reason: AppointmentReason) => void;
  /** Open the symptom checker, on an area or (null) at the start. */
  onSymptoms: (area: string | null) => void;
}) {
  const t = useTide();
  const catalog = useCatalogMode();
  const catalogOn = !!catalog && catalog !== "off";
  const areas = visibleCategories(CATALOG, "adult");

  return (
    <View style={{ gap: tSpace[2.5] }}>
      <StepTitle n={n}>Why are you coming?</StepTitle>
      <View style={{ flexDirection: "row", gap: tSpace[2.5] }}>
        {(
          [
            [
              "wrong",
              "Something is wrong",
              "I feel unwell, or something is new or worse",
              "activity",
            ],
            [
              "planned",
              "Planned care",
              "A check, a refill, results, pregnancy, a child",
              "calendar",
            ],
          ] as const
        ).map(([key, label, sub, icon]) => {
          const on = door === key;
          return (
            <Press
              key={key}
              onPress={() => onDoor(key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label}. ${sub}`}
              style={{
                flex: 1,
                minHeight: 164,
                padding: tSpace[3.5],
                borderRadius: tRadius.panel,
                justifyContent: "space-between",
                gap: tSpace[3],
                backgroundColor: on ? t.primary : t.surface,
                borderWidth: 2,
                borderColor: on ? t.primary : t.line,
                boxShadow: on ? t.shadow.float : undefined,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <IconDisc
                  name={icon}
                  size={44}
                  color={on ? t.onBandAccent : t.ink}
                  bg={on ? t.bandGlass : t.surface3}
                />
                {on ? (
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: t.onBandAccent,
                    }}
                  >
                    <Icon name="check" size={13} color={t.primary} strokeWidth={3} />
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 4 }}>
                <Text
                  style={[
                    tType.label,
                    { fontSize: 17, lineHeight: 21, color: on ? t.onPrimary : t.ink },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    tType.caption,
                    { fontFamily: tFont.medium, color: on ? t.onBand2 : t.ink2 },
                  ]}
                >
                  {sub}
                </Text>
              </View>
            </Press>
          );
        })}
      </View>

      {door === "wrong" ? (
        <Card padding={tSpace[4]} style={{ gap: tSpace[3] }}>
          <>
            <View style={{ gap: 2 }}>
              <Text style={[tType.label, { fontSize: 16, color: t.ink }]}>
                Where do you feel it?
              </Text>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>
                Pick an area. We ask a few questions, then suggest the right door.
              </Text>
            </View>
            {catalogOn ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
                {areas.map((c) => (
                  <Press
                    key={c.key}
                    onPress={() => onSymptoms(c.key)}
                    accessibilityLabel={sayCatalog(CATALOG, c.labelKey)}
                    style={{
                      flexBasis: "48%",
                      flexGrow: 1,
                      minHeight: 48,
                      paddingHorizontal: tSpace[3],
                      paddingVertical: tSpace[2],
                      borderRadius: tRadius.field,
                      justifyContent: "center",
                      backgroundColor: t.surface2,
                    }}
                  >
                    <Text style={[tType.labelS, { color: t.ink }]}>
                      {sayCatalog(CATALOG, c.labelKey)}
                    </Text>
                  </Press>
                ))}
              </View>
            ) : null}
            <Button
              label={catalogOn ? "Something else" : "Tell us what is wrong"}
              variant="soft"
              onPress={() => onSymptoms(null)}
            />
          </>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[2.5],
              padding: tSpace[2.5],
              borderRadius: tRadius.md,
              backgroundColor: t.surface2,
            }}
          >
            <Text style={[tType.bodyS, { flex: 1, color: t.ink }]}>
              Very unwell right now? Do not book.
            </Text>
            <HelpNow />
          </View>
        </Card>
      ) : door === "planned" ? (
        PLANNED_GROUPS.map((g) => (
          <View key={g.title} style={{ gap: tSpace[1.5] }}>
            <Text
              style={[
                tType.micro,
                { fontFamily: tFont.bold, letterSpacing: 0.8, color: t.ink3, paddingLeft: 4 },
              ]}
            >
              {g.title.toUpperCase()}
            </Text>
            <Card padding={0} radius={tRadius.card} style={{ gap: 0, overflow: "hidden" }}>
              {g.reasons.map((r, i) => {
                const on = reason === r.reason;
                return (
                  <Press
                    key={r.reason}
                    haptic={false}
                    onPress={() => onReason(r.reason)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={r.label}
                    style={{
                      minHeight: 60,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tSpace[3],
                      paddingHorizontal: tSpace[3.5],
                      paddingVertical: tSpace[2.5],
                      backgroundColor: on ? t.accentTint : t.surface,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: t.line,
                    }}
                  >
                    <IconDisc
                      name={r.icon}
                      size={36}
                      color={on ? t.onBandAccent : t.ink}
                      bg={on ? t.primary : t.surface3}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[tType.labelS, { fontSize: 15, color: t.ink }]}>{r.label}</Text>
                      {on ? (
                        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
                          {r.hint}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: on ? 7 : 2,
                        borderColor: on ? t.primary : t.lineStrong,
                        backgroundColor: t.surface,
                      }}
                    />
                  </Press>
                );
              })}
            </Card>
          </View>
        ))
      ) : null}
    </View>
  );
}

function HelpNow() {
  const router = useRouter();
  return (
    <Button
      label="Help"
      icon="phone"
      variant="danger"
      size="sm"
      onPress={() => router.push("/help")}
    />
  );
}
