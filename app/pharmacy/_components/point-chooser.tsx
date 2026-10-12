"use client";

import { useId, useTransition } from "react";

import { STOCK } from "@/content/pharmacy-stock";
import { chooseActingPoint } from "../actions";

/**
 * The acting-point chooser in the top bar (5.1, wireframe §1): a native menu, one option per point the
 * person may act at, each saying whether it is live. Changing it re-renders the workspace at that
 * point. One point has no chooser; the layout shows its name.
 */
export function PointChooser({
  points,
  value,
}: {
  points: { id: string; name: string; live: boolean }[];
  value: string;
}) {
  const id = useId();
  const [pending, start] = useTransition();
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <label
        htmlFor={id}
        className="text-muted-foreground text-caption sr-only shrink-0 sm:not-sr-only"
      >
        {STOCK.point.label}
      </label>
      <select
        id={id}
        value={value}
        disabled={pending}
        title={STOCK.point.stored}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const pointId = e.target.value;
          start(async () => {
            await chooseActingPoint({ pointId });
          });
        }}
        className="border-input bg-card text-body-s focus-visible:shadow-focus h-8 min-h-11 max-w-[14rem] min-w-0 truncate rounded-md border px-2 outline-none sm:min-h-8"
      >
        {points.map((p) => (
          <option key={p.id} value={p.id}>
            {p.live ? STOCK.point.live(p.name) : STOCK.point.notLive(p.name)}
          </option>
        ))}
      </select>
      <span id={`${id}-hint`} className="sr-only">
        {STOCK.point.stored}
      </span>
    </span>
  );
}
