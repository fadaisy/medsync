"use client";

import { Button } from "@/components/ui/button";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { setChargeModeAction, setPayFirstAction } from "../../catalogue-actions";
import { useSave } from "./catalogue-products";

const P = CATALOGUE.prices;

/** A point's charge mode and pay-before-collecting, each a new row from today (D-CAT-11). */
export function PointControls(props: {
  pointId: string;
  mode: "charged" | "free";
  payFirst: boolean;
  today: string;
}) {
  const { pointId, mode, payFirst, today } = props;
  const w = useSave();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        disabled={w.pending}
        onClick={() =>
          w.run(
            () =>
              setChargeModeAction({
                pointId,
                mode: mode === "free" ? "charged" : "free",
                fromDate: today,
              }),
            P.points.done,
          )
        }
      >
        {mode === "free" ? P.points.makeCharged : P.points.makeFree}
      </Button>
      <Button
        variant="ghost"
        disabled={w.pending}
        onClick={() =>
          w.run(
            () => setPayFirstAction({ pointId, required: !payFirst, fromDate: today }),
            P.points.done,
          )
        }
      >
        {P.points.payFirst}: {payFirst ? P.points.turnOff : P.points.turnOn}
      </Button>
      {w.status}
    </span>
  );
}
