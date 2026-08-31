# Database Schema — Support Ticketing System

Postgres. Companion to REQUIREMENTS.md — every table traces back to specific FRs, noted inline. UUID primary keys throughout (deliberate: sequential IDs let anyone enumerate ticket/user counts and guess adjacent records by incrementing a URL — not something to expose in an internal tool with an audit trail).

---

## `users`

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuidv7(),     -- Postgres 18+; see "Design notes" for pre-18 fallback
  name              TEXT NOT NULL,
  email             CITEXT UNIQUE NOT NULL,
  password_hash     TEXT,                          -- NULL if SSO-only (FR-12.1/12.2)
  sso_provider      TEXT,                           -- 'azure_ad' | 'google' | 'okta' | NULL
  sso_subject_id    TEXT,                           -- provider's unique user id
  team_id           UUID,                            -- FK added below, after teams exists (circular reference)
  is_support_triage BOOLEAN NOT NULL DEFAULT false,  -- Admin-managed allowlist (FR-2.7)
  is_admin          BOOLEAN NOT NULL DEFAULT false,
  is_executive      BOOLEAN NOT NULL DEFAULT false,
  is_unavailable    BOOLEAN NOT NULL DEFAULT false,  -- DERIVED, see FR-10.10 — never written directly by app code,
                                                      -- only by the availability approval/expiry logic
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT auth_method_present CHECK (password_hash IS NOT NULL OR sso_provider IS NOT NULL)
);

CREATE UNIQUE INDEX users_sso_identity ON users (sso_provider, sso_subject_id) WHERE sso_provider IS NOT NULL;
```

**Note on roles:** every user is implicitly a Requester (FR-1.1 — "any logged-in user"). Support/Triage, Admin, and Executive are flags. Team Member and Manager are *not* flags — they're derived from relationships: a user is a Team Member if `team_id` is set; a user is a Manager if `teams.manager_id` points to them. This avoids a role ever drifting out of sync with the team structure it's supposed to describe.

---

## `teams`

```sql
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  name        TEXT UNIQUE NOT NULL,          -- 'Fintech', 'Technical', 'ICT', extensible (FR-5.1)
  manager_id  UUID REFERENCES users(id),     -- exactly one manager per team (FR-3.7) — safe inline, users already exists here
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Close the circular reference: users.team_id was declared above with no inline FK
-- specifically because teams didn't exist yet at that point in the script.
ALTER TABLE users ADD CONSTRAINT users_team_fk FOREIGN KEY (team_id) REFERENCES teams(id);

-- Auto-maintain updated_at on every table that has it (§ Design notes)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## `sites`

```sql
CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  name        TEXT NOT NULL,                  -- e.g. 'Westgate'
  region      TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,   -- deactivated sites stay selectable on old tickets, not new ones (FR-11.2)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sites_name_region_idx ON sites (name, region);
CREATE TRIGGER sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## `categories`

```sql
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  name        TEXT UNIQUE NOT NULL,           -- 'Fintech', 'Technical', 'ICT'
  team_id     UUID NOT NULL REFERENCES teams(id),  -- the team a confirmed category routes to
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## `tickets`

