# Prompt for Claude Code — Master Developer Handoff

Copy everything below into Claude Code, opened in this project directory, as your starting prompt.

---

You are the master developer for this project. The design phase is complete — every requirement, architectural decision, security review, database schema, and API contract has already been worked out and documented. Your job is to **implement what's documented**, not to redesign it. If something in the docs is ambiguous, contradictory, or looks wrong, **stop and ask** rather than silently deciding for yourself — this system went through several rounds of catching and fixing exactly that kind of silent drift during the design phase, and it should not start happening again now that code is being written.

## Read these first, in this order

All in the project root:

1. `README.md` — orientation, stack, network layout, current status
2. `REQUIREMENTS.md` — the source of truth for *behavior*. Every FR-x.x reference elsewhere in this project points back here.
3. `ARCHITECTURE_AND_PLAN.md` — component architecture and the 8-step build plan you're picking up
4. `ARCHITECTURE_REVIEW.md` — a full completeness/security(CIA)/functionality review, with everything that was found wrong and how it was fixed. Read this even though it's "just" a review — it explains *why* several non-obvious things in the schema and API contract exist (the DB trigger, the append-only audit table's ownership model, the rate limits).
5. `DB_SCHEMA.md` — the actual Postgres DDL to turn into migrations. Includes a self-critique section showing what was wrong in the first draft and why the fixes matter — read that too, not just the final SQL.
6. `API_CONTRACT.md` — every route, request/response shape, auth model, and rate limit. This is the contract the frontend expects; don't deviate from it without flagging why.
7. `SEQUENCE_DIAGRAMS.md` — the core ticket lifecycle and the auth flow, end to end
8. `DESIGN_PATTERNS.md` — **read this one carefully.** It documents a deliberate architectural decision: the ticket lifecycle is implemented as the State design pattern, not as scattered status-string checks. This was chosen specifically after weighing it against Strategy, Observer, Facade, Adapter, Factory Method, and Singleton — it is the single most important structural decision in this codebase. Do not flatten it into `if (status === 'x')` logic for convenience.
9. `FIGMA_DESIGN_LOG.md` — which UI screens exist as reference, which are explicitly out of scope (not a gap — a decision)

## Visual reference for the frontend

Six screens were designed in Figma and screenshotted into the project root:
- `mytickets.jpeg` — Requester's ticket list
- `new-tickets.jpeg` — Requester's create-ticket form
- `incoming-queue.jpeg` — Support/Triage's queue (category confirm, assignee filtering, workload panel)
- `assigned-to-me.jpeg` — Team Member's assigned tickets with status actions
- `team-dashboard.jpeg` — Manager's team dashboard
- `system-dashboard.jpeg` — Admin/Executive system-wide dashboard

Full Figma file (includes anything not captured in the screenshots): https://www.figma.com/design/Njae8eyvTRBlOBqmzZYY8N

Design system: dark background, green accent, Inter for UI text, JetBrains Mono for ticket IDs/codes. Match this rather than defaulting to a generic component-library look. Two screens (Resolution Confirmation, and the Admin management screens for Teams/Roles/Categories) were never mocked up — that was an explicit decision, not an oversight, so build those from the FR text and API contract directly.

## Current state — what's already done vs. not started

**Done (build plan steps 1-3):**
- Repo structure exists: `/api`, `/web`, `/worker`, `/infra` — all currently empty except `/infra`
- `/infra/docker-compose.yml` — six services (postgres, redis, minio, api, worker, web, nginx), with Postgres/Redis/MinIO on an internal-only network with no route out
- `/infra/.env.example` — every secret placeholder needed
- `.gitignore`, `README.md` at repo root

**Not started (build plan steps 4-8) — this is your work:**
4. Turn `DB_SCHEMA.md` into real migrations
5. Scaffold the NestJS API (auth, RBAC guard, the State-pattern ticket lifecycle module)
6. Scaffold the worker (leave-expiry job, attachment validation job, notifications)
7. Scaffold the Next.js (SSR) frontend shell, matching the Figma screens
8. Run it end-to-end locally and smoke-test the full lifecycle

Work through these in order — each one has prerequisites from the last.

## Stack (already decided, do not re-litigate)

- **API:** Node, NestJS, standalone service — chosen specifically because its guards/interceptors/DI structurally enforce the shared-authorization and State-pattern requirements in a way Express/Fastify wouldn't (see chat history referenced in ARCHITECTURE_AND_PLAN.md if you want the full reasoning)
- **Frontend:** Next.js, SSR, a **separate** service from the API — not collapsed into Next.js API routes
- **Database:** PostgreSQL 18 (needed for native `uuidv7()` — see DB_SCHEMA.md's design notes for why UUIDv7 over UUIDv4)
- **Worker:** Node, Redis-backed job queue
- **Object storage:** MinIO (S3-compatible)
- **Auth:** HttpOnly/Secure/SameSite session cookie, not JWT — plus CSRF tokens, since that's the direct consequence of choosing cookies. Both local email/password and SSO (Azure AD/Google/Okta) are supported side by side.
- **Reverse proxy:** Nginx, the only service exposed on 80/443

## Non-negotiable constraints — these were hard-won decisions, not defaults

- **No auto-close, ever.** A ticket in Pending Confirmation stays open indefinitely until the requester acts. This was explicitly removed after being incorrectly assumed early in the design process — do not reintroduce it.
- **No AI/ML anywhere** — no auto-categorization, no smart suggestions. All routing and categorization is human-decided, by explicit decision.
- **Priority is a label only** — no SLA timers, no clock-pausing, no breach escalation. Don't build the full SLA subsystem that was considered and deliberately deferred.
- **Category → assignee consistency is enforced by a DB trigger** (`check_assignee_matches_category` in DB_SCHEMA.md), not just application code. Keep it. It's the "physically impossible to violate" guarantee, not a redundant check.
- **`ticket_history` (audit log) is append-only** — owned by a separate DB role from the app's runtime role, with UPDATE/DELETE revoked from the runtime role. Don't let the app's migration user and runtime user be the same role, or this guarantee becomes decorative (see ARCHITECTURE_REVIEW.md §2.2 for why).
- **File uploads are presigned URLs in both directions** (upload and download), never proxied through the API, with an async `pending → safe/rejected` validation step in between. See DB_SCHEMA.md's "File upload & serving architecture" section for the full flow.
- **`ticket_number` is the only externally-facing identifier** — the raw UUID `id` should never appear in a URL or be shown to a user, since UUIDv7 embeds a creation timestamp.
- **Site can only be corrected by Support/Triage**, never by Admin, Manager, or Team Member (FR-11.3) — this is a real, deliberate asymmetry with how category corrections work, not an oversight.

## Deliberately deferred — don't block on these, don't silently build them either

- Backup strategy, observability/logging, and secrets-manager graduation (moving off `.env`) are all explicitly deferred to production readiness. Use `.env` as-is; don't add a secrets manager unprompted.
- Testing strategy/CI: GitHub for version control, manual deploys for now. No CI pipeline expected at this stage.
- Notification email/message content hasn't been drafted — use clear placeholder copy and flag it for review rather than inventing final wording.

## How to proceed

Start at build plan step 4. Read every document above before writing any code — several of them explain *why* a particular schema or contract decision was made, and that reasoning matters for getting the implementation right, not just the shape. Where you genuinely need a decision that isn't covered above or in the docs, ask before proceeding rather than picking a default silently — this project's design phase ran into repeated problems with undocumented assumptions quietly becoming load-bearing, and the intent now is to not repeat that pattern in the implementation phase.
