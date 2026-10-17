import type { DoseSlot } from "@/data/medicines";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button, Chip, ChipRow, TextField } from "@/components/tide";
import { medicinesRepo, SLOT_TIMES, SLOT_WORDS } from "@/data/medicines";
import { savedLine } from "@/offline/outbox";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

const SLOTS = Object.keys(SLOT_WORDS) as DoseSlot[];

/**
 * Add a medicine to the patient's own list: its name and the times of day
 * they take it. No amount is asked or kept (law L5); the web's own list
 * shows the same row.
 */
export function AddMedicineForm({
  onDone,
  onCancel,
}: {
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const t = useTide();
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<DoseSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (s: DoseSlot) =>
    setSlots((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  const save = async () => {
    setBusy(true);
    const result = await medicinesRepo.add(name, slots);
    setBusy(false);
    if (result === "failed") {
      onDone(savedLine(result));
      return;
    }
    onDone(savedLine(result, `Added ${name.trim()} · only you can see your list`));
  };

  return (
    <View style={{ gap: tSpace[3] }}>
      <TextField
        label="Name of the medicine"
        value={name}
        onChangeText={setName}
        placeholder="As written on the packet"
        maxLength={120}
      />
      <View style={{ gap: tSpace[1.5] }}>
        <Text style={[tType.caption, { fontSize: 13, color: t.ink2 }]}>
          When do you take it? Pick none if only when you need it.
        </Text>
        <ChipRow>
          {SLOTS.map((s) => (
            <Chip
              key={s}
              label={`${SLOT_WORDS[s]} · ${SLOT_TIMES[s]}`}
              size="sm"
              selected={slots.includes(s)}
              onPress={() => toggle(s)}
            />
          ))}
        </ChipRow>
      </View>
      <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3 }]}>
        Take it as your clinician prescribed. This list is for you; your care team does not see it.
      </Text>
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        <Button
          label="Add medicine"
          disabled={!name.trim()}
          busy={busy}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
        <Button label="Cancel" variant="outline" onPress={onCancel} />
      </View>
    </View>
  );
}
