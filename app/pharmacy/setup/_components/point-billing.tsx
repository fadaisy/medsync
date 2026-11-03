import type { EmrDb } from "@/lib/emr/db";

import { Panel } from "@/components/tide/work/kit";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { pricesPage } from "@/lib/pharmacy/prices/store";
import { loadHospitalContext } from "@/lib/pharmacy/review/load";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { pharmacyScope } from "../../_lib/v2";
import { PointControls } from "./point-controls";

const P = CATALOGUE.prices.points;

/**
 * Set-up › Places › dispensing points (MEDICINES-TAB.md: billing moves here from Medicines): charged or free, and
 * pay before collecting. Read as the viewer; the controls show only to managers and the server re-checks.
 */
export async function PointBilling({ manages }: { manages: boolean }) {
  const scope = await pharmacyScope();
  const today = localDate(new Date());
  const h = await loadHospitalContext(db as unknown as EmrDb, scope.hospitalId);
  if (!h.points.length) return null;
  const page = await asClinicalReader(scope, (tx) =>
    pricesPage(
      tx,
      scope.hospitalId,
      h.points.map((p) => p.id),
      today,
    ),
  );
  const name = new Map(h.points.map((p) => [p.id, p.name]));
  return (
    <Panel title={P.title}>
      <p className="text-body-s text-ink-700 max-w-prose pb-2">{P.lead}</p>
      <ul className="divide-border flex flex-col divide-y">
        {page.points.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span className="text-body-s">
              <span className="font-semibold">{name.get(p.id)}</span> ·{" "}
              {p.mode === "free" ? P.free : P.charged} · {P.payFirst}:{" "}
              {p.payFirst === null
                ? P.payFirstHospital(h.settings.paymentStatusRequired)
                : p.payFirst
                  ? P.payFirstOn
                  : P.payFirstOff}
            </span>
            {manages ? (
              <PointControls
                pointId={p.id}
                mode={p.mode}
                payFirst={p.payFirst ?? h.settings.paymentStatusRequired}
                today={today}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
