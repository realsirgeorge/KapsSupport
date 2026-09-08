# Setup

This walks through getting SupportDesk running from a fresh clone: prerequisites, configuration, starting the stack, loading the database, and confirming it all actually works. Follow it top to bottom the first time; after that, skip to whatever step you need.

If something here turns out to be wrong for your environment, it's worth fixing this file in the same commit — it's meant to stay accurate, not be a one-time note.

## What you're setting up

Six pieces, all defined in `infra/docker-compose.yml`, running as Docker containers on one machine:

| Service | What it is | Talks to the outside world? |
|---|---|---|
| `postgres` | Postgres 18 — the database | No — internal only |
| `redis` | Redis 7 — job queue backing store for the worker | No — internal only |
| `minio` | S3-compatible object storage — ticket attachments | No — internal only |
| `api` | NestJS — the backend, `/v1/*` | No — only `nginx` reaches it |
| `worker` | Background job processor (Bull queues over Redis) | No — no HTTP surface at all |
| `web` | Next.js — the frontend everyone actually uses | No — only `nginx` reaches it |
| `nginx` | Reverse proxy — the only thing exposed on the network | **Yes — ports 80/443** |

That last column matters: `postgres`, `redis`, and `minio` sit on a Docker network marked `internal: true` in the compose file, which means they have no route out to the internet or to anything outside this container group — not a firewall rule that could be misconfigured, a property of the network itself. Nothing needs to be locked down after the fact.

## Prerequisites

