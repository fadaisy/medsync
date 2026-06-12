import { Skeleton } from "@/components/ui/skeleton";

/** Resus board skeleton — header + the two board sections, no layout jump. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  );
}
