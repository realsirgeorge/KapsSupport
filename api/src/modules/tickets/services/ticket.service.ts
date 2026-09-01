import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TicketStateMachine, TicketStatus } from '../states/ticket-state-machine';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { withActor } from '../../../database/with-actor';

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

  /** team_id means team membership, not management — see with-actor.ts / manager.service.ts for the same fix elsewhere. */
  private async getManagesTeamId(userId: string): Promise<string | null> {
    const [team] = await this.dataSource.query('SELECT id FROM teams WHERE manager_id = $1 LIMIT 1', [userId]);
    return team ? team.id : null;
  }

  /**
   * Shared authorization module: scope tickets by user's role and team/site.
   * Returns SQL WHERE conditions (ANDed) and their params, starting at $1.
   *
   * FR-3.4 (Manager sees all team tickets) and FR-4.1/4.2 (Team Member sees
   * ONLY their own assigned + own created, never a teammate's) are
   * different visibility rules, even though both roles have a team_id.
   * Deriving manages_team_id here is what actually distinguishes them --
   * checking team_id alone would (and until this fix, did) grant every
   * plain Team Member manager-level visibility into the whole team.
   */
  private async scopeTicketsForUser(user: User): Promise<{ conditions: string[]; params: any[] }> {
    if (user.is_admin || user.is_executive || user.is_support_triage) {
      // Admin, Executive, and Support/Triage see all tickets
      return { conditions: [], params: [] };
    }

    const managesTeamId = await this.getManagesTeamId(user.id);
    if (managesTeamId) {
      // Manager: own created + entire team's tickets regardless of holder (FR-3.4/3.6)
      return {
        conditions: [
          `(ticket.requester_id = $1 OR ticket.confirmed_category_id IN (SELECT id FROM categories WHERE team_id = $2))`,
        ],
        params: [user.id, managesTeamId],
      };
    }

    if (user.team_id) {
      // Team Member: ONLY tickets assigned to them + tickets they created (FR-4.1/4.2)
      return {
        conditions: ['(ticket.requester_id = $1 OR ticket.assigned_to = $1)'],
        params: [user.id],
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
    const scope = await this.scopeTicketsForUser(user);
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
      `SELECT ticket.*, c.name as category_name, s.name as site_name, au.name as assignee_name
       FROM tickets ticket
       LEFT JOIN categories c ON ticket.confirmed_category_id = c.id
       LEFT JOIN sites s ON ticket.site_id = s.id
       LEFT JOIN users au ON ticket.assigned_to = au.id
       ${whereClause}
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
    const scope = await this.scopeTicketsForUser(user);
    const params = [...scope.params, ticketId];
    const conditions = [...scope.conditions, `ticket.id = $${params.length}`];

    const [ticket] = await this.dataSource.query(
      `SELECT ticket.*, c.name as category_name, s.name as site_name,
              au.name as assignee_name, ru.name as requester_name
       FROM tickets ticket
       LEFT JOIN categories c ON ticket.confirmed_category_id = c.id
       LEFT JOIN sites s ON ticket.site_id = s.id
       LEFT JOIN users au ON ticket.assigned_to = au.id
       LEFT JOIN users ru ON ticket.requester_id = ru.id
       WHERE ${conditions.join(' AND ')}`,
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

    const [updatedTicket] = await withActor(this.dataSource, user.id, (manager) =>
      manager.query(
        `UPDATE tickets
         SET status = $1,
             pending_reason = $2,
             updated_at = now()
             ${resolvedAtClause}
             ${pendingConfirmationAtClause}
         WHERE id = $3
         RETURNING *`,
        [finalStatus, newStatus === TicketStatus.PENDING ? pending_reason : null, ticketId],
      ),
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
      [updatedTicket] = await withActor(this.dataSource, requester.id, (manager) =>
        manager.query(
          `UPDATE tickets SET status = $1, closed_at = now(), updated_at = now() WHERE id = $2 RETURNING *`,
          [TicketStatus.CLOSED, ticketId],
        ),
      );

      this.eventEmitter.emit('ticket.confirmed', { ticket: updatedTicket, actor_id: requester.id });
    } else {
      // Reopen and return to same Team Member (assigned_to stays the same)
      [updatedTicket] = await withActor(this.dataSource, requester.id, (manager) =>
        manager.query(
          `UPDATE tickets SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
          [TicketStatus.REOPENED, ticketId],
        ),
      );

      this.eventEmitter.emit('ticket.disputed', {
        ticket: updatedTicket,
        actor_id: requester.id,
        dispute_reason: comment,
      });
    }

    return updatedTicket;
  }

  /**
   * Recent audit trail entries across whatever tickets this user is
   * authorized to see (same scoping as listTickets), for a "live activity"
   * feed. actor_id can be null for history rows recorded before the
   * app.current_user_id fix — actor_name is null in that case too.
   */
  async getRecentActivity(user: User, limit = 8): Promise<any[]> {
    const scope = await this.scopeTicketsForUser(user);
    const params = [...scope.params];
    const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(' AND ')}` : '';

    return this.dataSource.query(
      `SELECT h.id, h.action, h.field_changed, h.old_value, h.new_value, h.created_at,
              ticket.ticket_number, ticket.id as ticket_id,
              a.name as actor_name
       FROM ticket_history h
       JOIN tickets ticket ON h.ticket_id = ticket.id
       LEFT JOIN users a ON h.actor_id = a.id
       ${whereClause}
       ORDER BY h.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );
  }
}
