"use client";

import { Icon, k } from "@/components/clinics-schedule/shared";
import { GUIDE } from "@/content/hospital-admin/guide";
import { useGuide } from "./guide-provider";

/**
 * The guide's button in the sidebar (ADR 0522): a ? in a circle, drawn by the admin frame and the Clinics &
 * schedule rail in the rail's own classes. Nothing outside the admin shell (the styleguide's fixture desk).
 */
export function GuideNavButton() {
  const guide = useGuide();
  if (!guide) return null;
  return (
    <nav className={k("nav")} aria-label={GUIDE.button}>
      <button
        type="button"
        className={k("nv")}
        data-tour="guide-btn"
        onClick={guide.openGuide}
        title={GUIDE.button}
      >
        <Icon n="help" size={19} />
        <span className={k("lbl")}>{GUIDE.button}</span>
      </button>
    </nav>
  );
}
