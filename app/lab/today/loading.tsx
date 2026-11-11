import { Bone, CardBone, PlaceLoading, TabsBone } from "@/components/tide/work/loading";
import { LABWS2 } from "@/content/lab-workspace-v2";

/** Today's shape: period tabs and section chips, the navy hero beside the stage cards, then two cards. */
export default function Loading() {
  return (
    <PlaceLoading place={LABWS2.shell.places.today} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <TabsBone n={3} />
        <Bone className="h-8 w-48 rounded-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,2fr)]">
        <div className="bg-tide-navy-900 rounded-tide-card min-h-64 p-5" />
        <CardBone rows={4} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <CardBone rows={4} />
        <CardBone rows={4} />
      </div>
    </PlaceLoading>
  );
}
