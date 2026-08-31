import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTriggersAndConstraints1693526400001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create set_updated_at trigger function
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Apply updated_at trigger to all tables that have it
    await queryRunner.query(`
      CREATE TRIGGER users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    await queryRunner.query(`
      CREATE TRIGGER teams_updated_at
      BEFORE UPDATE ON teams
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    await queryRunner.query(`
      CREATE TRIGGER sites_updated_at
      BEFORE UPDATE ON sites
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    await queryRunner.query(`
      CREATE TRIGGER tickets_updated_at
      BEFORE UPDATE ON tickets
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    // Create the check_assignee_matches_category trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION check_assignee_matches_category()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.assigned_to IS NOT NULL AND NEW.confirmed_category_id IS NOT NULL THEN
          IF (SELECT team_id FROM users WHERE id = NEW.assigned_to)
             != (SELECT team_id FROM categories WHERE id = NEW.confirmed_category_id) THEN
            RAISE EXCEPTION 'Assignee is not a member of the confirmed category''s team';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER tickets_assignee_category_consistency
      BEFORE INSERT OR UPDATE ON tickets
      FOR EACH ROW
      EXECUTE FUNCTION check_assignee_matches_category();
    `);

    // Create ticket_history audit trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_ticket_changes()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO ticket_history (ticket_id, actor_id, action, created_at)
          VALUES (NEW.id, NEW.requester_id, 'created', now());
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          -- Status changes
          IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid, 'status_changed', 'status', OLD.status, NEW.status, now());
          END IF;

          -- Category confirmations
          IF OLD.confirmed_category_id IS DISTINCT FROM NEW.confirmed_category_id THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid, 'category_changed', 'confirmed_category_id', OLD.confirmed_category_id::text, NEW.confirmed_category_id::text, now());
          END IF;

          -- Assignments
          IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid,
              CASE WHEN OLD.assigned_to IS NULL THEN 'assigned' ELSE 'reassigned' END,
              'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text, now());
          END IF;

          -- Site corrections
          IF OLD.site_id IS DISTINCT FROM NEW.site_id THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid, 'site_corrected', 'site_id', OLD.site_id::text, NEW.site_id::text, now());
          END IF;

          -- Resolved state
          IF OLD.status != 'resolved' AND NEW.status = 'resolved' THEN
            UPDATE tickets SET resolved_at = now() WHERE id = NEW.id;
          END IF;

          -- Pending confirmation state
          IF OLD.status != 'pending_confirmation' AND NEW.status = 'pending_confirmation' THEN
            UPDATE tickets SET pending_confirmation_at = now() WHERE id = NEW.id;
          END IF;

          -- Closed state
          IF OLD.status != 'closed' AND NEW.status = 'closed' THEN
            UPDATE tickets SET closed_at = now() WHERE id = NEW.id;
          END IF;

          RETURN NEW;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER tickets_audit
      AFTER INSERT OR UPDATE ON tickets
      FOR EACH ROW
      EXECUTE FUNCTION audit_ticket_changes();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS tickets_audit ON tickets;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS audit_ticket_changes();`);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS tickets_assignee_category_consistency ON tickets;`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS check_assignee_matches_category();`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS tickets_updated_at ON tickets;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS sites_updated_at ON sites;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS teams_updated_at ON teams;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS users_updated_at ON users;`);

    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at();`);
  }
}
