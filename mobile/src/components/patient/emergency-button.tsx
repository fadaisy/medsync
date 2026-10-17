import type { Href } from "expo-router";
import { useRouter } from "expo-router";

import { IconButton } from "@/components/ui/icon-button";

/**
 * The red disc on a pushed screen's back row — the same door as Tide's red
 * Help (ADR 0340), for the screens not yet rebuilt in Tide (ADR 0085 §5). A
 * patient mid-stroke may be on the booking screen; this is how they leave it.
 *
 * `navigate`, not `push`: a patient who taps this twice must land on Help once.
 *
 * `href` exists for the pre-auth screens (ADR 0098 ruling 7): signed out
 * there is no tab, so the welcome and sign-in screens send the disc to the
 * root `/emergency` sheet instead.
 */
export function EmergencyButton({ href = "/help" }: { href?: Href }) {
  const router = useRouter();
  return (
    <IconButton
      icon="alert-circle"
      label="Emergency"
      tone="critical"
      onPress={() => router.navigate(href)}
    />
  );
}
