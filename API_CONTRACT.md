# API Contract — Support Ticketing System

Companion to REQUIREMENTS.md, ARCHITECTURE_AND_PLAN.md, DB_SCHEMA.md. This is the contract between the Next.js frontend and the standalone Node API service.

---

## 1. Conventions

**Base URL:** `https://api.<host>/v1` (versioned from day one — cheap now, expensive to retrofit)

**Auth:** HttpOnly, Secure, SameSite=Strict session cookie — not a bearer token in `localStorage`/`sessionStorage`. Decision, not default: a token in browser storage is readable by any injected script (XSS risk); a cookie set `HttpOnly` never touches JS at all. Since the frontend is SSR (Next.js), the cookie is available to server-side requests without ever handing the token to client-side code. Every request to the API must carry this cookie; the API validates the session server-side on every call — no client is ever trusted to self-report its role.

**CSRF:** Since auth is cookie-based, every mutating request (POST/PATCH/DELETE) requires a CSRF token, issued on session start and validated per request. This is the direct consequence of choosing cookies over bearer tokens — cookies are the CSRF-vulnerable pattern, so this isn't optional.

**Response envelope:**
```json
// Success
{ "data": { ... } }
{ "data": [ ... ], "meta": { "page": 1, "limit": 25, "total": 142 } }

// Error
{ "error": { "code": "FORBIDDEN", "message": "You cannot assign tickets outside your team.", "details": null } }
```

**Standard error codes:** `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422, with `details` as a field→message map), `CONFLICT` (409, e.g. state-machine violation), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500). The API never leaks stack traces or raw DB errors in the response body — `INTERNAL_ERROR` is logged server-side with full detail, and the client sees only the generic message.

**Pagination:** `?page=1&limit=25` (default 25, max 100) on every list endpoint. Response includes `meta.total` so the frontend can build pager UI without a second request.

**Every list/detail endpoint applies role-scoping server-side** (per ARCHITECTURE_REVIEW.md §2.1's shared authorization module) — the query parameters below are for *filtering within what a role can already see*, never a way to request data outside that scope. A Team Member passing `?team_id=<another-team>` gets the same results as not passing it at all — scoping is enforced, not merely defaulted.

---

## 2. Auth

| Method | Path | Auth required | Notes |
|---|---|---|---|
| POST | `/auth/login` | No | `{ email, password }` → sets session cookie. Rate-limited (ARCHITECTURE_REVIEW.md §2.3). |
| GET | `/auth/sso/:provider` | No | Redirects to provider (`azure_ad`\|`google`\|`okta`) |
| GET | `/auth/sso/:provider/callback` | No | Provider redirects back here; sets session cookie on success |
| POST | `/auth/logout` | Yes | Clears session |
| GET | `/auth/me` | Yes | Returns current user + derived role flags (`is_admin`, `is_executive`, `is_support_triage`, `team_id`, `is_team_manager_of` if applicable) |

```json
// GET /auth/me → 200
{ "data": {
  "id": "...", "name": "K. Osei", "email": "k.osei@co.com",
  "team_id": "team-uuid", "is_admin": false, "is_executive": false,
  "is_support_triage": false, "is_unavailable": false,
  "manages_team_id": null
}}
```

---

## 3. Tickets — Requester & general access (§4.1)

| Method | Path | Role(s) | FR |
|---|---|---|---|
| POST | `/tickets` | Any authenticated user | FR-1.1 |
| GET | `/tickets` | Any (scoped) | FR-1.3, FR-4.1, FR-3.4, FR-6.1 |
| GET | `/tickets/:id` | Any (scoped) | — |
| POST | `/tickets/:id/comments` | Any with access to the ticket | FR-1.4, FR-4.4 |
| GET | `/tickets/:id/comments` | Any with access | Internal comments filtered out for Requesters (FR-4.4) |
| POST | `/tickets/:id/attachments` | Requester, assigned member, Manager | FR-8.4 |
| GET | `/tickets/:id/attachments/:attachmentId/download-url` | Any with access to the ticket | Returns a presigned GET URL — only for `status = 'safe'` attachments |

```json
// POST /tickets/:id/attachments
// Step 1 of 3 — request a presigned upload URL, no file bytes sent to the API
{ "filename": "screenshot.png", "content_type": "image/png", "size_bytes": 240000 }
// 201 →
{ "data": { "attachment_id": "...", "status": "pending", "upload_url": "https://minio.../presigned-put..." } }

