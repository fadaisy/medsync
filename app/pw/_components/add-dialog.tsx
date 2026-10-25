"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ActivityIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  MicIcon,
  PillIcon,
  PlusIcon,
} from "lucide-react";

import { Dialog } from "@/components/tide/controls";
import { ICON, IconDisc } from "@/components/tide/kit";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { cn } from "@/lib/utils";

/**
 * The plus and its Add dialog (§3: the phone's Add sheet as a centred dialog). The three doors; the
 * "Right now" due-dose card and the take dialog join at Step 3.
 */
export function AddButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={PATIENT_WEB_COPY.addLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="text-pw-ink [&:focus-visible>span:first-child]:outline-pw-focus flex flex-col items-center gap-1 text-xs leading-[14px] font-semibold focus-visible:outline-none [&:focus-visible>span:first-child]:outline-2 [&:focus-visible>span:first-child]:outline-offset-2"
      >
        <span
          className={cn(
            "shadow-pw-accent grid size-14 place-items-center rounded-full transition-[rotate,background-color] duration-250 ease-out motion-reduce:transition-none",
            open ? "bg-pw-act text-pw-on-act rotate-45" : "bg-pw-accent text-pw-on-accent",
          )}
        >
          <PlusIcon className="size-7" {...ICON} />
        </span>
        <span aria-hidden>Add</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="What would you like to do?" width="wide">
        <ul className="grid gap-3 min-[761px]:grid-cols-3">
          <Door
            href="/patient/care/readings"
            Icon={ActivityIcon}
            label="Log a reading"
            onPick={() => setOpen(false)}
          />
          <Door
            href="/patient/care/medicines"
            Icon={PillIcon}
            label="I took a medicine"
            onPick={() => setOpen(false)}
          />
          <Door
            href="/patient/book"
            Icon={CalendarPlusIcon}
            label="Book a visit"
            onPick={() => setOpen(false)}
          />
        </ul>
        <p className="rounded-pw-row bg-pw-surface-2 text-pw-ink-3 mt-4 flex min-h-12 items-center gap-3 px-4 text-[15px] font-medium">
          <MicIcon className="size-5" {...ICON} />
          Or just say it, in English or Luganda · coming later
        </p>
      </Dialog>
    </>
  );
}

function Door({
  href,
  Icon,
  label,
  onPick,
}: {
  href: string;
  Icon: typeof PillIcon;
  label: string;
  onPick: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onPick}
        className="rounded-pw-row bg-pw-surface-2 hover:bg-pw-surface-3 focus-visible:outline-pw-focus flex min-h-20 items-center gap-3 p-4 text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <IconDisc tone="accent">
          <Icon className="size-5" {...ICON} />
        </IconDisc>
        <span className="flex-1">{label}</span>
        <ChevronRightIcon className="text-pw-ink-3 size-5" {...ICON} />
      </Link>
    </li>
  );
}
