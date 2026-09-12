import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="-mt-2 mb-1 h-4 w-28" />
        <Skeleton className="h-3 w-44" />
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="size-11 shrink-0 rounded-md" />
        </div>
        <Skeleton className="h-4 w-full max-w-[48ch]" />
      </div>

      <div className="grid gap-6 @5xl/page:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
