import type { VisitPlace } from "@/components/tide/v2-shell";
import { Tabs, useRouter } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VisitNav } from "@/components/tide/v2-shell";

/**
 * Visit mode's four places, Home, Book, Visits and Me, in `VisitNav` (patient app v2, feature matrix 1.1; the
 * phone's default since ADR 0524). The plus is not a tab: it opens "What would you like to do?" over the
 * current screen (`/add`). Help is never in the nav; it is the red button in every screen's header (law L6).
 *
 * `care` stays a screen here without a place in the bar: Home links to it while Care mode is locked. Care
 * mode's own places (Today, Plan, My care, Me) wait for Gate CG.
 */
const ROUTE_FOR: Record<VisitPlace, string> = {
  home: "index",
  book: "booking",
  visits: "visits",
  me: "me",
};
const PLACE_FOR: Record<string, VisitPlace> = {
  index: "home",
  booking: "book",
  visits: "visits",
  me: "me",
};

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <Tabs
      // No cross-fade between tabs: a scene caught mid-fade could stay transparent (white).
      screenOptions={{ headerShown: false, animation: "none" }}
      tabBar={({ state, navigateToTab }) => (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 16, right: 16, bottom: 14 + insets.bottom }}
        >
          <VisitNav
            width={width - 32}
            current={PLACE_FOR[state.routes[state.index]?.name ?? "index"] ?? null}
            onNavigate={(place) => {
              const route = state.routes.find((r) => r.name === ROUTE_FOR[place]);
              if (route) navigateToTab(route.key);
            }}
            onPlus={() => router.push("/add")}
          />
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="booking" />
      <Tabs.Screen name="visits" />
      <Tabs.Screen name="me" />
      <Tabs.Screen name="care" />
    </Tabs>
  );
}
