import type { IconName } from "@/components/tide/icon";

import { createStore, useStore } from "@/data/store";

/**
 * Notifications. Demo data for now: the medicine, lab and care-team items are
 * clinical (law L2), and the visit items will come from the booking
 * notifications once they are mapped. Every item can carry an action that
 * works inside the row.
 */
export type NotifGroup = "today" | "yesterday" | "earlier";
export type NotifFilter = "all" | "care" | "visit" | "med";
export type NotifAction =
  | { kind: "takeDose"; doseId: string }
  | { kind: "link"; label: string; href: string };

export interface Notif {
  id: string;
  group: NotifGroup;
  type: Exclude<NotifFilter, "all">;
  icon: IconName;
  area: "medicines" | "visits" | "team" | "readings";
  title: string;
  line: string;
  time: string;
  action?: NotifAction;
  /** Tapping the whole row opens this. */
  href?: string;
}

export const NOTIFICATIONS: Notif[] = [
  {
    id: "1",
    group: "today",
    type: "med",
    icon: "pill",
    area: "medicines",
    title: "Midday medicine is due",
    line: "[Medicine B] · 13:00",
    time: "13:00",
    action: { kind: "takeDose", doseId: "n" },
  },
  {
    id: "2",
    group: "today",
    type: "visit",
    icon: "users",
    area: "visits",
    title: "3 people before you",
    line: "Diabetes clinic · Dr [Name A]. If you are far, leave now.",
    time: "12:40",
    action: { kind: "link", label: "Open ticket", href: "/book/today" },
  },
  {
    id: "3",
    group: "today",
    type: "care",
    icon: "message",
    area: "team",
    title: "Your care team replied",
    line: "About this morning's blood pressure",
    time: "09:15",
    action: { kind: "link", label: "Reply", href: "/care/chat" },
  },
  {
    id: "4",
    group: "yesterday",
    type: "care",
    icon: "flask",
    area: "medicines",
    title: "Lab results are ready",
    line: "HbA1c, cholesterol and kidney tests. 2 need review.",
    time: "16:20",
    action: { kind: "link", label: "See results", href: "/care/labs" },
  },
  {
    id: "5",
    group: "yesterday",
    type: "visit",
    icon: "calendar",
    area: "visits",
    title: "Diabetes review on Fri 23 Oct",
    line: "Bring your medicines and sugar meter",
    time: "10:00",
    href: "/visits",
  },
  {
    id: "6",
    group: "yesterday",
    type: "care",
    icon: "activity",
    area: "readings",
    title: "Your week in sugar",
    line: "In target 3 of 7 mornings. Better than last week.",
    time: "08:00",
    href: "/care/trends",
  },
  {
    id: "7",
    group: "earlier",
    type: "med",
    icon: "pill",
    area: "medicines",
    title: "Refill ready to collect",
    line: "[Medicine A] · pharmacy window 2",
    time: "Thu",
    href: "/care/chat",
  },
  {
    id: "8",
    group: "earlier",
    type: "visit",
    icon: "calendar",
    area: "visits",
    title: "Booking confirmed",
    line: "Tue 20 Oct · morning",
    time: "Wed",
    href: "/visits",
  },
];

export const GROUP_WORDS: Record<NotifGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier this week",
};

const store = createStore<{ read: Record<string, boolean> }>({
  read: { "4": true, "5": true, "6": true, "7": true, "8": true },
});

export const notificationsRepo = {
  demo: true,
  markRead(id: string) {
    store.set((s) => ({ read: { ...s.read, [id]: true } }));
  },
  markAllRead() {
    store.set({ read: Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, true])) });
  },
};

export function useNotifications() {
  const s = useStore(store);
  const unread = NOTIFICATIONS.filter((n) => !s.read[n.id]).length;
  return { items: NOTIFICATIONS, read: s.read, unread };
}
