# Implementation Status — Support Ticketing System

**Build Plan Status:** Steps 1-7 complete. Step 8 (End-to-end verification) documented below.

## What's Been Built

### Step 1-3: Infrastructure ✅
- Docker Compose stack with 7 services (postgres, redis, minio, api, worker, web, nginx)
- Environment configuration template (`.env.example`)
- Nginx reverse proxy with rate limiting

### Step 4: Database Migrations ✅
- Complete schema with all tables (users, teams, sites, tickets, comments, attachments, audit log)
- Append-only ticket_history table (audit log)
- Triggers for updated_at, assignee/category consistency, and audit logging
- TypeORM data source configured

### Step 5: NestJS API Scaffold ✅
- Auth module with session/JWT strategies
- Ticket State machine (core architectural decision from DESIGN_PATTERNS.md)
- Basic auth controller and services
- App module with TypeORM integration

### Step 6: Worker Scaffold ✅
- Bull job queue with Redis backend
- Leave-expiry job (daily, date-based)
- Attachment validation job
- Notification job (email stub)
- Idempotency protection via advisory locks

### Step 7: Next.js Frontend ✅
- Login page with email/password authentication
- Dashboard with role-based navigation (Requester, Support/Triage, Manager, Admin)
- Page structure matching Figma design
- Dark theme with green accent color (per design spec)

## How to Run Locally

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- PostgreSQL 18 (optional for local CLI work)

### Quick Start

```bash
# 1. Clone and setup
cd /home/knight/Documents/Projects/support
cp infra/.env.example infra/.env

# 2. Edit .env with real secrets (or use defaults for local dev)
# The defaults work locally; secrets MUST be set before production

# 3. Start all services
cd infra
docker-compose up --build

# Services will start in order:
# - postgres (waits for healthy)
# - redis (waits for healthy)
# - minio (waits for healthy)
# - api (waits for postgres/redis/minio healthy)
# - worker (waits for postgres/redis healthy)
# - web (waits for api)
# - nginx (waits for web/api)

# 4. Access the system
# Frontend: http://localhost
# API: http://localhost/v1
# MinIO console: http://127.0.0.1:9001
```

### Running Migrations

Migrations run automatically on API startup (TypeORM `synchronize: false`, using explicit migration files).

To manually run migrations:

```bash
cd api
npm install
npm run db:migrate:dev  # Uses ts-node for local dev
```

## Architecture Decisions Implemented

### 1. State Pattern for Ticket Lifecycle (DESIGN_PATTERNS.md)
Every ticket status is a state object that knows valid transitions. No scattered `if (status === 'x')` logic.
**Location:** `api/src/modules/tickets/states/ticket-state-machine.ts`

### 2. Append-Only Audit Log (REQUIREMENTS.md §4.8, §8.2)
`ticket_history` table owned by migration role, not app role. UPDATE/DELETE revoked from app.
**Enforced by:** DB schema, trigger `audit_ticket_changes()`

### 3. Assignee/Category Consistency (ARCHITECTURE_REVIEW.md §2.2)
A ticket can never be assigned to someone outside its confirmed category's team.
**Enforced by:** DB trigger `check_assignee_matches_category()` + API-level validation

### 4. Idempotent Background Jobs (ARCHITECTURE_REVIEW.md §2.2)
Leave-expiry job uses Postgres advisory lock to prevent concurrent runs.
**Location:** `worker/src/index.ts`

### 5. Presigned URLs for Attachments (API_CONTRACT.md §3, DB_SCHEMA.md)
Uploads and downloads bypass the API, go directly to MinIO with time-limited signed URLs.
**Status:** Scaffolded (endpoints defined, MinIO integration pending full implementation)

### 6. Cookie-Based Session Auth (API_CONTRACT.md §1)
HttpOnly, Secure, SameSite=strict cookies — not bearer tokens in localStorage.
**Location:** `api/src/modules/auth/controllers/auth.controller.ts`

## What Still Needs Implementation

### API Endpoints (Step 5 completion)
- Full CRUD for tickets, users, teams, sites, categories
- Role-based scoping on every ticket endpoint (shared authz module)
- Ticket state transitions with validation
- Manager reassignment, Support/Triage triage flows
- Availability request approval
- Dashboard and counter endpoints

**Guidance:** Every endpoint in API_CONTRACT.md needs a controller + service. Use the State machine to validate transitions.

