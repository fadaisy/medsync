import { TabbedLoading } from "@/app/lab/_components/v2/loading";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

export default function Loading() {
  return <TabbedLoading place={PHWS2.shell.places.window} tabs={5} />;
}
