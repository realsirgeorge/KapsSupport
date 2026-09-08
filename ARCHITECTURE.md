# Architecture

This document describes the system as it actually exists, not as originally planned. It reflects the state after a substantial fix/rebuild pass — see the git log on `feature/phases-2-5-and-e2e-fixes` for the history of what was broken and how it was fixed. Update this file when the architecture changes; treat drift between this file and the code as a bug.

## Stack

| Layer | Technology |
|---|---|
| API | NestJS 10, TypeScript, raw SQL via TypeORM's `DataSource.query()` (not the ORM's entity/repository layer — see [Data access pattern](#data-access-pattern)) |
| Database | PostgreSQL 18 |
| Cache / job queue transport | Redis 7 |
| Job queue | Bull (worker package) |
| Frontend | Next.js 14 (App Router), React, TypeScript |
| UI components | shadcn/ui on Radix UI primitives, Tailwind CSS |
| Auth | JWT in an HttpOnly cookie (not Authorization header, not sessions) |
| Object storage | MinIO (S3-compatible) — see [Attachments](#attachments) |

## Repository layout

```
api/       NestJS backend
worker/    Bull job worker (leave-expiry, attachment-validation, notifications)
web/       Next.js frontend
infra/     docker-compose.yml, nginx.conf, .env (gitignored)
```

Each of `api/`, `worker/`, `web/` is an independent npm package with its own `package.json`, `node_modules`, and `.env`/`.env.local`.

## Deployment topology

**This is not a single-host deployment.** The dev machine this code is built on has limited memory, so the database and cache run elsewhere:

- **Database (Postgres) and Redis**: run in Docker containers on a separate machine, `knight-labs`, reached over Tailscale. Both containers publish their port bound *only* to the Tailscale interface IP (not `0.0.0.0`) — verified via `ss -ltnp` showing the listener on the Tailscale IP specifically, and via explicit negative checks that `127.0.0.1` and the public interface both refuse connections. This means the database is reachable only from devices on the same Tailscale network, never from the public internet.
- **API and web app**: run directly with `node`/`next dev` on the local dev machine (or wherever they're deployed), pointed at the remote Postgres/Redis over Tailscale via `DATABASE_HOST`/`REDIS_HOST` in `api/.env`.
- **Adminer** (browser-based Postgres admin UI): also runs on knight-labs, same Tailscale-only binding pattern, for manual DB inspection without installing a client.
- **nginx** (`infra/nginx.conf`): the *intended* production reverse-proxy config, routing `/v1/*` to the API and everything else to the web app. It is not currently running anywhere in this deployment — `api/.env` and `web/.env.local` point directly at each service's port instead (`API_PORT=3001`, web on `3000`), bypassing nginx entirely for local development. `infra/docker-compose.yml` still defines the full stack (postgres, redis, minio, api, worker, web, nginx) for a self-contained deployment elsewhere, but that compose file is not what's actually running right now.

One unrelated, pre-existing container also runs on knight-labs (`n8n`) — not part of this project, mentioned here only because `docker ps` on that host will show it.

## Data access pattern

**The codebase does not use TypeORM's entity/repository layer for application queries.** Every service (`TicketService`, `TriageService`, `ManagerService`, `AdminService`, `AvailabilityService`, `AuthService`, `DashboardService`) injects a bare `DataSource` and writes raw parameterized SQL via `dataSource.query(sql, params)`.

This was a deliberate correction, not an oversight: several services originally called `dataSource.getRepository('table_name')` with a string table name, which throws at NestJS dependency-injection time because no `@Entity`-decorated class was ever registered for that name — this crashed the app on boot. Rather than build out a full entity layer, every service was converted to the raw-SQL pattern that most of them already used, for consistency. Two real TypeORM entity classes still exist (`api/src/entities/user.entity.ts`, `team.entity.ts`) but are legacy from the original scaffold and are not used by any service; `api/src/entities/index.ts` no longer exports the other five entity types that were once planned.

**Actor attribution in raw UPDATEs**: `tickets` has an `audit_ticket_changes` trigger that writes to `ticket_history`, reading who performed the action from the Postgres session variable `app.current_user_id` via `current_setting()`. Because `dataSource.query()` calls can each land on a different pooled connection, setting that variable and running the UPDATE must happen in the same transaction. `api/src/database/with-actor.ts` provides `withActor(dataSource, actorId, fn)`, which wraps `fn` in a transaction with `SET LOCAL app.current_user_id = ...` set first. Every ticket-mutating query in `ticket.service.ts`, `triage.service.ts`, `manager.service.ts`, and `admin.service.ts` uses this wrapper. Ticket *creation* passes `actor_id`/`requester_id` as a normal INSERT column and doesn't need it.

## Auth model

Session-cookie-based JWT, not Authorization-header JWT, not server-side sessions:

1. `POST /v1/auth/login` verifies email/password against `users.password_hash` (bcrypt) and issues a JWT signed with `JWT_SECRET`, set as an `HttpOnly`, `SameSite=Strict` cookie named `session_id`.
2. `JwtStrategy` (`api/src/modules/auth/strategies/jwt.strategy.ts`) extracts the token from that cookie first, falling back to an `Authorization: Bearer` header if present (kept for API-testing convenience, e.g. curl).
3. The JWT payload carries the full authorization-relevant snapshot of the user: `sub` (user id), `email`, `name`, `team_id`, `is_admin`, `is_support_triage`, `is_executive`, `is_unavailable`, and `manages_team_id`.
4. `manages_team_id` is **not a column on `users`** — nothing stores it directly. It's derived at login time (and by `DashboardService`/`ManagerService` independently, for their own authorization checks) via `SELECT id FROM teams WHERE manager_id = $1`. It only exists in the JWT so the *frontend* can decide what to render (e.g. whether to show the Team Dashboard nav link) without an extra round-trip; backend authorization checks always re-derive it from the `teams` table rather than trusting the JWT claim, since JWT claims are only as fresh as the last login.
5. `main.ts` registers `cookie-parser` middleware — without it, `req.cookies` is `undefined` and the cookie-based extractor silently fails closed.

Every protected route uses `@UseGuards(JwtAuthGuard)`. There is no separate `RolesGuard` — each service method checks the relevant boolean/team-membership fields on `req.user` inline.

## Roles

There is no `role` enum column. A user's effective role is a combination of independent boolean/relation fields on `users`, evaluated in a fixed precedence order (see `roleLabel()`/`primaryRoute()`/`navSections()` in `web/components/app/nav-config.ts`, and the equivalent branching in `DashboardService.getCounters()`):

1. `is_admin` (or `is_executive`) — full visibility; Executive is read-only, Admin can write
2. `manages_team_id` present (derived, see above) — Manager
3. `is_support_triage` — Support/Triage
4. `team_id` present — Team Member
5. none of the above — Requester

A user can technically satisfy more than one condition (e.g. the seeded Manager also has `team_id` set to their own team, making them a member of it); precedence order resolves the ambiguity consistently across both frontend nav and backend counters.

## Backend module map

| Module | Routes | Responsibility |
|---|---|---|
| `auth` | `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/me` | Login, logout, current-user lookup |
| `tickets` | `GET/POST /v1/tickets`, `GET /v1/tickets/:id`, `GET /v1/tickets/activity`, `PATCH /v1/tickets/:id/status`, `POST /v1/tickets/:id/confirm-resolution` | Core ticket CRUD, state-machine-gated status transitions, resolution confirm/dispute, role-scoped activity feed |
| `triage` | `GET /v1/triage/queue`, `POST /v1/tickets/:id/category/confirm`, `POST /v1/tickets/:id/priority/confirm`, `POST /v1/tickets/:id/assign` | Support/Triage's queue and the category-confirm → assign flow |
| `manager` | `GET /v1/teams/:id/{workload,stats,tickets}`, `POST /v1/tickets/:id/{reassign,return-to-triage}` | Manager's team-scoped views and actions |
| `dashboard` | `GET /v1/me/counters`, `GET /v1/dashboard/system`, `GET /v1/dashboard/system/pending-confirmations` | Role-shaped counter widgets (each role gets a different response shape from the same `/me/counters` endpoint) and the system-wide admin/exec view |
| `admin` | `GET/POST/PATCH/DELETE /v1/teams`, `GET/POST/PATCH /v1/sites`, `GET/POST/PATCH /v1/categories`, `GET/PATCH /v1/users`, `PATCH /v1/tickets/:id/site` | Teams/sites/categories/users CRUD, ticket site correction |
| `availability` | `GET/POST /v1/availability-requests`, `POST /v1/availability-requests/:id/{approve,reject,end}` | Leave/unavailability request → manager approval → `users.is_unavailable` flip |
| `attachments` | `GET/POST /v1/tickets/:id/attachments`, `POST .../attachments/:id/confirm`, `GET /v1/attachments/:id/download` | Presigned-URL upload/download against MinIO, async validation via Bull |
| `comments` | `GET/POST /v1/tickets/:id/comments` | Requester replies + staff internal notes, filtered per viewer |
| `teams`, `users` | *(none)* | Empty placeholder modules registered in `app.module.ts` from initial scaffolding. No controllers or services. Real team/user functionality lives in `manager` and `admin`. Candidates for deletion. |

`GET /v1/sites` and `GET /v1/categories` (list-only) have no role restriction — every authenticated user can read them, needed for the New Ticket form's site/category pickers.

## Ticket state machine

`api/src/modules/tickets/states/ticket-state-machine.ts` defines the valid transitions between 8 statuses: `new → assigned → in_progress ⇄ pending → resolved → pending_confirmation → closed`, plus `reopened` (from a disputed `pending_confirmation`, routing back to the *same* assignee, never back through triage). `TicketService.updateStatus()` validates every transition against this machine before writing; `RESOLVED` is special-cased to immediately flip to `PENDING_CONFIRMATION` server-side (a Team Member "resolving" a ticket doesn't leave it in a raw `resolved` state — it's a transient value that always becomes `pending_confirmation` in the same write).

"Aging" is not a stored status — it's a derived display state (open ticket, `created_at` more than 3 days ago), computed both server-side (`aging_over_3_days` counters) and client-side (`StatusBadge` component, `lib/format.ts#isAging`).

**Counting "open" tickets.** `OPEN_STATUSES`, exported from the same file, is the single definition every count windows on: `new`, `assigned`, `in_progress`, `pending`, `resolved`, `reopened`. `resolved` is in the list because the ticket is waiting on the requester and can still come back as `reopened`; only `pending_confirmation` and `closed` are out. Import it — never inline the list. Four divergent copies had grown across the services (one of them counting closed tickets as open), which put contradictory numbers for the same team on the same screen: the sidebar badge said 9 and the card it linked to said 7. The frontend mirror is `lib/format.ts#isOpenStatus` and must stay in step with it.

## Frontend structure

```
web/app/
  login/                    Public
  dashboard/
    layout.tsx              Auth gate + UserProvider + CountersProvider + SearchProvider + AppShell
    page.tsx                Redirects to the current user's primaryRoute()
    tickets/                My Tickets (Requester) / My Requests (Team Member, Manager) / All Tickets (Support/Triage, Admin) — same route, role-branches its query and title
    tickets/[id]/           Ticket Detail — also hosts the Resolution Confirmation flow when status is pending_confirmation and the viewer is the requester
    new/                    Create Ticket
    triage/                 Incoming Queue (Support/Triage)
    assigned/                Assigned to Me (Team Member)
    team/                   Team Dashboard (Manager)
    system/                 System Dashboard (Admin/Executive)
```

There is no generic "dashboard hub" page — `primaryRoute(user)` in `nav-config.ts` sends each role straight to the page above that's actually their job.

**Shared context providers**, all mounted once in `dashboard/layout.tsx`:
- `UserProvider` — the logged-in user, fetched once via `GET /v1/auth/me`
- `CountersProvider` — one `GET /v1/me/counters` fetch, powering both the notification bell and sidebar nav badge counts (`needsAttentionCount()`/`navBadgeValue()` in `nav-config.ts`) without per-component re-fetching
- `SearchProvider` — the top-bar search box's query string, reset on route change; filtering is client-side substring matching against whatever list the current page already fetched (**there is no search backend** — no full-text search endpoint exists, despite `tickets.search_vector` existing in the schema)

**Design system**: flat/matte dark theme (deliberately not glassmorphism — chosen for contrast/legibility across a mixed technical/non-technical user base), matching 6 real Figma mockup exports that shipped in the repo root (`mytickets.jpeg`, `new-tickets.jpeg`, `incoming-queue.jpeg`, `assigned-to-me.jpeg`, `team-dashboard.jpeg`, `system-dashboard.jpeg`). shadcn/ui components live in `web/components/ui/`, hand-added (the CLI hung on interactive prompts even with `--yes` in this environment) rather than generated. App-specific composed components live in `web/components/app/` (`AppShell`, `StatusBadge`, `StatCard`, `WorkloadBar`, `ActivityFeed`, `PageHeader`, plus the context providers above). Fonts are Inter + JetBrains Mono, self-hosted via `next/font/google` (bundled at build time, works without an internet connection at runtime).

Status badges always carry both a color *and* a text label — never color alone — for colorblind accessibility, and the same 4-color scheme (blue/amber/red/gray) the Figma mockups actually specify, not the differently-invented 8-color scheme an earlier, unreviewed version of the frontend had used.

## Database schema

11 tables (see `api/src/database/migrations/1693526400000-InitialSchema.ts` for full DDL): `users`, `teams`, `sites`, `categories`, `tickets`, `ticket_comments`, `ticket_attachments`, `ticket_history`, `availability_requests`, `notifications`, plus TypeORM's own `migrations` tracking table.

Notable constraints/triggers (`1693526400001-AddTriggersAndConstraints.ts`):
- `check_assignee_matches_category` — a BEFORE INSERT/UPDATE trigger on `tickets` that rejects assigning a ticket to a user whose `team_id` doesn't match the confirmed category's `team_id`, at the database level (defense in depth below the application-layer check in `triage.service.ts`).
- `audit_ticket_changes` — the AFTER INSERT/UPDATE trigger described above, writing `ticket_history` rows and also auto-populating `resolved_at`/`pending_confirmation_at`/`closed_at` when status crosses into those states.
- `set_updated_at` — generic `updated_at` bump on write, applied to every table that has the column.

`users.email` uses the `citext` extension (case-insensitive). `is_unavailable` on `users` is written by exactly two code paths: `AvailabilityService.approveRequest()` (sets `true`) and `AvailabilityService.endRequest()` for toggle-type requests (sets `false`) — nothing else may write it.

## File storage and comments

**Attachments**: MinIO runs on knight-labs (`support-minio`, Tailscale-only, bucket `ticket-attachments`). The `attachments` module implements the 3-step flow: `POST /v1/tickets/:id/attachments/request-upload` returns a presigned PUT URL, the client uploads directly to MinIO (the file body never passes through the API), then `POST /v1/tickets/:id/attachments/:attachmentId/confirm` enqueues a Bull job on the `attachment-validation` queue — the same queue the worker's stub handler was already listening on from the original scaffold, just never fed until this was wired up. Validation currently always marks `safe` (real content-type sniffing is a documented future improvement in the worker's own code, not a gap introduced here). 25MB size cap, allowlist of image/PDF/text/CSV content types, enforced both client- and server-side.

**Comments**: `comments` module implements FR-1.4 (requester replies) and FR-4.4 (Team Member/staff internal notes). `is_internal` can only be set by staff (`is_admin`, `is_support_triage`, or has a `team_id`) — a pure Requester's attempt to set it is silently ignored server-side, not just hidden client-side. `GET` filters out internal comments entirely for non-staff viewers.

## Known gaps

- **Search**: `tickets.search_vector` (tsvector) exists and is populated; nothing queries it. The visible search box is client-side substring filtering only.
- **`teams`/`users` NestJS modules**: empty scaffolding, superseded by `manager`/`admin`. Not wired to anything; safe to delete once confirmed unused.
- **FR-9.2 notifications**: not built. There is no notifications module, table, or delivery channel anywhere in the API — nothing to wire a UI to. What exists instead is the header bell, which is a live count of what needs your attention (`nav-config.ts#needsAttentionCount`, fed by `/v1/me/counters`) linking to the screen that holds it, not a notification inbox. Deliberately left unbuilt rather than mocked: a bell that opened an empty or fake list would read as implemented.
- **JWT staleness**: role/availability fields in the JWT (`is_unavailable`, role booleans, `manages_team_id`) are a snapshot from login time. If another user's action changes them mid-session (e.g. a manager approves your leave while you're logged in), your own UI won't reflect it until you log out and back in. Not fixed in this pass — would need either short-lived tokens with refresh, or a live `/me` re-fetch on relevant actions.
