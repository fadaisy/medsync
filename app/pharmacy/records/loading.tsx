import { CardBone, PlaceLoading, TabsBone } from "@/components/tide/work/loading";
import { RW } from "@/content/pharmacy-rework";

/** Records' shape: the tab row, the filter chips, then panels. */
export default function Loading() {
  return (
    <PlaceLoading place={RW.pages.records} className="flex flex-col gap-4">
      <TabsBone n={4} />
      <CardBone rows={2} />
      <CardBone rows={6} />
    </PlaceLoading>
  );
}
