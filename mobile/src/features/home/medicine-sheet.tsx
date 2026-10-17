import { useState } from "react";
import { Text, View } from "react-native";

import { Button, Icon, IconDisc, Note, Press, Sheet } from "@/components/tide";
import { medicinesRepo, SLOT_WORDS, useMedicines } from "@/data/medicines";
import { AddMedicineForm } from "@/features/care/add-medicine";
import { useNow } from "@/lib/use-now";
import { savedLine } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * "Which one did you take?" in place, from the Plus (F-05). Today's doses
 * from the patient's own list with I took it (or Took it early), undo,
 * "Something not on my list" to add one, and the one safety line about
 * missed doses. Names and times only (law L5).
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
  const { doses, taken, total, loading, error, retry } = useMedicines(now);
  const [adding, setAdding] = useState(false);

  const close = () => {
    setAdding(false);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      overline={total ? `Today · ${taken} of ${total} taken` : "Today"}
      overlineColor={t.area.medicines}
      title={adding ? "Add a medicine" : "Which one did you take?"}
    >
      {adding ? (
        <AddMedicineForm
          onCancel={() => setAdding(false)}
          onDone={(text) => {
            setAdding(false);
            onToast(text);
          }}
        />
      ) : (
        <>
          <View style={{ gap: tSpace[2] }}>
            {loading && !doses.length ? (
              <Text style={[tType.bodyM, { color: t.ink2 }]}>Loading your medicines…</Text>
            ) : error ? (
              <View style={{ gap: tSpace[2] }}>
                <Text style={[tType.bodyM, { color: t.ink2 }]}>
                  Couldn&apos;t load your medicines.
                </Text>
                <Button label="Try again" variant="outline" size="sm" onPress={retry} />
              </View>
            ) : !doses.length ? (
              <Text style={[tType.bodyM, { color: t.ink2 }]}>
                No doses on your list for today. Add a medicine below.
              </Text>
            ) : null}
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
                      : d.status === "missed"
                        ? "Not marked"
                        : "No entry";
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
                      onPress={async () => {
                        const r = await medicinesRepo.undo(d.id);
                        onToast(r === "failed" ? "Couldn't undo that. Try again later." : "Undone");
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
                      onPress={async () => {
                        const r = await medicinesRepo.take(d.id, now);
                        onToast(
                          savedLine(
                            r,
                            d.status === "later" ? `Saved as taken early · ${d.time}` : "Saved",
                          ),
                        );
                      }}
                    />
                  )}
                </View>
              );
            })}
          </View>
          <Press
            onPress={() => setAdding(true)}
            accessibilityLabel="Something not on my list. Add a medicine."
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
              <Text style={[tType.labelS, { color: t.ink }]}>Something not on my list</Text>
              <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
                Add it by name and the times you take it
              </Text>
            </View>
          </Press>
          <Note>
            Missed one? Do not take two at once. Ask your clinician or pharmacist what to do.
          </Note>
          <Button label="Done" onPress={close} />
        </>
      )}
    </Sheet>
  );
}
