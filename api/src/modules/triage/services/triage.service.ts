import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { withActor } from '../../../database/with-actor';

export interface User {
  id: string;
  email?: string;
  team_id?: string;
  is_support_triage: boolean;
  is_admin: boolean;
  is_executive?: boolean;
}

@Injectable()
export class TriageService {
  constructor(
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  /** team_id means team membership, not management — see with-actor.ts / manager.service.ts for the same fix elsewhere. */
  private async getManagesTeamId(userId: string): Promise<string | null> {
    const [team] = await this.dataSource.query('SELECT id FROM teams WHERE manager_id = $1 LIMIT 1', [userId]);
    return team ? team.id : null;
  }

  /**
   * GET /triage/queue - List tickets needing triage
   * Tickets with status = 'new' OR confirmed_category_id IS NULL OR assigned_to IS NULL
   */
  async getQueue(user: User) {
    if (!user.is_support_triage && !user.is_admin) {
      throw new ForbiddenException('Only Support/Triage can access queue');
    }

    const query = `
      SELECT t.id, t.ticket_number, t.subject, t.status,
             t.confirmed_category_id, t.assigned_to, t.created_at,
             t.suggested_category_id, t.suggested_priority,
             c.name as category_name, u.name as requester_name,
             s.name as site_name
      FROM tickets t
      LEFT JOIN categories c ON t.suggested_category_id = c.id
      LEFT JOIN users u ON t.requester_id = u.id
      LEFT JOIN sites s ON t.site_id = s.id
      WHERE t.status = 'new'
         OR t.confirmed_category_id IS NULL
         OR t.assigned_to IS NULL
      ORDER BY t.created_at ASC
    `;

    const tickets = await this.dataSource.query(query);
    return { data: tickets };
  }

  /**
   * POST /tickets/:id/category/confirm - Confirm/correct category
   * Support/Triage only
   */
  async confirmCategory(
    ticketId: string,
    categoryId: string,
    user: User,
  ): Promise<{ ticket: any; reassignment_required: boolean }> {
    if (!user.is_support_triage && !user.is_admin) {
      throw new ForbiddenException('Only Support/Triage can confirm category');
    }

    // Get the ticket
    const ticketQuery = `
      SELECT * FROM tickets WHERE id = $1
    `;
    const [ticket] = await this.dataSource.query(ticketQuery, [ticketId]);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Get category to verify it exists
    const categoryQuery = `
      SELECT id, team_id FROM categories WHERE id = $1
    `;
    const [category] = await this.dataSource.query(categoryQuery, [categoryId]);

    if (!category) {
      throw new BadRequestException('Category not found');
    }

    // Update the ticket with new category
    const updateQuery = `
      UPDATE tickets
      SET confirmed_category_id = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `;
    const [updatedTicket] = await withActor(this.dataSource, user.id, (manager) =>
      manager.query(updateQuery, [categoryId, ticketId]),
    );

    // Check if reassignment is required (if assigned to someone outside new category's team)
    let reassignment_required = false;
    if (updatedTicket.assigned_to) {
      const assigneeQuery = `
        SELECT team_id FROM users WHERE id = $1
      `;
      const [assignee] = await this.dataSource.query(assigneeQuery, [updatedTicket.assigned_to]);

      if (assignee && assignee.team_id !== category.team_id) {
        reassignment_required = true;
      }
    }

    this.eventEmitter.emit('ticket.category_confirmed', {
      ticket: updatedTicket,
      category_id: categoryId,
      actor_id: user.id,
    });

    return { ticket: updatedTicket, reassignment_required };
  }

  /**
   * POST /tickets/:id/priority/confirm - Confirm priority
   * Allowed by: Support/Triage or Manager (own team)
   */
  async confirmPriority(
    ticketId: string,
    priority: string,
    user: User,
  ): Promise<any> {
    // Validate priority value
    if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
      throw new BadRequestException('Invalid priority value');
    }

    // Get the ticket first
    const ticketQuery = `
      SELECT t.*, c.team_id FROM tickets t
      LEFT JOIN categories c ON t.confirmed_category_id = c.id
      WHERE t.id = $1
    `;
    const [ticket] = await this.dataSource.query(ticketQuery, [ticketId]);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check authorization
    const isSupport = user.is_support_triage || user.is_admin;
    const managesTeamId = isSupport ? null : await this.getManagesTeamId(user.id);
    const isManager = !!managesTeamId && managesTeamId === ticket.team_id;

    if (!isSupport && !isManager) {
      throw new ForbiddenException(
        'Only Support/Triage or Manager (own team) can confirm priority',
      );
    }

    // Update priority
    const updateQuery = `
      UPDATE tickets
      SET confirmed_priority = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `;
    const [updatedTicket] = await withActor(this.dataSource, user.id, (manager) =>
      manager.query(updateQuery, [priority, ticketId]),
    );

    this.eventEmitter.emit('ticket.priority_confirmed', {
      ticket: updatedTicket,
      priority,
      actor_id: user.id,
    });

    return updatedTicket;
  }

