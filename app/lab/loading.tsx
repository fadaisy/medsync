import { LABWS2_LOADING } from "@/content/lab-workspace-v2-loading";
import { TabbedLoading } from "./_components/v2/loading";

/** Fallback for any lab route without its own skeleton. */
export default function Loading() {
  return <TabbedLoading place={LABWS2_LOADING.laboratory} />;
}
