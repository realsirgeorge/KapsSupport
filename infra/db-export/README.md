# `support_ticketing.dump`

A `pg_dump --format=custom` snapshot of the `support_ticketing` database — schema and data both, exported from the machine that hosted it during development.

**This is seed/test data, not real production data.** Every user, ticket, and comment in it came from the project's seed script (`api/src/database/seed-expanded.ts`), not from a real deployment. It's here so your team can start from a working, populated system instead of an empty one.

## What's in it

| Table | Rows |
|---|---|
| users | 50 |
| teams | 5 |
| sites | 5 |
| categories | 6 |
| tickets | 30 |
| ticket_comments | 3 |
| ticket_attachments | 1 |
| ticket_history | 48 |
| availability_requests | 9 |
| notifications | 0 — table exists in the schema, nothing writes to it yet (see ARCHITECTURE.md, "Known gaps") |

All seeded accounts share one password: **`Password123!`** — emails follow the pattern `admin1@example.com`, `manager1@example.com`, `support1@example.com`, `member1@example.com`, `requester1@example.com`, etc. (numbered up to 3–20 depending on role — see `seed-expanded.ts` for the exact roster).

## How to use it

See **`../../SETUP.md`** for the full walkthrough. The short version, once `postgres` is up:

```bash
docker cp support_ticketing.dump <postgres-container-name>:/tmp/
docker exec <postgres-container-name> \
  pg_restore -U support_app -d support_ticketing --no-owner --no-privileges /tmp/support_ticketing.dump
```

## If you'd rather start empty

You don't have to use this. Run the migrations against a fresh database instead and skip this file entirely — see the "Option B" path in `SETUP.md`. Either is a normal starting point; this dump just saves the team from re-entering 50 users and 30 tickets by hand.
