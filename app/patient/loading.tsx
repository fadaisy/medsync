import { EcgLoader } from "@/components/medsync/ecg-loader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Patient-surface loading state — mirrors the home column's shape
 * (greeting, banner, glance card, 2-up quick actions) so the real
 * page settles into place without a layout jump.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <EcgLoader className="py-4" label="Loading your space" />
    </div>
  );
}