- A Linux machine (this was built and tested against Ubuntu; any modern Linux with Docker should work)
- [Docker Engine](https://docs.docker.com/engine/install/) with the Compose plugin (`docker compose version` should print something — if you only have the standalone `docker-compose` binary, the commands below still work, just replace `docker compose` with `docker-compose`)
- A GitHub token or SSH key with read access to this repository (you should already have one)
- `openssl` for generating secrets (installed by default on almost everything; `openssl version` to check)

You do **not** need Node, npm, or Postgres installed on the host — everything runs inside containers.

---

## 1. Clone the repo

```bash
git clone https://github.com/realsirgeorge/KapsSupport.git
cd KapsSupport
```

Use whichever credential you were given (token or SSH key) for the clone — see GitHub's own docs if you're not sure which URL form to use with it.

## 2. Configure your environment

There's one shared env file that `postgres`, `redis`, `minio`, `api`, `worker`, and `web` all read from — `infra/.env`. It doesn't exist yet; you create it from the template:

```bash
cd infra
cp .env.example .env
```

Now open `infra/.env` and replace every `change_me...` placeholder with a real value. Generate strong random secrets rather than typing something memorable:

```bash
openssl rand -hex 32
```

Run that once per secret (`POSTGRES_PASSWORD`, `DATABASE_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`) — **`POSTGRES_PASSWORD` and `DATABASE_PASSWORD` must be the same value**, since they're the same actual database password read by two different services under two different variable names. Same logic doesn't apply to the others; each secret is independent.

> **The one that actually matters most: `JWT_SECRET`.**
> This signs every login session. If you leave it unset, the API silently falls back to the literal string `dev-secret` — meaning anyone who's ever read this codebase could forge a valid session for any user. Don't skip it, and don't reuse a value from anywhere else.

Everything else in `.env.example` (`MINIO_HOST=minio`, `REDIS_HOST=redis`, `DATABASE_HOST=postgres`, the ports) is already correct as written — those are Docker's internal service names, not placeholders, and don't need to change.

The `SSO_*` and `SMTP_*` variables in that file are there for a feature that's designed but not built yet (see `ARCHITECTURE.md`, "Known gaps"). Leave them blank; nothing reads them.

## 3. Bring up the data services first

```bash
docker compose up -d postgres redis minio
docker compose ps
```

Wait until all three show `healthy` (a few seconds — each has a healthcheck baked in). If one doesn't go healthy, `docker compose logs postgres` (or `redis`/`minio`) is the first place to look — it's almost always a bad password in `.env` not matching between the container's own env var and the app-facing one (see the `POSTGRES_PASSWORD`/`DATABASE_PASSWORD` note above).

## 4. Load the database

You have two options here. **Option A is recommended** — it gets you a working system with real-looking data in one step, so you can actually click around and see what this application does.

### Option A: restore the provided export

`infra/db-export/support_ticketing.dump` is a full snapshot — schema and data — taken from the database used during development. It's seed/test data (50 fictional users, 30 fictional tickets), not anything sensitive. See `infra/db-export/README.md` for exactly what's in it and the shared login password for every seeded account.

```bash
docker cp infra/db-export/support_ticketing.dump \
  $(docker compose -f infra/docker-compose.yml ps -q postgres):/tmp/support_ticketing.dump

docker compose -f infra/docker-compose.yml exec postgres \
  pg_restore -U support_app -d support_ticketing --no-owner --no-privileges /tmp/support_ticketing.dump
```

That's it — no separate migration step needed, the dump already includes the fully-migrated schema.

### Option B: start from an empty database instead

If you'd rather not carry the seed data forward, skip Option A entirely and run migrations directly against the empty database the `postgres` container created on first boot:

```bash
cd api
npm ci
npm run build
npm run db:migrate

# optional — populate it with the same kind of seed data as the dump,
# freshly generated instead of restored:
npm run db:seed:expanded
cd ..
```

This runs `npm` on your host machine but points at the `postgres` container over the port Docker Compose publishes to `127.0.0.1` — it doesn't need anything else running yet.

## 5. Bring up the app

```bash
cd infra
docker compose up -d --build
docker compose ps
```

`--build` is only needed the first time (or after pulling code changes) — it builds the `api`, `worker`, and `web` images from their Dockerfiles. Subsequent `docker compose up -d` calls reuse the built images unless the source changed.

Watch the logs while it comes up if anything looks off:

```bash
docker compose logs -f api worker web
```

## 6. Confirm it's actually working

```bash
curl -I http://localhost/health
```

Should return `200 healthy`. Then open `http://localhost` (or whatever host/IP you're running this on) in a browser and log in.

If you restored the provided dump (Option A), sign in as `admin1@example.com` / `Password123!` and you should land on the system dashboard with real-looking numbers on it — teams, sites, tickets in various states. If you started empty (Option B) and skipped the seed step, you'll need to register or insert your first admin user directly, since there's no signup flow yet — see `ARCHITECTURE.md`'s auth section.

> **One thing to know if you put this behind a real domain later, not just an IP:** `infra/nginx.conf` sets the session cookie's `Secure` flag unconditionally, which means it's only ever set by a browser over HTTPS. Plain `http://localhost` or a bare IP over port 80 works fine for local testing regardless — this only becomes a blocker once you're serving from a real hostname without TLS in front of it.

### Running the automated tests against it

The end-to-end test suite (Playwright) exercises every role's main journey — login, tickets, triage, team dashboard, admin screens — against a running instance:

```bash
npm ci
npx playwright install --with-deps chromium
E2E_BASE_URL=http://localhost npx playwright test --reporter=line
```

It's read-only by design — it opens dialogs and checks controls but never saves or submits — so it's safe to run against the restored seed data without corrupting it. 13 tests, all should pass.

---

## Day-to-day operations

**Stop everything:**
```bash
docker compose -f infra/docker-compose.yml down
```
(data in `postgres`, `redis`, and `minio` persists in named Docker volumes — this doesn't delete it. Add `-v` if you genuinely want to wipe all data and start over.)

**Rebuild after a code change:**
```bash
docker compose -f infra/docker-compose.yml up -d --build api   # or worker, or web
```

**Run a migration after pulling new code:**
```bash
docker compose -f infra/docker-compose.yml exec api npm run db:migrate
```

**Get a shell in the database:**
```bash
docker compose -f infra/docker-compose.yml exec postgres psql -U support_app -d support_ticketing
```

**Back up the database yourself, the same way this export was made:**
```bash
docker compose -f infra/docker-compose.yml exec postgres \
  pg_dump -U support_app -d support_ticketing --format=custom --file=/tmp/backup.dump
docker cp $(docker compose -f infra/docker-compose.yml ps -q postgres):/tmp/backup.dump ./backup.dump
```

---

## If something doesn't work

| Symptom | Likely cause |
|---|---|
| `postgres`/`redis`/`minio` never go `healthy` | A password in `infra/.env` doesn't match between the container-facing var (`POSTGRES_PASSWORD`, etc.) and the app-facing one (`DATABASE_PASSWORD`, etc.) — see step 2 |
| `api` container exits immediately | Check `docker compose logs api` — almost always a missing or malformed `infra/.env` value, or the data services weren't healthy yet when it started |
| Login "works" but you're bounced straight back to the login page | `JWT_SECRET` wasn't set consistently, or you're serving over plain HTTP through a real hostname (not `localhost`/an IP) — see the nginx `Secure` cookie note above |
| `pg_restore` errors about roles or ownership | Make sure you passed `--no-owner --no-privileges` — the dump was taken with a different Postgres role than your fresh container's `support_app` |
| Attachments/file upload fails | `MINIO_HOST` must be `minio` (the Docker service name), not `localhost` — that's the one setting in `.env.example` most likely to get silently "corrected" back to `localhost` by someone testing outside Docker first |
| `psql -h localhost -p 5432` (or a GUI DB client) can't connect from the host, even though `postgres` is healthy | Expected on some Docker Compose versions — a service whose only network is marked `internal: true` (postgres, redis, minio all are, on purpose) silently drops its host port publish even though `docker-compose.yml` declares one. Doesn't affect the app itself: `api`/`worker` reach these over the internal Docker network by service name, never through the host port. Use `docker compose exec postgres psql -U support_app -d support_ticketing` instead of connecting from the host. |

For anything architectural — why the services are split this way, the ticket state machine, the auth model, what's deliberately not built yet — read `ARCHITECTURE.md` next. It's the accurate, current reference; the `REQUIREMENTS.md` / `ARCHITECTURE_AND_PLAN.md` / `DB_SCHEMA.md` family of docs in the repo root are the original design documents from before any of this was built and are kept for historical context, not as a setup guide.
