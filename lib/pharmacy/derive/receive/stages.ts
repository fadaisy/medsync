import type { ReceiveDelivery, ReceiveDispatch, ReceiveOrder, ReceiveWorld } from "./types";

import { RC } from "@/content/pharmacy-receive";
import { deliveryProblems, orderDue, owedLines } from "./delivery";
import { atText, plural } from "./format";

export type StageKey = "way" | "expected" | "counting" | "put" | "received";
export interface OrderCard { kind: "order"; order: ReceiveOrder; due: ReturnType<typeof orderDue>; stateText: string; sub: string }
export interface CountCard { kind: "count"; delivery: ReceiveDelivery; tag: string; queued: boolean; sub: string }
export interface PutCard { kind: "put"; delivery: ReceiveDelivery; left: number; sub: string }
export interface DoneCard { kind: "done"; delivery: ReceiveDelivery; sub: string; diffs: number }
export interface WayCard { kind: "way"; dispatch: ReceiveDispatch; sub: string }
export interface ConfirmedCard { kind: "confirmed"; dispatch: ReceiveDispatch; sub: string }
export type StageCard = OrderCard | CountCard | PutCard | DoneCard | WayCard | ConfirmedCard;
export interface Stage { key: StageKey; title: string; note: string; empty: string; tone: "warn" | "info" | ""; cards: StageCard[] }

const stateWord = (o: ReceiveOrder) => (o.state === "sent" ? "Sent" : o.state === "part" ? "Partly delivered" : "Closed");

/** The board (§A) for one place. A place that does not receive directly gets On the way → Received only. */
export function stages(w: ReceiveWorld, placeId: string): { stages: Stage[]; toDo: number; expected: number } {
  const place = w.places.find((p) => p.id === placeId);
  const here = w.deliveries.filter((d) => d.place === placeId);
  const meds = new Map(w.meds.map((m) => [m.id, m]));
  const way: StageCard[] = w.dispatches
    .filter((d) => d.state === "transit")
    .map((dispatch) => ({
      kind: "way",
      dispatch,
      sub: `${dispatch.kindText} · sent ${atText(dispatch.sentAt)} · ${plural(dispatch.lines.length, "line")}`,
    }));
  const confirmed: StageCard[] = w.dispatches
    .filter((d) => d.state !== "transit")
    .map((dispatch) => ({ kind: "confirmed", dispatch, sub: dispatch.note || atText(dispatch.sentAt) }));
  const orders: StageCard[] = w.orders
    .filter((o) => o.place === placeId && o.state !== "closed")
    .map((order) => {
      const owed = owedLines(order);
      const names = owed.map((l) => (meds.get(l.medId)?.name ?? "").split(" ")[0]).join(", ");
      const chased = order.chasedOn ? ` · chased ${atText(order.chasedOn)}` : "";
      return {
        kind: "order",
        order,
        due: orderDue(order, w.today),
        stateText: stateWord(order),
        sub: `${stateWord(order)} · ${plural(owed.length, "line")} still expected: ${names}${chased}`,
      };
    });
  const counting: StageCard[] = here
    .filter((d) => d.state === "counting" || d.state === "queued")
    .map((delivery) => {
      const counted = deliveryProblems(delivery, w).counted.length;
      return {
        kind: "count",
        delivery,
        queued: delivery.state === "queued",
        tag: delivery.state === "queued" ? "Waiting for the network" : delivery.kind === "supplier" ? "Counting" : RC.kind[delivery.kind],
        sub: `Arrived ${atText(delivery.arrived)} · ${plural(counted, "line")} counted`,
      };
    });
  const put: StageCard[] = here
    .filter((d) => d.state === "received" && d.put.some((p) => !p.done))
    .map((delivery) => {
      const left = delivery.put.filter((p) => !p.done).length;
      return { kind: "put", delivery, left, sub: `${plural(left, "batch", "batches")} waiting for a shelf` };
    });
  const done: StageCard[] = here
    .filter((d) => d.state === "received" || d.state === "abandoned")
    .map((delivery) => {
      const diffs =
        delivery.state === "received"
          ? deliveryProblems(delivery, w).infos.filter((x) => x.i.words.some((y) => y.caution)).length
          : 0;
      const prefix = delivery.kind === "supplier" ? "" : `${RC.kind[delivery.kind]} · `;
      return {
        kind: "done",
        delivery,
        diffs,
        sub:
          prefix +
          (delivery.state === "received"
            ? `${delivery.grn} · ${atText(delivery.finished)} · ${diffs ? plural(diffs, "difference") : "every line matched"}`
            : `Abandoned: ${delivery.abandonReason}`),
      };
    });
  const stage = (key: StageKey, t: readonly [string, string, string], cards: StageCard[], tone: Stage["tone"]): Stage => ({
    key,
    title: t[0],
    note: t[1],
    empty: t[2],
    tone,
    cards,
  });
  const S = RC.stage;
  const list = place?.direct
    ? [
        ...(way.length ? [stage("way", S.way, way, "info")] : []),
        stage("expected", S.expected, orders, ""),
        stage("counting", S.counting, counting, "warn"),
        stage("put", S.put, put, "info"),
        stage("received", S.received, done, ""),
      ]
    : [stage("way", S.way, way, "info"), stage("received", S.placeReceived, confirmed, "")];
  return { stages: list, toDo: put.length + counting.length + way.length, expected: orders.length };
}
