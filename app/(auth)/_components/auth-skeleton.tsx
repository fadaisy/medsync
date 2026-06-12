import { Skeleton } from "@/components/ui/skeleton";

/**
 * Card-shaped placeholder matching AuthCard's frame, shown while a
 * search-param-dependent form is suspended. Shimmer only — no fake copy.
 */
export function AuthCardSkeleton() {
  return (
    <div
      aria-busy="true"
      className="bg-card border-border shadow-card flex flex-col gap-6 rounded-lg border p-8"
    >
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-60 max-w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
