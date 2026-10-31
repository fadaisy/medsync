import { CardBone, PlaceLoading, TabsBone } from "@/components/tide/work/loading";
import { RW } from "@/content/pharmacy-rework";

/** A pharmacy page while it loads: its tab row when it has one, then panels. The shell stays put around it. */
export function PageLoading({
  page,
  tabs = 0,
  rows = [2, 6],
}: {
  page: keyof typeof RW.pages;
  tabs?: number;
  rows?: number[];
}) {
  return (
    <PlaceLoading place={RW.pages[page]} className="flex flex-col gap-4">
      {tabs ? <TabsBone n={tabs} /> : null}
      {rows.map((r, i) => (
        <CardBone key={i} rows={r} />
      ))}
    </PlaceLoading>
  );
}
