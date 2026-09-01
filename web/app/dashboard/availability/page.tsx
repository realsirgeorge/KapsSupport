'use client';

import { useEffect, useMemo, useState } from 'react';
import { availabilityApi } from '@/lib/api-client';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  decided_at?: string | null;
  ended_at?: string | null;
  requester_name?: string;
}

const STATUS_VARIANT: Record<string, 'blue' | 'green' | 'red' | 'gray'> = {
  pending: 'blue',
  approved: 'green',
  rejected: 'red',
  ended: 'gray',
  cancelled: 'gray',
};

export default function AvailabilityPage() {
  const user = useUser();
  const allowed = useRequireRole(!!user.team_id || !!user.manages_team_id);
  const isManager = !!user.manages_team_id;

  const [requests, setRequests] = useState<AvailabilityRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [requestOpen, setRequestOpen] = useState(false);
  const [type, setType] = useState<'range' | 'toggle'>('toggle');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => availabilityApi.list().then((res) => setRequests(res.data.data || []));

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  const mine = useMemo(() => requests.filter((r) => r.user_id === user.id), [requests, user.id]);
  const teamPending = useMemo(
    () => (isManager ? requests.filter((r) => r.user_id !== user.id && r.status === 'pending') : []),
    [requests, isManager, user.id],
  );

  const submitRequest = async () => {
    if (type === 'range' && (!startDate || !endDate)) {
      toast.error('Both start and end dates are required for a date-range request');
      return;
    }
    setSubmitting(true);
    try {
      await availabilityApi.request({
        type,
        start_date: type === 'range' ? startDate : undefined,
        end_date: type === 'range' ? endDate : undefined,
      });
      toast.success('Request submitted — your manager will review it');
      setRequestOpen(false);
      setStartDate('');
      setEndDate('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (id: string, action: 'approve' | 'reject' | 'end') => {
    setBusyId(id);
    try {
      await availabilityApi[action](id);
      toast.success(
        action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Ended',
      );
      await load();
    } catch {
      toast.error('Could not update the request');
    } finally {
      setBusyId(null);
    }
  };

  if (!allowed || isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Availability"
        subtitle="Request time off or toggle yourself unavailable — a manager reviews every request"
        action={<Button onClick={() => setRequestOpen(true)}>+ Request time off</Button>}
      />

      {isManager && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending approvals</p>
          {teamPending.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Nothing waiting on you.
            </div>
          ) : (
            <div className="space-y-3">
              {teamPending.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.requester_name ?? 'A team member'} — {r.type === 'toggle' ? 'Unavailable (open-ended)' : `${r.start_date} → ${r.end_date}`}
                    </p>
                    <p className="text-xs text-muted-foreground">Requested {relativeTime(r.requested_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, 'approve')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => act(r.id, 'reject')}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My requests</p>
        {mine.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No requests yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Dates</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Requested</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3 text-foreground">{r.type === 'toggle' ? 'Toggle' : 'Date range'}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {r.type === 'range' ? `${r.start_date} → ${r.end_date}` : 'Open-ended'}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>{r.status}</Badge>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{relativeTime(r.requested_at)}</td>
                    <td className="px-6 py-3 text-right">
                      {(r.status === 'pending' || r.status === 'approved') && (
                        <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => act(r.id, 'end')}>
                          {r.status === 'pending' ? 'Cancel' : 'End'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request time off</DialogTitle>
            <DialogDescription>
              Toggle marks you unavailable right away once approved, with no end date. A date range is for planned
              leave and clears automatically when it ends.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'range' | 'toggle')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toggle">Toggle (open-ended)</SelectItem>
                  <SelectItem value="range">Date range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === 'range' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Start date</Label>
                  <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date">End date</Label>
                  <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRequest} disabled={submitting}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
