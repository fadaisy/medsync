import { Bone, CardBone, PlaceLoading } from "@/components/tide/work/loading";
import { LABWS2 } from "@/content/lab-workspace-v2";

/** Needs you: filter chips over grouped panels, with the side column on wide screens. */
export default function Loading() {
  return (
    <PlaceLoading
      place={LABWS2.shell.needsYou}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Bone className="h-8 w-72 rounded-full" />
        <CardBone rows={3} />
        <CardBone rows={2} />
      </div>
      <CardBone rows={3} className="max-xl:hidden" />
    </PlaceLoading>
  );
}
