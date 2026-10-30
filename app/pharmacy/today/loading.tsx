import { Bone, CardBone, PlaceLoading, TabsBone } from "@/components/tide/work/loading";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

/** Today's shape: scope tabs, the limits line, the navy hero, the figures, flow beside Needs you, points. */
export default function Loading() {
  return (
    <PlaceLoading place={PHWS2.shell.places.today} className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <TabsBone n={2} />
      <Bone className="h-4 w-2/3" />
      <div className="bg-tide-navy-900 rounded-tide-card min-h-64 p-5" />
      <CardBone rows={2} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <CardBone rows={3} />
        <CardBone rows={4} />
      </div>
      <CardBone rows={4} />
    </PlaceLoading>
  );
}
