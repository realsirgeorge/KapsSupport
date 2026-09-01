import 'dotenv/config';
import { AppDataSource } from './data-source';
import * as bcrypt from 'bcryptjs';

const PASSWORD = 'Password123!';

async function seed() {
  await AppDataSource.initialize();
  const password_hash = await bcrypt.hash(PASSWORD, 10);

  try {
    const [team] = await AppDataSource.query(
      `INSERT INTO teams (name) VALUES ('Fintech Support')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );

    const [site] = await AppDataSource.query(
      `INSERT INTO sites (name, region) VALUES ('Westgate', 'Nairobi')
       RETURNING id`,
    );

    const [category] = await AppDataSource.query(
      `INSERT INTO categories (name, team_id) VALUES ('Fintech', $1)
       ON CONFLICT (name) DO UPDATE SET team_id = EXCLUDED.team_id
       RETURNING id`,
      [team.id],
    );

    const users = [
      { email: 'requester@example.com', name: 'Rita Requester', flags: {} },
      {
        email: 'member@example.com',
        name: 'Mo Member',
        flags: { team_id: team.id },
      },
      {
        email: 'manager@example.com',
        name: 'Mia Manager',
        flags: { team_id: team.id },
      },
      {
        email: 'support@example.com',
        name: 'Sam Support',
        flags: { is_support_triage: true },
      },
      {
        email: 'admin@example.com',
        name: 'Ada Admin',
        flags: { is_admin: true },
      },
    ];

    const ids: Record<string, string> = {};

    for (const u of users) {
      const [row] = await AppDataSource.query(
        `INSERT INTO users (name, email, password_hash, team_id, is_support_triage, is_admin, is_executive)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, team_id = EXCLUDED.team_id
         RETURNING id`,
        [
          u.name,
          u.email,
          password_hash,
          (u.flags as any).team_id || null,
          !!(u.flags as any).is_support_triage,
          !!(u.flags as any).is_admin,
        ],
      );
      ids[u.email] = row.id;
    }

    // Make manager@example.com the manager of the team
    await AppDataSource.query(`UPDATE teams SET manager_id = $1 WHERE id = $2`, [
      ids['manager@example.com'],
      team.id,
    ]);

    console.log('Seed complete.');
    console.log(`Team: Fintech Support (${team.id})`);
    console.log(`Site: Westgate (${site.id})`);
    console.log(`Category: Fintech (${category.id})`);
    console.log(`Password for all seeded users: ${PASSWORD}`);
    for (const u of users) {
      console.log(`  ${u.email} -> ${ids[u.email]}`);
    }
  } catch (err) {
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
