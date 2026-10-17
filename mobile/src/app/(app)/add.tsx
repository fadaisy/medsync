import type { IconName } from "@/components/tide";
import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, HelpButton, Icon, IconDisc, Press, Toast } from "@/components/tide";
import { medicinesRepo, SLOT_WORDS, useMedicines } from "@/data/medicines";
import { MedicineSheet } from "@/features/home/medicine-sheet";
import { ReadingSheet } from "@/features/home/reading-sheet";
import { savedWords } from "@/lib/flags";
import { useNow } from "@/lib/use-now";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

type SheetKind = "reading" | "medicine" | null;

/**
 * The Plus (F-05): what is due right now, then three bubbles that fan out of
 * the plus. A reading and a dose are logged in place on a sheet, so the
 * common case is two taps; "Tell my team" opens the chat.
 */
export default function AddScreen() {
  const t = useTide();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const now = useNow();
  const { dueNow } = useMedicines(now);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(null), 3500);
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const due = dueNow[0];

  const bubbles: {
    key: string;
    label: string;
    icon: IconName;
    color: string;
    dx: number;
    dy: number;
    onPress: () => void;
  }[] = [
    {
      key: "reading",
      label: "Log a reading",
      icon: "activity",
      color: t.area.readings,
      dx: 96,
      dy: 56,
      onPress: () => setSheet("reading"),
    },
    {
      key: "medicine",
      label: "I took a medicine",
      icon: "pill",
      color: t.area.medicines,
      dx: 0,
      dy: 104,
      onPress: () => setSheet("medicine"),
    },
    {
      key: "team",
      label: "Tell my team",
      icon: "message",
      color: t.area.team,
      dx: -96,
      dy: 56,
      onPress: () => router.push("/care/chat"),
    },
  ];

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: t.bg }, motion.scrimIn(reduced)]}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: tSpace[5],
          minHeight: insets.top + 50,
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <HelpButton source="add" />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: tSpace[5], gap: tSpace[4], paddingBottom: 300 }}
      >
        <Text accessibilityRole="header" style={[tType.display, { color: t.ink }]}>
          What would you like to do?
        </Text>

        <View style={{ gap: tSpace[2] }}>
          <Text style={[tType.overline, { color: t.ink3 }]}>Right now</Text>
          {due ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[3],
                padding: tSpace[3.5],
                borderRadius: tRadius.cardLg,
                backgroundColor: t.accentTint,
                borderWidth: 2,
                borderColor: t.accent,
              }}
            >
              <IconDisc name="pill" size={40} color={t.area.medicines} bg={t.surface} />
              <View style={{ flex: 1 }}>
                <Text style={[tType.label, { color: t.ink }]}>
                  {SLOT_WORDS[due.slot]} medicine is due
                </Text>
                <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
                  {due.medicine} · {due.time}
                </Text>
              </View>
              <Button
                size="sm"
                label="I took it"
                onPress={() => {
                  medicinesRepo.take(due.id, now);
                  say(savedWords("it"));
                }}
              />
            </View>
          ) : null}
          <Press
            onPress={() => setSheet("reading")}
            accessibilityLabel="Evening blood pressure. Due at 20:00. Log it now."
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[3],
              padding: tSpace[3.5],
              borderRadius: tRadius.cardLg,
              backgroundColor: t.surface,
              boxShadow: t.shadow.card,
            }}
          >
            <IconDisc name="activity" size={40} color={t.area.readings} bg={t.surface2} />
            <View style={{ flex: 1 }}>
              <Text style={[tType.label, { color: t.ink }]}>Evening blood pressure</Text>
              <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
                Due at 20:00 · your doctor asked for it
              </Text>
            </View>
            <Icon name="forward" size={20} color={t.ink3} />
          </Press>
          <View
            accessible
            accessibilityLabel="Speaking to the app is coming later"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[3],
              padding: tSpace[3.5],
              borderRadius: tRadius.cardLg,
              backgroundColor: t.surface2,
            }}
          >
            <Icon name="mic" size={20} color={t.ink3} />
            <Text style={[tType.bodyM, { color: t.ink3, flex: 1 }]}>
              Or just say it, in English or Luganda · coming later
            </Text>
          </View>
        </View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: insets.bottom + 18,
          alignItems: "center",
        }}
      >
        <View style={{ width: 320, height: 190 }} pointerEvents="box-none">
          {bubbles.map((b, i) => (
            <Animated.View
              key={b.key}
              style={[
                {
                  position: "absolute",
                  left: 160 - 55 - b.dx,
                  top: 104 - b.dy,
                  width: 110,
                  alignItems: "center",
                  gap: tSpace[1.5],
                },
                motion.fanRise(i, b.dx, b.dy, reduced),
              ]}
            >
              <Press
                onPress={b.onPress}
                accessibilityLabel={b.label}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: t.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: t.shadow.float,
                }}
              >
                <Icon name={b.icon} size={26} color={b.color} />
              </Press>
              <Text style={[tType.caption, { fontSize: 13, color: t.ink, textAlign: "center" }]}>
                {b.label}
              </Text>
            </Animated.View>
          ))}
        </View>
        <Animated.View style={motion.plusIn(reduced)}>
          <Press
            onPress={close}
            accessibilityLabel="Close"
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: t.primary,
              alignItems: "center",
              justifyContent: "center",
              boxShadow: t.shadow.float,
            }}
          >
            <Icon name="close" size={26} color={t.onPrimary} strokeWidth={2.4} />
          </Press>
        </Animated.View>
      </View>

      <ReadingSheet visible={sheet === "reading"} onClose={() => setSheet(null)} onSaved={say} />
      <MedicineSheet visible={sheet === "medicine"} onClose={() => setSheet(null)} onToast={say} />
      {toast ? <Toast text={toast} bottom={insets.bottom + 220} /> : null}
    </Animated.View>
  );
}
