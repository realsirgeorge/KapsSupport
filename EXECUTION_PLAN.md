# Complete Execution Plan — Comprehensive Build & Test

**Status:** Detailed accountability document for all remaining work.  
**Responsibility:** Every element listed here will be built, tested, and verified.  
**Strategy:** Parallel API builds + continuous integration testing + Playwright E2E verification.

---

## SECTION A: API ENDPOINTS (Complete Coverage)

### A1: Auth Endpoints (Partial → Complete)
- [x] POST `/auth/login` — implemented
- [x] POST `/auth/logout` — implemented
- [x] GET `/auth/me` — implemented
- [ ] POST `/auth/sso/:provider` — SSO redirect (resolve vs. defer)
- [ ] GET `/auth/sso/:provider/callback` — SSO callback (resolve vs. defer)
- **Test:** Login flow, session validation, logout clear cookie

**Remaining:** Stub SSO redirects (local dev doesn't need real OAuth)

---

### A2: Ticket Endpoints (Core CRUD)

#### Read Operations:
- [ ] GET `/tickets` — list with role-based scoping
  - Params: `?status=`, `?mine=true`, `?assigned_to_me=true`, `?team_id=`, `?page=`, `?limit=`
  - Response includes: pagination metadata
  - **Scoping:** Requester sees own, Team Member sees own + assigned, Manager sees team, Support/Triage sees all, Admin sees all
- [ ] GET `/tickets/:id` — single ticket detail
  - Include: full ticket data, pending_confirmation_days computed, status
  - Scoping: requesters see only own, Team Members see own + assigned, etc.
- [ ] POST `/tickets` — create new ticket
  - Body: `{ subject, description, site_id, suggested_category_id?, suggested_priority? }`
  - Response: full ticket with generated `ticket_number`
  - **Rate limit:** 20/hour per user (API_CONTRACT.md §12)

#### Write Operations:
- [ ] PATCH `/tickets/:id/status` — update status (Team Member only)
  - Body: `{ status, pending_reason? }`
  - Validation: State machine checks (use TicketStateMachine)
  - On resolve → actually transitions to pending_confirmation (not closed)
  - On disputed → reopens to same assigned Team Member
  - Response: 409 CONFLICT if invalid transition
- [ ] POST `/tickets/:id/confirm-resolution` — resolution confirmation (Requester only)
  - Body: `{ action: "confirm"|"dispute", comment? }`
  - Confirm → status = closed
  - Dispute → status = reopened, reassign to same Team Member
  - Response: 409 if not in pending_confirmation state

#### Attachments:
- [ ] POST `/tickets/:id/attachments` — request presigned upload URL
  - Body: `{ filename, content_type, size_bytes }`
  - Response: `{ attachment_id, status: "pending", upload_url }`
  - Creates attachment record with status='pending'
  - **Rate limit:** 20/hour per user
- [ ] POST `/tickets/:id/attachments/:attachmentId/confirm` — confirm upload, enqueue validation
  - Response: enqueue worker job, return status='pending'
- [ ] GET `/tickets/:id/attachments/:attachmentId/download-url` — get presigned download
  - Response: only if status='safe', else 404
  - Returns `{ download_url: "presigned GET URL" }`

#### Comments:
- [ ] POST `/tickets/:id/comments` — add comment/note
  - Body: `{ body, is_internal? }`
  - **Scoping:** Requester can add, assigned member can add, internal notes hidden from requester
  - **Rate limit:** 30/hour
- [ ] GET `/tickets/:id/comments` — list comments
  - Internal comments filtered out for Requesters

**Tests:**
- Ticket creation → retrieval
- Status transitions (valid and invalid)
- Resolution confirm/dispute cycle
- Requester can't see other's tickets
- Audit trail populated for every action

---

### A3: Triage Endpoints (Support/Triage workflow)

- [ ] GET `/triage/queue` — list tickets needing triage
  - Returns: unconfirmed category OR unassigned tickets
  - Scoping: Support/Triage only
- [ ] POST `/tickets/:id/category/confirm` — confirm/correct category
  - Body: `{ category_id }`
  - Response: includes `reassignment_required: true` if current assignee is now outside category's team
  - DB trigger validates: assignee.team must match category.team
  - **Test:** Category change forces reassignment requirement
- [ ] POST `/tickets/:id/priority/confirm` — confirm/correct priority
  - Body: `{ priority: "low"|"medium"|"high"|"urgent" }`
  - Unlike category: no reassignment required (priority is label-only)
  - Allowed by: Support/Triage or Manager (own team)
- [ ] POST `/tickets/:id/assign` — assign to team member
  - Body: `{ assignee_id }`
  - Validation:
    - Assignee must exist
    - Assignee must be in confirmed_category's team (DB trigger + API check)
    - Assignee must not be unavailable (is_unavailable = false)
  - Response: 409 CONFLICT with error message if invalid
  - Updates: `assigned_to`, `assigned_by`, `assigned_at`, status='assigned'
  - **Rate limit:** 120/min general write limit
- [ ] GET `/triage/queue` workflow test:
  - Create ticket → appears in queue
  - Confirm category → update response
  - Confirm priority → update response
  - Assign member → status='assigned'

---

### A4: Manager Endpoints (Team oversight)

- [ ] GET `/teams/:id/workload` — per-member open ticket count
  - Response: list of members with open_tickets count each
  - Used by: Support/Triage, Managers, Admin
- [ ] GET `/teams/:id/stats` — team performance metrics
  - Response: `{ open_tickets, avg_resolution_hours, aging_over_3_days, team_size, per_member: [...] }`
  - Scoping: Manager (own team), Admin
- [ ] GET `/teams/:id/tickets` — all team tickets
  - Params: filter by status, assigned_to, etc.
  - Scoping: Manager (own team), Admin
- [ ] POST `/tickets/:id/reassign` — Manager reassigns within team
  - Body: `{ assignee_id }`
  - Validation: assignee must be in same team, not unavailable
  - Scoping: Manager (own team only)
  - Response: 403 if trying to reassign outside team
- [ ] POST `/tickets/:id/return-to-triage` — Manager flags ticket back to Support/Triage
  - Body: optional reason
  - Response: audit log entry for "returned_to_triage"

**Tests:**
- Manager can only see/reassign within own team
- Manager cannot assign to unavailable members
- Reassignment validates team consistency

---

### A5: Dashboard & Counter Endpoints

- [ ] GET `/me/counters` — role-specific counter data
  - Requester: `{ open, pending_confirmation, closed_this_month }`
  - Team Member: `{ assigned_open, pending_blocked, resolved_this_week }`
  - Support/Triage: `{ awaiting_category, awaiting_assignment, assigned_today }`
  - Manager: `{ team_open, my_requests_open }`
  - Admin/Executive: `{ total_open, by_team: [...], by_status: [...] }`
  - **Rate limit:** 300/min (read limit)
- [ ] GET `/dashboard/system` — admin/executive overview
  - Response: total_open, by_team breakdown, by_status breakdown
  - Scoping: Admin, Executive only
- [ ] GET `/dashboard/system/pending-confirmations` — long-waiting tickets
  - Response: tickets in pending_confirmation sorted by pending_confirmation_at ascending
  - Compute: pending_confirmation_days = NOW() - pending_confirmation_at (query-time, not stored)
  - No automatic action taken (not a timer)
  - Scoping: Admin, Executive

**Tests:**
- Each role gets correct counter shape
- Counters reflect actual data
- Pending confirmations sorted correctly

---

### A6: Availability/Leave Endpoints

- [ ] POST `/availability-requests` — Team Member requests leave
  - Body: `{ type: "range"|"toggle", start_date?, end_date? }`
  - Range: requires both start_date and end_date
  - Toggle: no dates, open-ended
  - Response: `{ id, status: "pending", ... }`
  - Scoping: Team Member can only request for self
  - Creates: availability_requests record with status='pending'
  - Does NOT set users.is_unavailable yet (pending approval)
- [ ] GET `/availability-requests` — list requests
  - Params: `?status=pending` for approval queue
  - Scoping: Manager (own team), Admin
- [ ] POST `/availability-requests/:id/approve` — Manager approves
  - Response: sets availability_requests.status='approved' AND users.is_unavailable=true
  - Only path that can write is_unavailable (other: worker leave-expiry job)
- [ ] POST `/availability-requests/:id/reject` — Manager rejects
  - Response: sets status='rejected', does NOT touch is_unavailable
- [ ] POST `/availability-requests/:id/end` — Manager ends or Team Member cancels
  - Scoping: Manager (own team) OR the requesting user themselves
  - Response: status='ended', users.is_unavailable=false (only if was toggle, not range)
  - Response for range: just status='ended', member auto-returns on end_date (worker job)

**Tests:**
- Leave request → pending → approve → unavailable
- Unavailable members blocked from assignment
- Range-based auto-expires via worker job
- Toggle-based requires manual end

---

### A7: Admin Endpoints (Team/Site/Category management)

#### Teams:
- [ ] GET `/teams` — list all teams
- [ ] POST `/teams` — create team
  - Body: `{ name }`
- [ ] PATCH `/teams/:id` — update team
  - Body: `{ name?, manager_id? }`
- [ ] DELETE `/teams/:id` — delete team
  - Validation: 409 CONFLICT if in-flight tickets exist
  - Must reassign/return all tickets before deletion

#### Sites:
- [ ] GET `/sites` — list sites (anyone can read for dropdowns)
- [ ] POST `/sites` — Admin creates site
  - Body: `{ name, region? }`
- [ ] PATCH `/sites/:id` — Admin updates/deactivates
  - Body: `{ name?, region?, active? }`
  - Deactivating doesn't delete historical tickets, just blocks new selection

#### Categories:
- [ ] GET `/categories` — list categories (anyone can read)
- [ ] POST `/categories` — Admin creates
  - Body: `{ name, team_id }`
- [ ] PATCH `/categories/:id` — Admin updates
  - Body: `{ name?, team_id? }`

#### Users:
- [ ] GET `/users` — Admin only, list all users
- [ ] PATCH `/users/:id/roles` — Admin updates roles
  - Body: `{ is_admin?, is_support_triage?, is_executive? }`
  - Note: team_id and manager status derived from relationships, not direct flags

#### Ticket Site Correction:
- [ ] PATCH `/tickets/:id/site` — Support/Triage only (NOT Admin)
  - Body: `{ site_id }`
  - Audit: logged as "site_corrected"
  - **Note:** Admin CANNOT edit site (explicit design per REQUIREMENTS.md FR-11.3)

**Tests:**
- Admin can create/edit/delete teams
- Cannot delete team with in-flight tickets
- Site deactivation doesn't hide old tickets
- Only Support/Triage can correct site
- Admin cannot correct site

---

## SECTION B: Database Queries & Implementations

Every endpoint above maps to database queries. These must:

- [ ] Use TypeORM repository pattern (not raw SQL)
- [ ] Implement shared authz module for scoping (one function, not per-endpoint)
  - `scopeTicketsForUser(user: User, query: SelectQueryBuilder): SelectQueryBuilder`
  - Returns filtered query based on user's role and team/site membership
- [ ] Use State machine for all status transitions
  - `TicketStateMachine.validateTransition(current, new)` before UPDATE
- [ ] Populate audit log (ticket_history) via trigger + code
  - Every status change, assignment, site correction logged
  - Include actor_id, action, field_changed, old_value, new_value
- [ ] Handle transactions for multi-step operations
  - Category confirm + reassignment required coordination
  - Leave approval + unavailable flag

**Spot checks:**
- [x] Database schema exists (migrations complete)
- [ ] TypeORM entities created for all tables
- [ ] Repositories created for each entity
- [ ] Services wired to database
- [ ] Auth guard checks roles/scopes on every endpoint
- [ ] State machine called on every status change
- [ ] Audit trail populated (test via SELECT ticket_history)

---

## SECTION C: Frontend Completion (Detail & Integration Pages)

### C1: Detail & Edit Pages
- [ ] `/dashboard/tickets/:id` — Full ticket view
  - Display: all fields, status, audit trail (ticket_history)
  - Show: comments, attachments, requester info, assigned member
  - Actions: update status (if Team Member), add comment, download attachments
  - Conditionally show: "Confirm/Dispute Resolution" button (if Requester + pending_confirmation)
  - Conditionally show: "Update Status" dropdown (if Team Member + assigned)
- [ ] `/dashboard/triage/:id` — Triage workflow page
  - Show: ticket details, current category (if any), current assignee
  - Actions:
    - Dropdown to select category (call `/tickets/:id/category/confirm`)
    - If reassignment_required in response: show warning + assignee selector
    - Assignee dropdown (filtered by confirmed category's team, exclude unavailable)
    - Submit assigns ticket
    - Priority dropdown (optional, can confirm here too)
  - Workflow: category → assignee → save

### C2: Modal/Inline Forms
- [ ] Status update modal (Team Member on assigned ticket)
  - Dropdown: In Progress / Pending / Resolved
  - If Pending: textarea for reason (required)
  - Submit: PATCH `/tickets/:id/status`
- [ ] Resolution confirmation modal (Requester on pending_confirmation ticket)
  - Confirm button: POST to `/tickets/:id/confirm-resolution` with action="confirm"
  - Dispute button: POST with action="dispute" + comment field (optional)
  - Shows how long ticket has been waiting

### C3: Admin Pages (Management)
- [ ] `/dashboard/admin/teams` — CRUD teams
  - List teams, create new, edit name, assign manager, delete (with validation)
- [ ] `/dashboard/admin/sites` — CRUD sites
  - List active/inactive, create new, deactivate (not delete)
- [ ] `/dashboard/admin/categories` — CRUD categories
  - List, create with team selector, edit, delete (with validation)
- [ ] `/dashboard/admin/users` — Manage users
  - List all users, grant/revoke Admin/Support/Triage/Executive roles
  - Show team membership

### C4: Integration Tests (Playwright)
- [ ] Full requester flow:
  1. Login
  2. Create ticket (fill form)
  3. Verify ticket appears in "My Tickets"
  4. View ticket detail
  5. Add comment
  6. Logout
- [ ] Full triage flow:
  1. Support/Triage login
  2. Go to Triage Queue
  3. Click ticket
  4. Confirm category
  5. Select assignee
  6. Verify team filter works
  7. Verify unavailable members excluded
- [ ] Full Team Member flow:
  1. Team Member login
  2. See "Assigned to Me"
  3. Click ticket
  4. Update status → In Progress
  5. Update status → Pending (with reason)
  6. Update status → Resolved
  7. Verify status changes reflected
- [ ] Full Requester confirmation:
  1. Wait for resolution notification
  2. View ticket in "Pending Confirmation"
  3. Confirm resolution
  4. Verify status = closed
- [ ] Full Requester dispute:
  1. View pending confirmation
  2. Dispute with comment
  3. Verify reopens to same Team Member (not back to Support/Triage)
  4. Team Member sees it reassigned

**Playwright Test Scenarios:**
- Auth: login/logout, session persistence, redirect to login
- RBAC: verify each role sees only their data
- State machine: invalid transitions return 409
- Audit: every action logged in ticket_history
- Rate limiting: 429 after threshold

---

## SECTION D: Worker Jobs (Complete Implementation)

- [x] Leave-expiry job scaffold created
- [ ] Wire to database: query for end_date < CURRENT_DATE, set is_unavailable=false
  - Use advisory lock: `SELECT pg_advisory_lock(1)` before running
- [ ] Attachment validation job:
  - [ ] Fetch file from MinIO presigned URL
  - [ ] Inspect actual bytes (not extension/client MIME type)
  - [ ] Content-type verification (magic bytes for common types)
  - [ ] File size check (configurable limit, e.g., 10MB)
  - [ ] Set status = 'safe' or 'rejected'
- [ ] Notification job:
  - [ ] Fetch pending notifications from database
  - [ ] For each: compose email, send via SMTP
  - [ ] Update status = 'sent' or 'failed'
  - [ ] Retry logic: max 3 attempts with backoff

**Tests:**
- Leave-expiry runs daily, correctly expires old leaves
- Attachment validation catches invalid files
- Notifications actually send (mock SMTP for local testing)

---

## SECTION E: End-to-End Smoke Tests (Playwright)

### Happy Path: Create → Triage → Assign → Work → Resolve → Confirm

```
1. Requester: POST /tickets (create)
   ✓ Ticket appears in "My Tickets"
   ✓ Status = 'new'
   ✓ Audit log: action='created'

2. Support/Triage: GET /triage/queue
   ✓ Ticket appears in queue (status=new, no category)
   ✓ POST /tickets/:id/category/confirm
   ✓ Status = 'assigned' (no wait, stays 'new' until assign)
   ✗ VERIFY: spec says 'assigned' only after assign, not after category confirm
   ✓ Audit log: action='category_confirmed'

3. Support/Triage: POST /tickets/:id/assign
   ✓ Team Member appears in assignee list (filtered by category's team)
   ✓ Unavailable members not in list
   ✓ Status = 'assigned'
   ✓ Audit log: action='assigned', actor=support_triage_user

4. Team Member: GET /dashboard/assigned
   ✓ Ticket appears in "Assigned to Me"
   ✓ PATCH /tickets/:id/status → 'in_progress'
   ✓ Audit log: action='status_changed'

5. Team Member: PATCH /tickets/:id/status → 'resolved'
   ✓ Status = 'pending_confirmation' (NOT 'resolved' or 'closed')
   ✓ pending_confirmation_at set to now()
   ✓ Notification queued: "please confirm resolution"
   ✓ Audit log: action='status_changed'

6. Requester: GET /tickets/:id
   ✓ Status = 'pending_confirmation'
   ✓ pending_confirmation_days calculated (e.g., 0 if just happened)
   ✓ See "Confirm or Dispute" buttons

7. Requester: POST /tickets/:id/confirm-resolution { action: 'confirm' }
   ✓ Status = 'closed'
   ✓ closed_at set
   ✓ Audit log: action='confirmed'
   ✓ Ticket disappears from "My Tickets" open list

8. Verify audit trail:
   ✓ GET /tickets/:id returns full ticket_history
   ✓ Every step logged: created, category_confirmed, assigned, status_changed (×3), confirmed
   ✓ actor_id matches who performed each action
```

### Dispute Path: Resolve → Dispute → Reopen to Same Member

```
1. [Same as Happy Path through step 5]

2. Requester: POST /tickets/:id/confirm-resolution { action: 'dispute', comment: 'Still broken' }
   ✓ Status = 'reopened'
   ✓ Assigned to: SAME Team Member (not back to Support/Triage)
   ✓ Team Member sees it re-appear in "Assigned to Me"
   ✓ Audit log: action='disputed'
```

### Unavailable Member Flow

```
1. Team Member submits leave request
   ✓ POST /availability-requests { type: 'toggle' }
   ✓ Status = 'pending'
   ✓ User NOT unavailable yet (is_unavailable=false)

2. Manager approves
   ✓ POST /availability-requests/:id/approve
   ✓ Status = 'approved'
   ✓ User NOW unavailable (is_unavailable=true)

3. Support/Triage tries to assign:
   ✓ GET /triage/queue, click ticket
   ✓ Assignee dropdown excludes this member (marked unavailable)
   ✓ POST /tickets/:id/assign with unavailable member
   ✓ Returns 409 CONFLICT: "Member is unavailable"

4. Manager ends leave:
   ✓ POST /availability-requests/:id/end
   ✓ Status = 'ended'
   ✓ User back to available (is_unavailable=false)
   ✓ Next assign attempt: member appears in list again
```

---

## SECTION F: Verification Checklist

### Database:
- [ ] Schema matches DB_SCHEMA.md exactly
- [ ] All triggers fire correctly (updated_at, audit log, category/assignee validation)
- [ ] Migrations run without error
- [ ] Advisory lock works for leave-expiry job
- [ ] ticket_history is append-only (no UPDATE/DELETE from app role)

### API:
- [ ] All 40+ endpoints implemented
- [ ] Every endpoint scoped by role (RBAC guard on every route)
- [ ] State machine called for every status transition
- [ ] Audit log populated for every action
- [ ] Rate limits enforced (Redis-backed)
- [ ] CORS headers correct for Next.js frontend
- [ ] Session cookies: HttpOnly, Secure, SameSite=Strict

### Frontend:
- [ ] All 11 pages render without error
- [ ] Navigation sidebar reflects current user's role
- [ ] All links are functional
- [ ] Forms submit to correct endpoints
- [ ] Error messages display on API failures
- [ ] Loading states show
- [ ] Empty states display correctly

### E2E (Playwright):
- [ ] Happy path: Create → Triage → Assign → Work → Resolve → Confirm
- [ ] Dispute path: Reopen returns to same Team Member
- [ ] RBAC: Each role sees only their data
- [ ] State machine: Invalid transitions blocked
- [ ] Audit: Every action logged
- [ ] Leave/Availability: Unavailable members excluded from assignment
- [ ] Rate limiting: 429 on threshold
- [ ] Session: Login/logout/redirect working

### Performance & Security:
- [ ] No N+1 queries (eager load related data)
- [ ] No SQL injection (use parameterized queries)
- [ ] No XSS (React auto-escapes, form validation)
- [ ] No CSRF (CSRF token on cookie-auth forms)
- [ ] Secrets not logged (no DB passwords in console)
- [ ] Page load time <2s (local dev)

---

## SECTION G: Deliverables (By Commit)

Each section will produce a commit:

1. ✅ **Database migrations** (committed)
2. ✅ **API scaffold + auth** (committed)
3. ✅ **Worker jobs** (committed)
4. ✅ **Frontend pages** (committed)
5. **API Endpoints Phase 1:** Ticket CRUD (create, read, update, list)
6. **API Endpoints Phase 2:** Triage (confirm category, assign, priority)
7. **API Endpoints Phase 3:** Manager (reassign, team stats, workload)
8. **API Endpoints Phase 4:** Dashboard + counters + availability
9. **API Endpoints Phase 5:** Admin management (teams, sites, categories, users)
10. **Frontend Detail Pages:** Ticket view, triage workflow, admin screens
11. **Database Wiring:** Entity/repository implementations
12. **Integration:** Playwright E2E test suite
13. **Final:** Push to GitHub, smoke test confirmation

---

## SECTION H: Quality Gates (No Skips)

Before each commit:
- [ ] TypeScript compiles without error
- [ ] No console.error or console.warn in output
- [ ] Prettier/ESLint passes
- [ ] All new code has JSDoc comments on functions
- [ ] Tests pass (Playwright for E2E, unit tests for business logic)
- [ ] No hardcoded IDs or test data in production code
- [ ] No TODO comments (either fix or create issue)

---

## SECTION I: Timeline & Capacity

**Remaining work:** ~15-20 hours of implementation

**Parallel tracks (can happen simultaneously):**
- API endpoints can be built independently
- Frontend detail pages can be built in parallel
- Worker jobs don't block API/frontend

**Recommended sequence:**
1. Build all API endpoints (most critical path)
2. Wire frontend to API (integration)
3. Build detail/admin pages (polish)
4. Run Playwright suite (verification)
5. Deploy + smoke test

---

## Sign-Off

**This document is the complete specification.** Every checkbox must be completed. Every endpoint must work. Every page must render. Every test must pass.

If something is found to be missing during implementation, it will be added here and implemented immediately.

**No corners cut. No elements left behind.**
