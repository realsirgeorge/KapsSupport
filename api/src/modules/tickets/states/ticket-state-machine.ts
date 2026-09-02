export enum TicketStatus {
  NEW = 'new',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  PENDING = 'pending',
  RESOLVED = 'resolved',
  PENDING_CONFIRMATION = 'pending_confirmation',
  CLOSED = 'closed',
  REOPENED = 'reopened',
}

/**
 * The statuses that count as "still open" — i.e. still somebody's work.
 *
 * `resolved` belongs here: the ticket is waiting on the requester to confirm,
 * so it can still come back as `reopened`. Only `pending_confirmation` and
 * `closed` are out.
 *
 * This lives beside the state machine because it is a statement about the
 * state machine, and because every dashboard that counts "open tickets" has to
 * agree on it. They did not: the manager's team stats hard-coded a narrower
 * three-status list, so a manager saw 7 open tickets on the page while the
 * sidebar badge for that same team said 9. Two numbers for one question is
 * worse than either number being wrong, because there is no way to tell which
 * one to trust.
 */
export const OPEN_STATUSES: readonly string[] = [
  TicketStatus.NEW,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.PENDING,
  TicketStatus.RESOLVED,
  TicketStatus.REOPENED,
];

export interface StateTransition {
  from: TicketStatus;
  to: TicketStatus;
  roles?: string[];
  requiresReason?: boolean;
}

// State pattern: each status knows what transitions are legal from itself
abstract class TicketState {
  abstract canTransitionTo(newStatus: TicketStatus): boolean;
  abstract allowedTransitions(): TicketStatus[];
}

class NewState extends TicketState {
  canTransitionTo(newStatus: TicketStatus): boolean {
    return newStatus === TicketStatus.ASSIGNED;
  }
  allowedTransitions(): TicketStatus[] {
    return [TicketStatus.ASSIGNED];
  }
}

class AssignedState extends TicketState {
  canTransitionTo(newStatus: TicketStatus): boolean {
    return [TicketStatus.IN_PROGRESS, TicketStatus.PENDING].includes(newStatus);
  }
  allowedTransitions(): TicketStatus[] {
    return [TicketStatus.IN_PROGRESS, TicketStatus.PENDING];
  }
}

class InProgressState extends TicketState {
  canTransitionTo(newStatus: TicketStatus): boolean {
    return [TicketStatus.PENDING, TicketStatus.RESOLVED].includes(newStatus);
  }
  allowedTransitions(): TicketStatus[] {
    return [TicketStatus.PENDING, TicketStatus.RESOLVED];
  }
}

class PendingState extends TicketState {
  canTransitionTo(newStatus: TicketStatus): boolean {
    return [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED].includes(newStatus);
  }
  allowedTransitions(): TicketStatus[] {
    return [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED];
  }
}

class ResolvedState extends TicketState {
  canTransitionTo(newStatus: TicketStatus): boolean {
    return newStatus === TicketStatus.PENDING_CONFIRMATION;
  }
  allowedTransitions(): TicketStatus[] {
    return [TicketStatus.PENDING_CONFIRMATION];
  }
}

class PendingConfirmationState extends TicketState {
  canTransitionTo(newStatus: TicketStatus): boolean {
    return [TicketStatus.CLOSED, TicketStatus.REOPENED].includes(newStatus);
  }
  allowedTransitions(): TicketStatus[] {
    return [TicketStatus.CLOSED, TicketStatus.REOPENED];
  }
}

class ClosedState extends TicketState {
  canTransitionTo(): boolean {
    return false;
  }
  allowedTransitions(): TicketStatus[] {
    return [];
  }
}

class ReopenedState extends TicketState {
  canTransitionTo(newStatus: TicketStatus): boolean {
    return [TicketStatus.IN_PROGRESS, TicketStatus.PENDING].includes(newStatus);
  }
  allowedTransitions(): TicketStatus[] {
    return [TicketStatus.IN_PROGRESS, TicketStatus.PENDING];
  }
}

export class TicketStateMachine {
  private states = new Map<TicketStatus, TicketState>();

  constructor() {
    this.states.set(TicketStatus.NEW, new NewState());
    this.states.set(TicketStatus.ASSIGNED, new AssignedState());
    this.states.set(TicketStatus.IN_PROGRESS, new InProgressState());
    this.states.set(TicketStatus.PENDING, new PendingState());
    this.states.set(TicketStatus.RESOLVED, new ResolvedState());
    this.states.set(TicketStatus.PENDING_CONFIRMATION, new PendingConfirmationState());
    this.states.set(TicketStatus.CLOSED, new ClosedState());
    this.states.set(TicketStatus.REOPENED, new ReopenedState());
  }

  isValidTransition(currentStatus: TicketStatus, newStatus: TicketStatus): boolean {
    const state = this.states.get(currentStatus);
    if (!state) return false;
    return state.canTransitionTo(newStatus);
  }

  getAllowedTransitions(currentStatus: TicketStatus): TicketStatus[] {
    const state = this.states.get(currentStatus);
    return state ? state.allowedTransitions() : [];
  }

  validateTransition(
    currentStatus: TicketStatus,
    newStatus: TicketStatus,
  ): { valid: boolean; error?: string } {
    if (!this.isValidTransition(currentStatus, newStatus)) {
      const allowed = this.getAllowedTransitions(currentStatus);
      return {
        valid: false,
        error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(', ')}`,
      };
    }
    return { valid: true };
  }
}
