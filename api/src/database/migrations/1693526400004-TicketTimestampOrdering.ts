import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A ticket cannot be resolved, sent for confirmation, or closed before it was
 * created — but nothing enforced that, and rows violating it did reach the
 * database (from a seed script that picked each timestamp independently
 * rather than deriving it from created_at).
 *
 * The damage was quiet but real: `AVG(closed_at - created_at)` on the team
 * and system dashboards is a plain average with no guard, so two impossible
 * rows dragged a team's "avg resolution time" to **-600 hours**. A negative
 * duration is not a rendering bug to paper over in the UI — it means the
 * stored data is contradictory, so it is rejected at the boundary instead.
 *
 * NOT VALID validates new and updated rows while skipping the existing-row
 * scan, so this cannot fail on legacy data mid-deploy; the VALIDATE that
 * follows then checks what is already stored, and will error loudly if
 * anything still violates rather than silently accepting it.
 */
export class TicketTimestampOrdering1693526400004 implements MigrationInterface {
  name = 'TicketTimestampOrdering1693526400004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tickets
      ADD CONSTRAINT tickets_resolved_after_created
      CHECK (resolved_at IS NULL OR resolved_at >= created_at) NOT VALID;
    `);
    await queryRunner.query(`
      ALTER TABLE tickets
      ADD CONSTRAINT tickets_confirmation_after_created
      CHECK (pending_confirmation_at IS NULL OR pending_confirmation_at >= created_at) NOT VALID;
    `);
    await queryRunner.query(`
      ALTER TABLE tickets
      ADD CONSTRAINT tickets_closed_after_created
      CHECK (closed_at IS NULL OR closed_at >= created_at) NOT VALID;
    `);

    await queryRunner.query(`ALTER TABLE tickets VALIDATE CONSTRAINT tickets_resolved_after_created;`);
    await queryRunner.query(`ALTER TABLE tickets VALIDATE CONSTRAINT tickets_confirmation_after_created;`);
    await queryRunner.query(`ALTER TABLE tickets VALIDATE CONSTRAINT tickets_closed_after_created;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_resolved_after_created;`);
    await queryRunner.query(`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_confirmation_after_created;`);
    await queryRunner.query(`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_closed_after_created;`);
  }
}
