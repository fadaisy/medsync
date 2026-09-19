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
        <Stack.Screen name="book" />
        <Stack.Screen name="clinic/[id]" />
        <Stack.Screen name="doctor/[id]" />
        <Stack.Screen name="household" />
        <Stack.Screen name="ticket" />
        <Stack.Screen name="today" />
        <Stack.Screen name="visit/[id]" />
      </Stack.Protected>
    </Stack>
  );
}
