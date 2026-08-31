# Support Ticketing System

In-house support ticketing system — 50+ sites, category-then-assign triage model, Manager-approved availability tracking, full audit trail.

## Design documents (read in this order)

1. **REQUIREMENTS.md** — roles, ticket lifecycle, all functional requirements
2. **ARCHITECTURE_AND_PLAN.md** — component architecture, stack decision, 8-step build plan
3. **ARCHITECTURE_REVIEW.md** — completeness/security (CIA)/functionality review, with everything that was found and fixed
4. **DB_SCHEMA.md** — full Postgres DDL, with a self-critique of what was wrong the first pass and how it was fixed
5. **API_CONTRACT.md** — every route, request/response shape, and role requirement
6. **SEQUENCE_DIAGRAMS.md** — ticket lifecycle and auth flow, end to end
7. **DESIGN_PATTERNS.md** — the State pattern decision for the ticket lifecycle, and which supporting patterns (Strategy, Observer, Facade) fall out of it
8. **FIGMA_DESIGN_LOG.md** — screens built, screens explicitly out of scope, design decisions made along the way
9. **CLAUDE_CODE_HANDOFF.md** — the master-developer prompt for picking up implementation at build plan step 4

## Stack

- **API:** Node, standalone service (`/api`)
- **Frontend:** Next.js, SSR (`/web`)
- **Worker:** Node, Redis-backed jobs (`/worker`)
- **Database:** PostgreSQL 18
- **Object storage:** MinIO (S3-compatible)
- **Reverse proxy:** Nginx

Kept as separate services (not collapsed into one Next.js app) deliberately — see ARCHITECTURE_AND_PLAN.md §1 for why.

## Local development

```bash
cd infra
cp .env.example .env
# fill in real secrets in .env — it's gitignored, never commit it
docker compose up
```

Nothing runs yet — `/api`, `/web`, and `/worker` are currently empty directories waiting for their respective scaffolds (build plan step 5–7). `docker-compose.yml` and `.env.example` are in place (step 2–3); the schema in DB_SCHEMA.md hasn't been turned into migrations yet (step 4).

## Network layout

Postgres, Redis, and MinIO sit on an internal-only Docker network (`backend`) with no route to the outside world and no ports published beyond `127.0.0.1` for local debugging. Only `api` and `worker` can reach them. Only `nginx` is exposed on 80/443. `api` sits on both networks so it can reach the database *and* make outbound calls (SMTP, SSO providers) without ever exposing the database itself.

## Status

Design phase is complete — requirements, architecture, security review, schema, and API contract are all internally consistent, no open questions. Infrastructure scaffolding (repo layout, docker-compose, env template) is done; no application code written yet.

**Deferred by explicit decision, not oversight:**
- File upload flow: presigned URL to MinIO (recommended, not yet implemented) — see API_CONTRACT.md §11
- Backup strategy, observability/logging, secrets manager graduation — see chat history for options considered; none chosen yet, none block current work
- Notification email/message content — drafted during email integration, not before
- **Testing/CI:** GitHub for version control, manual deploys for now. No CI pipeline yet — revisit once there's a production target to design against.
- **One real open item:** the idempotency locking mechanism for the leave-expiry worker job (advisory lock vs. Redis lock vs. row-level lock) — recommendation is a Postgres advisory lock, not yet finalized in code.
