import type * as NotificationsModule from "expo-notifications";
import { useEffect } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
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

type Notifications = typeof NotificationsModule;
let loaded: Notifications | null | undefined;

/**
 * `expo-notifications`, or null where push cannot work: Expo Go on Android
 * dropped remote notifications in SDK 53, and merely importing the module
 * there throws, which stopped the whole app (owner's Android test, 18 Oct
 * 2026). There the app runs without push; SMS still reaches the patient. A
 * development or release build has it.
 */
export function notificationsModule(): Notifications | null {
  if (loaded !== undefined) return loaded;
  const expoGoAndroid =
    Platform.OS === "android" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (Platform.OS === "web" || expoGoAndroid) return (loaded = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("expo-notifications") as Notifications;
    // Foreground presentation: show it — a silent arrival would be a message the patient never sees.
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    loaded = null;
  }
  return loaded;
}

/** This phone's push permission, or null where push is not available at all. */
export async function pushPermission(): Promise<"granted" | "denied" | "undetermined" | null> {
  const N = notificationsModule();
  if (!N) return null;
  const p = await N.getPermissionsAsync();
  return p.status === "granted" ? "granted" : p.status === "denied" ? "denied" : "undetermined";
}

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
  const Notifications = notificationsModule();
  if (!Notifications || !Device.isDevice) return null;
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
  const Notifications = notificationsModule();
  if (!Notifications || !Device.isDevice) return;
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
    const Notifications = notificationsModule();
    if (!enabled || !Notifications) return;
    void registerPushToken();

    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as PushData;
      if (data.dispatch_id) void ackNotification(data.dispatch_id);
    });
    const follow = (response: NotificationsModule.NotificationResponse) => {
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
