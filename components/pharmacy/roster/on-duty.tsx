"use client";

import type { SectionProps } from "./roster-tab";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhoneIcon } from "lucide-react";

import { signInAction } from "@/app/pharmacy/setup/roster-actions";
import { sectionTitle } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { Panel } from "@/components/tide/work/kit";
import { CADRE } from "@/content/pharmacy-roster";
import { phoneHref, phoneText, RG } from "@/content/pharmacy-roster-grid";
import { attendanceOf, cellOf, isPharmacyPlace, onDutyNow } from "@/lib/pharmacy/derive/roster";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

const T = RG.onDuty;
const ATT = {
  ok: "bg-ink-150 text-ink-800",
  late: "bg-status-caution-bg text-status-caution-fg-aa",
  none: "bg-status-critical-bg text-status-critical-fg-aa",
} as const;
const hm = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** §2: who is on the current shift(s), pharmacy and wards, with attendance (pharmacy only) and a Call link. */
export function OnDutyNow({ view, toast }: SectionProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!view.ready) return null;
  const { now, params } = view;
  const { date, shifts } = onDutyNow(now);
  const byId = new Map(view.people.map((p) => [p.userId, p]));
  const signed = (u: string, s: string) =>
    view.attendance.find((a) => a.userId === u && a.date === date && a.shift === s);

  let mine: { placeId: string; name: string } | null = null;
  const groups = (["pharmacy", "wards"] as const).map((g) => {
    const list = view.places
      .filter((p) => isPharmacyPlace(p) === (g === "pharmacy"))
      .flatMap((p) =>
        shifts
          .filter((s) => p.shifts.includes(s))
          .flatMap((s) =>
            cellOf(view.duties, date, p.id, s).map((u) => {
              const per = byId.get(u);
              const a = attendanceOf(signed(u, s)?.min ?? null, date, s, p, now, params);
              if (u === view.viewerId && isPharmacyPlace(p) && s !== "call" && !signed(u, s))
                mine = { placeId: p.id, name: p.name };
              return { key: `${p.id}|${s}|${u}`, per, place: p.name, s, a };
            }),
          ),
      );
    return { g, list };
  });
  const me = mine as { placeId: string; name: string } | null;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden className="bg-ink-500 size-2 rounded-full" />
          {T.title}
        </span>
      }
      action={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body-s text-ink-600">
            {T.line(now.date, hm(now.min), shifts[0] === "day")}
          </span>
          {me ? (
            <LabButton
              size="sm"
              variant="primary"
              busy={busy}
              aria-label={T.signInAria(me.name)}
              onClick={async () => {
                setBusy(true);
                const r = await signInAction({ placeId: me.placeId, deviceId: null });
                setBusy(false);
                if (!r.ok) return toast((r as { error?: string }).error ?? "");
                toast(T.signedIn);
                router.refresh();
              }}
            >
              {T.signIn}
            </LabButton>
          ) : null}
        </span>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map(({ g, list }) => (
          <div key={g} className="bg-tide-sunken rounded-tide-tile flex flex-col gap-2 p-3">
            <h3 className={sectionTitle}>{T.groups[g]}</h3>
            {list.length === 0 ? (
              <span className="text-body-s text-ink-600">{T.nobody}</span>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {list.map(({ key, per, place, s, a }) => {
                  const ph = phoneText(per?.phone ?? null);
                  return (
                    <li key={key} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar person={per} size={28} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-semibold">{per?.name}</span>
                          <span className="text-ink-600 truncate text-[12px]">
                            {T.sub(per ? CADRE[per.cadre] : "", place, s === "call")}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {a ? (
                          <span
                            className={cn(
                              "inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold whitespace-nowrap",
                              ATT[a.kind],
                            )}
                          >
                            {a.kind === "ok"
                              ? T.att.ok(a.at)
                              : a.kind === "late"
                                ? T.att.late
                                : T.att.none}
                          </span>
                        ) : null}
                        {per?.phone && ph ? (
                          <a
                            href={`tel:${phoneHref(per.phone)}`}
                            aria-label={T.callAria(per.name, ph)}
                            className="bg-card text-foreground hover:bg-ink-50 focus-visible:ring-primary grid size-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none focus-visible:ring-2"
                          >
                            <PhoneIcon aria-hidden className="size-4" />
                          </a>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
