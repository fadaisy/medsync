import { Stack } from "expo-router";

import { usePushNotifications } from "@/lib/push";
import { useTheme } from "@/theme/theme";

/**
 * The signed-in workspace. The root gate mounts this group only once a
 * session exists, so nothing under it needs to branch on `status`.
 *
 * Headers are off because every screen draws its own chrome through the
 * `Screen` kit (wordmark, back control, heading); the content background
 * repeats the root layout's so a screen transition never flashes the other
 * theme's ground between two screens.
 *
 * `(tabs)` holds home, visits and settings under the floating bar; the doors,
 * the ticket and a visit push over it from here, full-screen, with a Back.
 */
/** The tabs are the floor of this stack: Back from any pushed screen lands on them. */
export const unstable_settings = { anchor: "(tabs)" };

export default function AppLayout() {
  const { colors } = useTheme();
  // Gate E: this stack exists only with a session, so "mounted" is "signed in".
  usePushNotifications(true);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
