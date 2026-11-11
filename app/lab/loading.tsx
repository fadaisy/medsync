import { TabbedLoading } from "@/components/tide/work/loading";
import { LABWS2_LOADING } from "@/content/lab-workspace-v2-loading";

/** Fallback for any lab route without its own skeleton. */
export default function Loading() {
  return <TabbedLoading place={LABWS2_LOADING.laboratory} />;
}
