# In-House Support Ticketing System — Requirements Spec

Phase: Requirements definition (SDLC Phase 1)
Status: Roles, lifecycle, and functional requirements defined and iterated. Ready for design/architecture phase.

---

## 1. Roles

| Role | Who | Key permissions |
|---|---|---|
| **Requester** | Any logged-in user (PFM, PFA, Technician, Developer, Manager, etc.) | Create tickets, view own ticket history |
| **Support/Triage** | <5 dedicated staff, separate role, Admin-managed allowlist | Confirm/correct ticket category, view per-member workload, assign tickets directly to a named individual on any team |
| **Team Member** | Staff belonging to a team (Fintech/Technical/ICT) | See and work only their own assigned tickets + their own requester history; must update ticket status |
| **Manager** | One per team, also a requester | Assign/reassign within their own team, view all team tickets + stats |
| **Admin** | System owner | Full visibility, manages users/teams/roles |
| **Executive** | Top exec, read-only | Same visibility as Admin, no edit/assign rights |

No AI/ML-driven features (no auto-classification, no AI-suggested categories or routing). All routing and categorization is human-decided.

---

## 2. Category & Assignment Model

- The **requester selects a category** (Fintech / Technical / ICT) at ticket creation. This is a **suggestion**, not final.
- **Support/Triage confirms or corrects** the category as the first triage step. A ticket cannot be assigned without a confirmed category (blocking step).
- Once confirmed, the **"assign to" list filters to that category's team members only**.
- Support/Triage **views per-member workload** (open ticket count per individual) to inform who to assign to — this is a Support/Triage capability, not a Manager one.
- Support/Triage **assigns directly to a named individual** — every ticket must be assigned; no ticket is ever left in an unassigned "team queue."
- If Support/Triage recategorizes a ticket later, the assignee list re-filters, and any existing assignment must be revisited (can't leave a ticket assigned to someone outside the new category's team).
- **Managers** can reassign a ticket to a different member **within their own team only** (they cannot recategorize or assign across teams).

---

## 3. Ticket Lifecycle

```
New
 └─▶ Category confirmed by Support/Triage (blocking step)
      └─▶ Assigned (mandatory, to a named individual, by Support/Triage)
           └─▶ In Progress ⇄ Pending (blocked on requester/3rd party — pauses SLA clock)
                │        ↑
                │   (reassign: Support/Triage → any member of the confirmed category's team;
                │    Manager → own team member only)
                ▼
           Resolved (by Team Member — does NOT close the ticket)
                └─▶ Pending Confirmation (requester notified — stays open indefinitely until they act)
                     ├─▶ Confirmed by requester → Closed
                     └─▶ Disputed by requester → Reopened → back to assigned Team Member
```

Every status change, assignment, and reassignment is logged with actor + timestamp (audit trail).

When a requester disputes a resolution, the ticket reopens and returns **directly to the same Team Member** who resolved it — no rerouting through Support/Triage or the Manager (FR-9.4).

---

## 4. Functional Requirements

### 4.1 Ticket Creation & Requester View
- **FR-1.1** Any logged-in user can create a ticket with: subject, description, the **site the issue relates to** (required, selected by the requester from a managed list — see 4.11), a category they select (Fintech/Technical/ICT — a suggestion, not final), a **priority they suggest** (Low/Medium/High/Urgent — a suggestion, not final, mirrors category — see 4.2), and optional attachments.
- **FR-1.2** A ticket is owned by its creator (requester) regardless of role.
- **FR-1.3** Requesters can view a full history of tickets they've created, with current status.
- **FR-1.4** Requesters can add comments/replies to their own tickets.
- **FR-1.5** Requesters cannot see other users' tickets, assign, or reassign tickets.

