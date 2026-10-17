import type { ReadingInput, ReadingKind, ReadingLevel, SugarContext } from "@/lib/readings";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Button, Chip, ChipRow, Sheet, Stepper, TextLink } from "@/components/tide";
import { readingsRepo, START_VALUES } from "@/data/readings";
import { savedWords } from "@/lib/flags";
import {
  checkReading,
  parseReading,
  readingValueText,
  SUGAR_CONTEXT_WORDS,
  THRESHOLDS_NOTE,
} from "@/lib/readings";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const KIND_WORDS: Record<ReadingKind, string> = {
  bp: "Blood pressure",
  sugar: "Blood sugar",
  weight: "Weight",
  pulse: "Pulse",
};

/** The live check line: grey while empty, then the clinical word with its colour (law L4). */
export function CheckBand({ level, text }: { level: ReadingLevel; text: string }) {
  const t = useTide();
  const pair =
    level === "empty"
      ? t.pending
      : level === "ok"
        ? t.stable
        : level === "watch"
          ? t.caution
          : t.critical;
  const dot =
    level === "empty"
      ? t.lineStrong
      : level === "ok"
        ? t.stable.text
        : level === "watch"
          ? t.caution.text
          : t.emergency;
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[2],
        paddingVertical: tSpace[2.5],
        paddingHorizontal: tSpace[3],
        borderRadius: tRadius.md,
        backgroundColor: pair.tint,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={[tType.labelS, { fontSize: 13, color: pair.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/**
 * Log a reading in place, from the Plus (F-05). Type tiles, typeable numbers
 * with − and +, the sugar timing chips, the live check and Save: two taps
 * from the Plus when the numbers are already right. A dangerous reading is
 * saved, then turns the sheet into the danger card that offers help.
 */
export function ReadingSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const t = useTide();
  const router = useRouter();
  const [kind, setKind] = useState<ReadingKind>("bp");
  const [ctx, setCtx] = useState<SugarContext>("fasting");
  const [values, setValues] = useState<
    Record<"top" | "bottom" | "sugar" | "weight" | "pulse", string>
  >({
    ...START_VALUES,
  });
  const [taps, setTaps] = useState(1);
  const [savedDanger, setSavedDanger] = useState<ReadingInput | null>(null);

  const set = (key: keyof typeof values) => (v: string) => {
    setTaps((n) => n + 1);
    setValues((s) => ({ ...s, [key]: v }));
  };

  const input: ReadingInput =
    kind === "bp"
      ? { kind, top: parseReading(values.top), bottom: parseReading(values.bottom) }
      : kind === "sugar"
        ? { kind, value: parseReading(values.sugar), context: ctx }
        : { kind, value: parseReading(values[kind]) };
  const check = checkReading(input);
  const dangerCheck = savedDanger ? checkReading(savedDanger) : null;

  const close = () => {
    setSavedDanger(null);
    setTaps(1);
    onClose();
  };

  const save = () => {
    if (check.level === "empty") return;
    readingsRepo.save(input, { entry: "sheet", taps: taps + 1 });
    if (check.level === "danger") {
      setSavedDanger(input);
      return;
    }
    close();
    onSaved(
      `Saved · ${readingValueText(input)}${check.level === "watch" ? " · above target" : ""}`,
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      overline="Log a reading"
      overlineColor={t.area.readings}
      title={dangerCheck ? "Needs attention" : KIND_WORDS[kind]}
    >
      {dangerCheck && savedDanger ? (
        <View style={{ gap: tSpace[3] }}>
          <View
            style={{
              borderRadius: tRadius.panel,
              padding: tSpace[4],
              backgroundColor: t.emergency,
              gap: tSpace[2],
            }}
          >
            <Text style={[tType.overline, { color: t.onEmergency }]}>
              Saved · this reading needs attention
            </Text>
            <Text
              style={{
                ...tType.numeral,
                fontFamily: tType.code.fontFamily,
                fontSize: 40,
                lineHeight: 44,
                color: t.onEmergency,
              }}
            >
              {readingValueText(savedDanger)}
            </Text>
            <Text style={[tType.heading, { color: t.onEmergency }]}>{dangerCheck.dangerWord}</Text>
          </View>
          <Text style={[tType.label, { color: t.ink }]}>Do you have any of these now?</Text>
          <ChipRow>
            {(dangerCheck.signs ?? []).map((s) => (
              <View
                key={s}
                style={{
                  minHeight: 34,
                  paddingHorizontal: tSpace[3],
                  borderRadius: tRadius.pill,
                  backgroundColor: t.surface2,
                  justifyContent: "center",
                }}
              >
                <Text style={[tType.bodyS, { color: t.ink }]}>{s}</Text>
              </View>
            ))}
          </ChipRow>
          <Button
            label="Yes, get help now"
            variant="danger"
            onPress={() => {
              close();
              router.push({
                pathname: "/danger",
                params: {
                  kind: savedDanger.kind,
                  value: readingValueText(savedDanger),
                  ...(savedDanger.kind === "sugar" ? { context: savedDanger.context } : {}),
                },
              });
            }}
          />
          <Button
            label={
              savedDanger.kind === "sugar" && dangerCheck.selfCare
                ? "I had something sweet · check again in 15 min"
                : "No, I feel fine · check again in 5 min"
            }
            variant="outline"
            onPress={() => {
              close();
              onSaved("We will remind you to check again");
            }}
          />
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3, textAlign: "center" }]}>
            {savedWords("this reading")}. {THRESHOLDS_NOTE}
          </Text>
        </View>
      ) : (
        <View style={{ gap: tSpace[3] }}>
          <ChipRow scroll>
            {(Object.keys(KIND_WORDS) as ReadingKind[]).map((k) => (
              <Chip
                key={k}
                label={k === "bp" ? "Blood pressure" : k === "sugar" ? "Sugar" : KIND_WORDS[k]}
                selected={kind === k}
                onPress={() => {
                  setTaps((n) => n + 1);
                  setKind(k);
                }}
              />
            ))}
          </ChipRow>

          {kind === "bp" ? (
            <View style={{ flexDirection: "row", gap: tSpace[2] }}>
              <Stepper
                label="Top number"
                unit="mmHg"
                value={values.top}
                onChange={set("top")}
                step={2}
                min={60}
                max={260}
              />
              <Stepper
                label="Bottom number"
                unit="mmHg"
                value={values.bottom}
                onChange={set("bottom")}
                step={2}
                min={30}
                max={160}
              />
            </View>
          ) : null}

          {kind === "sugar" ? (
            <View style={{ gap: tSpace[1.5] }}>
              <Text style={[tType.caption, { fontSize: 13, color: t.ink2 }]}>
                When did you check?
              </Text>
              <ChipRow scroll>
                {(Object.keys(SUGAR_CONTEXT_WORDS) as SugarContext[]).map((c) => (
                  <Chip
                    key={c}
                    size="sm"
                    label={SUGAR_CONTEXT_WORDS[c].replace(/^./, (x) => x.toUpperCase())}
                    selected={ctx === c}
                    onPress={() => {
                      setTaps((n) => n + 1);
                      setCtx(c);
                    }}
                  />
                ))}
              </ChipRow>
            </View>
          ) : null}

          {kind !== "bp" ? (
            <View style={{ flexDirection: "row" }}>
              <Stepper
                label={
                  kind === "sugar"
                    ? "Meter reading"
                    : kind === "weight"
                      ? "On the scale"
                      : "Sitting still"
                }
                unit={kind === "sugar" ? "mmol/L" : kind === "weight" ? "kg" : "beats per minute"}
                value={values[kind]}
                onChange={set(kind)}
                step={kind === "sugar" ? 0.1 : kind === "weight" ? 0.5 : 1}
                decimals={kind === "pulse" ? 0 : 1}
                min={1}
                max={300}
              />
            </View>
          ) : null}

          <CheckBand
            level={check.level}
            text={check.level === "empty" ? "Type your number, or use − and +" : check.text}
          />
          <Button
            label={check.level === "danger" ? "Save and get help" : "Save reading"}
            variant={check.level === "danger" ? "danger" : "primary"}
            disabled={check.level === "empty"}
            onPress={save}
          />
          <View style={{ alignItems: "center", gap: tSpace[1] }}>
            <TextLink
              label="Type it in instead"
              tone="info"
              onPress={() => {
                close();
                router.push("/care/reading");
              }}
            />
            <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3 }]}>{THRESHOLDS_NOTE}</Text>
          </View>
        </View>
      )}
    </Sheet>
  );
}
