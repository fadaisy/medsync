import { useEffect } from "react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { Platform } from "react-native";

import { ackNotification } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

/**
 * Expo push (Gate E, ADR 0090). Three jobs:
 *
 *   1. After sign-in, ask once and store this device's token in `push_tokens`
 *      under RLS (own-row INSERT/UPDATE). No token, no push — the dispatcher
 *      then falls back to SMS where the patient allowed it.
 *   2. Before sign-out, delete the token (RLS own DELETE), so the next person
 *      on a shared phone never receives this account's messages.
 *   3. While the app is open: a push that arrives is ACKNOWLEDGED
 *      (`pt-ack-notification`) — that is what stops the SMS fallback — and a
 *      tapped one deep-links to the visit it is about.
 *
 * The permission prompt is the phone's own; Settings says in plain words what
 * notifications are for and where to turn them on when they were refused.
 *
 * ponytail: `upsert` on the token's UNIQUE. A token row left by ANOTHER
 * account on the same phone (they signed out without the network) cannot be
 * updated under RLS, and this account then has no push until that row is
 * gone. Ceiling: shared phones with a dead sign-out. Upgrade path: an Edge
 * Function that re-homes a token to the caller.
 */

/** Foreground presentation: show it — a silent arrival would be a message the patient never sees. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL = "medsync-visits";

/** What the dispatcher puts in `data` (ids only — never a name or a phone). */
interface PushData {
  dispatch_id?: string;
  kind?: string;
  related_kind?: string;
  related_id?: string;
}

/**
 * Ask, get the token, store it. Returns the token, or null when the phone
 * refused, is a simulator, or has no EAS project id to mint against — every
 * one of those is "no push for this device", not an error to show.
 */
export async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Visits",
      importance: Notifications.AndroidImportance.HIGH,
      description: "Your bookings: confirmations, reminders and changes.",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === "granted"
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  const projectId: string | undefined =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch {
    return null;
  }

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;
  await supabase
    .from("push_tokens")
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    )
    .then(
      () => undefined,
      () => undefined,
    );
  return token;
}

/** Called BEFORE `auth.signOut()` — after it the JWT is gone and RLS refuses the delete. */
export async function unregisterPushToken(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") return;
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    /* best-effort: the dispatcher drops a dead token on DeviceNotRegistered */
  }
}

/** Where a tapped notification goes. */
function destinationFor(
  data: PushData,
): { pathname: "/visits/[id]"; params: { id: string } } | "/(app)/(tabs)/visits" | null {
  if (data.related_kind === "appointment" && data.related_id) {
    return { pathname: "/visits/[id]", params: { id: data.related_id } };
  }
  if (data.related_kind === "waitlist_entry") return "/(app)/(tabs)/visits";
  return null;
}

/**
 * Mount once inside the signed-in stack. Registers the token, acks what
 * arrives, follows what is tapped — including the tap that launched the app.
 */
export function usePushNotifications(enabled: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    void registerPushToken();

    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as PushData;
      if (data.dispatch_id) void ackNotification(data.dispatch_id);
    });
    const follow = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as PushData;
      if (data.dispatch_id) void ackNotification(data.dispatch_id);
      const to = destinationFor(data);
      if (to) router.push(to);
    };
    const responded = Notifications.addNotificationResponseReceivedListener(follow);
    // The tap that cold-started the app arrives before any listener existed.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) follow(r);
    });
    return () => {
      received.remove();
      responded.remove();
    };
  }, [enabled, router]);
}
