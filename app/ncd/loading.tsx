import { EcgLoader } from "@/components/medsync/ecg-loader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * NCD registry pending state, shown at once on every navigation inside /ncd (the sidebar and banner
 * stay; only the page area waits). The page's own shape: title, a figure strip, a roomy list.
 */
export default function Loading() {
  return (
    <div className="fade-in-slow mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-6 sm:px-8">
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-4 w-48" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <div className="flex justify-center py-4">
        <EcgLoader label="Loading the registry" />
      </div>
    </div>
  );
}
