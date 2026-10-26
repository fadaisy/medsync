"use client";

import type { NotifFilter, NotifGroup, NotifItem } from "@/lib/patient-web/notification-items";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  BellIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  ClockIcon,
  MessageSquareIcon,
  RotateCcwIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { Chip, ChipRow } from "@/components/tide/controls";
import { Button, buttonClass, ICON, IconDisc, Note } from "@/components/tide/kit";
import { GROUP_WORDS } from "@/lib/patient-web/notification-items";
import { cn } from "@/lib/utils";
import { ackNotificationsAction } from "../actions";

const FILTERS: { key: NotifFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "care", label: "Care" },
  { key: "visit", label: "Visits" },
  { key: "med", label: "Medicines" },
];
const GROUPS: NotifGroup[] = ["today", "yesterday", "earlier"];
const ICONS: Record<string, typeof BellIcon> = {
  calendar: CalendarDaysIcon,
  clock: ClockIcon,
  users: UsersIcon,
  wallet: WalletIcon,
  message: MessageSquareIcon,
  bell: BellIcon,
};

/** The list half of Notifications: filters, day groups, and opening a row marks it read (S8). */
export function NotificationList({ items }: { items: NotifItem[] | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<NotifFilter>("all");
  const [, start] = useTransition();
  const [read, markLocal] = useOptimistic(
    new Set<string>(),
    (s: Set<string>, ids: string[]) => new Set([...s, ...ids]),
  );

  if (items === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Note>Couldn&apos;t load your messages. Try again.</Note>
        <Button tone="soft" size="m" onClick={() => router.refresh()}>
          <RotateCcwIcon className="size-5" {...ICON} />
          Try again
        </Button>
      </div>
    );
  }

  const ack = (ids: string[]) => {
    const fresh = ids.filter((id) => !read.has(id));
    if (fresh.length === 0) return;
    start(async () => {
      markLocal(fresh);
      await ackNotificationsAction(fresh);
    });
  };
  const unread = (n: NotifItem) => n.unread && !n.dispatchIds.some((id) => read.has(id));
  const shown = items.filter((n) => filter === "all" || n.type === filter);
  const unreadIds = items.filter(unread).flatMap((n) => n.dispatchIds);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipRow label="Show">
          {FILTERS.map((f) => (
            <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Chip>
          ))}
        </ChipRow>
        {unreadIds.length > 0 ? (
          <button
            type="button"
            onClick={() => ack(unreadIds)}
            className="text-pw-accent-text focus-visible:outline-pw-focus min-h-12 px-1 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <Note>
          {filter === "all"
            ? "Nothing here yet. Messages about your visits and medicines show here."
            : "Nothing here yet."}
        </Note>
      ) : null}

      {GROUPS.map((g) => {
        const rows = shown.filter((n) => n.group === g);
        if (rows.length === 0) return null;
        return (
          <section key={g} aria-labelledby={`notif-${g}`} className="flex flex-col gap-2">
            <h2
              id={`notif-${g}`}
              className="text-pw-ink-3 text-xs leading-4 font-semibold tracking-[0.06em] uppercase"
            >
              {GROUP_WORDS[g]}
            </h2>
            <ul className="rounded-pw-card bg-pw-surface shadow-pw-card divide-pw-line divide-y overflow-hidden">
              {rows.map((n) => (
                <Row key={n.id} n={n} unread={unread(n)} onOpen={() => ack(n.dispatchIds)} />
              ))}
            </ul>
          </section>
        );
      })}

      <Link
        href="/patient/me"
        className="rounded-pw-card bg-pw-surface-2 hover:bg-pw-surface-3 focus-visible:outline-pw-focus flex items-center gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <IconDisc className="bg-pw-surface text-pw-ink-2">
          <SettingsIcon className="size-5" {...ICON} />
        </IconDisc>
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-semibold">Choose what you get</span>
          <span className="text-pw-ink-2 text-[13px] leading-[18px] font-medium">
            App, SMS, or a voice call in Luganda or English
          </span>
        </span>
        <ChevronRightIcon className="text-pw-ink-3 size-5" {...ICON} />
      </Link>
    </div>
  );
}

function Row({ n, unread, onOpen }: { n: NotifItem; unread: boolean; onOpen: () => void }) {
  const Icon = ICONS[n.icon] ?? BellIcon;
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        {unread ? <span aria-hidden className="bg-pw-accent size-2 shrink-0 rounded-full" /> : null}
        <span
          className={cn("flex-1 text-[15px] leading-5", unread ? "font-bold" : "font-semibold")}
        >
          {unread ? <span className="sr-only">New. </span> : null}
          {n.title}
        </span>
        <span className="font-pw-mono text-pw-ink-3 text-xs font-semibold">{n.time}</span>
      </span>
      <span className="text-pw-ink-2 text-[15px] leading-[21px] font-medium">{n.line}</span>
    </>
  );
  return (
    <li className="flex gap-3 p-3.5">
      <IconDisc
        className={cn(
          "bg-pw-surface-2 size-10",
          n.type === "visit" ? "text-pw-area-visits" : "text-pw-area-team",
        )}
      >
        <Icon className="size-5" {...ICON} />
      </IconDisc>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {n.href ? (
          <Link
            href={n.href}
            onClick={onOpen}
            className="focus-visible:outline-pw-focus flex flex-col gap-0.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {body}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="focus-visible:outline-pw-focus flex flex-col gap-0.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {body}
          </button>
        )}
        {n.act && n.href ? (
          <Link
            href={n.href}
            onClick={onOpen}
            className={cn(buttonClass("soft", "s"), "mt-1.5 self-start")}
          >
            {n.act}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
