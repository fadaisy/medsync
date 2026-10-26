"use client";

import type { DayView } from "../_lib/cascade";
import { useState } from "react";
import { hhmm, SLOT_WORDS } from "@patient-core/dose-slots";
import { CheckIcon } from "lucide-react";

import { Cascade, CascadeItem, CascadeStep, DoneCard, NowCard } from "@/components/tide/cascade";
import { Button, ButtonLink, Card, ICON } from "@/components/tide/kit";
import { HOME_COPY as C } from "@/content/patient/home";
import { cascadeTone } from "../_lib/cascade";
import { useTake } from "../../_components/take";

/**
 * The day (the phone's Home body): first run, or the cascade with its tail card. "Not yet" snoozes for 15
 * minutes in this page's memory only (the phone keeps it on the phone; nothing is stored, W3).
 */
export function DayCascade({ view }: { view: DayView }) {
  const { take, pending, toast, say } = useTake();
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});

  if (view.kind === "firstRun")
    return (
      <Card className="flex flex-col gap-3 p-[18px]">
        <h3 className="text-[17px] leading-[22px] font-semibold">{C.firstRunTitle}</h3>
        <p className="text-pw-ink-2 text-[15px] leading-[21px] font-medium">{C.firstRunBody}</p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/patient/care/medicines?add=1" className="flex-1">
            {C.addMedicine}
          </ButtonLink>
          <ButtonLink href="/patient/care/readings" tone="outline" className="flex-1">
            {C.logReading}
          </ButtonLink>
        </div>
      </Card>
    );

  const { steps, tail } = view;
  return (
    <>
      <Cascade label={C.dayTitle}>
        {steps.map((s, i) => (
          <CascadeItem key={s.key} index={i}>
            <CascadeStep
              tone={cascadeTone(i)}
              icon={s.icon}
              title={s.title}
              line={s.line}
              done={s.done}
              href={s.href}
              last={i === steps.length - 1 && !tail}
            />
          </CascadeItem>
        ))}
        {tail ? (
          <CascadeItem index={steps.length}>
            {tail.kind === "now" ? (
              <NowCard
                pill={
                  snoozed[tail.dose.id]
                    ? C.snoozedPill(snoozed[tail.dose.id]!)
                    : C.nowPill(tail.dose.time)
                }
                overline={C.medicinesOverline}
                title={C.slotMedicine(SLOT_WORDS[tail.dose.slot])}
                line={C.asPrescribed(tail.dose.medicine)}
                actions={
                  <>
                    <Button
                      className="flex-1"
                      busy={pending}
                      onClick={() => take(tail.dose, C.savedOnlyYou)}
                    >
                      <CheckIcon className="size-5" {...ICON} />
                      {C.tookIt}
                    </Button>
                    <Button
                      tone="outline"
                      onClick={() => {
                        setSnoozed((s) => ({
                          ...s,
                          [tail.dose.id]: hhmm(new Date(Date.now() + 15 * 60_000)),
                        }));
                        say(C.snoozed);
                      }}
                    >
                      {C.notYet}
                    </Button>
                  </>
                }
              />
            ) : tail.kind === "next" ? (
              <DoneCard
                title={C.slotMedicine(SLOT_WORDS[tail.dose.slot])}
                line={C.next(tail.dose.time, tail.dose.medicine)}
              />
            ) : (
              <DoneCard title={C.nothingDue} line={C.nothingDueLine} />
            )}
          </CascadeItem>
        ) : null}
      </Cascade>
      {toast}
    </>
  );
}