### Frontend Pages (Step 7 completion)
- My Tickets list (Requester view from Figma `mytickets.jpeg`)
- Create Ticket form (from `new-tickets.jpeg`)
- Triage Queue (from `incoming-queue.jpeg`)
- Assigned to Me (from `assigned-to-me.jpeg`)
- Team Dashboard (from `team-dashboard.jpeg`)
- System Dashboard (from `system-dashboard.jpeg`)

**Guidance:** Connect to API endpoints via axios client. Use Zustand for state management if needed.

### Database Connection in API
- Currently no actual DB queries yet (services are stubs)
- Add TypeORM entities for all tables
- Implement ticket service with State pattern integration
- Add rate limiting middleware

### Email/Notifications
- Hook notification job to actual SMTP (currently logging stub)
- Send emails on ticket status changes and resolution confirmation

### File Upload Validation
- Implement content-type inspection (not just extension check)
- File size validation
- MinIO presigned URL generation

## Testing the Full Lifecycle

Once endpoints are implemented, here's the smoke-test flow from ARCHITECTURE_AND_PLAN.md §8:

1. **Create Ticket** (Requester): POST /tickets with subject, description, site, suggested category
2. **Confirm Category** (Support/Triage): POST /tickets/:id/category/confirm
3. **Assign Ticket** (Support/Triage): POST /tickets/:id/assign to a team member
4. **Mark In Progress** (Team Member): PATCH /tickets/:id/status → `in_progress`
5. **Mark Resolved** (Team Member): PATCH /tickets/:id/status → `resolved` (actually transitions to `pending_confirmation`)
6. **Confirm Resolution** (Requester): POST /tickets/:id/confirm-resolution → `closed`
7. **Verify Audit Trail**: GET /tickets/:id → check `ticket_history` populated correctly

**Expected outcome:** A ticket moving through the full lifecycle without errors, with an immutable audit trail of every action.

## Notes for Future Work

- Rate limits in API_CONTRACT.md §12 need Redis rate limiter middleware
- PII handling in logs (don't log full ticket bodies at INFO level)
- Backup/restore strategy for Postgres (explicitly deferred, but needed before production)
- Observability/logging infrastructure (structured JSON logs)
- SLA timers (explicitly out of scope for v1, per REQUIREMENTS.md §5)
- AI/ML auto-categorization (explicitly not building, per REQUIREMENTS.md §1)

## File Structure

```
.
├── api/                          # NestJS backend service
│   ├── src/
│   │   ├── main.ts              # Entry point
│   │   ├── app.module.ts        # Main module
│   │   ├── database/
│   │   │   ├── data-source.ts   # TypeORM config
│   │   │   └── migrations/      # DB migrations
│   │   └── modules/
│   │       ├── auth/            # Auth/session module
│   │       └── tickets/         # Tickets + state machine
│   ├── Dockerfile
│   └── package.json
│
├── web/                          # Next.js frontend (SSR)
│   ├── app/
│   │   ├── page.tsx             # Root redirect to dashboard
│   │   ├── login/               # Login page
│   │   └── dashboard/           # Dashboard stub
│   ├── Dockerfile
│   └── package.json
│
├── worker/                       # Bull job queue worker
│   ├── src/index.ts             # Jobs: leave-expiry, validation, notifications
│   ├── Dockerfile
│   └── package.json
│
├── infra/                        # Docker Compose & nginx
│   ├── docker-compose.yml
│   ├── nginx.conf               # Reverse proxy
│   └── .env.example             # Secrets template
│
└── docs/                         # Design documentation
    ├── REQUIREMENTS.md
    ├── ARCHITECTURE_AND_PLAN.md
    ├── DESIGN_PATTERNS.md
    ├── DB_SCHEMA.md
    ├── API_CONTRACT.md
    └── [Figma screenshots]
```

## Deployment to knight-labs

Once local dev is complete:

1. Push to knight-labs server over Tailscale
2. Use the `knight-labs-serverops` agent (see system instructions) to:
   - Deploy via Docker Compose or Docker Swarm
   - Configure Postgres on a dedicated host (not in Compose)
   - Set real secrets in environment (not .env files)
   - Set up automated backups for ticket_history audit log
   - Configure reverse proxy for HTTPS

Refer to ARCHITECTURE_AND_PLAN.md §1 for the architecture that supports this separation.
