import { EcgLoader } from "@/components/medsync/ecg-loader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Console loading state — sober: header band + table block, matching
 * the approvals/audit layouts so content lands without a jump.
 */
export default function Loading() {
  return (
    <div className="flex flex-col">
      <div className="border-border border-b px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex w-full max-w-300 flex-col gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-300 px-4 sm:px-8">
        <Skeleton className="mt-6 h-72 rounded-lg" />
        <EcgLoader className="py-8" label="Loading console" />
      </div>
    </div>
  );
}
