import type { IconName } from "@/components/tide";
import type { Anim } from "@/motion/presets";
import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HelpButton, Icon, Press, Toast } from "@/components/tide";
import { visitNavBottom } from "@/components/tide/v2-shell";
import { SLOT_WORDS, useMedicines } from "@/data/medicines";
import { lastTimeLine, useReadings } from "@/data/readings";
import { MedicineSheet } from "@/features/home/medicine-sheet";
import { ReadingSheet } from "@/features/home/reading-sheet";
import { flag } from "@/lib/flags";
import { useNow } from "@/lib/use-now";
import { EASE_OUT, motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

type SheetKind = "reading" | "medicine" | null;

/** The plus and the menu's discs are the same size as the plus in the nav, so the menu grows out of it. */
const DISC = 56;
/** How far apart the actions sit, disc to disc. */
const STEP = DISC + 14;

/**
 * The Plus (F-05; redrawn 18 Nov 2026 from the owner's approved prototype): the page stays where it is under a
 * veil, and the actions rise out of the plus in one column, each a word beside its disc, nearest first. The
 * plus turns into the close button in the same place, so the way out is under the same thumb.
 *
 * A reading and a dose are logged in place on a sheet, so the common case is two taps. "Tell my team" is here
 * only while chat is switched on (`mobileChat`): until a clinician inbox exists it would lead nowhere.
 */
export default function AddScreen() {
  const t = useTide();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const now = useNow();
  const { dueNow } = useMedicines(now);
  const { readings } = useReadings();
  const last = readings[0];
  const chat = flag("mobileChat");
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

  // Top of the column first; the last one sits nearest the plus.
  const actions: {
    key: string;
    label: string;
    note?: string;
    icon: IconName;
    color: string;
    onPress: () => void;
  }[] = [
    {
      key: "book",
      label: "Book a visit",
      icon: "calendarPlus",
      color: t.area.visits,
      onPress: () => router.replace("/book"),
    },
    ...(chat
      ? [
          {
            key: "team",
            label: "Tell my team",
            icon: "message" as const,
            color: t.area.team,
            onPress: () => router.replace("/care/chat"),
          },
        ]
      : []),
    {
      key: "medicine",
      label: "I took a medicine",
      // What is due right now, in words: the sheet it opens logs it.
      note: due ? `${SLOT_WORDS[due.slot]} medicine is due · ${due.time}` : undefined,
      icon: "pill",
      color: t.area.medicines,
      onPress: () => setSheet("medicine"),
    },
    {
      key: "reading",
      label: "Log a reading",
      note: last ? `Last: ${lastTimeLine(readings, last.input.kind, now)}` : undefined,
      icon: "activity",
      color: t.area.readings,
      onPress: () => setSheet("reading"),
    },
  ];

  const bottom = visitNavBottom(insets.bottom) + 4;
  // The plus turns a quarter of the way to a cross as the menu opens.
  const turn: Anim | null = reduced
    ? null
    : {
        animationName: {
          from: { transform: [{ rotate: "0deg" }] },
          to: { transform: [{ rotate: "45deg" }] },
        },
        animationDuration: 250,
        animationTimingFunction: EASE_OUT,
        animationFillMode: "both",
      };

  return (
    <View style={{ flex: 1 }}>
      {/* The veil: the page shows faintly through, so it is plain the menu sits over where you were. */}
      <Animated.View
        style={[
          { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
          motion.scrimIn(reduced),
        ]}
      >
        <View style={{ flex: 1, backgroundColor: t.bg, opacity: 0.92 }} />
      </Animated.View>
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close the menu"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />

      <View
        pointerEvents="box-none"
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

      <View
        pointerEvents="box-none"
        accessibilityRole="menu"
        accessibilityLabel="What would you like to do?"
        style={{
          position: "absolute",
          right: 16,
          bottom: bottom + DISC + 14,
          alignItems: "flex-end",
          gap: 14,
        }}
      >
        {actions.map((a, i) => {
          // 0 is the action nearest the plus: it has the least far to rise and goes first.
          const fromPlus = actions.length - 1 - i;
          return (
            <Animated.View
              key={a.key}
              style={motion.fanRise(fromPlus, 0, STEP * (fromPlus + 1), reduced)}
            >
              <Press
                onPress={a.onPress}
                accessibilityRole="menuitem"
                accessibilityLabel={a.note ? `${a.label}. ${a.note}` : a.label}
                style={{
                  minHeight: DISC,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tSpace[3],
                }}
              >
                <View style={{ alignItems: "flex-end", maxWidth: 240 }}>
                  <Text style={[tType.label, { fontSize: 17, lineHeight: 22, color: t.ink }]}>
                    {a.label}
                  </Text>
                  {a.note ? (
                    <Text numberOfLines={1} style={[tType.bodyS, { color: t.ink2 }]}>
                      {a.note}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={{
                    width: DISC,
                    height: DISC,
                    borderRadius: DISC / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: t.surfaceRaised,
                    boxShadow: t.shadow.float,
                  }}
                >
                  <Icon name={a.icon} size={24} color={a.color} />
                </View>
              </Press>
            </Animated.View>
          );
        })}
      </View>

      <View style={{ position: "absolute", right: 16, bottom }}>
        <Press
          onPress={close}
          accessibilityLabel="Close"
          style={{
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            backgroundColor: t.primary,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: t.shadow.float,
          }}
        >
          <Animated.View style={[{ transform: [{ rotate: "45deg" }] }, turn]}>
            <Icon name="plus" size={26} color={t.onPrimary} strokeWidth={2.4} />
          </Animated.View>
        </Press>
      </View>

      <ReadingSheet visible={sheet === "reading"} onClose={() => setSheet(null)} onSaved={say} />
      <MedicineSheet visible={sheet === "medicine"} onClose={() => setSheet(null)} onToast={say} />
      {/* Above the whole column, so the saved line never covers an action. */}
      {toast ? (
        <Toast text={toast} bottom={bottom + DISC + 14 + actions.length * STEP + 8} />
      ) : null}
    </View>
  );
}
