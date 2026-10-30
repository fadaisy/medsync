import { TabbedLoading } from "@/components/tide/work/loading";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

export default function Loading() {
  return <TabbedLoading place={PHWS2.shell.places.shelf} tabs={3} />;
}
