/**
 * The v2 header avatar with the patient's own data (feature matrix 1.3, M4): initials from
 * the account name, the photo set on Me, and the unseen count from the same list the bell read. It opens
 * Notifications. `useHeaderIdentity` also gives Home the first name for its greeting.
 */
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { AvatarCount } from "@/components/tide/v2-shell";
import { initials, metaName } from "@/data/me";
import { useNotifications } from "@/data/notifications";
import { fetchMyAvatarUrl } from "@/lib/booking";
import { useSession } from "@/lib/session";

export function useHeaderIdentity(): {
  /** The whole name, or null when the account has none. */
  name: string | null;
  /** The first name, or null. */
  first: string | null;
  initials: string;
  photoUrl: string | null;
  unseen: number;
} {
  const { session } = useSession();
  const { unread } = useNotifications();
  const name = metaName(session?.user.user_metadata);
  // The photo the patient set on Me, read again whenever the screen comes back into view.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void fetchMyAvatarUrl().then(setPhotoUrl, () => {});
    }, []),
  );
  return {
    name,
    first: name ? (name.split(/\s+/)[0] ?? null) : null,
    initials: initials(name),
    photoUrl,
    unseen: unread,
  };
}

/** For a tab screen's `headerRight`: the avatar and its count, beside Help. */
export function HeaderAvatar({ size = 40 }: { size?: number }) {
  const me = useHeaderIdentity();
  return (
    <AvatarCount initials={me.initials} photoUrl={me.photoUrl} count={me.unseen} size={size} />
  );
}
