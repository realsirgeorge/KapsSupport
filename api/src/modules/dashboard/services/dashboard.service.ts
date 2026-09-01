import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface User {
  id: string;
  team_id?: string;
  is_admin: boolean;
  is_executive: boolean;
  is_support_triage: boolean;
}

/**
 * Open statuses: 'new', 'assigned', 'in_progress', 'pending', 'resolved', 'reopened'
 * (excludes 'pending_confirmation' and 'closed' since they're terminal states)
 */
const OPEN_STATUSES = ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'reopened'];

@Injectable()
export class DashboardService {
  constructor(private dataSource: DataSource) {}

  /**
   * Helper: Get manager's team ID if user is a manager.
   * Returns the team ID of a team where user is the manager.
   */
  private async getManagerTeamId(userId: string): Promise<string | null> {
    const result = await this.dataSource.query(
      'SELECT id FROM teams WHERE manager_id = $1 LIMIT 1',
      [userId],
    );
    return result.length > 0 ? result[0].id : null;
  }

  /**
   * Helper: Compute pending_confirmation_days for a given date.
   */
  private computePendingDays(pendingAt: Date): number {
    if (!pendingAt) return 0;
    return Math.floor((Date.now() - new Date(pendingAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Helper: Get system-wide counter data (by_team and by_status breakdowns).
   * Used by both getCounters (Admin/Exec) and getSystemDashboard.
   */
  private async getSystemCounts(): Promise<{
    total_open: number;
    aging_over_3_days: number;
    resolved_this_month: number;
    avg_resolution_hours: number;
    by_team: Array<{ team_name: string; team_id: string; count: number }>;
    by_status: Array<{ status: string; count: number }>;
  }> {
    // Total open tickets
    const totalResult = await this.dataSource.query(
      'SELECT COUNT(*) as count FROM tickets WHERE status = ANY($1::text[])',
      [OPEN_STATUSES],
    );
    const total_open = parseInt(totalResult[0].count || '0', 10);

    // Aging: open tickets created more than 3 days ago
    const agingResult = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM tickets
       WHERE status = ANY($1::text[]) AND (now() - created_at) > INTERVAL '3 days'`,
      [OPEN_STATUSES],
    );
    const aging_over_3_days = parseInt(agingResult[0].count || '0', 10);

    // Resolved (closed) this calendar month
    const resolvedResult = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM tickets
       WHERE status = 'closed' AND closed_at >= date_trunc('month', now())`,
    );
    const resolved_this_month = parseInt(resolvedResult[0].count || '0', 10);

    // System-wide average resolution time for closed tickets
    const avgResult = await this.dataSource.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)::NUMERIC as hours
       FROM tickets WHERE status = 'closed' AND closed_at IS NOT NULL`,
    );
    const avg_resolution_hours = parseFloat(avgResult[0]?.hours || '0');

    // By team: group by confirmed_category's team
    const byTeamResult = await this.dataSource.query(
      `SELECT
        t.id as team_id,
        t.name as team_name,
        COUNT(tk.id) as count
      FROM teams t
      LEFT JOIN categories c ON c.team_id = t.id
      LEFT JOIN tickets tk ON tk.confirmed_category_id = c.id AND tk.status = ANY($1::text[])
      GROUP BY t.id, t.name
      ORDER BY t.name`,
      [OPEN_STATUSES],
    );

    const by_team = byTeamResult
      .filter((row) => parseInt(row.count || '0', 10) > 0)
      .map((row) => ({
        team_id: row.team_id,
        team_name: row.team_name,
        count: parseInt(row.count || '0', 10),
      }));

    // By status: open statuses as-is, plus pending_confirmation, plus closed in the last 30 days
    const byStatusResult = await this.dataSource.query(
      `SELECT status, COUNT(*) as count
      FROM tickets
      WHERE status = ANY($1::text[]) OR status = 'pending_confirmation'
      GROUP BY status
      ORDER BY status`,
      [OPEN_STATUSES],
    );

    const closedLast30Result = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM tickets WHERE status = 'closed' AND closed_at >= now() - INTERVAL '30 days'`,
    );

    const by_status = [
      ...byStatusResult.map((row) => ({
        status: row.status,
        count: parseInt(row.count || '0', 10),
      })),
      { status: 'closed', count: parseInt(closedLast30Result[0].count || '0', 10) },
    ];

    return { total_open, aging_over_3_days, resolved_this_month, avg_resolution_hours, by_team, by_status };
  }

  /**
   * GET /me/counters - Role-specific counter shapes
   */
  async getCounters(user: User): Promise<any> {
    // Admin or Executive: full system overview
    if (user.is_admin || user.is_executive) {
      const systemData = await this.getSystemCounts();
      return systemData;
    }

    // Support/Triage
    if (user.is_support_triage) {
      const [awaiting_category, awaiting_assignment, assigned_today] = await Promise.all([
        // Tickets with no confirmed category
        this.dataSource
          .query(
            'SELECT COUNT(*) as count FROM tickets WHERE confirmed_category_id IS NULL AND status != $1',
            ['closed'],
          )
          .then((r) => parseInt(r[0].count || '0', 10)),
        // Tickets with confirmed category but no assignee
        this.dataSource
          .query(
            'SELECT COUNT(*) as count FROM tickets WHERE confirmed_category_id IS NOT NULL AND assigned_to IS NULL AND status != $1',
            ['closed'],
          )
          .then((r) => parseInt(r[0].count || '0', 10)),
        // Tickets assigned today
        this.dataSource
          .query(
            "SELECT COUNT(*) as count FROM tickets WHERE assigned_at >= date_trunc('day', now())",
          )
          .then((r) => parseInt(r[0].count || '0', 10)),
      ]);

      return { awaiting_category, awaiting_assignment, assigned_today };
    }

    // Manager (must check this before Team Member)
    const managerTeamId = await this.getManagerTeamId(user.id);
    if (managerTeamId) {
      const [team_open, my_requests_open] = await Promise.all([
        // Tickets in this manager's team
        this.dataSource
          .query(
            `SELECT COUNT(*) as count FROM tickets tk
           JOIN categories c ON tk.confirmed_category_id = c.id
           WHERE c.team_id = $1 AND tk.status = ANY($2::text[])`,
            [managerTeamId, OPEN_STATUSES],
          )
          .then((r) => parseInt(r[0].count || '0', 10)),
        // Tickets created by this manager that are still open
        this.dataSource
          .query(
            'SELECT COUNT(*) as count FROM tickets WHERE requester_id = $1 AND status = ANY($2::text[])',
            [user.id, OPEN_STATUSES],
          )
          .then((r) => parseInt(r[0].count || '0', 10)),
      ]);

      return { team_open, my_requests_open };
    }

    // Team Member (has team_id)
    if (user.team_id) {
      const [assigned_open, pending_blocked, resolved_this_week] = await Promise.all([
        // Tickets assigned to this member that are open
        this.dataSource
          .query(
            'SELECT COUNT(*) as count FROM tickets WHERE assigned_to = $1 AND status = ANY($2::text[])',
            [user.id, OPEN_STATUSES],
          )
          .then((r) => parseInt(r[0].count || '0', 10)),
        // Tickets assigned to this member that are pending (blocked)
        this.dataSource
          .query('SELECT COUNT(*) as count FROM tickets WHERE assigned_to = $1 AND status = $2', [
            user.id,
            'pending',
          ])
          .then((r) => parseInt(r[0].count || '0', 10)),
        // Tickets resolved by this member in the last 7 days
        this.dataSource
          .query(
            "SELECT COUNT(*) as count FROM tickets WHERE assigned_to = $1 AND resolved_at >= date_trunc('week', now())",
            [user.id],
          )
          .then((r) => parseInt(r[0].count || '0', 10)),
      ]);

      return { assigned_open, pending_blocked, resolved_this_week };
    }

    // Requester (no team)
    const [open, pending_confirmation, closed_this_month] = await Promise.all([
      // Tickets created by this user that are open
      this.dataSource
        .query(
          'SELECT COUNT(*) as count FROM tickets WHERE requester_id = $1 AND status = ANY($2::text[])',
          [user.id, OPEN_STATUSES],
        )
        .then((r) => parseInt(r[0].count || '0', 10)),
      // Tickets awaiting requester confirmation
      this.dataSource
        .query('SELECT COUNT(*) as count FROM tickets WHERE requester_id = $1 AND status = $2', [
          user.id,
          'pending_confirmation',
        ])
        .then((r) => parseInt(r[0].count || '0', 10)),
      // Tickets closed this month
      this.dataSource
        .query(
          "SELECT COUNT(*) as count FROM tickets WHERE requester_id = $1 AND status = $2 AND closed_at >= date_trunc('month', now())",
          [user.id, 'closed'],
        )
        .then((r) => parseInt(r[0].count || '0', 10)),
    ]);

    return { open, pending_confirmation, closed_this_month };
  }

  /**
   * GET /dashboard/system - System-wide overview (Admin/Executive only)
   */
  async getSystemDashboard(user: User): Promise<any> {
    if (!user.is_admin && !user.is_executive) {
      throw new ForbiddenException('Admin/Executive only');
    }

    return this.getSystemCounts();
  }

  /**
   * GET /dashboard/system/pending-confirmations - Long-wait tickets sorted by oldest first
   */
  async getPendingConfirmations(user: User): Promise<any[]> {
    if (!user.is_admin && !user.is_executive) {
      throw new ForbiddenException('Admin/Executive only');
    }

    const tickets = await this.dataSource.query(
      `SELECT
        id,
        ticket_number,
        subject,
        requester_id,
        assigned_to,
        status,
        pending_confirmation_at,
        created_at,
        updated_at
      FROM tickets
      WHERE status = $1
      ORDER BY pending_confirmation_at ASC`,
      ['pending_confirmation'],
    );

    // Enrich with pending_confirmation_days computed at query time
    return tickets.map((ticket) => ({
      ...ticket,
      pending_confirmation_days: this.computePendingDays(ticket.pending_confirmation_at),
    }));
  }
}