// Step 2 — client PUTs the file directly to upload_url (not shown, not an API call)

// POST /tickets/:id/attachments/:attachmentId/confirm
// Step 3 — client confirms after the direct upload finishes
// 200 → enqueues the worker's validation job; attachment stays 'pending' until it runs
{ "data": { "attachment_id": "...", "status": "pending" } }

// GET /tickets/:id/attachments/:attachmentId/download-url
// 200, only if status = 'safe' → { "data": { "download_url": "https://minio.../presigned-get..." } }
// 404 if status is still 'pending' or 'rejected' — never-servable attachments simply don't resolve
```

See DB_SCHEMA.md §"File upload & serving architecture" for why this is presigned-both-directions rather than proxied — resolves the security (real byte-level validation before anything is servable) vs. efficiency (repeated downloads by other users never touch the API server) tradeoff directly instead of picking one.

```json
// POST /tickets
// body:
{ "subject": "POS terminal offline", "description": "...",
  "site_id": "site-uuid", "suggested_category_id": "cat-uuid",
  "suggested_priority": "high" }   // optional; one of low|medium|high|urgent (FR-1.1)
// 201 →
{ "data": { "id": "...", "ticket_number": "TCK-2026-00842", "status": "new", ... } }
```

**`GET /tickets` scoping by role** (this is the whole point of the shared authz module — one endpoint, different results per caller, never a separate route per role):

| Caller | Sees |
|---|---|
| Requester | Tickets where `requester_id = self` |
| Team Member | Tickets where `requester_id = self` OR `assigned_to = self` |
| Support/Triage | All tickets, with `?status=new` filterable for the queue view |
| Manager | Tickets where `requester_id = self` OR ticket's team = manager's team |
| Admin / Executive | All tickets, unfiltered |

Query params: `?status=`, `?mine=true`, `?assigned_to_me=true`, `?team_id=` (Manager/Admin only, and only within what they can already see).

---

## 4. Triage & Assignment (§4.2)

| Method | Path | Role(s) | FR |
|---|---|---|---|
| GET | `/triage/queue` | Support/Triage | FR-2.3 — tickets with `status = new` or category unconfirmed |
| POST | `/tickets/:id/category/confirm` | Support/Triage | FR-2.1 — `{ category_id }` |
| POST | `/tickets/:id/priority/confirm` | Support/Triage, or Manager (own team) | FR-2.8 — `{ priority }`, one of `low\|medium\|high\|urgent`. Label-only: no reassignment, no team-filter side effect, unlike category confirm (FR-2.9). |
| POST | `/tickets/:id/assign` | Support/Triage (any team) or Manager (own team only) | FR-2.2, FR-3.1 |
| GET | `/teams/:id/workload` | Support/Triage, Manager (own team), Admin | FR-2.5, FR-3.5 |

```json
// POST /tickets/:id/category/confirm
{ "category_id": "cat-uuid" }
// 200 → { "data": { ...ticket, "confirmed_category_id": "cat-uuid", "assigned_to": null } }
// If the ticket was already assigned to someone outside the new category's team,
// this call succeeds at the category level but the response includes:
{ "data": { ...ticket }, "meta": { "reassignment_required": true } }
// The frontend must block save/navigation until POST /tickets/:id/assign follows (FR-2.4).

