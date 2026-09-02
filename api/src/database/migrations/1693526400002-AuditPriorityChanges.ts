import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The audit trigger logged creation, status changes, category confirmations,
 * assignment/reassignment and site corrections — but not priority.
 *
 * That was invisible until the per-ticket audit trail (FR-8.2) became a real
 * screen: a Support/Triage user could confirm or change a ticket's priority
 * (FR-2.8/2.9) and the ticket's own history would show nothing at all. Adds a
 * `confirmed_priority` branch so priority decisions are attributable like every
 * other change.
 *
 * The rest of the function is reproduced verbatim from
 * 1693526400001-AddTriggersAndConstraints.ts because CREATE OR REPLACE
 * FUNCTION has to restate the whole body.
 */
export class AuditPriorityChanges1693526400002 implements MigrationInterface {
  name = 'AuditPriorityChanges1693526400002';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

          -- Priority confirmations / changes (FR-2.8/2.9)
          IF OLD.confirmed_priority IS DISTINCT FROM NEW.confirmed_priority THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid, 'priority_changed', 'confirmed_priority', OLD.confirmed_priority, NEW.confirmed_priority, now());
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop only the priority branch, restoring the previous body.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_ticket_changes()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO ticket_history (ticket_id, actor_id, action, created_at)
          VALUES (NEW.id, NEW.requester_id, 'created', now());
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid, 'status_changed', 'status', OLD.status, NEW.status, now());
          END IF;

          IF OLD.confirmed_category_id IS DISTINCT FROM NEW.confirmed_category_id THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid, 'category_changed', 'confirmed_category_id', OLD.confirmed_category_id::text, NEW.confirmed_category_id::text, now());
          END IF;

          IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid,
              CASE WHEN OLD.assigned_to IS NULL THEN 'assigned' ELSE 'reassigned' END,
              'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text, now());
          END IF;

          IF OLD.site_id IS DISTINCT FROM NEW.site_id THEN
            INSERT INTO ticket_history (ticket_id, actor_id, action, field_changed, old_value, new_value, created_at)
            VALUES (NEW.id, (SELECT current_setting('app.current_user_id', true))::uuid, 'site_corrected', 'site_id', OLD.site_id::text, NEW.site_id::text, now());
          END IF;

          IF OLD.status != 'resolved' AND NEW.status = 'resolved' THEN
            UPDATE tickets SET resolved_at = now() WHERE id = NEW.id;
          END IF;

          IF OLD.status != 'pending_confirmation' AND NEW.status = 'pending_confirmation' THEN
            UPDATE tickets SET pending_confirmation_at = now() WHERE id = NEW.id;
          END IF;

          IF OLD.status != 'closed' AND NEW.status = 'closed' THEN
            UPDATE tickets SET closed_at = now() WHERE id = NEW.id;
          END IF;

          RETURN NEW;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
