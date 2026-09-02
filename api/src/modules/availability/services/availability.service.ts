import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getManagesTeamId } from '../../../database/team-management';

/**
 * User interface for authorization checks
 */
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

/**
 * Availability request interface
 */
export interface AvailabilityRequest {
  id: string;
  user_id: string;
  type: 'range' | 'toggle';
  start_date?: Date;
  end_date?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'ended' | 'cancelled';
  requested_at: Date;
  decided_by?: string;
  decided_at?: Date;
  ended_at?: Date;
}

/**
 * AvailabilityService handles leave requests, approvals, rejections, and endings.
 *
 * Critical invariant: is_unavailable is ONLY written by:
 * 1. POST /availability-requests/:id/approve (sets is_unavailable=true)
 * 2. POST /availability-requests/:id/end (sets is_unavailable=false for toggle requests)
 * 3. Worker leave-expiry job (sets is_unavailable=false for range requests at end_date)
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}


  /**
   * POST /availability-requests - Team Member requests leave
   *
   * - Creates request with status='pending'
   * - Does NOT set is_unavailable yet (pending approval)
   * - Range requires both start_date and end_date
   * - Toggle has no dates (open-ended)
   * - Scoping: Team Member can only request for self
   */
  async requestLeave(
    userId: string,
    data: {
      type: 'range' | 'toggle';
      start_date?: string;
      end_date?: string;
    },
    requestingUser: User,
  ): Promise<AvailabilityRequest> {
    // Only allow requesting for self (unless admin)
    if (requestingUser.id !== userId && !requestingUser.is_admin) {
      throw new ForbiddenException('Can only request leave for yourself');
    }

    // Validate type
    if (!data.type || (data.type !== 'range' && data.type !== 'toggle')) {
      throw new BadRequestException('Type must be "range" or "toggle"');
    }

    // Validate dates based on type
    if (data.type === 'range') {
      if (!data.start_date || !data.end_date) {
        throw new BadRequestException('Range type requires both start_date and end_date');
      }

      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid date format');
      }

      if (endDate <= startDate) {
        throw new BadRequestException('end_date must be after start_date');
      }
    } else {
      // Toggle type should not have dates
      if (data.start_date || data.end_date) {
        throw new BadRequestException('Toggle type should not have dates');
      }
    }

    // Check if user exists
    const [user] = await this.dataSource.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create the availability request
    const [request] = await this.dataSource.query(
      `INSERT INTO availability_requests
        (user_id, type, start_date, end_date, status, requested_at)
       VALUES ($1, $2, $3, $4, 'pending', now())
       RETURNING *`,
      [
        userId,
        data.type,
        data.type === 'range' ? data.start_date : null,
        data.type === 'range' ? data.end_date : null,
      ],
    );

    // Emit event for audit logging
    this.eventEmitter.emit('availability.requested', {
      request,
      actor_id: requestingUser.id,
    });

    return request;
  }

  /**
   * GET /availability-requests - Manager lists requests (own team), Admin lists all
   *
   * - Params: ?status=pending for approval queue
   * - Scoping: Manager (own team), Admin
   */
  async listRequests(
    user: User,
    filters?: { status?: string },
  ): Promise<{ data: AvailabilityRequest[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];

    const managesTeamId = await getManagesTeamId(this.dataSource, user.id);

    if (user.is_admin || user.is_support_triage) {
      // Admin and Support/Triage see all requests
    } else if (managesTeamId) {
      // Manager sees own team's requests
      params.push(managesTeamId);
      conditions.push(`ar.user_id IN (SELECT id FROM users WHERE team_id = $${params.length})`);
    } else {
      // Everyone else (including regular team members): only see own requests
      params.push(user.id);
      conditions.push(`ar.user_id = $${params.length}`);
    }

    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`ar.status = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await this.dataSource.query(
      `SELECT ar.*, u.name as requester_name
       FROM availability_requests ar
       JOIN users u ON ar.user_id = u.id
       ${whereClause}
       ORDER BY ar.requested_at DESC`,
      params,
    );

    return { data, total: data.length };
  }

  /**
   * POST /availability-requests/:id/approve - Manager approves (own team only)
   *
   * Sets: status='approved' AND users.is_unavailable=true
   * This is ONE OF THE ONLY two code paths allowed to write is_unavailable
   */
  async approveRequest(
    requestId: string,
    approvingUser: User,
  ): Promise<AvailabilityRequest> {
    const [request] = await this.dataSource.query(
      'SELECT * FROM availability_requests WHERE id = $1',
      [requestId],
    );

    if (!request) {
      throw new NotFoundException('Availability request not found');
    }

    const [requestingUser] = await this.dataSource.query(
      'SELECT * FROM users WHERE id = $1',
      [request.user_id],
    );

    if (!requestingUser) {
      throw new NotFoundException('Requesting user not found');
    }

    // Authorization: Only manager of the user's team or admin can approve
    if (!approvingUser.is_admin) {
      const managesTeamId = await getManagesTeamId(this.dataSource, approvingUser.id);
      if (!managesTeamId || managesTeamId !== requestingUser.team_id) {
        throw new ForbiddenException('Can only approve requests for your team');
      }
    }

    // Validate request status
    if (request.status !== 'pending') {
      throw new ConflictException(`Cannot approve request with status: ${request.status}`);
    }

    // Update request status
    const [updatedRequest] = await this.dataSource.query(
      `UPDATE availability_requests
       SET status = 'approved', decided_by = $1, decided_at = now()
       WHERE id = $2
       RETURNING *`,
      [approvingUser.id, requestId],
    );

    // CRITICAL: Set is_unavailable=true (only write path for approval)
    await this.dataSource.query(
      'UPDATE users SET is_unavailable = true, updated_at = now() WHERE id = $1',
      [requestingUser.id],
    );

    // Emit event for audit logging
    this.eventEmitter.emit('availability.approved', {
      request: updatedRequest,
      actor_id: approvingUser.id,
    });

    return updatedRequest;
  }

  /**
   * POST /availability-requests/:id/reject - Manager rejects (own team only)
   *
   * Sets: status='rejected', does NOT touch is_unavailable
   */
  async rejectRequest(
    requestId: string,
    rejectingUser: User,
  ): Promise<AvailabilityRequest> {
    const [request] = await this.dataSource.query(
      'SELECT * FROM availability_requests WHERE id = $1',
      [requestId],
    );

    if (!request) {
      throw new NotFoundException('Availability request not found');
    }

    const [requestingUser] = await this.dataSource.query(
      'SELECT * FROM users WHERE id = $1',
      [request.user_id],
    );

    if (!requestingUser) {
      throw new NotFoundException('Requesting user not found');
    }

    // Authorization: Only manager of the user's team or admin can reject
    if (!rejectingUser.is_admin) {
      const managesTeamId = await getManagesTeamId(this.dataSource, rejectingUser.id);
      if (!managesTeamId || managesTeamId !== requestingUser.team_id) {
        throw new ForbiddenException('Can only reject requests for your team');
      }
    }

    // Validate request status
    if (request.status !== 'pending') {
      throw new ConflictException(`Cannot reject request with status: ${request.status}`);
    }

    // Update request status (NO changes to is_unavailable)
    const [updatedRequest] = await this.dataSource.query(
      `UPDATE availability_requests
       SET status = 'rejected', decided_by = $1, decided_at = now()
       WHERE id = $2
       RETURNING *`,
      [rejectingUser.id, requestId],
    );

    // Emit event for audit logging
    this.eventEmitter.emit('availability.rejected', {
      request: updatedRequest,
      actor_id: rejectingUser.id,
    });

    return updatedRequest;
  }

  /**
   * POST /availability-requests/:id/end - Manager (own team) or requester cancels/ends
   *
   * Sets: status='ended'
   * For toggle: also sets users.is_unavailable=false
   * For range: just status='ended', auto-return handled by worker job
   *
   * Scoping: Manager (own team) OR the requesting user themselves
   */
  async endRequest(
    requestId: string,
    endingUser: User,
  ): Promise<AvailabilityRequest> {
    const [request] = await this.dataSource.query(
      'SELECT * FROM availability_requests WHERE id = $1',
      [requestId],
    );

    if (!request) {
      throw new NotFoundException('Availability request not found');
    }

    const [requestingUser] = await this.dataSource.query(
      'SELECT * FROM users WHERE id = $1',
      [request.user_id],
    );

    if (!requestingUser) {
      throw new NotFoundException('Requesting user not found');
    }

    // Authorization: Can end if:
    // 1. You are the requester, OR
    // 2. You are the manager of the team, OR
    // 3. You are admin
    const isRequester = endingUser.id === request.user_id;
    const isAdmin = endingUser.is_admin;
    const managesTeamId = isRequester || isAdmin ? null : await getManagesTeamId(this.dataSource, endingUser.id);
    const isManagerOfTeam = !!managesTeamId && managesTeamId === requestingUser.team_id;

    if (!isRequester && !isManagerOfTeam && !isAdmin) {
      throw new ForbiddenException('Can only end your own requests or requests in your team');
    }

    // Validate request status (can only end approved or pending requests)
    if (request.status !== 'approved' && request.status !== 'pending') {
      throw new ConflictException(`Cannot end request with status: ${request.status}`);
    }

    // Update request status
    const [updatedRequest] = await this.dataSource.query(
      `UPDATE availability_requests
       SET status = 'ended', ended_at = now()
       WHERE id = $1
       RETURNING *`,
      [requestId],
    );

    // For toggle requests: set is_unavailable=false (only write path for toggle end)
    // For range requests: leave is_unavailable=true; worker job will auto-reset at end_date
    if (request.type === 'toggle') {
      await this.dataSource.query(
        'UPDATE users SET is_unavailable = false, updated_at = now() WHERE id = $1',
        [requestingUser.id],
      );
    }

    // Emit event for audit logging
    this.eventEmitter.emit('availability.ended', {
      request: updatedRequest,
      actor_id: endingUser.id,
    });

    return updatedRequest;
  }
}
