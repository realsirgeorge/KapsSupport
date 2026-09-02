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
import { getManagesTeamId } from '../../../database/team-management';

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

    // FR-2.4: recategorizing an already-assigned ticket to a different
    // team's category must never leave it assigned to someone outside that
    // team, even transiently — the DB's check_assignee_matches_category
    // trigger enforces exactly this and will reject the UPDATE below with a
    // raw exception if we set confirmed_category_id while an incompatible
    // assigned_to is still in place. So: check first, and if the current
    // assignee no longer fits, clear the assignment in the same statement
    // (satisfies the trigger) and tell the caller reassignment is required.
    let reassignment_required = false;
    if (ticket.assigned_to) {
      const [assignee] = await this.dataSource.query('SELECT team_id FROM users WHERE id = $1', [
        ticket.assigned_to,
      ]);
      if (assignee && assignee.team_id !== category.team_id) {
        reassignment_required = true;
      }
    }

    const updateQuery = reassignment_required
      ? `UPDATE tickets
         SET confirmed_category_id = $1, assigned_to = NULL, assigned_by = NULL, assigned_at = NULL,
             status = 'new', updated_at = now()
         WHERE id = $2
         RETURNING *`
      : `UPDATE tickets
         SET confirmed_category_id = $1, updated_at = now()
         WHERE id = $2
         RETURNING *`;

    const [updatedTicket] = await withActor(this.dataSource, user.id, (manager) =>
      manager.query(updateQuery, [categoryId, ticketId]),
    );

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
    const managesTeamId = isSupport ? null : await getManagesTeamId(this.dataSource, user.id);
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
    const managesTeamId = isSupport ? null : await getManagesTeamId(this.dataSource, user.id);
    const isManager = !!managesTeamId && managesTeamId === ticket.team_id;

    if (!isSupport && !isManager) {
      throw new ForbiddenException(
        'Only Support/Triage or Manager (own team) can assign tickets',
      );
    }

    // FR-2.6: a ticket cannot be assigned without a confirmed category —
    // a required, blocking step. ticket.team_id comes from a LEFT JOIN on
    // confirmed_category_id, so it's null exactly when no category is
    // confirmed yet; without this explicit check the team-match check below
    // silently no-ops on a null team_id and assignment goes through anyway.
    if (!ticket.confirmed_category_id) {
      throw new BadRequestException('Category must be confirmed before a ticket can be assigned');
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

  // A second `getTeamWorkload` lived here, unreachable: no controller routed to
  // it and nothing called it. GET /v1/teams/:id/workload — the endpoint the
  // triage queue actually uses to pick an assignee — is served by
  // ManagerService. This copy counted only ('assigned', 'in_progress') and
  // omitted `is_unavailable` entirely, so had anything ever wired up to it,
  // triage would have shown different workload numbers than the manager's own
  // dashboard and offered unavailable members as assignees (FR-10.5). Removed
  // rather than fixed: one definition of team workload, in one place.
}