  /**
   * POST /tickets/:id/assign - Assign to team member
   * Allowed by: Support/Triage (any team) or Manager (own team only)
   */
  async assign(
    ticketId: string,
    assignee_id: string,
    user: User,
  ): Promise<any> {
    // Get the ticket
    const ticketQuery = `
      SELECT t.*, c.team_id FROM tickets t
      LEFT JOIN categories c ON t.confirmed_category_id = c.id
      WHERE t.id = $1
    `;
    const [ticket] = await this.dataSource.query(ticketQuery, [ticketId]);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check authorization
    const isSupport = user.is_support_triage || user.is_admin;
    const managesTeamId = isSupport ? null : await this.getManagesTeamId(user.id);
    const isManager = !!managesTeamId && managesTeamId === ticket.team_id;

    if (!isSupport && !isManager) {
      throw new ForbiddenException(
        'Only Support/Triage or Manager (own team) can assign tickets',
      );
    }

    // Validate assignee exists
    const assigneeQuery = `
      SELECT id, team_id, is_unavailable FROM users WHERE id = $1
    `;
    const [assignee] = await this.dataSource.query(assigneeQuery, [assignee_id]);

    if (!assignee) {
      throw new BadRequestException('Assignee not found');
    }

    // Check if assignee is unavailable
    if (assignee.is_unavailable) {
      throw new ConflictException('Assignee is currently unavailable');
    }

    // Validate assignee's team matches ticket's category team
    if (ticket.team_id && assignee.team_id !== ticket.team_id) {
      throw new ConflictException(
        "Assignee's team does not match ticket's category team",
      );
    }

    // Update ticket
    const updateQuery = `
      UPDATE tickets
      SET assigned_to = $1, assigned_by = $2, assigned_at = now(),
          status = 'assigned', updated_at = now()
      WHERE id = $3
      RETURNING *
    `;
    const [updatedTicket] = await withActor(this.dataSource, user.id, (manager) =>
      manager.query(updateQuery, [assignee_id, user.id, ticketId]),
    );

    this.eventEmitter.emit('ticket.assigned', {
      ticket: updatedTicket,
      assignee_id,
      actor_id: user.id,
    });

    return updatedTicket;
  }

  /**
   * Get team members available for assignment
   * Helper method for getting assignees in a category's team
   */
  async getTeamMembers(categoryId: string, user: User) {
    if (!user.is_support_triage && !user.is_admin) {
      throw new ForbiddenException('Not authorized');
    }

    const query = `
      SELECT u.id, u.name, u.email, u.team_id
      FROM users u
      JOIN categories c ON u.team_id = c.team_id
      WHERE c.id = $1 AND u.is_unavailable = false AND u.active = true
      ORDER BY u.name ASC
    `;

    const members = await this.dataSource.query(query, [categoryId]);
    return { data: members };
  }

  /**
   * Get per-member workload for a team
   */
  async getTeamWorkload(teamId: string, user: User) {
    if (!user.is_support_triage && !user.is_admin) {
      throw new ForbiddenException('Not authorized');
    }

    const query = `
      SELECT u.id, u.name, u.email,
             COUNT(CASE WHEN t.status IN ('assigned', 'in_progress') THEN 1 END) as open_tickets
      FROM users u
      LEFT JOIN tickets t ON u.id = t.assigned_to
      WHERE u.team_id = $1 AND u.active = true
      GROUP BY u.id, u.name, u.email
      ORDER BY u.name ASC
    `;

    const workload = await this.dataSource.query(query, [teamId]);
    return { data: workload };
  }
}
