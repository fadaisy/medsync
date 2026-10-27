import { TabbedLoading } from "@/app/lab/_components/v2/loading";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <TabbedLoading place={PHWS2.shell.places.setup} tabs={6} />
    </div>
  );
}
