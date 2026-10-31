import { CardBone, PlaceLoading } from "@/components/tide/work/loading";
import { RW } from "@/content/pharmacy-rework";

/** Team's shape: the figures, the hourly bars, the table. */
export default function Loading() {
  return (
    <PlaceLoading place={RW.pages.team} className="flex flex-col gap-4">
      <CardBone rows={1} />
      <CardBone rows={2} />
      <CardBone rows={6} />
    </PlaceLoading>
  );
}
