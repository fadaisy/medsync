import type { LabelValues, ProductDraft, ProductSource } from "@/data/products";
import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Text, View } from "react-native";

import { Button, Icon, Note, Press, TextField } from "@/components/tide";
import { draftFromForm, labelFromPhoto } from "@/data/products";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/** The barcodes printed on food packs. */
const FOOD_CODES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

/** The back camera looking for a food barcode; the first one found is handed on, once. */
export function BarcodeScan({ onCode }: { onCode: (code: string) => void }) {
  const t = useTide();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const taken = useRef(false);

  if (!permission?.granted)
    return (
      <View style={{ gap: tSpace[3] }}>
        <Note tone="info" icon="camera">
          MedSync needs the camera to read the barcode on the pack. Nothing else is recorded.
        </Note>
        <Button label="Allow the camera" onPress={() => void requestPermission()} />
      </View>
    );

  return (
    <View
      style={{ height: 300, borderRadius: tRadius.xl, overflow: "hidden", backgroundColor: t.band }}
    >
      <CameraView
        style={{ position: "absolute", inset: 0 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...FOOD_CODES] }}
        onBarcodeScanned={({ data }) => {
          if (taken.current || !/^\d{6,14}$/.test(data)) return;
          taken.current = true;
          onCode(data);
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: "12%",
          right: "12%",
          top: "38%",
          height: "24%",
          borderRadius: tRadius.md,
          borderWidth: 3,
          borderColor: t.onBand,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 14,
          flexDirection: "row",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <Press
          onPress={() => setTorch((v) => !v)}
          accessibilityLabel="Torch"
          accessibilityState={{ checked: torch }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: torch ? t.onBand : t.bandGlass,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="torch" size={20} color={torch ? t.band : t.onBand} />
        </Press>
        <View
          accessibilityLiveRegion="polite"
          style={{
            minHeight: 44,
            paddingHorizontal: tSpace[4],
            borderRadius: tRadius.pill,
            backgroundColor: t.bandGlass,
            justifyContent: "center",
          }}
        >
          <Text style={[tType.caption, { fontSize: 13, color: t.onBand }]}>
            Hold the barcode inside the box
          </Text>
        </View>
      </View>
    </View>
  );
}

const FIELDS: { key: keyof LabelValues; label: string; optional?: boolean }[] = [
  { key: "kcal", label: "Energy (kcal per 100 g)" },
  { key: "carbs", label: "Carbohydrate (g per 100 g)" },
  { key: "protein", label: "Protein (g per 100 g)", optional: true },
  { key: "fat", label: "Fat (g per 100 g)", optional: true },
  { key: "fibre", label: "Fibre (g per 100 g)", optional: true },
  { key: "servingG", label: "One serving (g)", optional: true },
];

/**
 * A packaged food from its label: photographed and read for the patient to
 * check, or typed. Values are per 100 g (or 100 ml), as labels print them.
 */
export function ProductForm({
  barcode,
  intro,
  onDone,
}: {
  barcode: string | null;
  intro: string;
  onDone: (draft: ProductDraft) => void;
}) {
  const t = useTide();
  const [v, setV] = useState<LabelValues>({});
  const [source, setSource] = useState<ProductSource>("typed");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async () => {
    setReading(true);
    setNote(null);
    const r = await labelFromPhoto();
    setReading(false);
    if (r.ok) {
      setV((old) => ({
        ...old,
        ...Object.fromEntries(Object.entries(r.values).filter(([, x]) => x)),
      }));
      setSource("label_photo");
      setNote("Check each value against the label before you go on.");
    } else if (!("cancelled" in r)) setNote(r.message);
  };

  return (
    <View style={{ gap: tSpace[3] }}>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>{intro}</Text>
      <Button
        label="Read the label from a photo"
        icon="camera"
        variant="soft"
        busy={reading}
        onPress={() => void read()}
      />
      {note ? <Note tone="info">{note}</Note> : null}
      <TextField
        label="Name"
        value={v.name ?? ""}
        onChangeText={(name) => setV((o) => ({ ...o, name }))}
        placeholder="As on the pack"
      />
      {FIELDS.map((f) => (
        <TextField
          key={f.key}
          label={f.label}
          optional={f.optional}
          value={v[f.key] ?? ""}
          onChangeText={(x) => setV((o) => ({ ...o, [f.key]: x }))}
          keyboardType="decimal-pad"
        />
      ))}
      {error ? <Text style={[tType.caption, { color: t.ink }]}>{error}</Text> : null}
      <Button
        label="Continue"
        onPress={() => {
          const r = draftFromForm(v, barcode, source);
          if (!r.ok) return setError(r.error);
          setError(null);
          onDone(r.draft);
        }}
      />
    </View>
  );
}
