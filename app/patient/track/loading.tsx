import { Skeleton } from "@/components/ui/skeleton";

/** The tracking hub: header, the three-stat glance strip, the log CTA, then
 *  the medicines list beside the readings column. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-full max-w-[48ch]" />
      </div>

      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-11 rounded-full md:w-40" />

      <div className="grid gap-6 @5xl/page:grid-cols-[minmax(0,1fr)_20rem] @5xl/page:items-start">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-16 rounded-xl" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
