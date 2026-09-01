import { Injectable, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { withActor } from '../../../database/with-actor';

// Inline interfaces matching project pattern
export interface User {
  id: string;
  email?: string;
  team_id?: string;
  is_admin: boolean;
  is_support_triage: boolean;
  is_executive?: boolean;
}

export interface Team {
  id: string;
  name: string;
  manager_id?: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Site {
  id: string;
  name: string;
  region?: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: string;
  name: string;
  team_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  team_id?: string;
  is_admin: boolean;
  is_support_triage: boolean;
  is_executive: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AdminService {
  constructor(
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  private validateAdmin(user: User): void {
    if (!user.is_admin) {
      throw new ForbiddenException('Admin role required');
    }
  }

  private validateSupportTriage(user: User): void {
    if (!user.is_support_triage) {
      throw new ForbiddenException('Only Support/Triage can perform this action');
    }
  }

  // ===== TEAMS =====

  /**
   * GET /v1/teams - List all teams (read only for dropdowns)
   * No role restriction - anyone can read
   */
  async listTeams(): Promise<{ data: Team[] }> {
    const query = `
      SELECT id, name, manager_id, active, created_at, updated_at
      FROM teams
      ORDER BY name ASC
    `;

    const teams = await this.dataSource.query(query);
    return { data: teams };
  }

  /**
   * POST /v1/teams - Create team (Admin only)
   */
  async createTeam(user: User, data: { name: string }): Promise<{ data: Team }> {
    this.validateAdmin(user);

    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('Team name is required');
    }

    // Check for duplicate name
    const existing = await this.dataSource.query(
      'SELECT id FROM teams WHERE name = $1',
      [data.name],
    );

    if (existing.length > 0) {
      throw new ConflictException('Team name already exists');
    }

    const id = this.generateId();
    const now = new Date();

    await this.dataSource.query(
      `INSERT INTO teams (id, name, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, data.name, true, now, now],
    );

    this.eventEmitter.emit('team.created', {
      team_id: id,
      name: data.name,
      actor_id: user.id,
    });

    return {
      data: {
        id,
        name: data.name,
        manager_id: undefined,
        active: true,
        created_at: now,
        updated_at: now,
      },
    };
  }

  /**
   * PATCH /v1/teams/:id - Update team (Admin only)
   */
  async updateTeam(
    user: User,
    teamId: string,
    data: { name?: string; manager_id?: string },
  ): Promise<{ data: Team }> {
    this.validateAdmin(user);

    // Verify team exists
    const [team] = await this.dataSource.query(
      'SELECT * FROM teams WHERE id = $1',
      [teamId],
    );

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      // Check for duplicate name (excluding current team)
      const existing = await this.dataSource.query(
        'SELECT id FROM teams WHERE name = $1 AND id != $2',
        [data.name, teamId],
      );
      if (existing.length > 0) {
        throw new ConflictException('Team name already exists');
      }
      updates.push(`name = $${paramCount++}`);
      params.push(data.name);
    }

    if (data.manager_id !== undefined) {
      // Validate manager exists if provided
      if (data.manager_id !== null) {
        const [manager] = await this.dataSource.query(
          'SELECT id FROM users WHERE id = $1',
          [data.manager_id],
        );
        if (!manager) {
          throw new BadRequestException('Manager user not found');
        }
      }
      updates.push(`manager_id = $${paramCount++}`);
      params.push(data.manager_id);
    }

    if (updates.length === 0) {
      return { data: team };
    }

    updates.push(`updated_at = $${paramCount++}`);
    params.push(new Date());
    params.push(teamId);

    const query = `
      UPDATE teams
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const [updated] = await this.dataSource.query(query, params);

    this.eventEmitter.emit('team.updated', {
      team_id: teamId,
      changes: data,
      actor_id: user.id,
    });

    return { data: updated };
  }

  /**
   * DELETE /v1/teams/:id - Delete team (Admin only)
   * Validation: 409 CONFLICT if in-flight tickets exist
   */
  async deleteTeam(user: User, teamId: string): Promise<{ success: boolean }> {
    this.validateAdmin(user);

    // Verify team exists
    const [team] = await this.dataSource.query(
      'SELECT * FROM teams WHERE id = $1',
      [teamId],
    );

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Check for in-flight tickets linked via category or assigned users
    // In-flight: status NOT IN ('closed')
    // Tickets linked to team via:
    // 1. confirmed_category_id -> categories.team_id
    // 2. assigned_to -> users.team_id
    const inFlightQuery = `
      SELECT t.id FROM tickets t
      WHERE t.status != 'closed'
        AND (
          t.confirmed_category_id IN (
            SELECT id FROM categories WHERE team_id = $1
          )
          OR t.assigned_to IN (
            SELECT id FROM users WHERE team_id = $1
          )
        )
      LIMIT 1
    `;

    const inFlight = await this.dataSource.query(inFlightQuery, [teamId]);

    if (inFlight.length > 0) {
      throw new ConflictException(
        'Cannot delete team with in-flight tickets. Reassign or close all tickets first.',
      );
    }

    // Delete the team
    await this.dataSource.query('DELETE FROM teams WHERE id = $1', [teamId]);

    this.eventEmitter.emit('team.deleted', {
      team_id: teamId,
      actor_id: user.id,
    });

    return { success: true };
  }

  // ===== SITES =====

  /**
   * GET /v1/sites - List all sites (read only for dropdowns)
   * No role restriction - anyone can read
   */
  async listSites(): Promise<{ data: Site[] }> {
    const query = `
      SELECT id, name, region, active, created_at, updated_at
      FROM sites
      ORDER BY name ASC
    `;

    const sites = await this.dataSource.query(query);
    return { data: sites };
  }

  /**
   * POST /v1/sites - Create site (Admin only)
   */
  async createSite(
    user: User,
    data: { name: string; region?: string },
  ): Promise<{ data: Site }> {
    this.validateAdmin(user);

    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('Site name is required');
    }

    // Check for duplicate name
    const existing = await this.dataSource.query(
      'SELECT id FROM sites WHERE name = $1',
      [data.name],
    );

    if (existing.length > 0) {
      throw new ConflictException('Site name already exists');
    }

    const id = this.generateId();
    const now = new Date();

    await this.dataSource.query(
      `INSERT INTO sites (id, name, region, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, data.name, data.region || null, true, now, now],
    );

    this.eventEmitter.emit('site.created', {
      site_id: id,
      name: data.name,
      region: data.region || null,
      actor_id: user.id,
    });

    return {
      data: {
        id,
        name: data.name,
        region: data.region,
        active: true,
        created_at: now,
        updated_at: now,
      },
    };
  }

  /**
   * PATCH /v1/sites/:id - Update/deactivate site (Admin only)
   * Deactivating doesn't delete historical tickets, just blocks new selection
   */
  async updateSite(
    user: User,
    siteId: string,
    data: { name?: string; region?: string; active?: boolean },
  ): Promise<{ data: Site }> {
    this.validateAdmin(user);

    // Verify site exists
    const [site] = await this.dataSource.query(
      'SELECT * FROM sites WHERE id = $1',
      [siteId],
    );

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      // Check for duplicate name (excluding current site)
      const existing = await this.dataSource.query(
        'SELECT id FROM sites WHERE name = $1 AND id != $2',
        [data.name, siteId],
      );
      if (existing.length > 0) {
        throw new ConflictException('Site name already exists');
      }
      updates.push(`name = $${paramCount++}`);
      params.push(data.name);
    }

    if (data.region !== undefined) {
      updates.push(`region = $${paramCount++}`);
      params.push(data.region || null);
    }

    if (data.active !== undefined) {
      updates.push(`active = $${paramCount++}`);
      params.push(data.active);
    }

    if (updates.length === 0) {
      return { data: site };
    }

    updates.push(`updated_at = $${paramCount++}`);
    params.push(new Date());
    params.push(siteId);

    const query = `
      UPDATE sites
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const [updated] = await this.dataSource.query(query, params);

    this.eventEmitter.emit('site.updated', {
      site_id: siteId,
      changes: data,
      actor_id: user.id,
    });

    return { data: updated };
  }

  // ===== CATEGORIES =====

  /**
   * GET /v1/categories - List all categories (read only for dropdowns)
   * No role restriction - anyone can read
   */
  async listCategories(): Promise<{ data: Category[] }> {
    const query = `
      SELECT id, name, team_id, created_at, updated_at
      FROM categories
      ORDER BY name ASC
    `;

    const categories = await this.dataSource.query(query);
    return { data: categories };
  }

  /**
   * POST /v1/categories - Create category (Admin only)
   */
  async createCategory(
    user: User,
    data: { name: string; team_id: string },
  ): Promise<{ data: Category }> {
    this.validateAdmin(user);

    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('Category name is required');
    }

    if (!data.team_id) {
      throw new BadRequestException('Team ID is required');
    }

    // Verify team exists
    const [team] = await this.dataSource.query(
      'SELECT id FROM teams WHERE id = $1',
      [data.team_id],
    );

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    // Check for duplicate name within team
    const existing = await this.dataSource.query(
      'SELECT id FROM categories WHERE name = $1 AND team_id = $2',
      [data.name, data.team_id],
    );

    if (existing.length > 0) {
      throw new ConflictException('Category already exists in this team');
    }

    const id = this.generateId();
    const now = new Date();

    await this.dataSource.query(
      `INSERT INTO categories (id, name, team_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, data.name, data.team_id, now, now],
    );

    this.eventEmitter.emit('category.created', {
      category_id: id,
      name: data.name,
      team_id: data.team_id,
      actor_id: user.id,
    });

    return {
      data: {
        id,
        name: data.name,
        team_id: data.team_id,
        created_at: now,
        updated_at: now,
      },
    };
  }

  /**
   * PATCH /v1/categories/:id - Update category (Admin only)
   */
  async updateCategory(
    user: User,
    categoryId: string,
    data: { name?: string; team_id?: string },
  ): Promise<{ data: Category }> {
    this.validateAdmin(user);

    // Verify category exists
    const [category] = await this.dataSource.query(
      'SELECT * FROM categories WHERE id = $1',
      [categoryId],
    );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      // Check for duplicate name within team
      const teamId = data.team_id || category.team_id;
      const existing = await this.dataSource.query(
        'SELECT id FROM categories WHERE name = $1 AND team_id = $2 AND id != $3',
        [data.name, teamId, categoryId],
      );
      if (existing.length > 0) {
        throw new ConflictException('Category already exists in this team');
      }
      updates.push(`name = $${paramCount++}`);
      params.push(data.name);
    }

    if (data.team_id !== undefined) {
      // Validate team exists
      const [team] = await this.dataSource.query(
        'SELECT id FROM teams WHERE id = $1',
        [data.team_id],
      );
      if (!team) {
        throw new BadRequestException('Team not found');
      }
      updates.push(`team_id = $${paramCount++}`);
      params.push(data.team_id);
    }

    if (updates.length === 0) {
      return { data: category };
    }

    updates.push(`updated_at = $${paramCount++}`);
    params.push(new Date());
    params.push(categoryId);

    const query = `
      UPDATE categories
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const [updated] = await this.dataSource.query(query, params);

    this.eventEmitter.emit('category.updated', {
      category_id: categoryId,
      changes: data,
      actor_id: user.id,
    });

    return { data: updated };
  }

  // ===== USERS =====

  /**
   * GET /v1/users - List all users (Admin only)
   */
  async listUsers(user: User): Promise<{ data: UserResponse[] }> {
    this.validateAdmin(user);

    const query = `
      SELECT id, email, name, team_id, is_admin, is_support_triage,
             is_executive, active, created_at, updated_at
      FROM users
      ORDER BY email ASC
    `;

    const users = await this.dataSource.query(query);
    return { data: users };
  }

  /**
   * PATCH /v1/users/:id/roles - Update user roles (Admin only)
   */
  async updateUserRoles(
    user: User,
    userId: string,
    data: { is_admin?: boolean; is_support_triage?: boolean; is_executive?: boolean },
  ): Promise<{ data: UserResponse }> {
    this.validateAdmin(user);

    // Verify user exists
    const [targetUser] = await this.dataSource.query(
      'SELECT * FROM users WHERE id = $1',
      [userId],
    );

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (data.is_admin !== undefined) {
      updates.push(`is_admin = $${paramCount++}`);
      params.push(data.is_admin);
    }

    if (data.is_support_triage !== undefined) {
      updates.push(`is_support_triage = $${paramCount++}`);
      params.push(data.is_support_triage);
    }

    if (data.is_executive !== undefined) {
      updates.push(`is_executive = $${paramCount++}`);
      params.push(data.is_executive);
    }

    if (updates.length === 0) {
      return { data: targetUser };
    }

    updates.push(`updated_at = $${paramCount++}`);
    params.push(new Date());
    params.push(userId);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, name, team_id, is_admin, is_support_triage, is_executive, active, created_at, updated_at
    `;

    const [updated] = await this.dataSource.query(query, params);

    this.eventEmitter.emit('user.roles_updated', {
      user_id: userId,
      roles: data,
      actor_id: user.id,
    });

    return { data: updated };
  }

  // ===== TICKET SITE CORRECTION (Support/Triage only - NOT Admin) =====

  /**
   * PATCH /v1/tickets/:id/site - Correct ticket site (Support/Triage only)
   * Per FR-11.3: Only Support/Triage can correct site, Admin cannot
   */
  async correctTicketSite(
    user: User,
    ticketId: string,
    siteId: string,
  ): Promise<{ data: { id: string; site_id: string } }> {
    this.validateSupportTriage(user);

    // Verify ticket exists
    const [ticket] = await this.dataSource.query(
      'SELECT * FROM tickets WHERE id = $1',
      [ticketId],
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Verify site exists
    const [site] = await this.dataSource.query(
      'SELECT id FROM sites WHERE id = $1 AND active = true',
      [siteId],
    );

    if (!site) {
      throw new BadRequestException('Site not found or is inactive');
    }

    // Update ticket with new site
    await withActor(this.dataSource, user.id, (manager) =>
      manager.query(`UPDATE tickets SET site_id = $1, updated_at = $2 WHERE id = $3`, [siteId, new Date(), ticketId]),
    );

    this.eventEmitter.emit('ticket.site_corrected', {
      ticket_id: ticketId,
      site_id: siteId,
      actor_id: user.id,
    });

    return {
      data: {
        id: ticketId,
        site_id: siteId,
      },
    };
  }

  // ===== HELPERS =====

  private generateId(): string {
    return require('uuid').v4();
  }
}
