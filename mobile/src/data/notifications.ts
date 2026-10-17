import type { IconName } from "@/components/tide/icon";
import type { Dose } from "@/data/medicines";
import type { Href } from "expo-router";
import { useEffect } from "react";

import { SLOT_WORDS, useMedicines } from "@/data/medicines";
import { createStore, useStore } from "@/data/store";
import { dateKey, dayLabel, formatTime } from "@/lib/booking";
import { ackNotification } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { useNow } from "@/lib/use-now";

/**
 * Notifications (F-06). Real: the patient's own `notification_dispatches`
 * (Gate E, migrations 0061/0062), read under RLS and filtered to rows sent to
 * this account, plus the medicines due now from the patient's own list. A row
 * stores no text (PHI rule), so the words come from its kind, as the web's
 * push titles do. Read means acknowledged: opening a row acks it, which also
 * stops the SMS fallback.
 */
export type NotifGroup = "today" | "yesterday" | "earlier";
export type NotifFilter = "all" | "care" | "visit" | "med";
export type NotifAction =
  | { kind: "takeDose"; doseId: string }
  | { kind: "link"; label: string; href: Href };

export interface Notif {
  id: string;
  /** The dispatch rows this item stands for (a push and its SMS are one item). Empty for a dose. */
  dispatchIds: string[];
  group: NotifGroup;
  type: Exclude<NotifFilter, "all">;
  icon: IconName;
  area: "medicines" | "visits" | "team" | "readings";
  title: string;
  line: string;
  time: string;
  /** Sort key, newest first. */
  at: string;
  unread: boolean;
  action?: NotifAction;
  /** Tapping the whole row opens this. */
  href?: Href;
}

export const GROUP_WORDS: Record<NotifGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

/** One `notification_dispatches` row as the phone reads it. */
export interface DispatchRow {
  id: string;
  kind: string;
  related_kind: string;
  related_id: string;
  payload: Record<string, unknown> | null;
  scheduled_at: string;
  acknowledged_at: string | null;
  hospitals: { name: string } | { name: string }[] | null;
}

interface KindWords {
  title: string;
  line: string;
  icon: IconName;
  type: Notif["type"];
  /** The button inside the row, when the message asks for something. */
  act?: string;
}

/**
 * Titles are the web's push titles (`composeDispatchPush`, lib/notifications/dispatches.ts);
 * the lines say what to do next, with no name or value in them.
 */
const KIND_WORDS: Record<string, KindWords> = {
  booking_receipt: {
    title: "Your visit is booked",
    line: "Open it to see the day and your code.",
    icon: "calendar",
    type: "visit",
  },
  confirmation_request: {
    title: "Are you coming tomorrow?",
    line: "Confirm you are coming, or free the place.",
    icon: "calendar",
    type: "visit",
    act: "Open visit",
  },
  reminder: {
    title: "A reminder about your visit",
    line: "Open it to see the day and time.",
    icon: "clock",
    type: "visit",
  },
  arrival_window: {
    title: "Your arrival window today",
    line: "Open it to see when to arrive.",
    icon: "clock",
    type: "visit",
    act: "Open visit",
  },
  window_shifted: {
    title: "Your arrival window has moved",
    line: "The clinic is running late. Open it to see the new window.",
    icon: "clock",
    type: "visit",
    act: "Open visit",
  },
  waitlist_offer: {
    title: "A place has opened",
    line: "Open your visits to take it before the offer closes.",
    icon: "calendar",
    type: "visit",
    act: "See the offer",
  },
  session_cancelled: {
    title: "Clinic day cancelled",
    line: "We are sorry. Open it to choose another day.",
    icon: "calendar",
    type: "visit",
    act: "Choose a day",
  },
  unconfirmed_release: {
    title: "Your place was released",
    line: "It was not confirmed. If you still need a visit, book again.",
    icon: "calendar",
    type: "visit",
    act: "Book a visit",
  },
  position_called: {
    title: "The clinic is calling you",
    line: "Open your ticket.",
    icon: "users",
    type: "visit",
    act: "Open ticket",
  },
  payment: {
    title: "About a payment",
    line: "Open MedSync for details.",
    icon: "wallet",
    type: "care",
  },
  sms_reply: {
    title: "We answered your text message",
    line: "Sent by SMS to your phone.",
    icon: "message",
    type: "care",
  },
};

const FALLBACK: KindWords = {
  title: "An update about your visit",
  line: "Open MedSync for details.",
  icon: "bell",
  type: "care",
};

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Where a row goes: its appointment, the visits list for a waitlist, the ticket when called, else nowhere. */
export function targetOf(
  row: Pick<DispatchRow, "kind" | "related_kind" | "related_id">,
): Href | undefined {
  if (row.kind === "unconfirmed_release") return "/book";
  if (row.kind === "position_called") return "/ticket";
  if (row.related_kind === "appointment")
    return { pathname: "/visits/[id]", params: { id: row.related_id } };
  if (row.related_kind === "waitlist_entry" || row.related_kind === "clinic_session")
    return "/visits";
  return undefined;
}

