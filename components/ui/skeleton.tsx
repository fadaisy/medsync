import { cn } from "@/lib/utils";

/** Shimmer placeholder. Compose into per-surface loading layouts. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  );
}

/** A ready-made "workspace is coming" page block: header bar + card rows. */
function SkeletonPage({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-8", className)}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28 max-lg:hidden" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export { Skeleton, SkeletonPage };
