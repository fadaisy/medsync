import { Stack } from "expo-router";

import { usePushNotifications } from "@/lib/push";
import { useSession } from "@/lib/session";
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
 *
 * The consent gate (Gate H, ADR 0094) is a second `Stack.Protected` pair, the
 * root gate's idiom: until the check comes back `clear`, `consent` is the
 * only screen in the navigator — it holds while checking, asks when a text
 * is due, offers Retry when the read failed — and every other
 * one — the tabs, the doors, a visit a push could deep-link to — is dropped
 * from it, so nothing under the gate can be reached or swiped back to.
 * Every screen is listed so the guard covers it; none carries options here.
 */
/** The tabs are the floor of this stack: Back from any pushed screen lands on them. */
export const unstable_settings = { anchor: "(tabs)" };

export default function AppLayout() {
  const { colors } = useTheme();
  const { consent } = useSession();
  const gated = consent.kind !== "clear";
  // Gate E: this stack exists only with a session, so "mounted" is "signed in".
  usePushNotifications(true);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={gated}>
        <Stack.Screen name="consent" />
      </Stack.Protected>

      <Stack.Protected guard={!gated}>
        <Stack.Screen name="(tabs)" />
        {/* Tide v1 (ADR 0340). The Plus opens over the current screen. */}
        <Stack.Screen
          name="add"
          options={{
            presentation: "transparentModal",
            animation: "fade",
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="mood" />
        <Stack.Screen name="visits/[id]" />
        <Stack.Screen name="book/index" />
        <Stack.Screen name="book/today" />
        <Stack.Screen name="book/day" />
        <Stack.Screen name="care/medicines" />
        <Stack.Screen name="care/reading" />
        <Stack.Screen name="care/trends" />
        <Stack.Screen name="care/labs" />
        <Stack.Screen name="care/activity" />
        <Stack.Screen name="care/chat" />
        <Stack.Screen name="records/index" />
        <Stack.Screen name="records/[id]" />
        <Stack.Screen name="danger" options={{ animation: "fade" }} />
        <Stack.Screen name="household" />
        <Stack.Screen name="ticket" />
        <Stack.Screen name="today" />
        {/* ADR 0098: the symptom catalog pre-step and the Emergency Pathway's
            pre-alert, status and calm routes. E1 itself is the Emergency tab. */}
        <Stack.Screen name="symptoms" />
        <Stack.Screen name="emergency/lines" />
        <Stack.Screen name="emergency/tell" />
        <Stack.Screen name="emergency/status" />
        <Stack.Screen name="emergency/crisis" />
        <Stack.Screen name="emergency/sv" />
      </Stack.Protected>
    </Stack>
  );
}
