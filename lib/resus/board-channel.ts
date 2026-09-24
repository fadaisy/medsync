import type { BoardEpisodeMessage } from "@/lib/resus/arrest-alarm";

import { createClient } from "@/lib/supabase/client";

/**
 * One shared subscription per hospital to the private `resus-board:<hospital>`
 * topic (client side). realtime-js hands out ONE channel object per topic, so two
 * components subscribing on their own (the board and the arrest alarm) would
 * subscribe it twice (it throws) and the first to unmount would tear down the
 * other's. Every listener goes through here instead; the channel closes a moment
 * after its last listener leaves (the grace absorbs a remount on navigation).
 */

export interface BoardListener {
  onEpisode?: (m: BoardEpisodeMessage) => void;
  onStatus?: (live: boolean) => void;
}

interface Hub {
  listeners: Set<BoardListener>;
  live: boolean;
  closeTimer: ReturnType<typeof setTimeout> | null;
  close: () => void;
}

const hubs = new Map<string, Hub>();
const CLOSE_GRACE_MS = 1_000;

function openHub(hospitalId: string): Hub {
  const supabase = createClient();
  let closed = false;
  const channel = supabase.channel(`resus-board:${hospitalId}`, { config: { private: true } });
  const hub: Hub = {
    listeners: new Set(),
    live: false,
    closeTimer: null,
    close: () => {
      closed = true;
      hubs.delete(hospitalId);
      void supabase.removeChannel(channel);
    },
  };
  channel.on("broadcast", { event: "episode" }, ({ payload }) => {
    const m = payload as Partial<BoardEpisodeMessage> | undefined;
    if (!m?.episodeId || !m.state || !m.phase) return;
    for (const l of hub.listeners) l.onEpisode?.(m as BoardEpisodeMessage);
  });
  void supabase.realtime
    .setAuth()
    .catch(() => undefined)
    .then(() => {
      if (closed) return;
      channel.subscribe((status) => {
        if (closed) return;
        hub.live = status === "SUBSCRIBED";
        for (const l of hub.listeners) l.onStatus?.(hub.live);
      });
    });
  return hub;
}

/** Listen to one hospital's board topic; returns the unsubscribe. */
export function subscribeResusBoard(hospitalId: string, listener: BoardListener): () => void {
  const hub = hubs.get(hospitalId) ?? openHub(hospitalId);
  hubs.set(hospitalId, hub);
  if (hub.closeTimer) clearTimeout(hub.closeTimer);
  hub.closeTimer = null;
  hub.listeners.add(listener);
  listener.onStatus?.(hub.live);
  return () => {
    hub.listeners.delete(listener);
    if (hub.listeners.size > 0) return;
    hub.closeTimer = setTimeout(() => {
      if (hub.listeners.size === 0) hub.close();
    }, CLOSE_GRACE_MS);
  };
}
