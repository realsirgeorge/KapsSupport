import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1693526400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable citext extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext;`);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email CITEXT UNIQUE NOT NULL,
        password_hash TEXT,
        sso_provider TEXT,
        sso_subject_id TEXT,
        team_id UUID,
        is_support_triage BOOLEAN NOT NULL DEFAULT false,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        is_executive BOOLEAN NOT NULL DEFAULT false,
        is_unavailable BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT auth_method_present CHECK (password_hash IS NOT NULL OR sso_provider IS NOT NULL)
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX users_sso_identity ON users (sso_provider, sso_subject_id) WHERE sso_provider IS NOT NULL;`,
    );

    // Create teams table
    await queryRunner.query(`
      CREATE TABLE teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        manager_id UUID,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Now add the foreign key for users.team_id
    await queryRunner.query(
      `ALTER TABLE users ADD CONSTRAINT users_team_fk FOREIGN KEY (team_id) REFERENCES teams(id);`,
    );

    // Add foreign key for teams.manager_id
    await queryRunner.query(
      `ALTER TABLE teams ADD CONSTRAINT teams_manager_fk FOREIGN KEY (manager_id) REFERENCES users(id);`,
    );

    // Create sites table
    await queryRunner.query(`
      CREATE TABLE sites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        region TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX sites_name_region_idx ON sites (name, region);`,
    );

    // Create categories table
    await queryRunner.query(`
      CREATE TABLE categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        team_id UUID NOT NULL REFERENCES teams(id),
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Create tickets table
    await queryRunner.query(`
      CREATE TABLE tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_number TEXT UNIQUE NOT NULL,
        requester_id UUID NOT NULL REFERENCES users(id),
        site_id UUID NOT NULL REFERENCES sites(id),
        suggested_category_id UUID REFERENCES categories(id),
        confirmed_category_id UUID REFERENCES categories(id),
        assigned_to UUID REFERENCES users(id),
        assigned_by UUID REFERENCES users(id),
        assigned_at TIMESTAMPTZ,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('english', subject || ' ' || coalesce(description, ''))
        ) STORED,
        suggested_priority TEXT,
        confirmed_priority TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        pending_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ,
        pending_confirmation_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        CONSTRAINT valid_status CHECK (status IN (
          'new', 'assigned', 'in_progress', 'pending',
          'resolved', 'pending_confirmation', 'closed', 'reopened'
        )),
        CONSTRAINT valid_suggested_priority CHECK (suggested_priority IS NULL OR suggested_priority IN ('low','medium','high','urgent')),
        CONSTRAINT valid_confirmed_priority CHECK (confirmed_priority IS NULL OR confirmed_priority IN ('low','medium','high','urgent')),
        CONSTRAINT pending_needs_reason CHECK (status != 'pending' OR pending_reason IS NOT NULL)
      );
    `);

    await queryRunner.query(
      `CREATE INDEX tickets_requester_idx ON tickets (requester_id);`,
    );
    await queryRunner.query(`CREATE INDEX tickets_assigned_to_idx ON tickets (assigned_to);`);
    await queryRunner.query(`CREATE INDEX tickets_site_idx ON tickets (site_id);`);
    await queryRunner.query(`CREATE INDEX tickets_status_idx ON tickets (status);`);
    await queryRunner.query(`CREATE INDEX tickets_priority_idx ON tickets (confirmed_priority);`);
    await queryRunner.query(`CREATE INDEX tickets_search_idx ON tickets USING GIN (search_vector);`);

    // Create ticket_comments table
    await queryRunner.query(`
      CREATE TABLE ticket_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES tickets(id),
        author_id UUID NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        is_internal BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX ticket_comments_ticket_idx ON ticket_comments (ticket_id);`,
    );

    // Create ticket_attachments table
    await queryRunner.query(`
      CREATE TABLE ticket_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES tickets(id),
        comment_id UUID REFERENCES ticket_comments(id),
        uploaded_by UUID NOT NULL REFERENCES users(id),
        storage_key TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        validated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT valid_attachment_status CHECK (status IN ('pending', 'safe', 'rejected'))
      );
    `);

    await queryRunner.query(
      `CREATE INDEX ticket_attachments_ticket_idx ON ticket_attachments (ticket_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX ticket_attachments_status_idx ON ticket_attachments (status);`,
    );

    // Create ticket_history table (append-only audit log)
    await queryRunner.query(`
      CREATE TABLE ticket_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES tickets(id),
        actor_id UUID REFERENCES users(id),
        action TEXT NOT NULL,
        field_changed TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX ticket_history_ticket_idx ON ticket_history (ticket_id, created_at);`,
    );

    // Create availability_requests table
    await queryRunner.query(`
      CREATE TABLE availability_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        start_date DATE,
        end_date DATE,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_by UUID REFERENCES users(id),
        decided_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        CONSTRAINT valid_type CHECK (type IN ('range', 'toggle')),
        CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'ended', 'cancelled')),
        CONSTRAINT range_needs_start CHECK (type != 'range' OR start_date IS NOT NULL)
      );
    `);

    await queryRunner.query(
      `CREATE INDEX availability_requests_user_idx ON availability_requests (user_id, status);`,
    );

    // Create notifications table
    await queryRunner.query(`
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        ticket_id UUID REFERENCES tickets(id),
        channel TEXT NOT NULL DEFAULT 'email',
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT valid_notification_status CHECK (status IN ('pending', 'sent', 'failed'))
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications');

    await queryRunner.dropIndex('availability_requests', 'availability_requests_user_idx');
    await queryRunner.dropTable('availability_requests');

    await queryRunner.dropIndex('ticket_history', 'ticket_history_ticket_idx');
    await queryRunner.dropTable('ticket_history');

    await queryRunner.dropIndex('ticket_attachments', 'ticket_attachments_status_idx');
    await queryRunner.dropIndex('ticket_attachments', 'ticket_attachments_ticket_idx');
    await queryRunner.dropTable('ticket_attachments');

    await queryRunner.dropIndex('ticket_comments', 'ticket_comments_ticket_idx');
    await queryRunner.dropTable('ticket_comments');

    await queryRunner.dropIndex('tickets', 'tickets_search_idx');
    await queryRunner.dropIndex('tickets', 'tickets_priority_idx');
    await queryRunner.dropIndex('tickets', 'tickets_status_idx');
    await queryRunner.dropIndex('tickets', 'tickets_site_idx');
    await queryRunner.dropIndex('tickets', 'tickets_assigned_to_idx');
    await queryRunner.dropIndex('tickets', 'tickets_requester_idx');
    await queryRunner.dropTable('tickets');

    await queryRunner.dropTable('categories');

    await queryRunner.dropIndex('sites', 'sites_name_region_idx');
    await queryRunner.dropTable('sites');

    await queryRunner.query(`ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_manager_fk;`);
    await queryRunner.dropTable('teams');

    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_team_fk;`);
    await queryRunner.dropIndex('users', 'users_sso_identity');
    await queryRunner.dropTable('users');

    await queryRunner.query(`DROP EXTENSION IF EXISTS citext;`);
  }
}
