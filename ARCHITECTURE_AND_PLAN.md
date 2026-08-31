# Support Ticketing System — Architecture & Infrastructure Build Plan

Companion to REQUIREMENTS.md and FIGMA_DESIGN_LOG.md in this directory. Target: `knight-labs`.

---

## 1. Architecture Overview

Client-server pattern with a single API server as the only thing that talks to the database — this matters because so much of what's specified in REQUIREMENTS.md (category-driven assignment filtering, manager-can't-touch-other-teams, data-layer access scoping) has to be enforced in one place, not scattered across the UI.

**Components:**

| Component | Role |
|---|---|
| **Next.js app (Node)** | SSR frontend — role-based UI, the screens built in Figma. Separate service from the API (not collapsed). |
| **API server (Node)** | Auth, business rules, audit logging — the only thing that talks to Postgres. Standalone service, called by the Next.js app over HTTP. |
| **PostgreSQL** | Core ticket data: tickets, users, teams, categories, sites, availability_requests, plus an append-only audit log table |
| **Object storage** (S3-compatible / MinIO) | Ticket attachments, kept out of the database, served via signed time-limited URLs |
| **Redis + worker** | Background jobs: leave auto-expiry scan (daily), attachment validation, outbound notifications |
| **Email / SMTP** | Status change and resolution-confirmation notifications, driven by the worker |

**Stack decision (resolved):** Node for both services. Frontend is Next.js with SSR; API is a separate standalone Node service (not collapsed into Next.js API routes) — kept separate deliberately for a clean security boundary and independent scaling/deployment, per review discussion.

**Requirement-to-architecture mapping:**

- **FR-2.1a / FR-3.8** (category-filtered assignment; manager can't touch other teams) — enforced in the API server on every request. The frontend can hide buttons for UX, but the API is what actually refuses the action.
- **FR-9.2 / FR-9.3** (append-only audit trail; access control enforced at the data layer) — the audit table lives in Postgres with no update/delete grant on the app's DB role; every query is filtered by the requesting user's permitted sites/teams at the API layer.
- **FR-10.7** (date-range availability auto-expiry) — needs a worker with its own clock, not something the API can do on a request-response cycle. Note: there is deliberately no equivalent auto-*close* job for tickets — a ticket in Pending Confirmation stays open indefinitely until the requester acts (REQUIREMENTS.md §4.9).

**Local dev target:** Docker Compose stack — one container each for Postgres, Redis, MinIO, API, worker, and frontend, with Nginx as a single entrypoint. Nothing here requires cloud infrastructure to develop against. A future cloud target would swap MinIO for real S3 and add a managed Postgres instance without touching application code.

---

## 2. Build Plan

1. **Scaffold the repo structure** — monorepo layout: `/api` (backend), `/web` (frontend), `/worker` (background jobs), `/infra` (docker-compose, env templates). Matches the four containers above.

2. **Write docker-compose.yml** — services: postgres, redis, minio, api, worker, web, nginx reverse proxy. Volumes for Postgres data and MinIO buckets so nothing is lost on container restart.

3. **Set up environment config** — `.env.example` covering DB credentials, Redis URL, MinIO keys, SMTP settings, session/CSRF secrets (cookie-based auth, not JWT — see API_CONTRACT.md §1). Keep real secrets out of git from the start.

4. **Build the database schema** — turn the data model from REQUIREMENTS.md into migrations: `users`, `teams`, `sites`, `tickets`, `categories`, `ticket_history` (append-only audit log), `availability_requests` (FR-10.x, with a derived `is_unavailable` flag on `users` — see FR-10.10), with role and site-scoping constraints baked into foreign keys and indexes.

5. **Scaffold the API server** — auth (login, HttpOnly/Secure/SameSite session cookie + CSRF token, per API_CONTRACT.md §1), an RBAC middleware enforcing role + team/site scoping on every query, and the ticket state machine as a first-class module rather than scattered logic (this is the State pattern decision — see DESIGN_PATTERNS.md for what "first-class module" concretely means and why it's the single most important technical decision in this project).

6. **Scaffold the worker** — Redis-backed job queue with three jobs first: leave auto-expiry scan (FR-10.7, runs daily, date-only — reduced load, per decision), attachment validation (real content-type/size check on uploaded files before they become downloadable — see DB_SCHEMA.md "File upload & serving architecture"), and outbound email notifications (FR-5.x). All need idempotency guards so an overlapping run doesn't double-process — leave-expiry uses a Postgres advisory lock (cheap insurance even at daily cadence). Everything else in the notification list hangs off this later.

7. **Wire up the frontend shell** — Next.js (SSR) app with the SupportDesk shell (header, sidebar, role-based routing) matching the Figma screens, pointed at the API server. Start with the Requester and Support/Triage views since those are furthest along in Figma.

8. **Run it end-to-end locally** — `docker-compose up`, run migrations, seed test users per role, walk through: create ticket → confirm category → assign → resolve → confirm. The smoke test that proves the architecture holds together. (No auto-close to test — a ticket left in Pending Confirmation is expected to just sit there.)

---

## 3. Stack Decision (Resolved)

- **Backend:** Node, standalone API service, **NestJS** (resolved — chosen for structural enforcement of the shared authz module, state-machine module, and audit logging via guards/interceptors; see chat discussion for the full unbiased Express/Fastify/NestJS comparison this came from).
- **Frontend:** Next.js (SSR), a separate service from the API, communicating over HTTP.
- Kept separate rather than collapsed into one Next.js app for a clean security boundary and independent scaling, per the architecture review.

## 4. Remaining Open Decisions Before Scaffolding

None currently open. Both items previously listed here are resolved:
- Wrong site correction — **resolved:** only Support/Triage can correct it (REQUIREMENTS.md FR-11.3).
- Node API framework — **resolved:** NestJS (above).

See ARCHITECTURE_REVIEW.md §4 for the still-tracked (but non-blocking) items: signed URLs/file upload validation, backup strategy, observability, secrets management graduation path.
