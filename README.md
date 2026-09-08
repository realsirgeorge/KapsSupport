# Support Ticketing System

In-house support ticketing system — 50+ sites, category-then-assign triage model, Manager-approved availability tracking, full audit trail.

**New to this repo? Start with [`SETUP.md`](SETUP.md).** It walks through cloning, configuring, and running the whole stack, including loading a working seed dataset — everything you need to get from a fresh clone to a logged-in dashboard.

## Documentation map

- **[`SETUP.md`](SETUP.md)** — how to actually run this. Start here.
- **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — the current, accurate reference: stack, module map, auth model, ticket state machine, and a "Known gaps" section listing what's deliberately not built yet.
- **[`infra/db-export/README.md`](infra/db-export/README.md)** — what's in the provided database export and the shared login password for seeded accounts.

The documents below were written *before* implementation started, as the original design phase. They're kept for historical context and rationale — why certain decisions were made — but describe intent, not the system as it was actually built. Where they disagree with `ARCHITECTURE.md` or the code itself, trust the code.

1. **REQUIREMENTS.md** — roles, ticket lifecycle, all functional requirements
2. **ARCHITECTURE_AND_PLAN.md** — component architecture, stack decision, 8-step build plan
3. **ARCHITECTURE_REVIEW.md** — completeness/security (CIA)/functionality review, with everything that was found and fixed
4. **DB_SCHEMA.md** — full Postgres DDL, with a self-critique of what was wrong the first pass and how it was fixed
5. **API_CONTRACT.md** — every route, request/response shape, and role requirement
6. **SEQUENCE_DIAGRAMS.md** — ticket lifecycle and auth flow, end to end
7. **DESIGN_PATTERNS.md** — the State pattern decision for the ticket lifecycle, and which supporting patterns (Strategy, Observer, Facade) fall out of it
8. **FIGMA_DESIGN_LOG.md** — screens built, screens explicitly out of scope, design decisions made along the way
9. **CLAUDE_CODE_HANDOFF.md** — the master-developer prompt used to pick up implementation partway through the original build plan

## Stack

- **API:** Node, standalone service (`/api`)
- **Frontend:** Next.js, SSR (`/web`)
- **Worker:** Node, Redis-backed jobs (`/worker`)
- **Database:** PostgreSQL 18
- **Object storage:** MinIO (S3-compatible)
- **Reverse proxy:** Nginx

Kept as separate services (not collapsed into one Next.js app) deliberately — see ARCHITECTURE_AND_PLAN.md §1 for why.

## Quick start

```bash
git clone https://github.com/realsirgeorge/KapsSupport.git
cd KapsSupport/infra
cp .env.example .env   # then fill in real secrets — see SETUP.md for what each one does
docker compose up -d postgres redis minio
# load infra/db-export/support_ticketing.dump, or run migrations against an empty DB
docker compose up -d --build
```

That's the short version — **[`SETUP.md`](SETUP.md)** has the full walkthrough, including exactly which secrets are required versus safe to leave blank, how to load the provided database export, and a troubleshooting table for the failure modes people actually hit.

## Network layout

Postgres, Redis, and MinIO sit on an internal-only Docker network (`backend`) with no route to the outside world and no ports published beyond `127.0.0.1` for local debugging. Only `api` and `worker` can reach them. Only `nginx` is exposed on 80/443. `api` sits on both networks so it can reach the database *and* make outbound calls (SMTP, SSO providers) without ever exposing the database itself.

## Status

Built and working: API, web app, ticket lifecycle, role-based dashboards for every role (requester, team member, manager, support/triage, admin, executive), file attachments, audit trail, availability approvals. 13/13 end-to-end journeys pass; production build is clean.

**Known gaps** (deliberately unbuilt or incomplete, not oversights) are tracked in `ARCHITECTURE.md`'s "Known gaps" section — currently: search (the tsvector column exists, nothing queries it yet), FR-9.2 notifications (no backend module exists), and JWT staleness on role/availability changes mid-session. That section is the current, maintained list; treat the "Deferred by explicit decision" framing that used to live here as superseded by it.
