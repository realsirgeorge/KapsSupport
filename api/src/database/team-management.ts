import { DataSource, EntityManager } from 'typeorm';

/**
 * Resolves the team a user *manages*, or null.
 *
 * `users.team_id` means "is a member of this team" — it does NOT mean
 * "manages this team". Management is stored the other way round, on
 * `teams.manager_id`. Comparing `team_id === team_id` to authorize a
 * manager-only action therefore grants it to every member of the team.
 *
 * That exact mistake produced four separate authorization bugs in this
 * codebase (ticket visibility, priority confirm, ticket assign, and the
 * whole availability approve/reject/list flow), which is why this lives
 * in one place instead of being re-derived per service.
 */
export async function getManagesTeamId(
  db: DataSource | EntityManager,
  userId: string,
): Promise<string | null> {
  const [team] = await db.query('SELECT id FROM teams WHERE manager_id = $1 LIMIT 1', [userId]);
  return team ? team.id : null;
}
