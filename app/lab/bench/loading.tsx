import { Bone, CardBone, HeaderBone, PlaceLoading } from "@/components/tide/work/loading";
import { LABWS2 } from "@/content/lab-workspace-v2";

/** The bench frame's shape: stage tabs, then the queue beside the work area. */
export default function Loading() {
  return (
    <PlaceLoading place={LABWS2.shell.places.bench}>
      <HeaderBone tabs={5} />
      <Bone className="-mt-1 mb-4 h-8 w-56 rounded-full" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(280px,320px)]">
        <CardBone rows={4} className="p-3" />
        <CardBone rows={2} />
      </div>
    </PlaceLoading>
  );
}
