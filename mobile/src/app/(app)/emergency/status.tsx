import type { PendingPreArrival } from "@/lib/emergency";
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { StatusPanel } from "@/components/emergency/status-panel";
import { readPendingPreArrival } from "@/lib/emergency";

/**
 * E3 for a signed-in patient (PRD §8.4). Opened by the pre-alert with the
 * receipt in its params; reopened from E1's link, or after a relaunch, from
 * the capability the phone kept.
 */
export default function StatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    token?: string;
    sentAt?: string;
    smsBody?: string;
  }>();
  const [pending, setPending] = useState<PendingPreArrival | null>(null);

  useEffect(() => {
    if (params.id) return;
    readPendingPreArrival().then((p) => {
      if (p) setPending(p);
      else router.navigate("/(app)/(tabs)/emergency");
    });
  }, [params.id, router]);

  const id = params.id ?? pending?.id;
  if (!id) return null;
  return (
    <StatusPanel
      id={id}
      token={params.token ?? pending?.token}
      sentAt={params.sentAt ?? pending?.sentAt ?? new Date().toISOString()}
      smsBody={params.smsBody || pending?.smsBody || null}
      onBack={() => router.navigate("/(app)/(tabs)/emergency")}
    />
  );
}
