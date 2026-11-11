"use client";

import type { ReceiveWorld } from "@/lib/pharmacy/derive/receive";

import { RC } from "@/content/pharmacy-receive";
import { AfterView } from "./after/after-view";
import { Board } from "./board/board";
import { CountView } from "./count/count-view";
import { ReceiveDialogs } from "./dialogs";
import { ReceiveProvider, useReceive } from "./provider";

function Views() {
  const { world, deliveryId, online, queued, toast } = useReceive();
  const d = deliveryId ? world.deliveries.find((x) => x.id === deliveryId) : null;
  return (
    <div className="flex flex-col gap-4">
      {!online ? (
        <p
          role="status"
          className="bg-status-caution-bg text-status-caution-fg-aa m-0 rounded-xl px-4 py-3 text-[14px] leading-5 font-semibold"
        >
          {RC.device.offline(queued)}
        </p>
      ) : null}
      {d?.state === "counting" ? (
        <CountView key={d.id} delivery={d} />
      ) : d?.state === "received" ? (
        <AfterView key={d.id} delivery={d} />
      ) : (
        <Board />
      )}
      <ReceiveDialogs />
      {toast}
    </div>
  );
}

/** Stock › Receive a delivery. */
export function ReceiveTab({
  world,
  deliveryId,
  live = true,
}: {
  world: ReceiveWorld;
  deliveryId: string | null;
  live?: boolean;
}) {
  return (
    <ReceiveProvider world={world} deliveryId={deliveryId} live={live}>
      <Views />
    </ReceiveProvider>
  );
}
