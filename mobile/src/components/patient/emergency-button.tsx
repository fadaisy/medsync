import { useRouter } from "expo-router";

import { IconButton } from "@/components/ui/icon-button";

/**
 * The red disc on a pushed screen's back row — the same affordance as the
 * Emergency tab, for the screens that sit over the tab bar (ADR 0085 §5). A
 * patient mid-stroke may be on the booking screen; this is how they leave it.
 *
 * `navigate`, not `push`: the emergency screen is a tab, and a patient who
 * taps this twice must land on it once.
 */
export function EmergencyButton() {
  const router = useRouter();
  return (
    <IconButton
      icon="alert-circle"
      label="Emergency"
      tone="critical"
      onPress={() => router.navigate("/(app)/(tabs)/emergency")}
    />
  );
}
