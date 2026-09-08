'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarOff, InboxIcon, CheckCheck } from 'lucide-react';
import { availabilityApi } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { PageHeader } from '@/components/app/page-header';
import { Section } from '@/components/ui/section';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { FormDialog, Field } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { relativeTime } from '@/lib/format';
import { toast } from 'sonner';

interface AvailabilityRequest {
  id: string;
  user_id: string;
  type: 'range' | 'toggle';
  start_date?: string | null;
  end_date?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'ended' | 'cancelled';
  requested_at: string;
  requester_name?: string;
}

const STATUS_VARIANT: Record<string, 'blue' | 'green' | 'red' | 'gray'> = {
  pending: 'blue',
  approved: 'green',
  rejected: 'red',
  ended: 'gray',
  cancelled: 'gray',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  ended: 'Ended',
  cancelled: 'Cancelled',
};

function describeDates(r: AvailabilityRequest): string {
  if (r.type === 'toggle') return 'Open-ended';
  if (!r.start_date || !r.end_date) return '—';
  return `${r.start_date} → ${r.end_date}`;
}

export default function AvailabilityPage() {
  const user = useUser();
  const allowed = useRequireRole(!!user.team_id || !!user.manages_team_id);
  const isManager = !!user.manages_team_id;

  const [requests, setRequests] = useState<AvailabilityRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [requestOpen, setRequestOpen] = useState(false);
  const [type, setType] = useState<'range' | 'toggle'>('toggle');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [decision, setDecision] = useState<{ req: AvailabilityRequest; action: 'approve' | 'reject' } | null>(
    null,
  );
  const [endTarget, setEndTarget] = useState<AvailabilityRequest | null>(null);

  const load = () => availabilityApi.list().then((res) => setRequests(res.data.data || []));

  useEffect(() => {
    if (!allowed) return;
    load()
      .catch(() => toast.error('Could not load availability requests'))
      .finally(() => setIsLoading(false));
  }, [allowed]);

  const mine = useMemo(() => requests.filter((r) => r.user_id === user.id), [requests, user.id]);
  const teamPending = useMemo(
    () => (isManager ? requests.filter((r) => r.user_id !== user.id && r.status === 'pending') : []),
    [requests, isManager, user.id],
  );

  const submitRequest = async () => {
    if (type === 'range' && (!startDate || !endDate)) {
      toast.error('A date range needs both a start and an end date');
      return false;
    }
    try {
      await availabilityApi.request({
        type,
        start_date: type === 'range' ? startDate : undefined,
        end_date: type === 'range' ? endDate : undefined,
      });
      toast.success('Request submitted — your manager will review it');
      setStartDate('');
      setEndDate('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not submit this request');
      return false;
    }
  };

  const decide = async () => {
    if (!decision) return;
    const { req, action } = decision;
    try {
      await availabilityApi[action](req.id);
      toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update this request');
      throw err;
    }
  };

  const endRequest = async () => {
    if (!endTarget) return;
    try {
      await availabilityApi.end(endTarget.id);
      toast.success(endTarget.status === 'pending' ? 'Request cancelled' : 'Availability restored');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update this request');
      throw err;
    }
  };

  const columns: Column<AvailabilityRequest>[] = [
    {
      key: 'type',
      header: 'Type',
      width: 'w-32',
      cell: (r) => <span className="text-foreground">{r.type === 'toggle' ? 'Open-ended' : 'Date range'}</span>,
    },
    {
      key: 'dates',
      header: 'Dates',
      cell: (r) => <span className="text-muted-foreground">{describeDates(r)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-44',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>,
    },
    {
      key: 'requested',
      header: 'Requested',
      width: 'w-32',
      hideBelowLg: true,
      cell: (r) => <span className="tabular text-muted-foreground">{relativeTime(r.requested_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-28',
      cell: (r) =>
        r.status === 'pending' || r.status === 'approved' ? (
          <Button size="sm" variant="outline" onClick={() => setEndTarget(r)}>
            {r.status === 'pending' ? 'Cancel' : 'End'}
          </Button>
        ) : null,
    },
  ];

  if (!allowed || isLoading) {
    return <PageSkeleton stats={0} rows={4} cols={5} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Availability"
        subtitle="Ask to be taken off new assignments. A manager reviews every request."
        action={<Button onClick={() => setRequestOpen(true)}>Request time off</Button>}
      />

      {isManager && (
        <Section title="Waiting on your approval" bare bodyClassName="space-y-3">
          {teamPending.length === 0 ? (
            <EmptyState
              size="compact"
              icon={CheckCheck}
              title="Nothing waiting on you"
              description="Your team has no leave requests to review right now."
            />
          ) : (
            teamPending.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-card"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.requester_name ?? 'Team member'} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {r.requester_name ?? 'A team member'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.type === 'toggle' ? 'Unavailable, open-ended' : describeDates(r)} · asked{' '}
                      {relativeTime(r.requested_at)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setDecision({ req: r, action: 'approve' })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDecision({ req: r, action: 'reject' })}>
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </Section>
      )}

      <Section title="My requests" bare>
        <DataTable
          columns={columns}
          rows={mine}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={CalendarOff}
              title="You haven't requested any time off"
              description="Ask to be taken off new assignments for a set period, or open-ended until you turn it back on."
              action={<Button onClick={() => setRequestOpen(true)}>Request time off</Button>}
            />
          }
        />
      </Section>

      <FormDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        title="Request time off"
        description="While you're unavailable you stay visible to everyone, but nobody can assign you new tickets. Work already assigned to you is unaffected."
        submitLabel="Submit request"
        onSubmit={submitRequest}
      >
        <Field
          label="Type"
          hint={
            type === 'toggle'
              ? 'Stays in effect until you or your manager turns it off.'
              : 'Ends automatically once the end date passes.'
          }
        >
          <Select value={type} onValueChange={(v) => setType(v as 'range' | 'toggle')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="toggle">Open-ended</SelectItem>
              <SelectItem value="range">Specific dates</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {type === 'range' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First day" htmlFor="start-date" required>
              <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Last day" htmlFor="end-date" required>
              <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        title={
          decision?.action === 'approve'
            ? `Approve time off for ${decision?.req.requester_name ?? 'this member'}?`
            : `Reject this request from ${decision?.req.requester_name ?? 'this member'}?`
        }
        description={
          decision?.action === 'approve'
            ? 'They stay visible to everyone but stop being selectable for new assignments. Tickets already assigned to them are unaffected.'
            : 'They stay available for new assignments. Let them know why separately — the system does not pass on a reason.'
        }
        confirmLabel={decision?.action === 'approve' ? 'Approve' : 'Reject'}
        onConfirm={decide}
      />

      <ConfirmDialog
        open={!!endTarget}
        onOpenChange={(o) => !o && setEndTarget(null)}
        title={endTarget?.status === 'pending' ? 'Cancel this request?' : 'End this early?'}
        description={
          endTarget?.status === 'pending'
            ? 'It is withdrawn before your manager decides. You can ask again at any time.'
            : 'You become selectable for new assignments again straight away.'
        }
        confirmLabel={endTarget?.status === 'pending' ? 'Cancel request' : 'End now'}
        onConfirm={endRequest}
      />
    </div>
  );
}
