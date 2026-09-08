import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminService } from '../services/admin.service';

/**
 * Admin CRUD controllers for Teams, Sites, Categories, and Users
 * Also includes special Ticket Site Correction endpoint (Support/Triage only)
 *
 * Route prefix: /v1
 */

/**
 * Teams CRUD endpoints
 * Pattern: /v1/teams and /v1/teams/:id
 */
@Controller('/v1/teams')
@UseGuards(JwtAuthGuard)
export class AdminTeamsController {
  constructor(private adminService: AdminService) {}

  /**
   * GET /v1/teams - List all teams (read only)
   * Anyone authenticated can read (for dropdowns)
   */
  @Get()
  async listTeams() {
    const result = await this.adminService.listTeams();
    return result;
  }

  /**
   * POST /v1/teams - Create team (Admin only)
   */
  @Post()
  async createTeam(@Body() body: { name: string }, @Request() req: any) {
    if (!body.name) {
      throw new BadRequestException('Team name is required');
    }

    const result = await this.adminService.createTeam(req.user, body);
    return result;
  }

  /**
   * PATCH /v1/teams/:id - Update team (Admin only)
   */
  @Patch(':id')
  async updateTeam(
    @Param('id') id: string,
    @Body() body: { name?: string; manager_id?: string },
    @Request() req: any,
  ) {
    const result = await this.adminService.updateTeam(req.user, id, body);
    return result;
  }

  /**
   * DELETE /v1/teams/:id - Delete team (Admin only)
   */
  @Delete(':id')
  async deleteTeam(@Param('id') id: string, @Request() req: any) {
    const result = await this.adminService.deleteTeam(req.user, id);
    return result;
  }
}

/**
 * Sites CRUD endpoints
 * Pattern: /v1/sites and /v1/sites/:id
 */
@Controller('/v1/sites')
@UseGuards(JwtAuthGuard)
export class AdminSitesController {
  constructor(private adminService: AdminService) {}

  /**
   * GET /v1/sites - List all sites (read only)
   * Anyone authenticated can read (for dropdowns)
   */
  @Get()
  async listSites() {
    const result = await this.adminService.listSites();
    return result;
  }

  /**
   * POST /v1/sites - Create site (Admin only)
   */
  @Post()
  async createSite(
    @Body() body: { name: string; region?: string },
    @Request() req: any,
  ) {
    if (!body.name) {
      throw new BadRequestException('Site name is required');
    }

    const result = await this.adminService.createSite(req.user, body);
    return result;
  }

  /**
   * PATCH /v1/sites/:id - Update site (Admin only)
   */
  @Patch(':id')
  async updateSite(
    @Param('id') id: string,
    @Body() body: { name?: string; region?: string; active?: boolean },
    @Request() req: any,
  ) {
    const result = await this.adminService.updateSite(req.user, id, body);
    return result;
  }
}

/**
 * Categories CRUD endpoints
 * Pattern: /v1/categories and /v1/categories/:id
 */
@Controller('/v1/categories')
@UseGuards(JwtAuthGuard)
export class AdminCategoriesController {
  constructor(private adminService: AdminService) {}

  /**
   * GET /v1/categories - List all categories (read only)
   * Anyone authenticated can read (for dropdowns)
   */
  @Get()
  async listCategories() {
    const result = await this.adminService.listCategories();
    return result;
  }

  /**
   * POST /v1/categories - Create category (Admin only)
   */
  @Post()
  async createCategory(
    @Body() body: { name: string; team_id: string },
    @Request() req: any,
  ) {
    if (!body.name || !body.team_id) {
      throw new BadRequestException('Name and team_id are required');
    }

    const result = await this.adminService.createCategory(req.user, body);
    return result;
  }

  /**
   * PATCH /v1/categories/:id - Update category (Admin only)
   */
  @Patch(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: { name?: string; team_id?: string },
    @Request() req: any,
  ) {
    const result = await this.adminService.updateCategory(req.user, id, body);
    return result;
  }
}

/**
 * Users management endpoint
 * Pattern: /v1/users and /v1/users/:id/roles
 */
@Controller('/v1/users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(private adminService: AdminService) {}

  /**
   * GET /v1/users - List all users (Admin only)
   */
  @Get()
  async listUsers(@Request() req: any) {
    const result = await this.adminService.listUsers(req.user);
    return result;
  }

  /**
   * PATCH /v1/users/:id/roles - Update user roles (Admin only)
   */
  @Patch(':id/roles')
  async updateUserRoles(
    @Param('id') id: string,
    @Body() body: { is_admin?: boolean; is_support_triage?: boolean; is_executive?: boolean; team_id?: string | null },
    @Request() req: any,
  ) {
    const result = await this.adminService.updateUserRoles(req.user, id, body);
    return result;
  }
}

/**
 * Ticket Site Correction endpoint (Support/Triage only - NOT Admin)
 * Pattern: /v1/tickets/:id/site
 * Per FR-11.3: Only Support/Triage can correct site
 */
@Controller('/v1/tickets')
@UseGuards(JwtAuthGuard)
export class AdminTicketSiteCorrectionController {
  constructor(private adminService: AdminService) {}

  /**
   * PATCH /v1/tickets/:id/site - Correct ticket site (Support/Triage only)
   */
  @Patch(':id/site')
  async correctTicketSite(
    @Param('id') id: string,
    @Body() body: { site_id: string },
    @Request() req: any,
  ) {
    if (!body.site_id) {
      throw new BadRequestException('Site ID is required');
    }

    const result = await this.adminService.correctTicketSite(
      req.user,
      id,
      body.site_id,
    );
    return { data: result.data };
  }
}
