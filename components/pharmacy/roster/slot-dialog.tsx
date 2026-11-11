"use client";

import type { SectionProps } from "./roster-tab";
import type { Shift } from "@/lib/pharmacy/derive/roster";
import type { RosterView } from "@/lib/pharmacy/roster/view";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquareIcon, PhoneIcon, XIcon } from "lucide-react";

import { assignToSlotAction, removeFromSlotAction } from "@/app/pharmacy/setup/roster-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { newKey } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { CADRE, restWhyText, ROSTER_REFUSAL } from "@/content/pharmacy-roster";
import { phoneHref, phoneText, RG, TODAY_TINT } from "@/content/pharmacy-roster-grid";
import {
  candidates,
  canWitness,
  cellOf,
  effStatus,
  isPharmacyPlace,
  leaveOn,
  restWhy,
  SHIFTS,
} from "@/lib/pharmacy/derive/roster";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

const T = RG.slot;
export interface Slot {
  date: string;
  placeId: string;
  shift: Shift;
  mode: "assign" | "card";
  userId?: string;
}
/** The card's "Ask a colleague to swap or cover" hands the slot to the Swap requests section (swaps.tsx). */
export const ASK_SWAP_EVENT = "roster:ask-swap";

/** Why this place can't be changed here, or null when the viewer may edit it (§4 card, §19). */
export function roWhyOf(view: RosterView, placeId: string) {
  const p = view.places.find((x) => x.id === placeId);
  if (!p || !isPharmacyPlace(p)) return T.wardRo;
  if (view.weekPublished) return ROSTER_REFUSAL.locked;
  if (!view.editable.includes(placeId)) return ROSTER_REFUSAL.viewOnly;
  return null;
}
/** `user@place|date|shift` for every open swap (the card's "Swap requested"). */
export function pendingSlots(view: RosterView) {
  const out = new Set<string>();
  for (const rq of view.requests) {
    const st = effStatus(rq, view.duties, view.now);
    if (st !== "colleague" && st !== "incharge") continue;
    out.add(`${rq.fromUser}@${rq.give.placeId}|${rq.give.date}|${rq.give.shift}`);
    if (rq.take) out.add(`${rq.toUser}@${rq.take.placeId}|${rq.take.date}|${rq.take.shift}`);
  }
  return out;
}
const chip =
  "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap";

type Result<D> = { ok: true; data?: D } | { ok: false; error: string };
/** Run a roster action: the refusal is toasted as worded; on success `done(data)`, then the page refreshes. */
export function useAct(toast: (m: string) => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async <D,>(go: () => Promise<Result<D>>, done: (d: D) => void) => {
    setBusy(true);
    const r = await go();
    setBusy(false);
    if (!r.ok) return toast(r.error);
    done(r.data as D);
    router.refresh();
  };
  return [busy, run] as const;
}

