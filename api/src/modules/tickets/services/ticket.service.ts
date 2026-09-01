import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TicketStateMachine, TicketStatus } from '../states/ticket-state-machine';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface User {
  id: string;
  email: string;
  name: string;
  team_id?: string;
  is_admin: boolean;
  is_support_triage: boolean;
  is_executive: boolean;
  is_unavailable: boolean;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  requester_id: string;
  site_id: string;
  suggested_category_id?: string;
  confirmed_category_id?: string;
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: Date;
  subject: string;
  description: string;
  suggested_priority?: string;
  confirmed_priority?: string;
  status: TicketStatus;
  pending_reason?: string;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
  pending_confirmation_at?: Date;
  closed_at?: Date;
}

@Injectable()
export class TicketService {
  private stateMachine: TicketStateMachine;

  constructor(
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {
    this.stateMachine = new TicketStateMachine();
  }

  /**
   * Shared authorization module: scope tickets by user's role and team/site.
   * Returns SQL WHERE conditions (ANDed) and their params, starting at $1.
   */
  private scopeTicketsForUser(user: User): { conditions: string[]; params: any[] } {
    if (user.is_admin || user.is_executive || user.is_support_triage) {
      // Admin, Executive, and Support/Triage see all tickets
      return { conditions: [], params: [] };
    }

    if (user.team_id) {
      // Team Member / Manager: see own created + own team's + own assigned
      return {
        conditions: [
          `(ticket.requester_id = $1 OR ticket.assigned_to = $1 OR ticket.confirmed_category_id IN (SELECT id FROM categories WHERE team_id = $2))`,
        ],
        params: [user.id, user.team_id],
      };
    }

    // Requester (no team): see only own tickets
    return { conditions: ['ticket.requester_id = $1'], params: [user.id] };
  }

  /**
   * List tickets with role-based scoping.
   */
  async listTickets(
    user: User,
    options: {
      status?: string;
      mine?: boolean;
      assigned_to_me?: boolean;
      team_id?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ data: Ticket[]; total: number; page: number; limit: number }> {
    const scope = this.scopeTicketsForUser(user);
    const conditions = [...scope.conditions];
    const params = [...scope.params];

    if (options.mine) {
      params.push(user.id);
      conditions.push(`ticket.requester_id = $${params.length}`);
    }

    if (options.assigned_to_me) {
      params.push(user.id);
      conditions.push(`ticket.assigned_to = $${params.length}`);
    }

    if (options.status) {
      params.push(options.status);
      conditions.push(`ticket.status = $${params.length}`);
    }

    if (options.team_id && (user.is_admin || user.is_support_triage)) {
      params.push(options.team_id);
      conditions.push(
        `ticket.confirmed_category_id IN (SELECT id FROM categories WHERE team_id = $${params.length})`,
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const page = options.page || 1;
    const limit = Math.min(options.limit || 25, 100);
    const offset = (page - 1) * limit;

    const countResult = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM tickets ticket ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0].count || '0', 10);

    const data = await this.dataSource.query(
      `SELECT ticket.* FROM tickets ticket ${whereClause}
       ORDER BY ticket.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return { data, total, page, limit };
  }

  /**
   * Get a single ticket (with authorization check).
   */
  async getTicket(ticketId: string, user: User): Promise<Ticket> {
    const scope = this.scopeTicketsForUser(user);
    const params = [...scope.params, ticketId];
    const conditions = [...scope.conditions, `ticket.id = $${params.length}`];

    const [ticket] = await this.dataSource.query(
      `SELECT ticket.* FROM tickets ticket WHERE ${conditions.join(' AND ')}`,
      params,
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found or access denied');
    }

    // Compute pending_confirmation_days
    if (ticket.status === TicketStatus.PENDING_CONFIRMATION && ticket.pending_confirmation_at) {
      const days = Math.floor(
        (Date.now() - new Date(ticket.pending_confirmation_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      (ticket as any).pending_confirmation_days = days;
    }

    return ticket;
  }

  /**
   * Create a new ticket.
   */
  async createTicket(
    data: {
      subject: string;
      description: string;
      site_id: string;
      suggested_category_id?: string;
      suggested_priority?: string;
    },
    requesterId: string,
  ): Promise<Ticket> {
    // Generate ticket number (e.g., TCK-2026-00001)
    const year = new Date().getFullYear();
    const [lastTicket] = await this.dataSource.query(
      `SELECT ticket_number FROM tickets WHERE ticket_number LIKE $1 ORDER BY created_at DESC LIMIT 1`,
      [`TCK-${year}-%`],
    );

    const lastNumber = lastTicket && lastTicket.ticket_number
      ? parseInt(lastTicket.ticket_number.split('-')[2])
      : 0;
    const ticket_number = `TCK-${year}-${String(lastNumber + 1).padStart(5, '0')}`;

    const [ticket] = await this.dataSource.query(
      `INSERT INTO tickets
        (ticket_number, requester_id, site_id, suggested_category_id, suggested_priority,
         subject, description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
       RETURNING *`,
      [
        ticket_number,
        requesterId,
        data.site_id,
        data.suggested_category_id || null,
        data.suggested_priority || null,
        data.subject,
        data.description,
        TicketStatus.NEW,
      ],
    );

    this.eventEmitter.emit('ticket.created', { ticket, actor_id: requesterId });

    return ticket;
  }

  /**
   * Update ticket status (state machine validation).
   */
  async updateStatus(
    ticketId: string,
    newStatus: TicketStatus,
    user: User,
    pending_reason?: string,
  ): Promise<Ticket> {
    const ticket = await this.getTicket(ticketId, user);

    // Only assigned Team Member can update status (for now)
    if (ticket.assigned_to !== user.id && !user.is_admin) {
      throw new ForbiddenException('Only assigned member can update status');
    }

    // Validate state transition
    const validation = this.stateMachine.validateTransition(ticket.status as TicketStatus, newStatus);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    // Validate pending reason if needed
    if (newStatus === TicketStatus.PENDING && !pending_reason) {
      throw new BadRequestException('Pending reason is required');
    }

    let finalStatus = newStatus;
    let resolvedAtClause = '';
    let pendingConfirmationAtClause = '';

    if (newStatus === TicketStatus.RESOLVED) {
      // Team Member marks resolved → actually transitions to pending_confirmation
      finalStatus = TicketStatus.PENDING_CONFIRMATION;
      resolvedAtClause = ', resolved_at = now()';
      pendingConfirmationAtClause = ', pending_confirmation_at = now()';
    }

    const [updatedTicket] = await this.dataSource.query(
      `UPDATE tickets
       SET status = $1,
           pending_reason = $2,
           updated_at = now()
           ${resolvedAtClause}
           ${pendingConfirmationAtClause}
       WHERE id = $3
       RETURNING *`,
      [finalStatus, newStatus === TicketStatus.PENDING ? pending_reason : null, ticketId],
    );

    // Emit event for audit logging and notifications
    this.eventEmitter.emit('ticket.status_changed', {
      ticket: updatedTicket,
      old_status: ticket.status,
      new_status: finalStatus,
      actor_id: user.id,
    });

    return updatedTicket;
  }

  /**
   * Confirm ticket resolution (Requester only).
   */
  async confirmResolution(
    ticketId: string,
    action: 'confirm' | 'dispute',
    requester: User,
    comment?: string,
  ): Promise<Ticket> {
    const ticket = await this.getTicket(ticketId, requester);

    // Only requester can confirm/dispute
    if (ticket.requester_id !== requester.id) {
      throw new ForbiddenException('Only requester can confirm resolution');
    }

    if (ticket.status !== TicketStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Ticket is not pending confirmation');
    }

    let updatedTicket: Ticket;

    if (action === 'confirm') {
      [updatedTicket] = await this.dataSource.query(
        `UPDATE tickets SET status = $1, closed_at = now(), updated_at = now() WHERE id = $2 RETURNING *`,
        [TicketStatus.CLOSED, ticketId],
      );

      this.eventEmitter.emit('ticket.confirmed', { ticket: updatedTicket, actor_id: requester.id });
    } else {
      // Reopen and return to same Team Member (assigned_to stays the same)
      [updatedTicket] = await this.dataSource.query(
        `UPDATE tickets SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [TicketStatus.REOPENED, ticketId],
      );

      this.eventEmitter.emit('ticket.disputed', {
        ticket: updatedTicket,
        actor_id: requester.id,
        dispute_reason: comment,
      });
    }

    return updatedTicket;
  }
}
