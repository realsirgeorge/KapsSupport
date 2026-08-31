import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * User interface for authorization checks
 */
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

/**
 * Availability request interface
 */
interface AvailabilityRequest {
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
  private availabilityRequestsRepository: Repository<AvailabilityRequest>;
  private usersRepository: Repository<User>;

  constructor(
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {
    this.availabilityRequestsRepository = this.dataSource.getRepository('availability_requests');
    this.usersRepository = this.dataSource.getRepository('users');
  }

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
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create the availability request
    const request = this.availabilityRequestsRepository.create({
      user_id: userId,
      type: data.type,
      start_date: data.type === 'range' ? new Date(data.start_date!) : null,
      end_date: data.type === 'range' ? new Date(data.end_date!) : null,
      status: 'pending',
      requested_at: new Date(),
    });

    await this.availabilityRequestsRepository.save(request);

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
    // Only Manager and Admin can list requests
    // Team Member can see their own
    let query = this.availabilityRequestsRepository.createQueryBuilder('ar');

    if (user.is_admin || user.is_support_triage) {
      // Admin and Support/Triage see all requests
      // Query needs to join with users to see their team
      query = query
        .leftJoinAndSelect('ar.user_id', 'user')
        .orderBy('ar.requested_at', 'DESC');
    } else if (user.team_id) {
      // Manager sees only own team's requests
      // This requires joining users and checking team_id
      query = query
        .leftJoinAndSelect('ar.user_id', 'user')
        .andWhere('user.team_id = :teamId', { teamId: user.team_id })
        .orderBy('ar.requested_at', 'DESC');
    } else {
      // Non-team-member without admin: only see own requests
      query = query
        .andWhere('ar.user_id = :userId', { userId: user.id })
        .orderBy('ar.requested_at', 'DESC');
    }

    // Apply status filter if provided
    if (filters?.status) {
      query = query.andWhere('ar.status = :status', { status: filters.status });
    }

    const [data, total] = await query.getManyAndCount();

    return { data, total };
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
    const request = await this.availabilityRequestsRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Availability request not found');
    }

    // Get the requesting user to check team membership
    const requestingUser = await this.usersRepository.findOne({
      where: { id: request.user_id },
    });

    if (!requestingUser) {
      throw new NotFoundException('Requesting user not found');
    }

    // Authorization: Only manager of the user's team or admin can approve
    if (!approvingUser.is_admin && approvingUser.team_id !== requestingUser.team_id) {
      throw new ForbiddenException('Can only approve requests for your team');
    }

    // Validate request status
    if (request.status !== 'pending') {
      throw new ConflictException(`Cannot approve request with status: ${request.status}`);
    }

    // Update request status
    request.status = 'approved';
    request.decided_by = approvingUser.id;
    request.decided_at = new Date();

    await this.availabilityRequestsRepository.save(request);

    // CRITICAL: Set is_unavailable=true (only write path for approval)
    requestingUser.is_unavailable = true;
    requestingUser.updated_at = new Date();
    await this.usersRepository.save(requestingUser);

    // Emit event for audit logging
    this.eventEmitter.emit('availability.approved', {
      request,
      actor_id: approvingUser.id,
    });

    return request;
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
    const request = await this.availabilityRequestsRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Availability request not found');
    }

    // Get the requesting user to check team membership
    const requestingUser = await this.usersRepository.findOne({
      where: { id: request.user_id },
    });

    if (!requestingUser) {
      throw new NotFoundException('Requesting user not found');
    }

    // Authorization: Only manager of the user's team or admin can reject
    if (!rejectingUser.is_admin && rejectingUser.team_id !== requestingUser.team_id) {
      throw new ForbiddenException('Can only reject requests for your team');
    }

    // Validate request status
    if (request.status !== 'pending') {
      throw new ConflictException(`Cannot reject request with status: ${request.status}`);
    }

    // Update request status (NO changes to is_unavailable)
    request.status = 'rejected';
    request.decided_by = rejectingUser.id;
    request.decided_at = new Date();

    await this.availabilityRequestsRepository.save(request);

    // Emit event for audit logging
    this.eventEmitter.emit('availability.rejected', {
      request,
      actor_id: rejectingUser.id,
    });

    return request;
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
    const request = await this.availabilityRequestsRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Availability request not found');
    }

    // Get the requesting user
    const requestingUser = await this.usersRepository.findOne({
      where: { id: request.user_id },
    });

    if (!requestingUser) {
      throw new NotFoundException('Requesting user not found');
    }

    // Authorization: Can end if:
    // 1. You are the requester, OR
    // 2. You are the manager of the team, OR
    // 3. You are admin
    const isRequester = endingUser.id === request.user_id;
    const isManagerOfTeam = !endingUser.is_admin && endingUser.team_id === requestingUser.team_id;
    const isAdmin = endingUser.is_admin;

    if (!isRequester && !isManagerOfTeam && !isAdmin) {
      throw new ForbiddenException('Can only end your own requests or requests in your team');
    }

    // Validate request status (can only end approved or pending requests)
    if (request.status !== 'approved' && request.status !== 'pending') {
      throw new ConflictException(`Cannot end request with status: ${request.status}`);
    }

    // Update request status
    request.status = 'ended';
    request.ended_at = new Date();

    await this.availabilityRequestsRepository.save(request);

    // For toggle requests: set is_unavailable=false (only write path for toggle end)
    // For range requests: leave is_unavailable=true; worker job will auto-reset at end_date
    if (request.type === 'toggle') {
      requestingUser.is_unavailable = false;
      requestingUser.updated_at = new Date();
      await this.usersRepository.save(requestingUser);
    }

    // Emit event for audit logging
    this.eventEmitter.emit('availability.ended', {
      request,
      actor_id: endingUser.id,
    });

    return request;
  }
}
