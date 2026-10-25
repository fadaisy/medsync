"use client";

import type { Food, Product } from "@patient-core/care-meals";
import type { LogRow } from "@patient-core/log";
import { useState } from "react";

import { Segments, Toast } from "@/components/tide/controls";
import { CARE_COPY } from "@/content/patient/care";
import { EatPanel } from "./eat-panel";
import { MovePanel } from "./move-panel";

const C = CARE_COPY.move;

/**
 * Move and eat: the Move and Eat panels over the patient's own rows, and one toast. Days are read on this
 * device's clock, as the phone reads them. ponytail: the server's first paint uses its own clock, so for the
 * hours its zone and the patient's disagree about "today" the page settles after hydration; upgrade by
 * rendering with the patient's zone from their profile.
 */
export function MoveView({
  startTab,
  rows,
  weightKg,
  products,
  usda,
}: {
  startTab: "move" | "eat";
  rows: LogRow[];
  weightKg: number | null;
  products: Product[];
  usda: Food[];
}) {
  const [tab, setTab] = useState(startTab);
  const [toast, setToast] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  return (
    <div className="flex w-full max-w-[880px] flex-col gap-5">
      <Segments
        label={C.tabsLabel}
        options={[
          { value: "move", label: C.tabs.move },
          { value: "eat", label: C.tabs.eat },
        ]}
        value={tab}
        onChange={setTab}
        className="self-start max-[760px]:w-full"
      />
      {tab === "move" ? (
        <MovePanel now={now} rows={rows} weightKg={weightKg} onToast={setToast} />
      ) : (
        <EatPanel now={now} rows={rows} products={products} usda={usda} onToast={setToast} />
      )}
      <p className="text-pw-ink-3 text-center text-[13px] font-medium">{C.note}</p>
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
