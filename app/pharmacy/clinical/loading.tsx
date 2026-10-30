import { Bone, CardBone, PlaceLoading } from "@/components/tide/work/loading";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

/** The Clinical hub: the intro, the limits line, then the cards. */
export default function Loading() {
  return (
    <PlaceLoading
      place={PHWS2.shell.places.clinical}
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6"
    >
      <Bone className="h-4 w-96 max-w-full" />
      <Bone className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <CardBone key={i} rows={2} />
        ))}
      </div>
    </PlaceLoading>
  );
}