### 4.2 Triage & Assignment (Support/Triage role)
- **FR-2.1** Support/Triage staff review the requester's chosen category on each incoming ticket and either confirm it or change it if it's wrong.
- **FR-2.1a** Once the category is confirmed, the "assign to" list filters to that category's team members only.
- **FR-2.2** Support/Triage staff then assign the ticket directly to a specific individual from that filtered list.
- **FR-2.3** Support/Triage staff can view all incoming/unassigned tickets across all teams, plus the member roster of every team.
- **FR-2.4** Support/Triage staff can reassign a ticket to a different individual if misassigned, at any point before resolution. **Changing the category forces immediate reassignment** — the assignee list re-filters to the new category's team, and Support/Triage must pick a new (valid) assignee before the recategorization can be saved; a ticket can never be left assigned to someone outside its current confirmed category's team, even transiently.
- **FR-2.5** Support/Triage staff can see per-member workload (open ticket count) to inform assignment decisions.
- **FR-2.6** A ticket cannot be assigned without a confirmed category — this is a required, blocking step before "assign to" is enabled.
- **FR-2.7** The Support/Triage role is limited to a small, Admin-managed allowlist of accounts.
- **FR-2.8** Support/Triage staff review the requester's suggested priority on each incoming ticket and either confirm it or change it — mirrors FR-2.1 for category. **Priority is a label only for v1**: unlike category, it does not drive routing, does not gate assignment, and has no SLA timers or escalation logic attached (formal SLA enforcement is explicitly deferred — see §5).
- **FR-2.9** Support/Triage (or the ticket's Manager, within their own team) can change the confirmed priority at any point before resolution, same correction pattern as category. Unlike category, changing priority **never forces reassignment** — priority has no bearing on which team or individual holds the ticket.

### 4.3 Manager — Assignment, Reassignment & Oversight
- **FR-3.1** A Manager can assign an unassigned ticket (in their team's scope) to any member of their team.
- **FR-3.2** A Manager can reassign a ticket already assigned to one team member, to another member on their team.
- **FR-3.3** A Manager can flag/return a ticket to Support/Triage if misassigned to their team entirely.
- **FR-3.4** A Manager can view all tickets belonging to their team, regardless of who currently holds them.
- **FR-3.5** A Manager can view team-level stats: open/closed counts, resolution time, workload per member, aging tickets.
- **FR-3.6** A Manager, as a requester, can also see tickets they personally created — separate from their team management view.
- **FR-3.7** Each team has exactly one Manager; each Manager leads exactly one team.
- **FR-3.8** A Manager cannot assign or reassign tickets to members outside their own team, and cannot recategorize tickets.

### 4.4 Team Member View & Responsibilities
- **FR-4.1** A Team Member can see only: (a) tickets currently assigned to them, and (b) tickets they personally created as a requester.
- **FR-4.2** A Team Member cannot see other members' assigned tickets, even within the same team.
- **FR-4.3** A Team Member must update ticket status as work progresses (Assigned → In Progress → Resolved) — a core responsibility, not optional.
- **FR-4.4** A Team Member can add comments/notes, including internal notes not visible to the requester.
- **FR-4.5** A Team Member cannot assign or reassign tickets to anyone, including themselves.
- **FR-4.6** A Team Member can mark a ticket "Pending" (waiting on requester/third party) with a reason, pausing any SLA clock.
- **FR-4.7** A Team Member marks a ticket as Resolved — this does not immediately close it; it awaits requester confirmation (see 4.9).

### 4.5 Team Management (Admin)
- **FR-5.1** Admin can create, rename, and remove teams (not hardcoded — currently Fintech/Technical/ICT).
- **FR-5.2** Admin can add or remove staff from a team's member list.
- **FR-5.3** Admin can assign or change a team's Manager.
- **FR-5.4** Admin can grant/revoke the Support/Triage role on user accounts.
- **FR-5.5** Deleting/deactivating a team must handle in-flight tickets (force reassignment/triage-back before removal).

### 4.6 Admin & Executive Dashboard
- **FR-6.1** Admin has unrestricted visibility into all tickets, all teams, all users, system-wide.
- **FR-6.2** Admin can view and edit all configuration (teams, roles, categories, etc.).
- **FR-6.3** Executive role has the same system-wide visibility as Admin for dashboards/stats, but is read-only.
- **FR-6.4** Dashboard shows system-wide stats: total tickets by status, by team, by category, resolution time trends, aging tickets, staff workload across all teams, and **tickets currently in Pending Confirmation sorted by how long they've been waiting** (FR-9.6) — visibility only, no action taken automatically on this list.

### 4.7 Ticket Counters (scoped per role)
- **FR-7.1** Requester: counter of their own open tickets (optionally total/closed).
- **FR-7.2** Team Member: counter of tickets currently assigned to them (open/in-progress).
- **FR-7.3** Manager: counter of open tickets across their whole team, plus their own personal requester count.
- **FR-7.4** Support/Triage: counter of tickets awaiting category confirmation and/or assignment.
- **FR-7.5** Admin/Executive: system-wide counter broken down by team and status.
- **FR-7.6** All counters update in near-real-time (or at minimum on page load), scoped strictly to what that role can see.

### 4.8 Core Ticket Mechanics
- **FR-8.1** Ticket state machine as defined in Section 3.
- **FR-8.2** Every status change, assignment, and reassignment is logged with actor + timestamp (audit trail).
- **FR-8.3** A unique ticket number is generated on creation.
- **FR-8.4** Attachments can be added by the requester, the assigned member, or the manager.

### 4.9 Resolution & Closure Flow
- **FR-9.1** When the assigned Team Member marks a ticket Resolved, the ticket enters a "Pending Confirmation" state, not Closed.
- **FR-9.2** The requester is notified that their ticket has been marked resolved and is asked to confirm.
- **FR-9.3** If the requester confirms, the ticket moves to Closed.
- **FR-9.4** If the requester disputes/rejects the resolution, the ticket reopens and returns directly to the same Team Member who resolved it — no rerouting through Support/Triage or the Manager.
- **FR-9.5** The confirmation/dispute action and its timestamp are recorded in the audit trail like any other status change.
- **FR-9.6** The system computes how long a ticket has been in Pending Confirmation (current time minus `pending_confirmation_at`) on demand — shown on the ticket itself and surfaced in Admin/Executive dashboards/reports (see FR-6.4). This is a **query-time calculation, not a timer or scheduled job** — nothing runs on a clock, and no automated action is ever taken based on the elapsed duration. It exists purely so a long-waiting confirmation is visible to someone, not so the system acts on it.
- **No automatic closure.** A ticket in Pending Confirmation stays open indefinitely until the requester explicitly confirms or disputes — there is no time-based fallback that closes it on its own.

### 4.10 Availability Management (Team Member unavailable/on-leave)
Model: Team Member submits a request — either a date range (start + end date) or an open-ended toggle (unavailable now, no end date) — which requires Manager approval before it takes effect. Approved-and-unavailable members stay visible everywhere but are excluded from new assignment; tickets already assigned to them are unaffected and continue their normal lifecycle.

- **FR-10.1** A Team Member can submit an unavailability request as either a date range (start + end date) or an open-ended toggle (on, no end date).
- **FR-10.2** The request is Pending until their Manager approves or rejects it — it has no effect on assignment eligibility while pending.
- **FR-10.3** A Manager can approve or reject an unavailability request from a member of their own team only (mirrors FR-3.8's team-scoping).
- **FR-10.4** Once approved, the member's status becomes Unavailable for the specified range (or indefinitely, for a toggle) — visible as a highlighted/flagged state wherever that member appears (Support/Triage's assignee list, Manager's workload panel, team roster).
- **FR-10.5** An Unavailable member cannot be selected as an assignee by Support/Triage (FR-2.1/2.2) or reassigned to by a Manager (FR-3.1/3.2) — they're shown, highlighted, but not selectable.
- **FR-10.6** Tickets already assigned to a member before they went Unavailable are not auto-reassigned or flagged — they continue their normal status/resolution lifecycle exactly as if the member were available. The member is expected to keep working assigned tickets during a toggle-based "unavailable" state unless the Manager reassigns manually (a date-range leave implies they're actually out, but the system doesn't force any action on existing tickets either way).
- **FR-10.7** A date-range unavailability automatically ends when the end date passes — the member returns to selectable/available status with no manual action needed. A toggle-based unavailability stays in effect until the member (or their Manager) turns it off.
- **FR-10.8** A Manager can manually end a member's unavailability early (e.g. leave cancelled), in addition to the member doing so themselves.
- **FR-10.9** The approval/rejection action and any status change are recorded in the audit trail like any other action (per FR-9.5).
- **FR-10.10** The unavailable/on-leave status is a **derived flag**, entirely controlled by the approved-request flow above — no role, including Admin, can toggle it directly. This preserves the guarantee that a member only goes Unavailable with Manager approval.

### 4.11 Site Management (Admin)
- **FR-11.1** Admin can create, edit, and deactivate sites (name, region/location, active status) — mirrors team management (FR-5.1).
- **FR-11.2** Deactivating a site does not delete or hide historical tickets tied to it; it only prevents it from being selected on new tickets.
- **FR-11.3** Every ticket has exactly one site, set by the requester at creation. **Only Support/Triage can correct it** if wrong (mirrors their category-correction authority in FR-2.1) — Admin, Manager, and Team Member cannot edit a ticket's site.

### 4.12 Authentication
- **FR-12.1** Users can authenticate via local email/password credentials.
- **FR-12.2** Users can alternatively authenticate via SSO (e.g. Azure AD, Google Workspace, Okta) — both methods are supported side by side, not mutually exclusive.
- **FR-12.3** A user's role, team, and site assignments are independent of authentication method — SSO does not bypass or shortcut the RBAC model.

---

## 5. Explicitly Out of Scope (per user decisions so far)
- No AI/ML-based category suggestion or auto-triage.
- No unassigned "team queue" state — every ticket must have a named assignee.
- **Priority is a label only** (Low/Medium/High/Urgent, requester-suggested/Support-confirmed per FR-2.8) — no SLA response/resolution timers, no clock-pausing logic, no breach escalation. This was discussed in early research as a full SLA subsystem but deliberately scoped down to a label for v1; the full SLA-enforcement version (timers, escalation chains) remains a defined-but-deferred future project, not a gap.

---

## 6. Open Questions Carried Into Next Phase
None currently open — all prior items (dispute routing, recategorization behavior, SLA/priority scope) have been resolved. This section is kept as a placeholder for whatever comes up next.
