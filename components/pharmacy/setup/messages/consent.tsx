"use client";

import type { SectionProps } from "./index";
import { useState } from "react";

import { PickField } from "@/app/lab/_components/v2/fields";
import { optInAction, optOutAction } from "@/app/pharmacy/setup/setup-actions";
import { inputCls } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { stamp } from "@/content/pharmacy-roster-sections";
import { OPT_OUT_REASONS } from "@/content/pharmacy-setup";
import { MSG } from "@/content/pharmacy-setup-messages";
import { maskPhone, normalisePhoneUG } from "@/lib/pharmacy/derive/setup/messages";
import { cn } from "@/lib/utils";

const M = MSG.consent;

/** §D5: who agreed, opting a number out at the desk (duplicates refused by the server), and opting back in. */
export function Consent({ view, toast, run, pending }: SectionProps) {
  const [phone, setPhone] = useState("");
  const [why, setWhy] = useState<(typeof OPT_OUT_REASONS)[number]>(OPT_OUT_REASONS[0]);
  const { consented: c, patients: p } = view.stats;
  const pct = p ? Math.round((c / p) * 100) : 0;
  const can = view.can.manage;

  const add = () => {
    const to = normalisePhoneUG(phone);
    if (!to) return toast(MSG.badPhone);
    void run(
      () => optOutAction({ phone, reason: why }),
      () => M.optedOut(maskPhone(to)),
    ).then((ok) => ok && setPhone(""));
  };

  return (
    <Panel title={M.title}>
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="bg-tide-sunken block h-2 overflow-hidden rounded-full">
          <span className="bg-tide-lagoon block h-full rounded-full" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-body-s font-semibold">{M.line(c, p, pct)}</span>
      </div>
      <p className="text-body-s text-muted-foreground">{M.why}</p>
      {can ? (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <PickField
            label={M.reason}
            options={OPT_OUT_REASONS.map((r) => ({ value: r, label: r }))}
            value={why}
            onChange={(v) => setWhy(v as typeof why)}
          />
          <span className="flex flex-wrap items-center gap-2">
            <input
              type="tel"
              aria-label={M.phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={MSG.phonePh}
              className={cn(inputCls, "w-48")}
            />
            <LabButton type="submit" busy={pending}>
              {M.optOut}
            </LabButton>
          </span>
        </form>
      ) : null}
      {view.optOuts.length ? (
        <ul className="divide-border flex flex-col divide-y">
          {view.optOuts.map((o) => {
            const day = stamp(o.at).split(",")[0];
            const sub =
              o.source === "reply_stop"
                ? `${M.repliedStop} · ${day}`
                : `${o.reason ?? ""} · ${day}${/desk/.test(o.reason ?? "") ? "" : ` · ${M.atDesk}`}`;
            return (
              <li key={o.hmac} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-s font-semibold tabular-nums">{o.phoneMasked}</span>
                  <span className="text-caption text-muted-foreground">{sub}</span>
                </span>
                {can ? (
                  <LabButton
                    type="button"
                    size="sm"
                    variant="text"
                    busy={pending}
                    onClick={() =>
                      void run(
                        () => optInAction({ hmac: o.hmac }),
                        () => M.optedIn,
                      )
                    }
                  >
                    {M.optIn}
                  </LabButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact title={M.none} />
      )}
    </Panel>
  );
}
