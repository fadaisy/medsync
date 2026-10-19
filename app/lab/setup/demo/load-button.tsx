"use client";

import { LabButton } from "../../_components/v2/button";
import { Said, useAct } from "../criticals/_components/setup-forms";
import { loadDemoDayAction } from "./actions";

export function LoadDemoDay() {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-2">
      <LabButton
        type="button"
        className="w-fit"
        onClick={() => act(loadDemoDayAction, "Loaded. The worklist now has a demo day.")}
        variant="primary"
        busy={pending}
      >
        {pending ? "Loading…" : "Load a demo lab day"}
      </LabButton>
      <Said message={message} />
    </div>
  );
}
