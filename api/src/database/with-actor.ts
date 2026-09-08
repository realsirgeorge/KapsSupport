import { DataSource, EntityManager } from 'typeorm';

/**
 * Runs `fn` inside a transaction with `app.current_user_id` set for its
 * duration (SET LOCAL semantics — scoped to this transaction only, never
 * leaks onto other pooled connections). The `audit_ticket_changes` DB
 * trigger reads this session variable to attribute ticket_history rows to
 * an actor; without it, every UPDATE-triggered audit row records a blank
 * actor_id (INSERTs are fine — those pass actor_id as a normal column).
 */
export async function withActor<T>(
  dataSource: DataSource,
  actorId: string,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await manager.query(`SELECT set_config('app.current_user_id', $1, true)`, [actorId]);
    return fn(manager);
  });
}
