import { Skeleton } from "@/components/ui/skeleton";

/** Triage worklist skeleton — mirrors the header + row layout so nothing jumps. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="border-border divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-2 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
