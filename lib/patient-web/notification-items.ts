import type { NotifTarget } from "@patient-core/notifications";
import { FALLBACK, KIND_WORDS, notifTarget } from "@patient-core/notifications";

/**
 * Dispatch rows to list items, as the phone's `notifsFromDispatches` (mobile/src/data/notifications.ts; that file
 * mixes in React Native, so the grouping is mirrored here, the words and targets are shared). Pure.
 */
export type NotifGroup = "today" | "yesterday" | "earlier";
export type NotifFilter = "all" | "care" | "visit" | "med";

export const GROUP_WORDS: Record<NotifGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

export interface DispatchRow {
  id: string;
  kind: string;
  relatedKind: string;
  relatedId: string;
  payload: Record<string, unknown> | null;
  scheduledAt: Date;
  acknowledgedAt: Date | null;
  hospital: string | null;
}

export interface NotifItem {
  id: string;
  dispatchIds: string[];
  group: NotifGroup;
  type: "care" | "visit" | "med";
  icon: string;
  title: string;
  line: string;
  time: string;
  unread: boolean;
  href?: string;
  act?: string;
}

const TZ = "Africa/Kampala";
const dateKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** The web route for each shared target key (GATE A §1: the ticket lives on the visit; called means today's ticket). */
export function webHref(t: NotifTarget | undefined): string | undefined {
  if (!t) return undefined;
  switch (t.key) {
    case "visit":
      return `/patient/visits/${t.id}`;
    case "visits":
      return "/patient/visits";
    case "book":
      return "/patient/book";
    case "ticket":
      return "/patient/book/today";
  }
}

export function groupOf(at: Date, now: Date): NotifGroup {
  const key = dateKey(at);
  if (key === dateKey(now)) return "today";
  if (key === dateKey(new Date(now.getTime() - 86_400_000))) return "yesterday";
  return "earlier";
}

export function groupDispatches(rows: readonly DispatchRow[], now: Date): NotifItem[] {
  const byEvent = new Map<string, DispatchRow[]>();
  for (const r of rows) {
    const key = `${r.kind}:${r.relatedKind}:${r.relatedId}`;
    byEvent.set(key, [...(byEvent.get(key) ?? []), r]);
  }
  return [...byEvent.values()].map((group) => {
    const first = group.reduce((a, b) => (a.scheduledAt <= b.scheduledAt ? a : b));
    const w = KIND_WORDS[first.kind] ?? FALLBACK;
    const delay = first.payload?.delay_minutes;
    const line =
      first.kind === "window_shifted" && typeof delay === "number"
        ? `The clinic is running ${delay} minutes late. Open it to see the new window.`
        : w.line;
    const href = webHref(
      notifTarget({
        kind: first.kind,
        related_kind: first.relatedKind,
        related_id: first.relatedId,
      }),
    );
    const g = groupOf(first.scheduledAt, now);
    return {
      id: first.id,
      dispatchIds: group.map((r) => r.id),
      group: g,
      type: w.type,
      icon: w.icon,
      title: w.title,
      line: first.hospital ? `${first.hospital} · ${line}` : line,
      // The phone's DAY_FMT and TIME_FMT (mobile/src/lib/booking.ts): "Thu 18 Sep", "9:30 AM".
      time:
        g === "earlier"
          ? first.scheduledAt.toLocaleDateString("en-GB", {
              timeZone: TZ,
              weekday: "short",
              day: "numeric",
              month: "short",
            })
          : first.scheduledAt.toLocaleTimeString("en-US", {
              timeZone: TZ,
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }),
      unread: group.every((r) => r.acknowledgedAt === null),
      href,
      act: w.act && href ? w.act : undefined,
    };
  });
}
