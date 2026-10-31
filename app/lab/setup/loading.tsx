import { LABWS2 } from "@/content/lab-workspace-v2";
import { Bone, CardBone, PlaceLoading } from "@/components/tide/work/loading";

/** The Set-up hub: the note, the finder, the signature queue, then the groups of settings. */
export default function Loading() {
  return (
    <PlaceLoading place={LABWS2.shell.places.setup} className="flex flex-col gap-4">
      <Bone className="h-4 w-96 max-w-full" />
      <Bone className="h-10 w-full max-w-md" />
      <CardBone rows={1} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardBone key={i} rows={2} />
        ))}
      </div>
    </PlaceLoading>
  );
}
