import { LABWS2 } from "@/content/lab-workspace-v2";
import { TabbedLoading } from "@/components/tide/work/loading";

export default function Loading() {
  return <TabbedLoading place={LABWS2.shell.places.sendOuts} />;
}
