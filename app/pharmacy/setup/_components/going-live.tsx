import type { PharmacyPoint } from "@/lib/pharmacy/write";

import { Pill } from "@/components/tide/work/kit";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_SETUP } from "@/content/pharmacy-workspace-v2-setup";
import { pointState } from "@/lib/pharmacy/workspace-v2/setup";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

const G = PHWS2_SETUP.goingLive;
const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIME_ZONE,
});

/** Set-up › Going live: read only. The hospital admin switches points on; nothing here links to it or acts. */
export function GoingLiveView({ points }: { points: readonly PharmacyPoint[] }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <p className="text-body-s text-ink-700 max-w-[70ch]">{G.lead}</p>
      {points.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{G.none}</p>
      ) : (
        <section aria-label={G.title} className="bg-card shadow-tide-card rounded-tide-card overflow-hidden">
          <table className="text-body-s w-full">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {G.columns.point}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {G.columns.state}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {points.map((p) => {
                const s = pointState(p);
                return (
                  <tr key={p.id}>
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {p.name}
                    </th>
                    <td className="px-4 py-3">
                      {s.state === "live" ? (
                        <Pill tone="lagoon" glyph={null}>
                          {fill(G.live, { date: day.format(s.at) })}
                        </Pill>
                      ) : s.state === "off" ? (
                        <Pill>{fill(G.switchedOff, { date: day.format(s.at) })}</Pill>
                      ) : (
                        <Pill>{G.notLive}</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
