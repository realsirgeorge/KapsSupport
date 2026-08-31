import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { TicketStateMachine, TicketStatus } from '../states/ticket-state-machine';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Temporary: inline entity interfaces (entities would be separate files)
interface User {
  id: string;
  email: string;
  name: string;
  team_id?: string;
  is_admin: boolean;
  is_support_triage: boolean;
  is_executive: boolean;
  is_unavailable: boolean;
}

interface Ticket {
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
  private ticketsRepository: Repository<Ticket>;

  constructor(
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {
    this.stateMachine = new TicketStateMachine();
    this.ticketsRepository = this.dataSource.getRepository('tickets');
  }

  /**
   * Shared authorization module: scope tickets by user's role and team/site.
   * Returns a filtered query builder that enforces what this user can see.
   */
  private scopeTicketsForUser(user: User): SelectQueryBuilder<Ticket> {
    let query = this.ticketsRepository.createQueryBuilder('ticket');

    if (user.is_admin || user.is_executive) {
      // Admin and Executive see all tickets
      return query;
    }

    if (user.is_support_triage) {
      // Support/Triage sees all tickets
      return query;
    }

    if (user.team_id) {
      // Team Member / Manager: see own created + own team's + own assigned
      query = query.where('ticket.requester_id = :userId', { userId: user.id })
        .orWhere('ticket.assigned_to = :userId', { userId: user.id });

      // If Manager, also see team's tickets
      // (would check if user.manages_team_id exists)
      return query;
    }

    // Requester (no team): see only own tickets
    return query.where('ticket.requester_id = :userId', { userId: user.id });
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
    let query = this.scopeTicketsForUser(user);

    // Apply filters
    if (options.mine) {
      query = query.andWhere('ticket.requester_id = :userId', { userId: user.id });
    }

    if (options.assigned_to_me) {
      query = query.andWhere('ticket.assigned_to = :userId', { userId: user.id });
    }

    if (options.status) {
      query = query.andWhere('ticket.status = :status', { status: options.status });
    }

    if (options.team_id && (user.is_admin || user.is_support_triage)) {
      // Only Admin/Support can filter by team
      query = query.andWhere('category.team_id = :teamId', { teamId: options.team_id });
    }

    // Pagination
    const page = options.page || 1;
    const limit = Math.min(options.limit || 25, 100); // Max 100
    const skip = (page - 1) * limit;

    const [data, total] = await query
      .skip(skip)
      .take(limit)
      .orderBy('ticket.created_at', 'DESC')
      .getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * Get a single ticket (with authorization check).
   */
  async getTicket(ticketId: string, user: User): Promise<Ticket> {
    const query = this.scopeTicketsForUser(user);
    const ticket = await query.andWhere('ticket.id = :ticketId', { ticketId }).getOne();

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
    const lastTicket = await this.ticketsRepository
      .createQueryBuilder('ticket')
      .orderBy('ticket.created_at', 'DESC')
      .limit(1)
      .getOne();

    const lastNumber = lastTicket && lastTicket.ticket_number
      ? parseInt(lastTicket.ticket_number.split('-')[2])
      : 0;
    const ticket_number = `TCK-${year}-${String(lastNumber + 1).padStart(5, '0')}`;

    const ticket = this.ticketsRepository.create({
      ...data,
      ticket_number,
      requester_id: requesterId,
      status: TicketStatus.NEW,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.ticketsRepository.save(ticket);

    // Emit event for audit logging
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

    // Update ticket
    ticket.status = newStatus;
    if (newStatus === TicketStatus.PENDING) {
      ticket.pending_reason = pending_reason;
    } else {
      ticket.pending_reason = null;
    }

    if (newStatus === TicketStatus.RESOLVED) {
      // Team Member marks resolved → actually transitions to pending_confirmation
      ticket.status = TicketStatus.PENDING_CONFIRMATION;
      ticket.resolved_at = new Date();
      ticket.pending_confirmation_at = new Date();
    }

    ticket.updated_at = new Date();
    await this.ticketsRepository.save(ticket);

    // Emit event for audit logging and notifications
    this.eventEmitter.emit('ticket.status_changed', {
      ticket,
      old_status: ticket.status,
      new_status: newStatus,
      actor_id: user.id,
    });

    return ticket;
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

    if (action === 'confirm') {
      ticket.status = TicketStatus.CLOSED;
      ticket.closed_at = new Date();

      this.eventEmitter.emit('ticket.confirmed', { ticket, actor_id: requester.id });
    } else if (action === 'dispute') {
      // Reopen and return to same Team Member
      ticket.status = TicketStatus.REOPENED;
      // assigned_to stays the same (returns to same Team Member, not Support/Triage)

      this.eventEmitter.emit('ticket.disputed', {
        ticket,
        actor_id: requester.id,
        dispute_reason: comment,
      });
    }

    ticket.updated_at = new Date();
    await this.ticketsRepository.save(ticket);

    return ticket;
  }

  /**
   * Confirm category (Support/Triage only).
   */
  async confirmCategory(
    ticketId: string,
    categoryId: string,
    user: User,
  ): Promise<{ ticket: Ticket; reassignment_required: boolean }> {
    if (!user.is_support_triage && !user.is_admin) {
      throw new ForbiddenException('Only Support/Triage can confirm category');
    }

    const ticket = await this.getTicket(ticketId, user);

    ticket.confirmed_category_id = categoryId;
    ticket.updated_at = new Date();
    await this.ticketsRepository.save(ticket);

    // Check if current assignee is in the new category's team
    let reassignment_required = false;
    if (ticket.assigned_to) {
      // Would query to verify assignee.team matches category.team
      // For now, assume it's validated by DB trigger
      reassignment_required = false;
    }

    this.eventEmitter.emit('ticket.category_confirmed', {
      ticket,
      category_id: categoryId,
      actor_id: user.id,
    });

    return { ticket, reassignment_required };
  }

  /**
   * Assign ticket (Support/Triage or Manager).
   */
  async assign(
    ticketId: string,
    assignee_id: string,
    user: User,
  ): Promise<Ticket> {
    if (!user.is_support_triage && !user.is_admin && !user.team_id) {
      throw new ForbiddenException('Not authorized to assign');
    }

    const ticket = await this.getTicket(ticketId, user);

    // Validate assignee isn't unavailable
    // Would query user table here
    // const assignee = await this.usersRepository.findOne(assignee_id);
    // if (assignee.is_unavailable) throw new BadRequestException('Assignee is unavailable');

    ticket.assigned_to = assignee_id;
    ticket.assigned_by = user.id;
    ticket.assigned_at = new Date();
    ticket.status = TicketStatus.ASSIGNED;
    ticket.updated_at = new Date();

    await this.ticketsRepository.save(ticket);

    this.eventEmitter.emit('ticket.assigned', {
      ticket,
      assignee_id,
      actor_id: user.id,
    });

    return ticket;
  }
}
