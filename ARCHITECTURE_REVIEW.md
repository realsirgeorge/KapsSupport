# Architecture Review — Completeness, Security (CIA), Functionality

Reviewing: ARCHITECTURE_AND_PLAN.md against REQUIREMENTS.md, post stack-decision (Node, separate API + Next.js SSR frontend).

---

## 1. Completeness Gaps

Things the current architecture doesn't yet account for, found by walking every FR section against the component list.

### 1.1 Missing entity: Availability requests (FR-10.x)
The data model in the build plan (`users`, `teams`, `tickets`, `categories`, `ticket_history`) has no table for the on-leave/unavailable feature. Needs:
- `availability_requests`: id, user_id, requested_by, type (range/toggle), start_date, end_date (nullable), status (pending/approved/rejected/ended), approved_by, created_at, resolved_at.
- A denormalized `is_unavailable` flag (or computed view) on the user record, since Support/Triage's assignee list (FR-2.2) and Manager's reassignment (FR-3.2) both need a fast "can this person be assigned" check on every ticket action — recomputing from the requests table on every read is wasteful.

### 1.2 Missing background job: leave auto-expiry
The worker section only lists two jobs (auto-close scan, notifications). FR-10.7 requires a date-range unavailability to end automatically when the end date passes. That's a third scheduled job — same pattern as auto-close, easy to add, but currently undocumented and will get forgotten if it's not written down now.

### 1.3 `site` field is in the UI but not in the requirements
The Figma screens show "Site 12 · Westgate" as ticket metadata, but FR-1.1 (ticket creation) only lists subject, description, category, attachments — no site field. Either:
(a) site was dropped from scope when the model moved from the original site-manager concept to the team/category model, and the Figma mockups are stale, or
(b) site is still a real field that got lost from the FR list.
This needs a decision — right now the schema can't be finalized because this is ambiguous. If site stays in scope, it also needs to be a real reference table (not free text) if you ever want to filter/report by site.

### 1.4 No identity/auth decision recorded
REQUIREMENTS.md never specified whether accounts are local (email/password), SSO, or both. This blocks step 5 (API auth scaffolding) — needs a decision before that step starts, not during.

### 1.5 No observability layer
Nothing in the architecture covers application logging, error tracking, or metrics. For a system whose entire value proposition includes an audit trail (FR-9.2) and SLA-adjacent tracking (resolution time, aging), you need to be able to see what the system itself is doing, separate from what users did. Recommend: structured JSON logs from API/worker, shipped somewhere queryable even in dev (even just a local Loki/Grafana or plain file + `jq` is fine at this stage) — but it needs to be a line item, not an afterthought.

### 1.6 No backup/restore plan for Postgres
The Docker Compose plan gives Postgres a volume so data survives container restarts, but a volume isn't a backup — it doesn't protect against `docker volume rm`, disk failure, or a bad migration. Given this system is the append-only source of truth for the audit trail (FR-9.2), at minimum: scheduled `pg_dump` to a location outside the Postgres container, before this goes anywhere near production data.

### 1.7 No CI/testing story
Not required for local dev, but worth deciding now rather than after the first migration breaks something: where do tests live, what runs them, does anything gate a merge. Can be deferred, but should be an explicit "deferred" rather than silently absent.

---

## 2. Security Review (Confidentiality, Integrity, Availability)

### 2.1 Confidentiality — is data only visible to who should see it?

