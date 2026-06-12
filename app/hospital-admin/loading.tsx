import { EcgLoader } from "@/components/medsync/ecg-loader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Hospital-admin loading state — mirrors the overview column (header,
 * two KPI panels, placeholder card) so content settles without a jump.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
      <EcgLoader className="py-4" label="Loading workspace" />
    </div>
  );
}