```sql
CREATE TABLE tickets (
  id                    UUID PRIMARY KEY DEFAULT uuidv7(),
  ticket_number         TEXT UNIQUE NOT NULL,        -- e.g. 'TCK-2026-00842', app-generated (FR-8.3) — the ONLY externally
                                                       -- exposed identifier; uuidv7's embedded timestamp is fine internally
                                                       -- but shouldn't be the thing users see in a URL

  requester_id          UUID NOT NULL REFERENCES users(id),
  site_id               UUID NOT NULL REFERENCES sites(id),          -- required, requester-set (FR-1.1, FR-11.3)

  suggested_category_id UUID REFERENCES categories(id),              -- requester's guess (FR-1.1a)
  confirmed_category_id UUID REFERENCES categories(id),               -- Support/Triage's call (FR-2.1) — NULL until triaged

  assigned_to           UUID REFERENCES users(id),                   -- NULL only before triage; never left NULL after (FR-2.6)
  assigned_by           UUID REFERENCES users(id),
  assigned_at           TIMESTAMPTZ,

  subject               TEXT NOT NULL,
  description           TEXT NOT NULL,
  search_vector         tsvector GENERATED ALWAYS AS (
                           to_tsvector('english', subject || ' ' || coalesce(description, ''))
                         ) STORED,                                    -- generated + stored, not a bare expression index —
                                                                       -- computed once on write, not recomputed per query;
                                                                       -- coalesce() so a NULL description can't null out the whole vector

  suggested_priority    TEXT,                                         -- requester's guess (FR-1.1), label only — no SLA logic (FR-2.8)
  confirmed_priority    TEXT,                                         -- Support/Triage's call (FR-2.8); NULL until triaged, same as category

  status                TEXT NOT NULL DEFAULT 'new',
  pending_reason         TEXT,                                        -- required when status = 'pending' (FR-4.6)

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ,
  pending_confirmation_at TIMESTAMPTZ,                                 -- source for the query-time "how long has this been
                                                                       -- waiting" calculation (FR-9.6) — no job or timer reads this,
                                                                       -- it's computed on demand wherever displayed
  closed_at             TIMESTAMPTZ,

  CONSTRAINT valid_status CHECK (status IN (
    'new', 'assigned', 'in_progress', 'pending',
    'resolved', 'pending_confirmation', 'closed', 'reopened'
  )),
  CONSTRAINT valid_suggested_priority CHECK (suggested_priority IS NULL OR suggested_priority IN ('low','medium','high','urgent')),
  CONSTRAINT valid_confirmed_priority CHECK (confirmed_priority IS NULL OR confirmed_priority IN ('low','medium','high','urgent')),
  CONSTRAINT pending_needs_reason CHECK (status != 'pending' OR pending_reason IS NOT NULL)
  -- Integrity guard from the architecture review (§2.2): assignee's team must match the confirmed category's team.
  -- Enforced via trigger below rather than a plain CHECK, since it requires a cross-table lookup.
  -- Note: confirmed_priority has NO equivalent trigger — deliberate. Priority is a label only (REQUIREMENTS.md §5),
  -- it carries no team-routing consequence the way category does, so there's nothing cross-table to enforce.
);

CREATE INDEX tickets_requester_idx ON tickets (requester_id);
CREATE INDEX tickets_assigned_to_idx ON tickets (assigned_to);
CREATE INDEX tickets_site_idx ON tickets (site_id);
CREATE INDEX tickets_status_idx ON tickets (status);
CREATE INDEX tickets_priority_idx ON tickets (confirmed_priority);
CREATE INDEX tickets_search_idx ON tickets USING GIN (search_vector);
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Trigger — assignee/category consistency** (the transactional-integrity gap flagged in ARCHITECTURE_REVIEW.md §2.2):

```sql
CREATE OR REPLACE FUNCTION check_assignee_matches_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.confirmed_category_id IS NOT NULL THEN
    IF (SELECT team_id FROM users WHERE id = NEW.assigned_to)
       != (SELECT team_id FROM categories WHERE id = NEW.confirmed_category_id) THEN
      RAISE EXCEPTION 'Assignee is not a member of the confirmed category''s team';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_assignee_category_consistency
  BEFORE INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION check_assignee_matches_category();
