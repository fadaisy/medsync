import { TabList, Tabs, TabSlot, TabTrigger } from "expo-router/ui";
import Animated from "react-native-reanimated";

import {
  TAB_TRANSITION,
  TabBarClearance,
  TabButton,
  useTabBarFrame,
} from "@/components/ui/tab-bar";

/**
 * The four places a patient can stand: home (the two doors), their visits,
 * the emergency contact, and settings. The doors themselves are NOT tabs —
 * ADR 0084 §2 makes them two unequal choices on one screen, and a tab bar
 * would make them equal. They push over the tabs from home, with a Back, and
 * the bar stays behind.
 *
 * Emergency is the one red thing in the app (ADR 0085 §5): it IS the
 * emergency affordance, so it is red at rest, and nothing else may be.
 *
 * Headless tabs from `expo-router/ui` rather than the React Navigation bar,
 * because the design IS the bar: a floating pill whose current tab opens into
 * a chip. `<TabList>` and `<TabTrigger>` must be literal here — the router
 * finds the tabs by walking this JSX — so the look lives in `tab-bar.tsx`
 * and only the assembly is on this page.
 */
export default function TabsLayout() {
  const frame = useTabBarFrame();

  return (
    <TabBarClearance>
      <Tabs>
        <TabSlot />
        {/* `asChild` so the pill itself can animate its width as the chip
            moves — the plain TabList View cannot take a layout transition. */}
        <TabList asChild>
          <Animated.View layout={TAB_TRANSITION} style={frame}>
            <TabTrigger name="index" href="/(app)/(tabs)" asChild>
              <TabButton label="Home" icon="home-outline" iconActive="home" />
            </TabTrigger>
            <TabTrigger name="visits" href="/(app)/(tabs)/visits" asChild>
              <TabButton label="Visits" icon="calendar-outline" iconActive="calendar" />
            </TabTrigger>
            <TabTrigger name="emergency" href="/(app)/(tabs)/emergency" asChild>
              <TabButton
                label="Emergency"
                tone="critical"
                icon="alert-circle-outline"
                iconActive="alert-circle"
              />
            </TabTrigger>
            <TabTrigger name="settings" href="/(app)/(tabs)/settings" asChild>
              <TabButton label="Settings" icon="settings-outline" iconActive="settings" />
            </TabTrigger>
          </Animated.View>
        </TabList>
      </Tabs>
    </TabBarClearance>
  );
}