| Area | Assessment |
|---|---|
| **Access control enforcement point** | Correctly placed at the API layer (per REQUIREMENTS.md FR-9.3), not the frontend. This is the right call and the single most important confidentiality decision in the whole design — keep it. |
| **Data-layer scoping** | The plan says "every query filtered by requesting user's permitted sites/teams" — but this needs to be a **single shared authorization module** every route calls, not logic re-implemented per endpoint. The moment two developers (or two future you's) write the scoping filter slightly differently, you get a silent confidentiality leak. Recommend: one `scopeTicketsForUser(user, baseQuery)` function, unit-tested against every role, that every ticket-reading endpoint is required to route through. |
| **Secrets management** | `.env.example` is fine for local dev but is explicitly named as a completeness item in the plan, not a security control. For anything beyond a single dev's laptop, `.env` files get copied into Docker images, committed by accident, or leak into shell history. No blocker for local dev, but this needs to graduate to a real secrets manager before any shared or hosted environment. |
| **Attachment access** | Not yet specified. Object storage attachments need **signed, time-limited URLs**, not public buckets or permanently-valid links — otherwise anyone with a leaked/logged URL can pull a ticket attachment forever, bypassing the entire RBAC layer you built at the API level. |
| **PII in logs** | Not yet specified. Ticket subjects/descriptions may contain PII (a requester describing an account issue, an HR-adjacent request, etc.). Whatever observability layer gets built (§1.5) needs a rule: don't log full ticket bodies at INFO level by default. |
| **Session/token handling** | Not yet decided (tied to §1.4). Whichever you choose, tokens/session cookies need `HttpOnly`, `Secure`, and `SameSite` attributes at minimum — a Next.js SSR frontend doing auth makes this easy to get right if decided up front, easy to get wrong if bolted on later. |

### 2.2 Integrity — can data be trusted, and can actions only happen the "right" way?

| Area | Assessment |
|---|---|
| **Audit log immutability** | Correctly specified (no UPDATE/DELETE grant on the app's DB role for `ticket_history`, per FR-9.2). Good — this is the right mechanism, not just a policy. One gap: nothing stops the Postgres **superuser/migration role** from deleting rows. In practice that's an accepted risk for an internal tool, but worth being explicit that "append-only" is enforced against the app's runtime role, not against someone with DB admin access. |
| **State machine enforcement** | The plan correctly calls out the ticket state machine as "a first-class module rather than scattered logic" — this is the right instinct. The risk to watch for: the state machine must be enforced at the API/service layer with the same rigor for *every* transition, including the ones that look like edge cases (dispute-triggered reopen, the leave auto-expiry job's writes to `users.is_unavailable`) — those are exactly the transitions most likely to get implemented as one-off code that skips the shared validator. |
| **Category/assignment consistency (FR-2.1a, FR-2.4)** | **Resolved.** Confirming a category and filtering the assignee list are transactionally consistent via a DB trigger (`check_assignee_matches_category` in DB_SCHEMA.md) that makes an invalid assignee/category combination physically impossible to save, backed by a matching API-level check for a clean error message (API_CONTRACT.md §4). See SEQUENCE_DIAGRAMS.md §1 for the full flow. |
| **File upload integrity** | Not yet specified, and this is a real gap for a system taking arbitrary attachments from any logged-in user. Needs: content-type verification by actually inspecting file bytes (not trusting the extension or client-supplied MIME type), a file size cap, and generated (not user-supplied) storage filenames to prevent path traversal or silent overwrite of another ticket's attachment. |
| **Input validation on the state-changing endpoints** | Every FR that says "with a reason" (FR-4.6 pending reason, FR-3.3 flag/return reason) implies a required field the API must actually enforce, not just the UI form. Worth a shared validation layer (e.g. schema validation middleware) rather than hand-checked per route. |
| **Idempotency of background jobs** | The leave-expiry scan runs on a timer. If a job run overlaps with the next one (e.g. a slow scan under load), you risk double-processing — double-logging an audit entry, or (once notifications exist) double-sending an email. Needs a lock or "already processed" guard, not just "runs every N minutes." (There is no auto-close job to worry about here — tickets never auto-close, see REQUIREMENTS.md §4.9.) |

### 2.3 Availability — does the system keep working, and degrade gracefully when parts fail?

| Area | Assessment |
|---|---|
| **Single points of failure** | As drawn, everything (API, worker, Postgres, Redis, MinIO) is one container each with no redundancy — correct and appropriate for local dev, but worth stating explicitly so nobody mistakes this Compose setup for something that tolerates a container crash. Not a fix needed now, just a documented limitation. |
| **Worker failure blast radius** | If the worker container is down, leave-expiry (FR-10.7) simply stops happening — members who should have automatically returned to available status stay marked Unavailable indefinitely. This is availability of a *feature*, not the whole system, but it's exactly the kind of silent failure that's hard to notice until someone asks "why can't I assign to them, aren't they back from leave?" Recommend a simple health check / heartbeat the worker writes somewhere checkable. |
| **Rate limiting** | Not yet specified anywhere — not on login (brute-force risk), not on ticket creation (an authenticated user could still hammer the create-ticket endpoint), not on the email-sending path (an attacker with an authenticated session could trigger a flood of outbound notifications). This is both an availability and a confidentiality-adjacent concern (login rate limiting specifically protects against credential stuffing). |
| **Database connection exhaustion** | Not yet specified. With SSR pages plus API routes plus a worker all potentially hitting Postgres, connection pooling needs to be a deliberate choice (e.g. PgBouncer or pool limits in the ORM/driver config), not "whatever the default is" — the default is usually too permissive for a multi-process setup and can quietly exhaust Postgres's max connections under load. |
| **Graceful degradation of notifications** | If SMTP is down or slow, that shouldn't block the ticket action that triggered the notification (e.g. marking a ticket Resolved). Since notifications already route through the worker/queue (correct design), this is mostly already solved — just worth confirming the notification job retries with backoff rather than dropping silently on first failure. |

---

## 3. Functionality Traceability (spot-check against REQUIREMENTS.md)

| Requirement area | Architecture support | Status |
|---|---|---|
| Role-based views + data scoping (§1 Roles) | API-layer RBAC + shared scoping module (§2.1 above) | Sound, pending the shared-module discipline noted above |
| Category confirm → filtered assignment (§2) | **Resolved** — DB trigger + API check, transactionally consistent (see §2.2 above) | Sound |
| Ticket lifecycle incl. resolution confirm (§3) | State machine module + worker for auto-close | Sound, pending "every transition through the validator" discipline |
| Availability/on-leave (§4.10) | **Resolved** — `availability_requests` table, denormalized `is_unavailable` flag, and a dedicated worker job all now in ARCHITECTURE_AND_PLAN.md / DB_SCHEMA.md | Sound |
| Ticket counters (§4.7) | Not specified how computed (live query vs cached) | Fine as live query at this scale; revisit only if it becomes slow |
| Audit trail (§4.8, §4.9, §4.10) | Append-only table, no delete grant | Sound |
| Notifications (§4.5 in earlier FR set) | Worker + SMTP | Sound for email; Slack/Teams explicitly deferred, consistent with REQUIREMENTS.md |

---

## 4. Priority Summary

**Resolved:**
1. ~~Site field ambiguity~~ — **Resolved:** site is a required field, set by the requester at creation, backed by a managed `sites` table (Admin-managed, mirrors teams). See REQUIREMENTS.md FR-1.1, FR-11.1–11.3.
2. ~~Auth model~~ — **Resolved:** both local email/password and SSO, supported side by side. See REQUIREMENTS.md FR-12.1–12.3.
3. ~~Availability table~~ — **Resolved:** `availability_requests` table plus a derived `is_unavailable` flag on `users`, controlled entirely by the approved-request flow (no direct toggle, including by Admin). See REQUIREMENTS.md FR-10.10.

**Before writing any migrations (blocks step 4 of the build plan):**
- All three schema-blocking items above are resolved, plus the site-correction question (REQUIREMENTS.md §6 now reads "none open") — **step 4 is fully unblocked.**

**Before writing the API (blocks step 5):**
4. ~~Design the shared authorization/scoping module~~ — **Resolved:** the per-role scoping table for `GET /tickets` in API_CONTRACT.md §3 is the concrete design; the actual `scopeTicketsForUser()` implementation is code-phase work, not a design gap.
5. ~~Decide the transactional boundary for category-confirm + assignment~~ — **Resolved:** DB trigger + API check, see §2.2 above.

**Before writing the worker (blocks step 6):**
6. ~~Add the leave auto-expiry job~~ — **Resolved:** in the build plan's worker job list (ARCHITECTURE_AND_PLAN.md step 6) and DB_SCHEMA.md's design notes. Runs daily, date-only, per later decision.
7. ~~Idempotency guards for the leave-expiry scan~~ — **Resolved:** Postgres advisory lock. Even lower-risk now that the job runs daily rather than every few minutes, but kept as cheap insurance regardless.

**Can be deferred but should be tracked, not forgotten:**
8. ~~Signed URLs for attachments, file upload validation~~ — **Resolved:** presigned URLs both directions plus an async validation job (pending/safe/rejected). See DB_SCHEMA.md §"File upload & serving architecture" and API_CONTRACT.md §3.
9. ~~Rate limiting on login/create-ticket/notification paths~~ — **Resolved:** concrete thresholds set. See API_CONTRACT.md §12.
10. Backup strategy, observability, secrets management graduation path (§1.5, §1.6, §2.1) — **deliberately still deferred to production readiness**, not an oversight; `.env` remains the secrets approach until then.
