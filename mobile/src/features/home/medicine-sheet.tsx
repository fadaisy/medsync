import { Text, View } from "react-native";

import { Button, Icon, IconDisc, Note, Press, Sheet } from "@/components/tide";
import { medicinesRepo, SLOT_WORDS, useMedicines } from "@/data/medicines";
import { savedWords } from "@/lib/flags";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * "Which one did you take?" in place, from the Plus (F-05). Today's doses
 * with I took it (or Took it early), undo, something not on my list, and the
 * one safety line about missed doses. Names and times only (law L5).
 */
export function MedicineSheet({
  visible,
  onClose,
  onToast,
}: {
  visible: boolean;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const t = useTide();
  const now = useNow();
  const { doses, taken, total, otherReported } = useMedicines(now);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      overline={`Today · ${taken} of ${total} taken`}
      overlineColor={t.area.medicines}
      title="Which one did you take?"
    >
      <View style={{ gap: tSpace[2] }}>
        {doses.map((d) => {
          const isNow = d.status === "due";
          const line =
            d.status === "taken"
              ? `Taken at ${d.takenAt}`
              : d.status === "due"
                ? d.snoozedUntil
                  ? `Snoozed · ${d.snoozedUntil}`
                  : "Due now"
                : d.status === "later"
                  ? "Not due yet"
                  : "Not marked";
          return (
            <View
              key={d.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[3],
                padding: tSpace[3],
                borderRadius: tRadius.card,
                backgroundColor: isNow ? t.accentTint : t.surface,
                borderWidth: isNow ? 2 : 1,
                borderColor: isNow ? t.accent : t.surface3,
              }}
            >
              <View style={{ width: 54, alignItems: "center" }}>
                <Text style={{ fontFamily: tFont.monoSemibold, fontSize: 15, color: t.ink }}>
                  {d.time}
                </Text>
                <Text style={[tType.micro, { color: t.ink3 }]}>{SLOT_WORDS[d.slot]}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[tType.labelS, { fontSize: 15, color: t.ink }]}>{d.medicine}</Text>
                <Text
                  style={[
                    tType.bodyS,
                    { fontSize: 12, color: d.status === "taken" ? t.accentText : t.ink2 },
                  ]}
                >
                  {line}
                </Text>
              </View>
              {d.status === "taken" ? (
                <Press
                  onPress={() => {
                    medicinesRepo.undo(d.id);
                    onToast("Undone");
                  }}
                  accessibilityLabel={`Undo ${SLOT_WORDS[d.slot]} dose`}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: t.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="check" size={18} color={t.onPrimary} strokeWidth={2.8} />
                </Press>
              ) : (
                <Button
                  size="sm"
                  label={d.status === "later" ? "Took it early" : "I took it"}
                  variant={d.status === "later" ? "outline" : "primary"}
                  accessibilityLabel={`${d.status === "later" ? "Took it early" : "I took it"}: ${SLOT_WORDS[d.slot]} ${d.medicine}`}
                  onPress={() => {
                    medicinesRepo.take(d.id, now);
                    onToast(
                      d.status === "later" ? `Saved as taken early · ${d.time}` : savedWords("it"),
                    );
                  }}
                />
              )}
            </View>
          );
        })}
      </View>
      <Press
        onPress={() => {
          medicinesRepo.reportOther();
          onToast(medicinesRepo.demo ? "Noted on this phone · demo" : "Sent to your care team");
        }}
        accessibilityLabel="Something not on my list. Tell your care team."
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[2.5],
          padding: tSpace[3],
          borderRadius: tRadius.row,
          backgroundColor: t.surface2,
        }}
      >
        <IconDisc name="plus" size={32} color={t.area.medicines} bg={t.surface} />
        <View style={{ flex: 1 }}>
          <Text style={[tType.labelS, { color: t.ink }]}>
            {otherReported
              ? medicinesRepo.demo
                ? "Noted on this phone"
                : "Told your care team"
              : "Something not on my list"}
          </Text>
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
            {otherReported
              ? medicinesRepo.demo
                ? "Demo: nothing is sent yet"
                : "They will add it, or call you about it"
              : "Pain tablet, herbal medicine, anything else"}
          </Text>
        </View>
      </Press>
      <Note>
        Missed one? Do not take two at once. Tell your care team and they will advise you.
      </Note>
      <Button label="Done" onPress={onClose} />
    </Sheet>
  );
}
