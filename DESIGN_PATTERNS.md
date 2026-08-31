# Design Pattern Decision — Support Ticketing System

Companion to REQUIREMENTS.md (ticket lifecycle, §3), ARCHITECTURE_AND_PLAN.md (build plan step 5), API_CONTRACT.md.

---

## Decision: State pattern, as the core architectural choice

The ticket lifecycle (`New → Assigned → In Progress ⇄ Pending → Resolved → Pending Confirmation → Closed/Reopened`, REQUIREMENTS.md §3) is implemented as the **State pattern**: each status is its own state object/class that knows exactly which transitions are legal from itself, and rejects everything else. There is exactly one place in the codebase that answers "is this transition allowed" — not a `switch` statement duplicated across services, not an assumption baked into each controller method.

**Why this is the one decision that matters most,** out of everything considered (Strategy, Observer, Facade, Adapter, Factory Method, Singleton): nearly every functional requirement in this system is actually a rule about which transitions are legal from which state — category must be confirmed before assignment (FR-2.6), a Team Member can't skip to Resolved without going through In Progress (FR-4.3), a dispute reopens and returns to the same Team Member rather than any other transition (FR-9.4), a ticket in Pending Confirmation never auto-closes (REQUIREMENTS.md §4.9). These aren't incidental details layered onto the system — they're what the system is *for*. Getting the State implementation right is worth more scrutiny and care than any other single technical decision in this project.

## Supporting patterns — not separate decisions, consequences of this one

Once the ticket lifecycle is a proper State machine, three other patterns fall out naturally rather than needing to be chosen independently:

- **Strategy** (role-based scoping in the auth Guard) — governs what a caller is even allowed to *attempt*, before the State machine runs at all. Also the natural fit for the SSO/local auth methods (FR-12.1/12.2) and notification-channel selection.
- **Observer** (audit logging + notifications via NestJS's `@nestjs/event-emitter`) — the State machine emits an event on every transition; audit logging and notification dispatch are separate listeners subscribed to that event, rather than being called manually inside every service method. This upgrades the audit-trail guarantee (FR-9.2, FR-8.2) from "the code remembered to log it" to "structurally cannot be skipped," since the listener isn't duplicated per call site.
- **Facade** (the service layer, e.g. `TicketService`) — the thin coordinating layer that calls the State machine, and nothing else reaches past it into state-machine internals directly. Controllers stay thin; complexity stays in one place.

## Considered, not adopted as first-class

- **Adapter** — real but narrow: normalizing the three SSO providers' different OAuth quirks, and later normalizing notification channels (email now, Slack/Teams potentially later) behind one interface. Worth using where it applies, not a project-wide concern.
- **Factory Method** — real but narrow: the `/me/counters` endpoint returns a different shape per caller role; a small builder-factory keyed on role fits there. Not a broader pattern across the system.
- **Singleton** — not needed. NestJS's dependency injection container already makes every service singleton-scoped by default; implementing this pattern by hand would just be redundant with what the framework already provides.

## Where this lands in the build plan

Directly shapes ARCHITECTURE_AND_PLAN.md step 5 ("the ticket state machine as a first-class module rather than scattered logic") — this document is what "first-class module" concretely means: a State pattern implementation, not a set of status-string checks scattered across services.
