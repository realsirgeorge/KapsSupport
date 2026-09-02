import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `categories` was created without an `updated_at` column, but AdminService
 * reads and writes one in all three of its category operations:
 *   - listCategories  SELECT ... , updated_at
 *   - createCategory  INSERT ... (…, created_at, updated_at)
 *   - updateCategory  UPDATE ... SET updated_at = …
 *
 * So GET/POST/PATCH /v1/categories have every one of them been returning 500
 * since the admin module was written. It went unnoticed because the callers
 * swallow the failure and fall back to an empty list — which is why the
 * category chips on "New ticket", the category dropdown in the triage queue,
 * and the admin categories screen were all silently empty rather than
 * visibly broken.
 *
 * Adding the column (rather than removing it from the queries) keeps
 * categories consistent with teams, sites, users, and tickets, all of which
 * carry updated_at and the set_updated_at trigger. Categories are editable —
 * their owning team can change, which decides who may be assigned their
 * tickets — so knowing when that last happened is worth having.
 *
 * Backfilled from created_at so existing rows get a sensible value instead
 * of a null that every consumer would then have to special-case.
 */
export class AddCategoriesUpdatedAt1693526400003 implements MigrationInterface {
  name = 'AddCategoriesUpdatedAt1693526400003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE categories
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    `);

    await queryRunner.query(`UPDATE categories SET updated_at = created_at;`);

    // Same trigger the other mutable tables use, so the column maintains
    // itself instead of relying on every caller remembering to set it.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS categories_updated_at ON categories;
      CREATE TRIGGER categories_updated_at
      BEFORE UPDATE ON categories
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS categories_updated_at ON categories;`);
    await queryRunner.query(`ALTER TABLE categories DROP COLUMN IF EXISTS updated_at;`);
  }
}
