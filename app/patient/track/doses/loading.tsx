import { Skeleton } from "@/components/ui/skeleton";

/** Rows the day strip reserves — seven chips, one week, same grid as the real
 *  strip so the chips don't shift sideways when the page paints. */
const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Three clock groups is what a twice- or thrice-daily patient sees; the
 *  gutter, rail column and card widths are the timeline's own grid. */
const GROUPS = [0, 1, 2];

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="-mt-2 mb-1 h-4 w-28" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full max-w-[48ch]" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="size-11 rounded-md" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="size-11 rounded-md" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((day) => (
            <Skeleton key={day} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid gap-6 @5xl/page:grid-cols-[minmax(0,1fr)_20rem] @5xl/page:items-start">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
          <ol className="flex flex-col gap-4">
            {GROUPS.map((group) => (
              <li key={group} className="grid grid-cols-[3.5rem_1px_minmax(0,1fr)] gap-x-5">
                <Skeleton className="mt-3 h-3 w-10 justify-self-end" />
                <span aria-hidden className="bg-border col-start-2 w-px" />
                <Skeleton className="col-start-3 h-16 rounded-lg" />
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
