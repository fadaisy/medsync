import { EcgLoader } from "@/components/medsync/ecg-loader";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-8 lg:py-10">
      <Skeleton className="h-3.5 w-44" />
      <Skeleton className="h-8 w-52" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16 max-sm:hidden" />
        <Skeleton className="h-16 max-lg:hidden" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="flex justify-center py-8">
        <EcgLoader label="Loading front desk" />
      </div>
    </div>
  );
}
