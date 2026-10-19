import type { labV2 } from "../../_lib/places";
import type { SP } from "@/lib/lab/redirects";

import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { labEquipmentLiveFor, labStockLiveFor } from "@/lib/lab/feature";
import { equipmentFor, ncsFor, qcToRun, stockFor } from "../_lib/quality-data";
import { ncLiveFor } from "../_lib/scope";
import { PillTabs, PrimaryLink, SpaceHeader } from "../../_components/v2/space";
import { one, pillTabs } from "../../_lib/place-tabs";
import { BedsideView } from "./bedside";
import { EqaView } from "./eqa";
import { EquipmentView } from "./equipment";
import { NcListView } from "./nc";
import { QcView } from "./qc";
import { StockView } from "./stock";
import { QualityTodayV2 } from "./today";

type V2 = Awaited<ReturnType<typeof labV2>>;
const W = LABWS2_QUALITY;

/**
 * The Quality place (Lab Workspace v2, prompt 5.7; gate-a §3): one path, `?tab=today|plans|runs|stock|
 * equipment|eqa|bedside|nc`, the viewer's visible tabs with amber counts where something needs action, and
 * Record a QC run as the place's one primary action on every tab.
 */
export async function QualityPlace({ v2, sp }: { v2: V2; sp: SP }) {
  const defs = v2.tabs.quality;
  const keys = defs.map((d) => d.key);
  const tab = keys.find((k) => k === one(sp.tab)) ?? keys[0] ?? "today";
  const h = v2.scope.hospitalId;
  const qcOn = keys.includes("runs");

  const [toRun, stock, equipment, ncs] = await Promise.all([
    qcOn ? qcToRun(h, v2.scope.userId) : null,
    keys.includes("stock") && labStockLiveFor(h) ? stockFor(h) : null,
    keys.includes("equipment") && labEquipmentLiveFor(h) ? equipmentFor(h) : null,
    keys.includes("nc") && ncLiveFor(h) ? ncsFor(h) : null,
  ]);
  const counted = (n: number | null | undefined) =>
    n == null ? undefined : { count: n, attention: n > 0 };
  const tabs = pillTabs(defs, "quality", {
    runs: counted(toRun?.count),
    stock: counted(stock?.items.filter((i) => i.belowMinimum || i.onHand <= 0).length),
    equipment: counted(equipment?.filter((e) => e.state === "down").length),
    nc: counted(ncs?.filter((n) => n.state === "open").length),
  });

  return (
    <>
      <SpaceHeader
        tabs={<PillTabs tabs={tabs} current={tab} label={W.tabsLabel} />}
        action={qcOn ? <PrimaryLink href="/lab/quality/qc/run">{W.record}</PrimaryLink> : null}
      />
      {tab === "today" ? (
        <QualityTodayV2 />
      ) : tab === "plans" || tab === "runs" ? (
        <QcView v2 tab={tab} />
      ) : tab === "stock" ? (
        <StockView v2 f={one(sp.f)} />
      ) : tab === "equipment" ? (
        <EquipmentView v2 />
      ) : tab === "eqa" ? (
        <EqaView v2 />
      ) : tab === "bedside" ? (
        <BedsideView v2 />
      ) : (
        <NcListView v2 />
      )}
    </>
  );
}
