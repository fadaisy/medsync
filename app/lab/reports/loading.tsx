import { TabbedLoading } from "@/components/tide/work/loading";
import { LABWS2 } from "@/content/lab-workspace-v2";

export default function Loading() {
  return <TabbedLoading place={LABWS2.shell.places.reports} />;
}
