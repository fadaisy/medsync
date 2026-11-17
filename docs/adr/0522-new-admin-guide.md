# ADR 0522: The new-admin guide: a welcome, walkthroughs on the real pages, Set up Tether, and demos that change nothing

**Status:** Accepted, 16 Nov 2026. The owner approved the prototype (canvas "Tether admin, harmonized", the guide fork: `add3.js`, `modals3.html`, `today-setup.html`, `add3.css`) and asked for it to be built in the hospital-admin workspace. Wording is a draft (`content/hospital-admin/guide.ts`, `GUIDE_COPY_STATUS`).

Builds on [ADR 0520](0520-one-admin-workspace.md) and [ADR 0521](0521-admin-workspace-phase-2.md) (one admin workspace, every page in the Tether desk).

## Context

A hospital admin's first hour decides whether the hospital is ever bookable. The admin workspace has fifteen pages and two desks (the admin frame and Clinics & schedule's own desk); nothing told a new admin where to start or what each page is for.

## Decision

- **One guide over both desks.** A client provider (`components/hospital-admin/guide/guide-provider.tsx`) is mounted in `app/hospital-admin/_components/hospital-shell.tsx`, around the admin frame, so a walkthrough crosses from Today into Clinics & schedule and back. It owns the welcome, the walkthrough (which one, which step, the spotlight), the guide dialog and the demos.
- **Welcome on first sign-in**, once per person in this browser ("Show me around" starts the menu tour; "I'll explore on my own" closes it). The guide's memory (welcomed, Set up Tether hidden, profile opened) is in `localStorage` under a hash of the user's id (the layout hashes it; the id itself is not used as a key), every call wrapped in try/catch; a browser that cannot store simply does not remember, and a welcome it cannot record is not shown.
- **Walkthroughs on the real pages.** Each step is `[data-tour target, route, title, words]`. The step goes to the real route with the Next router (`/hospital-admin/clinics?view=week`, `/hospital-admin/staff?tab=invites`, `/hospital-admin/departments?view=unavailable`), waits for the URL and the target, scrolls it into view and measures it. The spotlight is a box-shadow cut-out hugging the target (round only round an icon-sized one); the words go beside, below or above it with a quadratic-curve arrow to its nearest edge, or become a dark card when there is no room. A target the page does not show (a part this hospital has not set up, the phone's closed menu) gets the step centred with no spotlight. Motion is 400 ms on `cubic-bezier(0.16, 1, 0.3, 1)` and none under `prefers-reduced-motion`; the dim and the moving spotlight carry meaning (where to look). The overlay is a labelled `role="dialog"` with a polite live region; focus goes to Next; Escape closes; the arrow keys move between steps. The maths is pure and tested (`lib/hospital-admin/guide/placement.ts`).
- **Records by URL, never by guess.** A step that needs one record open (a clinic, a department, a ward's builder, a test) names `{pick:list}` in its route: the guide opens the list's page and reads the first record's id from its `data-guide-id`. Pages that keep their tab in the URL now follow it when it changes (`useUrlState`: People, Departments, Laboratory and imaging, Requests), which also fixes the back button there. Clinics & schedule keeps its view in its own state, so it also reads `?clinic=&tab=` on load and follows the guide's links through a window event (`GUIDE_NAV_EVENT`); the clinic editor's key includes its tab so a link opens that tab.
- **Set up Tether on Today**: seven steps, each Done only when the hospital's records say so, read on the server (`app/hospital-admin/today/_lib/setup.ts`), each fact on its own and best-effort. A fact that cannot be read is To do, never Done:

  | Step                                            | Done when                                                                                                                                                                                            |
  | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Check the hospital profile                      | the admin opened the profile in this browser (no record stands behind it; as in the prototype)                                                                                                       |
  | Set your departments live                       | any department has `medsync_live_at` and is not archived                                                                                                                                             |
  | Invite your team                                | any row in `hospital_staff_invitations` for the hospital                                                                                                                                             |
  | Set emergency routing and the location          | the hospital's latitude and longitude are both set, and a routing value is set, verified or waiting for a second admin (a starting default such as "not receiving" or pre-alerts off does not count) |
  | Open your first clinic for booking              | any service line active, not paused, not archived                                                                                                                                                    |
  | Publish the week plan                           | any row in `schedule_versions`                                                                                                                                                                       |
  | Pair the front desk and the waiting-room screen | any `desk_devices` row whose pairing code was used or that has been seen                                                                                                                             |

  Each step opens its page; its ? (the sidebar guide's icon, labelled "Show me how: …") starts the matching walkthrough. "Done" and "To do" are neutral square tags in words. "Hide" is remembered per person; the guide offers to show the card again.

- **The Tether guide** is a centred wide `DeskDialog` opened from a ? button in the sidebar of both desks (`data-tour="guide-btn"`): Walkthroughs first, then 26 how-tos in 7 topics as an accordion (numbered steps, "Good to know", "Walk me through it", "▶ Watch it done", "Take me there"), one search over how-tos and walkthroughs, and "Tour the menu again".
- **Motion demos change nothing.** The prototype's demos acted on sample data (typed into fields, pressed buttons, saved). In production a demo must never change data, so a demo is **passive playback on the real screens**: it only navigates (read-only, opening a panel by URL where the page supports it), moves a cursor to the real control with a click ring that is shown and never performed, and captions the action ("Press + on Monday to add a session"). A step inside a dialog that only opens by a click shows its caption in the middle of the page behind it. The bar says "A demo: nothing is changed"; closing returns to where the admin was. The guide's code imports no server action and never clicks, types, submits or dispatches a synthetic input event (a source test holds this).

### Where the built pages differ from the prototype

The steps were rewritten to the real pages; nothing describes a feature that is not built.

- **Menu tour** (17 steps, was 15): the menu has two People (Clinics & schedule's team view and the hospital's People), so the prototype's merged step is split (`nav-people`, `nav-hospital-people`); Hospital profile is added; Find anything describes ⌘K (a page, department, ward, clinic or test) and Clinics & schedule's own search (a clinic, person or room); Closures and Emergency and support are reworded to the real pages.
- **Set up a clinic:** the clinic is the first one in the list (the prototype chose the first not live); "Desks and screens" is the editor's Desks tab, worded from its own note; the Fee step no longer promises a free review within 14 days (not built); Booking names walk-ins and the reminder; Open for booking "appears here" once nothing blocks it.
- **Get ready:** the real stage and tab names; Open every ready clinic shows only when a clinic is ready; the template is "a usual week for each clinic".
- **Closures:** a closure, time away or an extra session; people booked are told when you publish.
- **Your team:** the prototype's People tabs inside Clinics & schedule do not exist; the step points at the hospital's People in the menu.
- **Invite and approve staff:** real `?tab=invites|admins`; the invite has no role (people pick it at sign-up, checked under To review); Admins is read-only (who holds the role, primary or backup).
- **Departments:** the detail opens by `?open=` on the first department; "Name its head below"; the three real tabs; the Ministry's list.
- **Wards and beds:** the prototype's list/board switch is the ward card's foot (Ward builder, Bed board); the builder's start screen is shown on the first ward without a layout and its palette, plan, inspector and Publish on the first ward with one; the palette is Beds, Dividers, Rooms and Fixtures; the plan's "Show" lens.
- **Laboratory and imaging:** "the parts of the page" (Compare shows only with a level).
- **Emergency and support:** "Confirm it is still true" is dropped (deferred in ADR 0521); the location is one admin, audited.
- **Hospital profile:** the identity card (set by the superadmin) and the emergency and location card replace the menu item as the first steps.
- **Demos:** clinic (dialog steps centred), invite (dialog steps centred, then the Invitations list), department (filter and detail described, detail opened by URL), emergency (Change pointed at, the dialog's steps centred), ward (no invented ward names or template; nothing placed, ticked or published; the bed-board switch dropped) and lab (the test opened by `?test=`; "write where it is referred to", since the referral is a free-text field; courier days dropped, not stored).

## Consequences

- No migration, no RLS or policy change, no new Edge Function, no new dependency. The guide adds `data-tour` attributes and reads; each page keeps its behaviour, except that a URL tab now wins when the URL changes.
- The Today page reads seven more existence checks, each `limit 1` and scoped to the hospital.
- New wording in `content/hospital-admin/guide.ts`, draft until the CSO signs. Tests: `tests/hospital-admin/guide.test.ts` (placement, arrow, search, setup derivation, copy status, reduced motion) and `guide-sources.test.ts` (every target is a real `data-tour`; demos call no action).