/** §4: assign (with best fit), a pharmacy card, or a ward contact card. */
export function SlotDialog({
  view,
  toast,
  slot,
  onSlot,
}: SectionProps & { slot: Slot | null; onSlot: (s: Slot | null) => void }) {
  const [busy, run] = useAct(toast);
  const close = () => onSlot(null);
  const place = slot ? view.places.find((p) => p.id === slot.placeId) : undefined;
  const byId = new Map(view.people.map((p) => [p.userId, p]));
  const R = view.duties;
  const P = view.params;

  let body = null;
  if (slot && place) {
    const when = T.when(slot.date, slot.shift);
    const header = (title: string, sub: string, avatar?: ReactNode) => (
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {avatar}
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{title}</DialogTitle>
            <p className="text-body-s text-ink-600 m-0">{sub}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={T.close}
          onClick={close}
          className="hover:bg-ink-100 focus-visible:ring-primary grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      </div>
    );
    const otherOf = (u: string) =>
      view.places.flatMap((p) =>
        SHIFTS.filter((s) => p.shifts.includes(s) && cellOf(R, slot.date, p.id, s).includes(u)).map(
          (s) => T.shiftAt(s, p.name),
        ),
      );

    if (slot.mode === "assign") {
      const list = candidates(
        R,
        { people: view.people, leaves: view.leaves, params: P },
        slot.date,
        place.id,
        slot.shift,
      );
      const cap = slot.shift === "call" ? 1 : P.perShift;
      const cur = cellOf(R, slot.date, place.id, slot.shift);
      body = (
        <>
          {header(T.assignTitle(place.name), when)}
          <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto px-4 pb-5">
            {list.map(({ person: p, j, best }) => {
              const b = j.block;
              const why = !b
                ? null
                : typeof b === "object"
                  ? ROSTER_REFUSAL.already(b.already)
                  : T.block[b];
              const other = otherOf(p.userId);
              const rw = restWhy(R, p.userId, slot.date, slot.shift, true, P).map(restWhyText);
              const pend = leaveOn(view.leaves, p.userId, slot.date, ["pending"]);
              return (
                <li key={p.userId}>
                  <button
                    type="button"
                    aria-disabled={b ? true : undefined}
                    disabled={busy}
                    onClick={() => {
                      if (why) return toast(T.blocked(p.name, why));
                      if (cur.length >= cap) return toast(ROSTER_REFUSAL.full);
                      void run(
                        () =>
                          assignToSlotAction({
                            clientKey: newKey(),
                            userId: p.userId,
                            placeId: place.id,
                            date: slot.date,
                            shift: slot.shift,
                          }),
                        () => {
                          close();
                          toast(T.assigned(p.name, rw, other));
                        },
                      );
                    }}
                    className={cn(
                      "focus-visible:ring-primary flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left outline-none focus-visible:ring-2",
                      b ? "cursor-not-allowed opacity-55" : best ? TODAY_TINT : "hover:bg-ink-50",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar person={p} size={36} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[14px] font-semibold">{p.name}</span>
                        <span className="text-ink-600 truncate text-[12px]">
                          {T.witness(CADRE[p.cadre], canWitness(p.cadre))}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {!b && (other.length || pend) ? (
                        <span
                          className={cn(chip, "bg-status-caution-bg text-status-caution-fg-aa")}
                        >
                          {pend ? T.askedLeave : T.alreadyOn(other[0]!)}
                        </span>
                      ) : null}
                      {!b && rw.length ? (
                        <span
                          className={cn(chip, "bg-status-critical-bg text-status-critical-fg-aa")}
                        >
                          {T.rest(rw[0]!)}
                        </span>
                      ) : null}
                      {why ? (
                        <span className={cn(chip, "bg-tide-navy-900 text-tide-on-band")}>
                          {why}
                        </span>
                      ) : null}
                      {best ? (
                        <span className={cn(chip, "bg-tide-lagoon text-tide-on-lagoon")}>
                          {T.best}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 ? (
              <li className="text-body-s text-ink-700 px-3 py-2.5">{T.noChoices}</li>
            ) : null}
          </ul>
        </>
      );
    } else {
      const u = slot.userId ?? "";
      const per = byId.get(u);
      const name = per?.name ?? RG.week.removed;
      const cadre = per ? CADRE[per.cadre] : "";
      const isPh = isPharmacyPlace(place);
      const ro = roWhyOf(view, place.id);
      const rw = restWhy(R, u, slot.date, slot.shift, false, P).map(restWhyText);
      const duty = R.find(
        (d) =>
          d.userId === u &&
          d.date === slot.date &&
          d.placeId === place.id &&
          d.shift === slot.shift,
      );
      const canAsk =
        isPh &&
        u === view.viewerId &&
        slot.date >= view.now.date &&
        !pendingSlots(view).has(`${u}@${place.id}|${slot.date}|${slot.shift}`);
      const ph = phoneText(per?.phone ?? null);
      body = (
        <>
          {header(name, T.cardSub(when, place.name), <Avatar person={per ?? { name }} size={44} />)}
          <div className="flex flex-col gap-3 px-6 pb-6">
            <p className="text-body-s text-ink-700 m-0">
              {isPh
                ? T.cardLine(cadre, canWitness(per?.cadre), ro)
                : T.contactLine(cadre, place.name)}
            </p>
            {rw.length ? (
              <p role="alert" className="text-status-critical-fg-aa m-0 text-[13px] font-semibold">
                {T.restAlert(rw)}
              </p>
            ) : null}
            {isPh ? (
              <>
                <span className="flex flex-wrap gap-2">
                  <LabButton
                    aria-disabled={ro ? true : undefined}
                    busy={busy}
                    onClick={() =>
                      ro
                        ? toast(ro)
                        : duty &&
                          void run(
                            () => removeFromSlotAction({ dutyId: duty.id }),
                            () => {
                              close();
                              toast(T.removedFlash(name));
                            },
                          )
                    }
                  >
                    {T.remove}
                  </LabButton>
                  <LabButton
                    aria-disabled={ro ? true : undefined}
                    busy={busy}
                    onClick={() =>
                      ro
                        ? toast(ro)
                        : duty &&
                          void run(
                            () => removeFromSlotAction({ dutyId: duty.id }),
                            () => onSlot({ ...slot, mode: "assign", userId: undefined }),
                          )
                    }
                  >
                    {T.replace}
                  </LabButton>
                </span>
                {canAsk ? (
                  <LabButton
                    variant="primary"
                    className="w-fit"
                    onClick={() => {
                      close();
                      window.dispatchEvent(
                        new CustomEvent(ASK_SWAP_EVENT, {
                          detail: { placeId: place.id, date: slot.date, shift: slot.shift },
                        }),
                      );
                    }}
                  >
                    {T.askSwap}
                  </LabButton>
                ) : null}
                <span className="text-ink-600 text-[12px]">{T.tip}</span>
              </>
            ) : (
              <div className="bg-tide-sunken rounded-tide-tile flex flex-wrap items-center gap-2 p-3">
                <span className="text-[14px] font-semibold tabular-nums">{ph ?? T.noPhone}</span>
                {per?.phone && ph ? (
                  <>
                    <a href={`tel:${phoneHref(per.phone)}`} className={contactLink}>
                      <PhoneIcon aria-hidden className="size-4" />
                      {T.call}
                    </a>
                    <a href={`sms:${phoneHref(per.phone)}`} className={contactLink}>
                      <MessageSquareIcon aria-hidden className="size-4" />
                      {T.sms}
                    </a>
                  </>
                ) : null}
                {/* ponytail: no "Message in MedSync" (no in-app staff messaging yet) and no prescriptions written /
                    doses given lists (no prescribing or MAR source wired here yet); add both when those exist. */}
              </div>
            )}
          </div>
        </>
      );
    }
  }

  return (
    <EditorDialog open={!!body} onOpenChange={(o) => !o && close()} width="medium">
      {body}
    </EditorDialog>
  );
}
const contactLink =
  "bg-card text-foreground hover:bg-ink-50 focus-visible:ring-primary inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none focus-visible:ring-2";
