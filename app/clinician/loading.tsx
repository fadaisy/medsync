import { EcgLoader } from "@/components/medsync/ecg-loader";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <Skeleton className="h-3.5 w-44" />
      <Skeleton className="h-8 w-60" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-14" />
      <Skeleton className="h-56" />
      <div className="flex justify-center py-8">
        <EcgLoader label="Loading clinician workspace" />
      </div>
    </div>
  );
}
