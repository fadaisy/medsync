import type { NavPlace } from "@/components/tide";
import type { ComponentType } from "react";
import { useLocalSearchParams } from "expo-router";
import { useWindowDimensions, View } from "react-native";

import Care from "@/app/(app)/(tabs)/care";
import Home from "@/app/(app)/(tabs)/index";
import Me from "@/app/(app)/(tabs)/me";
import Visits from "@/app/(app)/(tabs)/visits";
import Add from "@/app/(app)/add";
import BookDay from "@/app/(app)/book/day";
import Book from "@/app/(app)/book/index";
import BookToday from "@/app/(app)/book/today";
import Activity from "@/app/(app)/care/activity";
import Chat from "@/app/(app)/care/chat";
import Labs from "@/app/(app)/care/labs";
import Medicines from "@/app/(app)/care/medicines";
import Reading from "@/app/(app)/care/reading";
import Trends from "@/app/(app)/care/trends";
import Danger from "@/app/(app)/danger";
import Mood from "@/app/(app)/mood";
import Notifications from "@/app/(app)/notifications";
import { Note, Screen, TideNav } from "@/components/tide";

const TABS: Record<string, ComponentType> = { home: Home, visits: Visits, care: Care, me: Me };
const PUSHED: Record<string, ComponentType> = {
  add: Add,
  book: Book,
  "book-today": BookToday,
  "book-day": BookDay,
  notifications: Notifications,
  mood: Mood,
  danger: Danger,
  medicines: Medicines,
  reading: Reading,
  trends: Trends,
  labs: Labs,
  activity: Activity,
  chat: Chat,
};

/**
 * Development builds only: renders one signed-in screen outside the sign-in
 * gate, so the web preview can screenshot it. `/dev/screen?name=home`.
 * Buttons that navigate still hit the gate; this is for looking, not flows.
 */
export default function DevScreen() {
  const { name = "home" } = useLocalSearchParams<{ name?: string }>();
  const { width } = useWindowDimensions();
  const Tab = TABS[name];
  const Pushed = PUSHED[name];
  if (Tab)
    return (
      <View style={{ flex: 1 }}>
        <Tab />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <TideNav
            current={name as NavPlace}
            onNavigate={() => {}}
            onPlus={() => {}}
            width={width}
          />
        </View>
      </View>
    );
  if (Pushed) return <Pushed />;
  return (
    <Screen title="Unknown screen" back={{}}>
      <Note>{`Try one of: ${[...Object.keys(TABS), ...Object.keys(PUSHED)].join(", ")}`}</Note>
    </Screen>
  );
}
