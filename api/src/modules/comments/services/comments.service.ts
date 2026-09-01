import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TicketService, type User } from '../../tickets/services/ticket.service';

export interface Comment {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  is_internal: boolean;
  created_at: Date;
}

/** Requester per REQUIREMENTS.md §1: no team, not support/triage, not admin. */
function isStaff(user: User): boolean {
  return user.is_admin || user.is_support_triage || !!user.team_id;
}

@Injectable()
export class CommentsService {
  constructor(
    private dataSource: DataSource,
    private ticketService: TicketService,
  ) {}

  /**
   * FR-1.4: requesters can comment on their own tickets (never internal).
   * FR-4.4: team members (and by extension managers/support/admin) can post
   * internal notes the requester never sees.
   */
  async add(ticketId: string, user: User, data: { body: string; is_internal?: boolean }): Promise<Comment> {
    await this.ticketService.getTicket(ticketId, user); // throws if no access

    if (!data.body || !data.body.trim()) {
      throw new BadRequestException('Comment body is required');
    }

    const isInternal = !!data.is_internal && isStaff(user);

    const [comment] = await this.dataSource.query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketId, user.id, data.body.trim(), isInternal],
    );

    return comment;
  }

  async listForTicket(ticketId: string, user: User): Promise<Comment[]> {
    await this.ticketService.getTicket(ticketId, user); // throws if no access

    const visibleToRequesterOnly = !isStaff(user);
    const whereClause = visibleToRequesterOnly ? 'AND c.is_internal = false' : '';

    return this.dataSource.query(
      `SELECT c.*, u.name as author_name
       FROM ticket_comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.ticket_id = $1 ${whereClause}
       ORDER BY c.created_at ASC`,
      [ticketId],
    );
  }
}
