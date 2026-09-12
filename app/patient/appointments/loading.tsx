import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-full max-w-[48ch]" />
      </div>

      <Skeleton className="h-11 rounded-full sm:w-40" />

      <div className="grid gap-6 @5xl/page:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
