"use client";

import { Button } from "@/components/ui/button";
import { Said, useAct } from "../criticals/_components/setup-forms";
import { loadDemoDayAction } from "./actions";

export function LoadDemoDay() {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="w-fit"
        disabled={pending}
        onClick={() => act(loadDemoDayAction, "Loaded. The worklist now has a demo day.")}
      >
        {pending ? "Loading…" : "Load a demo lab day"}
      </Button>
      <Said message={message} />
    </div>
  );
}
