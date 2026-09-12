import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home's silhouette: header, hero, the two list sections, quick actions.
 *
 * Every heavy child route now has its own loading file, so this one only has
 * to match home — it used to fire for Track, Visits, Hospitals and Profile
 * too, flashing a shape none of them settle into.
 */
export default function Loading() {
  return (
    <div className="grid gap-6 @5xl/page:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-full max-w-[48ch]" />
        </div>
        <Skeleton className="h-44 rounded-2xl" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    </div>
  );
}
