# Support Ticketing System — Figma Design Log

Figma file: https://www.figma.com/design/Njae8eyvTRBlOBqmzZYY8N
File key: Njae8eyvTRBlOBqmzZYY8N
Design system used: KAPS Proximus dark industrial system (green accent, Inter + JetBrains Mono, dark surfaces) — repurposed from the KAPS parking platform skill, rebranded as "SupportDesk" for this project.

## Screens built (high-fidelity, on the "Screens" page)

1. **Requester — My Tickets** — ticket history, status badges, open/pending/closed counters, "+ New ticket" action.
2. **Support/Triage — Incoming Queue** — requester's suggested category shown as a chip, "Confirm [category]" / "Change category" actions, assignee dropdown (scoped to the confirmed category's team), per-member workload bars.
3. **Manager — Team Dashboard** — team-wide stat cards, workload panel, team ticket table with per-row "Reassign" action (scoped to own team).
4. **Admin & Executive — System Dashboard** — system-wide stats, tickets-by-team breakdown, tickets-by-status breakdown, "EXEC VIEW · READ-ONLY" badge shown when applicable.
5. **Team Member — Assigned Tickets** — tickets assigned to them only, with status-update actions (Start progress / Mark pending / Mark resolved / Add note), scoped strictly per FR-4.1/4.2.
6. **Requester — Create Ticket** — subject, description, category picker (framed as requester's suggestion, support confirms), attachment dropzone, submit.

## Not built — explicitly out of scope (user decision)

Stopped here deliberately, not for lack of time. Originally blocked by the Figma MCP rate limit; when asked to resume, the decision was "no need for figma" — so the remaining screens are intentionally unbuilt, not a gap:

- **Resolution Confirmation screen** (requester confirms/disputes after a Team Member marks Resolved) — the flow itself is fully specified without a mockup: see REQUIREMENTS.md §4.9, API_CONTRACT.md §7, and the sequence diagram in SEQUENCE_DIAGRAMS.md §1.
- Admin screens: Teams & members management, Roles & permissions, Categories management — corresponding API routes exist in API_CONTRACT.md §9 without a UI mockup.

If this changes later, the last attempted frame was planned at x=9240 ("Resolution Confirmation — Requester"); the frame x-position convention used so far is 1440px-wide frames with a 100px gap: 0, 1540, 3080, 4620, 6160, 7700.

## Design notes / decisions made while building

- All wrapper auto-layout frames must have `fills = []` explicitly set — Figma's `createAutoLayout()` defaults to a white fill, which otherwise washes out dark-themed content stacked inside it. This bit us on screen 1 (My Tickets) and was fixed retroactively; every screen after that sets `fills = []` inside the `autoV`/`autoH` helper functions from the start.
- Card/list children inside a FILL-sized wrapper (e.g. ticket cards inside `QueueWrap`) need `layoutSizingHorizontal = 'FILL'` set explicitly on each child after `appendChild` — the wrapper filling its parent does not automatically make its children fill it.
- `layoutSizingHorizontal/Vertical = 'FILL'` must be set AFTER `parent.appendChild(child)`, never before.
- Ticket IDs and codes use JetBrains Mono per the KAPS convention.
- Status badge colors: New/Assigned/Pending confirmation = blue, In progress/Pending = amber, Aging/Reopened = red, Closed = muted gray, "active" stat cards = green fill.
- Frames are resized taller than the fixed 900px shell whenever content overflows (measured via a temporary HUG pass on the main content column), so nothing gets clipped by the frame's default `clipsContent`.