```

This makes the constraint impossible to violate no matter which code path writes to `tickets` — the exact "don't rely on the API remembering to check" guarantee the review called for.

---

## `ticket_comments`

```sql
CREATE TABLE ticket_comments (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  ticket_id    UUID NOT NULL REFERENCES tickets(id),
  author_id    UUID NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  is_internal  BOOLEAN NOT NULL DEFAULT false,   -- hidden from requester (FR-4.4)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ticket_comments_ticket_idx ON ticket_comments (ticket_id);
```

---

## `ticket_attachments`

```sql
CREATE TABLE ticket_attachments (
  id                UUID PRIMARY KEY DEFAULT uuidv7(),
  ticket_id         UUID NOT NULL REFERENCES tickets(id),
  comment_id        UUID REFERENCES ticket_comments(id),  -- NULL if attached directly to the ticket, not a reply
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  storage_key       TEXT NOT NULL,             -- object-storage key, NOT the original filename (path-traversal guard, §2.2)
  original_filename TEXT NOT NULL,
  content_type      TEXT NOT NULL,             -- verified server-side from file bytes, not trusted from the client (§2.2)
  size_bytes         BIGINT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'safe' | 'rejected' — see § Design notes,
                                                        -- "File upload & serving architecture". Only 'safe' attachments
                                                        -- are ever downloadable; download URLs are presigned too, not proxied.
  validated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_attachment_status CHECK (status IN ('pending', 'safe', 'rejected'))
);

CREATE INDEX ticket_attachments_ticket_idx ON ticket_attachments (ticket_id);
CREATE INDEX ticket_attachments_status_idx ON ticket_attachments (status);
```

---

## `ticket_history` — append-only audit log

```sql
-- Owned by a separate migration role (e.g. `schema_owner`), NOT by the app's runtime role.
-- Table owners bypass GRANT/REVOKE in Postgres regardless of what's revoked below — if the
-- runtime role owned this table, the REVOKE at the bottom would be purely decorative.
CREATE TABLE ticket_history (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  ticket_id    UUID NOT NULL REFERENCES tickets(id),
  actor_id     UUID REFERENCES users(id),       -- NULL for system/worker-driven changes (e.g. leave auto-expiry)
  action       TEXT NOT NULL,                    -- 'created' | 'category_confirmed' | 'category_changed' |
                                                   -- 'assigned' | 'reassigned' | 'status_changed' |
                                                   -- 'resolved' | 'confirmed' | 'disputed' | 'site_corrected'
  field_changed TEXT,
  old_value    TEXT,
  new_value    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ticket_history_ticket_idx ON ticket_history (ticket_id, created_at);

-- No updated_at column, no updated_at trigger — this table is never updated, only inserted into.
-- app_runtime_role must be GRANTed INSERT + SELECT only (never the table owner):
GRANT INSERT, SELECT ON ticket_history TO app_runtime_role;
REVOKE UPDATE, DELETE ON ticket_history FROM app_runtime_role;
```

---

## `availability_requests`

```sql
CREATE TABLE availability_requests (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id      UUID NOT NULL REFERENCES users(id),      -- the Team Member requesting
  type         TEXT NOT NULL,                            -- 'range' | 'toggle' (FR-10.1)
  start_date   DATE,
  end_date     DATE,                                     -- NULL for toggle or open-ended range
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by   UUID REFERENCES users(id),                -- the Manager (FR-10.3)
  decided_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,                               -- set on auto-expiry (FR-10.7) or manual early-end (FR-10.8)

  CONSTRAINT valid_type CHECK (type IN ('range', 'toggle')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'ended', 'cancelled')),
  CONSTRAINT range_needs_start CHECK (type != 'range' OR start_date IS NOT NULL)
);

CREATE INDEX availability_requests_user_idx ON availability_requests (user_id, status);
```

The worker's leave-expiry job (build plan step 6) runs **once daily**, checking only the date (not time-of-day) — it scans for `status = 'approved' AND type = 'range' AND end_date < CURRENT_DATE`, flips `users.is_unavailable` back to `false`, and sets `ended_at`. Daily cadence deliberately reduces load and shrinks the already-small window for an idempotency collision; a Postgres advisory lock around the job is still kept as cheap insurance even though daily runs make overlap unlikely. That job is the *only* code path allowed to write `users.is_unavailable`, alongside the Manager-approval path — enforced by convention plus a code-review rule, since Postgres itself can't easily express "only these two call sites may write this column."

---

## `notifications` (outbound log, per FR-5.4)

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id     UUID NOT NULL REFERENCES users(id),
  ticket_id   UUID REFERENCES tickets(id),
  channel     TEXT NOT NULL DEFAULT 'email',
  subject     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'sent' | 'failed'
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_status CHECK (status IN ('pending', 'sent', 'failed'))
);
```

---

## Design notes

- **UUIDv7, not UUIDv4, for primary keys.** Postgres 18 (stable since Sept 2025, current as of this project) ships a native `uuidv7()` function. UUIDv7 embeds a timestamp in its high bits, so inserts land sequentially in B-tree indexes instead of scattering randomly the way UUIDv4 does — cited benchmarks show 2–10x insert throughput improvement and meaningfully smaller indexes on large tables. The one tradeoff: a UUIDv7 value leaks its creation timestamp if ever exposed externally. That's why `ticket_number` (not the raw `id`) is the only identifier meant to appear in a URL or be user-facing — this was already the design, so the tradeoff costs nothing here.
  - *Pre-Postgres-18 fallback*: if the deployment target is ever pinned to an older major version, generate UUIDv7 values in the application layer instead (most language UUID libraries support it) and store them in the same native `uuid` column — the index-locality benefit comes from the value's bit layout, not from where it was generated.
- **TEXT + CHECK constraints instead of Postgres ENUM types** for status fields — deliberate. Native ENUMs are marginally faster but require `ALTER TYPE` (with caveats) to add a value; given how much this spec has iterated already, `CHECK` constraints are one line to update in a migration and cost nothing in practice at this scale.
- **`is_unavailable` is denormalized** onto `users` rather than computed live from `availability_requests` on every read — Support/Triage's assignee list and Manager's reassignment view both need this on every ticket action (FR-2.2, FR-3.2), and recomputing "is there an approved, currently-in-range request" on every such read is wasteful. The tradeoff is exactly one thing to keep in sync (the approval + expiry job), which is a small, well-defined surface.
- **Full-text search** is a `GENERATED ALWAYS ... STORED` column, not a bare expression index — computed once on write rather than recomputed on every query plan, and `coalesce()`-guarded so a NULL `description` can't silently null out the whole search vector for that row.
- **`ticket_history` has no update/delete grant for the app's runtime role, and is owned by a separate role** — both parts matter. `REVOKE` alone is decorative if the same role that runs migrations also runs the app, since Postgres table owners bypass grants entirely regardless of what's revoked.
- **`updated_at` is maintained by a trigger** (`set_updated_at()`), not by application code remembering to set it on every write — one missed `UPDATE` statement anywhere in the codebase would otherwise silently leave that column stale.
- **Not included: Row-Level Security.** All access scoping lives in one shared API-layer authorization module by design (per ARCHITECTURE_REVIEW.md §2.1). Postgres RLS policies would add a second, database-enforced copy of the same rules — genuine defense-in-depth, but genuine added complexity too. Left out deliberately rather than decided silently; worth adding if you want belt-and-suspenders enforcement independent of the API layer.

## File upload & serving architecture (resolved)

Presigned URLs in both directions, never proxied through the API, with async validation between upload and servability:

1. Client requests a presigned **upload** URL from the API; API creates the `ticket_attachments` row with `status = 'pending'`.
2. Client uploads directly to MinIO using that URL — file bytes never touch the API server.
3. Client confirms completion with the API, which enqueues a validation job on the worker.
4. The worker inspects the actual file bytes (real content-type detection, size check, extensible to antivirus later) and sets `status` to `'safe'` or `'rejected'`.
5. Only `'safe'` attachments are ever downloadable, and downloads are **also** presigned URLs — the API issues a short-lived presigned GET URL rather than streaming the file itself. This is what makes repeated downloads by many different users (a ticket attachment viewed by Support/Triage, the assigned member, and the requester) cost nothing extra on the API server, no matter how often it's requested.

This resolves the security-vs-efficiency tension directly rather than trading one for the other: validation still inspects real bytes before anything is servable (the security review's requirement), while neither uploads nor downloads ever burden the API server (the efficiency requirement) — see API_CONTRACT.md §6 for the actual endpoints.