// POST /tickets/:id/assign
{ "assignee_id": "user-uuid" }
// 200 on success. 409 CONFLICT if assignee's team doesn't match confirmed_category_id's team
// (this mirrors the DB trigger in DB_SCHEMA.md — the API check exists for a clean error message,
// the DB trigger is the actual guarantee).
// 409 CONFLICT if assignee.is_unavailable = true (FR-10.5).
```

---

## 5. Manager — Reassignment & Team View (§4.3)

| Method | Path | Role(s) | FR |
|---|---|---|---|
| POST | `/tickets/:id/reassign` | Manager (own team only) | FR-3.2 |
| POST | `/tickets/:id/return-to-triage` | Manager | FR-3.3 |
| GET | `/teams/:id/tickets` | Manager (own team), Admin, Executive | FR-3.4 |
| GET | `/teams/:id/stats` | Manager (own team), Admin, Executive | FR-3.5 |

```json
// GET /teams/:id/stats → 200
{ "data": {
  "open_tickets": 19, "avg_resolution_hours": 6.4,
  "aging_over_3_days": 2, "team_size": 6,
  "per_member": [ { "user_id": "...", "name": "J. Amara", "open_tickets": 7 }, ... ]
}}
```

---

## 6. Team Member — Status Updates (§4.4)

| Method | Path | Role(s) | FR |
|---|---|---|---|
| PATCH | `/tickets/:id/status` | Assigned Team Member only | FR-4.3, FR-4.6, FR-4.7 |

```json
// PATCH /tickets/:id/status
{ "status": "in_progress" }
{ "status": "pending", "pending_reason": "Awaiting vendor callback" }  // reason required, 422 if missing
{ "status": "resolved" }  // → actually sets status to 'pending_confirmation', not 'closed' (FR-9.1)
// 409 CONFLICT if the requested transition isn't valid from the current state
// (the state machine module — REQUIREMENTS.md §3 — is the single source of truth for what's legal here)
```

---

## 7. Resolution Confirmation — Requester (§4.9)

| Method | Path | Role(s) | FR |
|---|---|---|---|
| POST | `/tickets/:id/confirm-resolution` | Requester of that ticket only | FR-9.3, FR-9.4 |

```json
// POST /tickets/:id/confirm-resolution
{ "action": "confirm" }   // → status: closed
{ "action": "dispute", "comment": "Still happening intermittently" }
// → status: reopened, then immediately reassigned to the same Team Member (FR-9.4, confirmed)
// 409 CONFLICT if ticket isn't currently in 'pending_confirmation' status
```

```json
// GET /tickets/:id → 200, when status = 'pending_confirmation'
// pending_confirmation_days is computed at response time (now() minus pending_confirmation_at,
// FR-9.6) — not stored, not timer-driven, purely a display value.
{ "data": { "id": "...", "status": "pending_confirmation",
  "pending_confirmation_at": "2026-08-15T10:00:00Z",
  "pending_confirmation_days": 12,
  ... } }
```

---

## 8. Availability / On-Leave (§4.10)

| Method | Path | Role(s) | FR |
|---|---|---|---|
| POST | `/availability-requests` | Team Member (self only) | FR-10.1 |
| GET | `/availability-requests` | Manager (own team), Admin | FR-10.3 — `?status=pending` for the approval queue |
| POST | `/availability-requests/:id/approve` | Manager (own team only) | FR-10.3 |
| POST | `/availability-requests/:id/reject` | Manager (own team only) | FR-10.3 |
| POST | `/availability-requests/:id/end` | Manager (own team) or the requesting user themselves | FR-10.8 |

```json
// POST /availability-requests
{ "type": "range", "start_date": "2026-09-10", "end_date": "2026-09-14" }
{ "type": "toggle" }  // no dates — open-ended, manual end required
// 201 → { "data": { ...request, "status": "pending" } }

