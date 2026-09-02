import { Injectable, ForbiddenException, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { withActor } from '../../../database/with-actor';
import { getManagesTeamId } from '../../../database/team-management';

export interface User {
  id: string;
  email: string;
  name: string;
  team_id?: string;
  is_admin: boolean;
  is_support_triage: boolean;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  requester_id: string;
  site_id: string;
  confirmed_category_id?: string;
  assigned_to?: string;
  assigned_by?: string;
  assigned_at?: Date;
  subject: string;
  description: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  is_unavailable: boolean;
  open_tickets: number;
}

@Injectable()
export class ManagerService {
  constructor(
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}


  /**
   * GET /teams/:id/workload - Per-member open ticket count
   * Used by: Support/Triage, Managers, Admin
   */
  async getTeamWorkload(teamId: string, user: User): Promise<{ data: TeamMember[] }> {
    await this.validateWorkloadAccess(teamId, user);

    // Query: SELECT u.id, u.name, u.email, u.is_unavailable, COUNT(t.id) as open_tickets
    // FROM users u
    // LEFT JOIN tickets t ON u.id = t.assigned_to AND t.status IN ('assigned', 'in_progress', 'pending')
    // WHERE u.team_id = $1
    // GROUP BY u.id, u.name, u.email, u.is_unavailable
    const members = await this.dataSource.query(
      `
      SELECT u.id, u.name, u.email, u.is_unavailable, COUNT(t.id)::INTEGER as open_tickets
      FROM users u
      LEFT JOIN tickets t ON u.id = t.assigned_to AND t.status IN ('assigned', 'in_progress', 'pending')
      WHERE u.team_id = $1
      GROUP BY u.id, u.name, u.email, u.is_unavailable
      ORDER BY u.name ASC
      `,
      [teamId],
    );

    return { data: members };
  }

  /**
   * GET /teams/:id/stats - Team performance metrics
   * Scoping: Manager (own team), Admin
   */
  async getTeamStats(
    teamId: string,
    user: User,
  ): Promise<{
    data: {
      open_tickets: number;
      avg_resolution_hours: number;
      aging_over_3_days: number;
      team_size: number;
      per_member: Array<{ user_id: string; name: string; open_tickets: number; avg_resolution_hours: number }>;
    };
  }> {
    await this.validateTeamAccess(teamId, user);

    // Get open tickets count
    const openResult = await this.dataSource.query(
      `
      SELECT COUNT(*)::INTEGER as count
      FROM tickets t
      JOIN categories c ON t.confirmed_category_id = c.id
      WHERE c.team_id = $1 AND t.status IN ('assigned', 'in_progress', 'pending')
      `,
      [teamId],
    );

    const open_tickets = openResult[0]?.count || 0;

    // Get aging tickets (open > 3 days)
    const agingResult = await this.dataSource.query(
      `
      SELECT COUNT(*)::INTEGER as count
      FROM tickets t
      JOIN categories c ON t.confirmed_category_id = c.id
      WHERE c.team_id = $1 AND t.status IN ('assigned', 'in_progress', 'pending')
      AND (NOW() - t.created_at) > INTERVAL '3 days'
      `,
      [teamId],
    );

    const aging_over_3_days = agingResult[0]?.count || 0;

    // Get average resolution hours (closed tickets)
    const avgResolutionResult = await this.dataSource.query(
      `
      SELECT AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 3600)::NUMERIC as hours
      FROM tickets t
      JOIN categories c ON t.confirmed_category_id = c.id
      WHERE c.team_id = $1 AND t.status = 'closed' AND t.closed_at IS NOT NULL
      `,
      [teamId],
    );

    const avg_resolution_hours = parseFloat(avgResolutionResult[0]?.hours || '0');

    // Get team size (members count)
    const teamSizeResult = await this.dataSource.query(
      `SELECT COUNT(*)::INTEGER as count FROM users WHERE team_id = $1`,
      [teamId],
    );

    const team_size = teamSizeResult[0]?.count || 0;

    // Get per-member stats
    const perMemberResult = await this.dataSource.query(
      `
      SELECT
        u.id as user_id,
        u.name,
        COUNT(t.id)::INTEGER as open_tickets,
        COALESCE(AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 3600)::NUMERIC, 0) as avg_resolution_hours
      FROM users u
      LEFT JOIN tickets t ON u.id = t.assigned_to
      LEFT JOIN categories c ON t.confirmed_category_id = c.id AND c.team_id = $1
      WHERE u.team_id = $1
      GROUP BY u.id, u.name
      ORDER BY u.name ASC
      `,
      [teamId],
    );

    const per_member = perMemberResult.map((m: any) => ({
      user_id: m.user_id,
      name: m.name,
      open_tickets: m.open_tickets,
      avg_resolution_hours: parseFloat(m.avg_resolution_hours || '0'),
    }));

    return {
      data: {
        open_tickets,
        avg_resolution_hours,
        aging_over_3_days,
        team_size,
        per_member,
      },
    };
  }

  /**
   * GET /teams/:id/tickets - All team tickets
   * Scoping: Manager (own team), Admin
   */
  async getTeamTickets(
    teamId: string,
    user: User,
    params?: {
      status?: string;
      assigned_to?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: Ticket[]; total: number; page: number; limit: number }> {
    await this.validateTeamAccess(teamId, user);

    let query = `
      SELECT t.*, au.name as assignee_name
      FROM tickets t
      JOIN categories c ON t.confirmed_category_id = c.id
      LEFT JOIN users au ON t.assigned_to = au.id
      WHERE c.team_id = $1
    `;
    const params_array: any[] = [teamId];

    if (params?.status) {
      query += ` AND t.status = $${params_array.length + 1}`;
      params_array.push(params.status);
    }

    if (params?.assigned_to) {
      query += ` AND t.assigned_to = $${params_array.length + 1}`;
      params_array.push(params.assigned_to);
    }

    // Pagination
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 25, 100);
    const skip = (page - 1) * limit;

    // Get total
    const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)::INTEGER as count');
    const countResult = await this.dataSource.query(countQuery, params_array);
    const total = countResult[0]?.count || 0;

    // Get paginated results
    query += ` ORDER BY t.created_at DESC LIMIT $${params_array.length + 1} OFFSET $${params_array.length + 2}`;
    params_array.push(limit, skip);

    const data = await this.dataSource.query(query, params_array);

    return { data, total, page, limit };
  }

  /**
   * POST /tickets/:id/reassign - Manager reassigns within team
   * Validation: assignee must be in same team, not unavailable
   * Response: 403 if trying to reassign outside team, 409 if assignee invalid
   */
  async reassign(ticketId: string, assigneeId: string, user: User): Promise<Ticket> {
    const managerTeamId = await getManagesTeamId(this.dataSource, user.id);
    if (!managerTeamId && !user.is_admin) {
      throw new ForbiddenException('Only Manager can reassign');
    }

    // Get the ticket
    const ticket = await this.dataSource.query(
      `
      SELECT t.*, c.team_id
      FROM tickets t
      LEFT JOIN categories c ON t.confirmed_category_id = c.id
      WHERE t.id = $1
      `,
      [ticketId],
    );

    if (!ticket || ticket.length === 0) {
      throw new NotFoundException('Ticket not found');
    }

    const ticketData = ticket[0];
    const ticketTeamId = ticketData.team_id;

    // Check if manager owns this team
    if (!user.is_admin && managerTeamId !== ticketTeamId) {
      throw new ForbiddenException('Manager can only reassign within own team');
    }

    // Validate assignee exists and is in the same team
    const assignee = await this.dataSource.query(
      `SELECT id, name, team_id, is_unavailable FROM users WHERE id = $1`,
      [assigneeId],
    );

    if (!assignee || assignee.length === 0) {
      throw new NotFoundException('Assignee not found');
    }

    if (assignee[0].team_id !== ticketTeamId) {
      throw new ConflictException('Assignee must be in the same team as the ticket');
    }

    if (assignee[0].is_unavailable) {
      throw new ConflictException('Assignee is unavailable');
    }

    // Update ticket
    const now = new Date();
    await withActor(this.dataSource, user.id, (manager) =>
      manager.query(
        `
        UPDATE tickets
        SET assigned_to = $1, assigned_by = $2, assigned_at = $3, updated_at = $4
        WHERE id = $5
        `,
        [assigneeId, user.id, now, now, ticketId],
      ),
    );

    // Fetch updated ticket
    const updatedTicket = await this.dataSource.query(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);

    // Emit event
    this.eventEmitter.emit('ticket.reassigned', {
      ticket_id: ticketId,
      assignee_id: assigneeId,
      actor_id: user.id,
    });

    return updatedTicket[0];
  }

  /**
   * POST /tickets/:id/return-to-triage - Manager flags ticket back to Support/Triage
   * Sets confirmed_category_id to NULL and unassigns the ticket, making it reappear in triage queue
   */
  async returnToTriage(ticketId: string, user: User, reason?: string): Promise<Ticket> {
    const managerTeamId = await getManagesTeamId(this.dataSource, user.id);
    if (!managerTeamId && !user.is_admin) {
      throw new ForbiddenException('Only Manager can return to triage');
    }

    // Get the ticket
    const ticket = await this.dataSource.query(
      `
      SELECT t.*, c.team_id
      FROM tickets t
      LEFT JOIN categories c ON t.confirmed_category_id = c.id
      WHERE t.id = $1
      `,
      [ticketId],
    );

    if (!ticket || ticket.length === 0) {
      throw new NotFoundException('Ticket not found');
    }

    const ticketData = ticket[0];
    const ticketTeamId = ticketData.team_id;

    // Check if manager owns this team
    if (!user.is_admin && managerTeamId !== ticketTeamId) {
      throw new ForbiddenException('Manager can only return tickets from own team');
    }

    // Update ticket: clear category, clear assignment
    const now = new Date();
    await withActor(this.dataSource, user.id, (manager) =>
      manager.query(
        `
        UPDATE tickets
        SET
          confirmed_category_id = NULL,
          assigned_to = NULL,
          assigned_by = NULL,
          assigned_at = NULL,
          status = 'new',
          updated_at = $1
        WHERE id = $2
        `,
        [now, ticketId],
      ),
    );

    // Fetch updated ticket
    const updatedTicket = await this.dataSource.query(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);

    // Emit event
    this.eventEmitter.emit('ticket.returned_to_triage', {
      ticket_id: ticketId,
      reason,
      actor_id: user.id,
    });

    return updatedTicket[0];
  }

  /**
   * Validate access for workload endpoint
   * Allowed: Support/Triage, Managers (own team), Admin
   */
  private async validateWorkloadAccess(teamId: string, user: User) {
    if (user.is_admin || user.is_support_triage) {
      return;
    }
    const managerTeamId = await getManagesTeamId(this.dataSource, user.id);
    if (managerTeamId !== teamId) {
      throw new ForbiddenException('No access to this team workload');
    }
  }

  /**
   * Validate access for stats and tickets endpoints
   * Allowed: Managers (own team), Admin
   */
  private async validateTeamAccess(teamId: string, user: User) {
    if (user.is_admin) {
      return;
    }
    const managerTeamId = await getManagesTeamId(this.dataSource, user.id);
    if (managerTeamId !== teamId) {
      throw new ForbiddenException('Manager can only access own team');
    }
  }
}
