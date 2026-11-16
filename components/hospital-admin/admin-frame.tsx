"use client";

import type { AdminNavGroup } from "@/lib/hospital-admin/admin-nav";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DeskDialog, Icon, k, VIEW_ICONS, VIEWS } from "@/components/clinics-schedule/shared";
import { DeskShell } from "@/components/reception/shell";
import { CS } from "@/content/clinics-schedule/copy";
import { ADMIN_NAV } from "@/content/hospital-admin/admin-nav";
import { activeKey } from "@/lib/hospital-admin/admin-nav";
import f from "./admin-frame.module.css";
import { AdminNavGroups } from "./admin-nav-groups";

/** Clinics & schedule draws its own desk shell with this same menu, so the frame steps aside there (ADR 0514). */
const BARE = "/hospital-admin/clinics";

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};

/**
 * Every hospital-admin page outside Clinics & schedule, in the same Tether desk shell and menu (ADR 0515): the
 * workspace's seven views as links, then the shared groups. The page itself scrolls inside the shell's body.
 */
export function AdminFrame({
  hospitalName,
  userName,
  groups,
  top,
  children,
}: {
  hospitalName: string;
  userName: string;
  groups: readonly AdminNavGroup[];
  /** The top bar's own tools (the ⌘K search). */
  top: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [rail, setRail] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState<"keys" | "emerg" | null>(null);
  const [seenPath, setSeenPath] = useState(path);
  const bare = path === BARE || path.startsWith(`${BARE}/`);

  // The drawer is the phone menu: moving to another page closes it.
  if (seenPath !== path) {
    setSeenPath(path);
    setDrawer(false);
  }

  useEffect(() => {
    if (bare) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawer) {
        setDrawer(false);
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") {
        e.preventDefault();
        setRail((r) => !r);
      } else if (e.key === "?") {
        e.preventDefault();
        setModal((m) => (m === "keys" ? null : "keys"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bare, drawer]);

  if (bare) return <>{children}</>;

  const active = activeKey(path, groups);
  const close = () => setModal(null);

  return (
    <DeskShell
      label={ADMIN_NAV.label}
      priv={false}
      offline={false}
      banner={null}
      rail={rail}
      setRail={setRail}
      drawer={drawer}
      setDrawer={setDrawer}
      hospitalName={hospitalName}
      user={{ name: userName, place: ADMIN_NAV.role }}
      syncText={ADMIN_NAV.online}
      onKeys={() => setModal("keys")}
      onSwitchUser={() => router.push("/accounts")}
      onEmergency={() => setModal("emerg")}
      toast={null}
      clearToast={() => {}}
      side={
        <div className={k(rail && !drawer && "railed")} style={{ display: "contents" }}>
          <nav className={k("nav")} aria-label={CS.label}>
            {VIEWS.map((v) => (
              <Link key={v} href={`${BARE}?view=${v}`} className={k("nv")} title={CS.views[v]}>
                <Icon n={VIEW_ICONS[v]} size={19} />
                <span className={k("lbl")}>{CS.views[v]}</span>
              </Link>
            ))}
          </nav>
          <AdminNavGroups groups={groups} active={active} />
          <div className={k("grow")} />
        </div>
      }
      top={
        <>
          <div className={f.tools}>{top}</div>
          <span className={k("grow")} />
        </>
      }
      after={
        <>
          <DeskDialog
            open={modal === "keys"}
            onClose={close}
            label={ADMIN_NAV.keys.title}
            tile="keys"
            title={ADMIN_NAV.keys.title}
            lead={ADMIN_NAV.keys.sub}
          >
            <div className={k("kys")}>
              {ADMIN_NAV.keys.list.map(([what, keys]) => (
                <div key={what} className={k("ky")}>
                  <span>{what}</span>
                  <span className={k("kk")}>
                    {keys.map((x) => (
                      <kbd key={x}>{x}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </DeskDialog>
          <DeskDialog
            open={modal === "emerg"}
            onClose={close}
            label={CS.emergency.title}
            tile="alert"
            red
            title={CS.emergency.title}
            lead={CS.emergency.body}
          >
            <div className={k("mf")}>
              <a className={k("btn", "r")} href="/emergency">
                {CS.emergency.go}
              </a>
              <button type="button" className={k("btn")} onClick={close}>
                {CS.close}
              </button>
            </div>
          </DeskDialog>
        </>
      }
    >
      <div className={f.page}>{children}</div>
    </DeskShell>
  );
}
