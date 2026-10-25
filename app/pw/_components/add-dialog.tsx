"use client";

import type { AddDialogDay } from "@/lib/patient-web/day";
import type { ComponentProps } from "react";
import Link from "next/link";
import { useState } from "react";
import { SLOT_WORDS } from "@patient-core/dose-slots";
import {
  ActivityIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  MicIcon,
  PillIcon,
  PlusIcon,
} from "lucide-react";

import { Dialog } from "@/components/tide/controls";
import { Button, ICON, IconDisc, Overline } from "@/components/tide/kit";
import { HOME_COPY } from "@/content/patient/home";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { cn } from "@/lib/utils";
import { TakeDialog, useTake } from "./take";

/**
 * The plus and its Add dialog (§3: the phone's Add sheet as a centred dialog): the "Right now" due dose with
 * I took it, the three doors (I took a medicine opens the take dialog) and the disabled "Or just say it".
 * `day` comes from the layout (`loadAddDialogDay`); absent, the dialog shows the doors only.
 */
export function AddButton({ day = null }: { day?: AddDialogDay | null }) {
  const [open, setOpen] = useState(false);
  const [taking, setTaking] = useState(false);
  const { take, pending, toast } = useTake();
  const due = day?.today.dueNow[0];
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
        {due ? (
          <section
            aria-label={HOME_COPY.rightNow}
            className="rounded-pw-row bg-pw-accent-tint mb-4 flex flex-wrap items-center gap-3 p-4"
          >
            <div className="min-w-0 flex-[1_1_220px]">
              <Overline area="medicines">{HOME_COPY.rightNow}</Overline>
              <p className="mt-1 text-[17px] leading-[22px] font-semibold">
                {HOME_COPY.slotMedicine(SLOT_WORDS[due.slot])} · {due.time}
              </p>
              <p className="text-pw-ink-2 text-[15px] font-medium">
                {HOME_COPY.asPrescribed(due.medicine)}
              </p>
            </div>
            <Button busy={pending} onClick={() => take(due, HOME_COPY.savedOnlyYou)}>
              {HOME_COPY.tookIt}
            </Button>
          </section>
        ) : null}
        <ul className="grid gap-3 min-[761px]:grid-cols-3">
          <Door
            href="/patient/care/readings"
            Icon={ActivityIcon}
            label="Log a reading"
            line={day?.lastReading ? HOME_COPY.lastReading(day.lastReading) : undefined}
            onClick={() => setOpen(false)}
          />
          <Door
            Icon={PillIcon}
            label="I took a medicine"
            onClick={() => {
              setOpen(false);
              setTaking(true);
            }}
          />
          <Door
            href="/patient/book"
            Icon={CalendarPlusIcon}
            label="Book a visit"
            onClick={() => setOpen(false)}
          />
        </ul>
        <p className="rounded-pw-row bg-pw-surface-2 text-pw-ink-3 mt-4 flex min-h-12 items-center gap-3 px-4 text-[15px] font-medium">
          <MicIcon className="size-5" {...ICON} />
          Or just say it, in English or Luganda · coming later
        </p>
      </Dialog>
      <TakeDialog open={taking} onOpenChange={setTaking} today={day?.today ?? null} />
      {toast}
    </>
  );
}

const DOOR =
  "rounded-pw-row bg-pw-surface-2 hover:bg-pw-surface-3 focus-visible:outline-pw-focus flex min-h-20 w-full items-center gap-3 p-4 text-left text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";

function Door({
  href,
  Icon,
  label,
  line,
  onClick,
}: {
  href?: ComponentProps<typeof Link>["href"];
  Icon: typeof PillIcon;
  label: string;
  line?: string;
  onClick: () => void;
}) {
  const body = (
    <>
      <IconDisc tone="accent">
        <Icon className="size-5" {...ICON} />
      </IconDisc>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {line ? <span className="text-pw-ink-2 block text-[13px] font-medium">{line}</span> : null}
      </span>
      <ChevronRightIcon className="text-pw-ink-3 size-5" {...ICON} />
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} onClick={onClick} className={DOOR}>
          {body}
        </Link>
      ) : (
        <button type="button" aria-haspopup="dialog" onClick={onClick} className={DOOR}>
          {body}
        </button>
      )}
    </li>
  );
}
