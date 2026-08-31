# Sequence Diagrams — Support Ticketing System

Mermaid source, rendered in chat during the design phase. Companion to API_CONTRACT.md.

---

## 1. Core ticket lifecycle (create → triage → assign → resolve → confirm)

```mermaid
sequenceDiagram
  participant R as Requester
  participant A as API
  participant D as Postgres
  participant S as Support/Triage
  participant T as Team Member

  R->>A: POST /tickets
  A->>D: INSERT ticket (status=new) + audit row
  D-->>A: ticket_number
  A-->>R: 201 created

  S->>A: POST /tickets/:id/category/confirm
  A->>D: UPDATE confirmed_category_id + audit row
  A-->>S: 200 ok

  S->>A: POST /tickets/:id/assign
  A->>D: check assignee team matches category, not unavailable
  D-->>A: ok (trigger enforced)
  A->>D: UPDATE assigned_to, status=assigned + audit row
  A-->>S: 200 ok

  T->>A: PATCH /tickets/:id/status (in_progress)
  A->>D: UPDATE status + audit row
  A-->>T: 200 ok

  T->>A: PATCH /tickets/:id/status (resolved)
  A->>D: UPDATE status=pending_confirmation + audit row
  A-->>T: 200 ok

  R->>A: POST /tickets/:id/confirm-resolution (confirm)
  A->>D: UPDATE status=closed + audit row
  A-->>R: 200 ok
```

**Key property this makes visible:** every state-changing call writes an audit row in the same step as the mutation — no code path exists that can change ticket state without also logging it (ARCHITECTURE_REVIEW.md §2.2). The `check assignee team matches category` step is the API-level mirror of the DB trigger in DB_SCHEMA.md — the API check gives a clean error message, the DB trigger is the actual, unbypassable guarantee.

**Not shown, but real:** the dispute path (requester disputes → reopened → back to the same Team Member, FR-9.4) is a separate, shorter sequence off the same `pending_confirmation` state — worth drawing if useful later, omitted here to keep the main flow readable. There is deliberately no auto-close sequence: a ticket in `pending_confirmation` stays there indefinitely until the requester acts, with no worker job that times it out (REQUIREMENTS.md §4.9).

---

## 2. Auth flow (login, SSR, cookie session, CSRF)

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next.js (SSR)
  participant A as API
  participant D as Postgres

  B->>N: GET /login
  N->>A: request CSRF token
  A-->>N: csrf_token
  N-->>B: login page (csrf_token embedded)

  B->>A: POST /auth/login (email, password, csrf_token)
  A->>A: validate csrf_token, check rate limit
  A->>D: verify password_hash
  D-->>A: user record
  A-->>B: Set-Cookie session (HttpOnly, Secure, SameSite)

  B->>N: GET /dashboard (cookie sent automatically)
  N->>A: forward request (cookie attached)
  A->>A: validate session, resolve role, scope query
  A->>D: SELECT scoped tickets
  D-->>A: rows
  A-->>N: scoped data
  N-->>B: rendered page
```

**Why cookie-based, not a bearer token in browser storage:** a token in `localStorage`/`sessionStorage` is readable by any injected script — an XSS vulnerability becomes a full session-theft vulnerability. An `HttpOnly` cookie never touches JavaScript at all. The direct cost of that choice is CSRF exposure (cookies are sent automatically by the browser on every request to the domain, including ones the user didn't intend), which is why every mutating request requires a CSRF token — this isn't a separate feature, it's the other half of the cookie decision.

**SSO variant (not diagrammed):** same shape after the redirect — `GET /auth/sso/:provider` sends the browser to the provider, the provider redirects back to `/auth/sso/:provider/callback`, and from that point the flow rejoins the diagram above at "Set-Cookie session."
