import { Bone, CardBone, PlaceLoading } from "@/app/lab/_components/v2/loading";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

/** Needs you: filter chips over grouped panels. */
export default function Loading() {
  return (
    <PlaceLoading
      place={PHWS2.shell.titles.needsYou}
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6"
    >
      <Bone className="h-8 w-72 rounded-full" />
      <CardBone rows={3} />
      <CardBone rows={2} />
    </PlaceLoading>
  );
}
