import { Skeleton } from "@/components/ui/skeleton";

/** Two regions of two, which is what the network looks like today — enough
 *  to hold the grid open without promising a page of results. */
const CARDS = [0, 1, 2, 3];

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="-mt-2 mb-1 h-4 w-28" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-[48ch]" />
      </div>

      <Skeleton className="h-11 rounded-full" />

      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <div className="grid gap-2 @3xl/page:grid-cols-2">
            {CARDS.map((card) => (
              <Skeleton key={card} className="h-36 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
