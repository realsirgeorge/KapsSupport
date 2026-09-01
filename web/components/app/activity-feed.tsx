import Link from 'next/link';
import { describeActivity, type ActivityEntry } from '@/lib/activity';
import { relativeTime } from '@/lib/format';

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No recent activity.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {entries.map((entry) => {
        const { actor, before, after } = describeActivity(entry);
        const initial = actor.trim().charAt(0).toUpperCase();
        return (
          <div key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-semibold">{actor}</span> {before}{' '}
                <Link href={`/dashboard/tickets/${entry.ticket_id}`} className="font-mono text-primary hover:underline">
                  {entry.ticket_number}
                </Link>
                {after && ` ${after}`}
              </p>
              <p className="text-xs text-muted-foreground">{relativeTime(entry.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