export function groupOf(iso: string, now: Date): NotifGroup {
  const key = dateKey(new Date(iso));
  if (key === dateKey(now)) return "today";
  if (key === dateKey(new Date(now.getTime() - 86_400_000))) return "yesterday";
  return "earlier";
}

/**
 * Rows to items. A push and its SMS fallback (same kind, same related row) are
 * one item; it is unread while none of its rows is acknowledged.
 */
export function notifsFromDispatches(rows: readonly DispatchRow[], now: Date): Notif[] {
  const byEvent = new Map<string, DispatchRow[]>();
  for (const r of rows) {
    const key = `${r.kind}:${r.related_kind}:${r.related_id}`;
    byEvent.set(key, [...(byEvent.get(key) ?? []), r]);
  }
  return [...byEvent.values()].map((group) => {
    const first = group.reduce((a, b) => (a.scheduled_at <= b.scheduled_at ? a : b));
    const w = KIND_WORDS[first.kind] ?? FALLBACK;
    const hospital = one(first.hospitals)?.name;
    const delay = first.payload?.delay_minutes;
    const line =
      first.kind === "window_shifted" && typeof delay === "number"
        ? `The clinic is running ${delay} minutes late. Open it to see the new window.`
        : w.line;
    const href = targetOf(first);
    const groupKey = groupOf(first.scheduled_at, now);
    return {
      id: first.id,
      dispatchIds: group.map((r) => r.id),
      group: groupKey,
      type: w.type,
      icon: w.icon,
      area: w.type === "visit" ? "visits" : "team",
      title: w.title,
      line: hospital ? `${hospital} · ${line}` : line,
      time:
        groupKey === "earlier"
          ? dayLabel(dateKey(new Date(first.scheduled_at)))
          : formatTime(first.scheduled_at),
      at: first.scheduled_at,
      unread: group.every((r) => r.acknowledged_at === null),
      href,
      action: w.act && href ? { kind: "link", label: w.act, href } : undefined,
    };
  });
}

/** A medicine due now, as a row with "I took it" inside it. Unread until taken. */
export function notifFromDose(d: Dose): Notif {
  return {
    id: `dose:${d.id}`,
    dispatchIds: [],
    group: "today",
    type: "med",
    icon: "pill",
    area: "medicines",
    title: `${SLOT_WORDS[d.slot]} medicine is due`,
    line: `${d.medicine} · ${d.time}`,
    time: d.time,
    at: "",
    unread: d.takenAt === null,
    action: { kind: "takeDose", doseId: d.id },
  };
}

/* ─── the store ──────────────────────────────────────────────────────── */

interface State {
  status: "loading" | "ready" | "error";
  rows: DispatchRow[];
}

const store = createStore<State>({ status: "loading", rows: [] });
let inFlight: Promise<void> | null = null;

/** The newest hundred rows sent to this account, already due, not cancelled. */
export function loadNotifications(): Promise<void> {
  inFlight ??= (async () => {
    const { data: auth } = await supabase.auth.getSession();
    const me = auth.session?.user.id;
    if (!me) {
      store.set({ status: "error", rows: [] });
      return;
    }
    const { data, error } = await supabase
      .from("notification_dispatches")
      .select(
        "id, kind, related_kind, related_id, payload, scheduled_at, acknowledged_at, hospitals(name)",
      )
      // RLS also lets staff read their facility's rows: a clinician who is a patient sees only their own here.
      .eq("recipient_user_id", me)
      .neq("state", "cancelled")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(100)
      .overrideTypes<DispatchRow[], { merge: false }>();
    store.set((s) => (error ? { ...s, status: "error" } : { status: "ready", rows: data ?? [] }));
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function ack(ids: readonly string[]) {
  const unacked = new Set(
    store
      .get()
      .rows.filter((r) => ids.includes(r.id) && r.acknowledged_at === null)
      .map((r) => r.id),
  );
  if (unacked.size === 0) return;
  const at = new Date().toISOString();
  store.set((s) => ({
    ...s,
    rows: s.rows.map((r) => (unacked.has(r.id) ? { ...r, acknowledged_at: at } : r)),
  }));
  unacked.forEach((id) => void ackNotification(id));
}

export const notificationsRepo = {
  markRead(n: Pick<Notif, "dispatchIds">) {
    ack(n.dispatchIds);
  },
  markAllRead() {
    ack(store.get().rows.map((r) => r.id));
  },
  reload: () => void loadNotifications(),
};

/**
 * Every notification, newest first: medicines due now, then the dispatch rows.
 * `read[id]` and `unread` keep Home's bell working; `status` drives loading
 * and error on the list.
 */
export function useNotifications(): {
  items: Notif[];
  read: Record<string, boolean>;
  unread: number;
  status: State["status"];
} {
  const now = useNow();
  const s = useStore(store);
  const { dueNow } = useMedicines(now);
  useEffect(() => {
    void loadNotifications();
  }, []);
  const items = [...dueNow.map(notifFromDose), ...notifsFromDispatches(s.rows, now)];
  return {
    items,
    read: Object.fromEntries(items.map((n) => [n.id, !n.unread])),
    unread: items.filter((n) => n.unread).length,
    status: s.status,
  };
}
