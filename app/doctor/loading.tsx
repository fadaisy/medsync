import { EcgLoader } from "@/components/medsync/ecg-loader";
import { Skeleton } from "@/components/ui/skeleton";

/** Doctor workspace pending state — the ECG mark over a quiet page scaffold. */
export default function Loading() {
  return (
    <div className="fade-in-slow mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-8">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-72" />
      <div className="flex min-h-72 items-center justify-center">
        <EcgLoader label="Loading workspace" />
      </div>
    </div>
  );
}