// POST /availability-requests/:id/approve
// 200 → sets availability_requests.status = 'approved' AND users.is_unavailable = true
// This is one of exactly two code paths allowed to write users.is_unavailable (the other is the
// worker's leave-expiry job) — enforced by code review convention, not a DB constraint (DB_SCHEMA.md).
```

---

## 9. Admin — Team, Site, Category, User Management (§4.5, §4.11)

| Method | Path | Role(s) | FR |
|---|---|---|---|
| GET / POST | `/teams` | Admin (write); anyone (read, for dropdowns) | FR-5.1 |
| PATCH | `/teams/:id` | Admin | FR-5.2, FR-5.3 (rename, change manager, add/remove members) |
| DELETE | `/teams/:id` | Admin | FR-5.5 — 409 CONFLICT if in-flight tickets exist and haven't been reassigned |
| GET / POST | `/sites` | Admin (write); anyone (read) | FR-11.1 |
| PATCH | `/sites/:id` | Admin | FR-11.1, FR-11.2 (deactivate) |
| GET / POST | `/categories` | Admin (write); anyone (read) | — |
| GET | `/users` | Admin | — |
| PATCH | `/users/:id/roles` | Admin | FR-5.4 — grant/revoke `is_support_triage`, `is_admin`, `is_executive` |
| PATCH | `/tickets/:id/site` | Support/Triage only | FR-11.3 |

---

## 10. Dashboards & Counters

| Method | Path | Role(s) | FR |
|---|---|---|---|
| GET | `/dashboard/system` | Admin, Executive (both see the same data; Executive gets no write endpoints at all — enforced by role, not by a different response shape) | FR-6.4 |
| GET | `/dashboard/system/pending-confirmations` | Admin, Executive | FR-9.6 — tickets in `pending_confirmation`, sorted by `pending_confirmation_at` ascending (longest-waiting first). Purely a query — `pending_confirmation_days` is computed at request time (`now() - pending_confirmation_at`), not stored, and viewing this list never triggers any action. |
| GET | `/me/counters` | Any authenticated user | FR-7.1–7.5 — returns only the counters relevant to the caller's role |

```json
// GET /me/counters → 200, shape varies by caller role
// Requester:      { "data": { "open": 3, "pending_confirmation": 1, "closed_this_month": 9 } }
// Team Member:    { "data": { "assigned_open": 5, "pending_blocked": 1, "resolved_this_week": 8 } }
// Support/Triage: { "data": { "awaiting_category": 4, "awaiting_assignment": 3, "assigned_today": 14 } }
// Manager:        { "data": { "team_open": 19, "my_requests_open": 1 } }
// Admin/Exec:     { "data": { "total_open": 87, "by_team": [...], "by_status": [...] } }
```

---

## 11. What's deliberately NOT in this contract yet

- **Notification endpoints** — notifications are worker-driven (email), not something the frontend calls directly; no `/notifications` write endpoints needed. A future `GET /notifications` for an in-app bell icon isn't specified because in-app notifications aren't in REQUIREMENTS.md.
- **SLA response/resolution timers** — priority is a label only for v1 (REQUIREMENTS.md §5); no timer/escalation endpoints exist because that subsystem is explicitly deferred, not forgotten.

## 12. Rate Limiting

Backed by Redis (already in the architecture for the job queue) — a sliding-window limiter, no new infrastructure needed. Every breach returns `429 RATE_LIMITED` with a `Retry-After` header. These are starting defaults, not tuned against real traffic yet:

| Endpoint(s) | Limit | Window | Keyed by | Why |
|---|---|---|---|---|
| `POST /auth/login` | 5 failed attempts | 15 min | IP + email | Standard brute-force throttle — the specific pair, so one bad actor can't lock out a legitimate user by spamming failed logins against their account. |
| `POST /auth/login` | 20 attempts | 1 hour | IP alone | Catches credential-stuffing across many accounts from one source, which the per-account limit above wouldn't. |
| `POST /auth/sso/:provider/callback` | 10 | 1 min | IP | Replay/flood guard on the callback endpoint. |
| `POST /tickets` | 20 | 1 hour | user | Generous for legitimate use (one every 3 minutes sustained) while blocking flooding or a runaway script/bug. |
| `POST /tickets/:id/comments` | 30 | 1 hour | user | |
| `POST /tickets/:id/attachments` | 20 | 1 hour | user | Separate from comments — uploads are heavier and hit object storage directly. |
| All other mutating endpoints (assign, status change, confirm-resolution, availability requests, etc.) | 120 | 1 min | user | A generic write-throttle. This is not primarily an abuse guard — it's a circuit breaker against a buggy frontend retry loop or a stuck script hammering the API. |
| All read/list endpoints | 300 | 1 min | user | Same purpose as above, for reads. |

**Account lockout (resolved, distinct from the IP-based rate limit above):** after **4 failed login attempts on the same account**, that account is locked for **20 minutes** regardless of source IP — this is an account-level control, separate from and in addition to the IP+email rate limit table above (which mainly protects against distributed/credential-stuffing attempts). A locked account returns `403 FORBIDDEN` with `code: ACCOUNT_LOCKED` and a `details.retry_after` timestamp, even with the correct password, until the lockout window passes.
