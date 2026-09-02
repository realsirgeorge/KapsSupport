'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users2, SearchX } from 'lucide-react';
import { adminApi } from '@/lib/api-client';
import { PageHeader } from '@/components/app/page-header';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { useSearch } from '@/components/app/search-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { FormDialog, Field } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';

interface Team {
  id: string;
  name: string;
  manager_id?: string | null;
  active: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  team_id?: string | null;
}

/** Radix Select cannot hold an empty string, so "no manager" needs a sentinel. */
const NO_MANAGER = '__none';

export default function AdminTeamsPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin);
  const { query } = useSearch();

  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState('');
  const [editManagerId, setEditManagerId] = useState(NO_MANAGER);

  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  const load = () =>
    Promise.all([adminApi.teams.list(), adminApi.users.list()]).then(([teamsRes, usersRes]) => {
      setTeams(teamsRes.data.data || []);
      setUsers(usersRes.data.data || []);
    });

  useEffect(() => {
    if (!allowed) return;
    load()
      .catch(() => toast.error('Could not load teams'))
      .finally(() => setIsLoading(false));
  }, [allowed]);

  const managerOf = (t: Team) => users.find((u) => u.id === t.manager_id);
  const memberCount = (t: Team) => users.filter((u) => u.team_id === t.id).length;

  const createTeam = async () => {
    if (!newName.trim()) return false;
    try {
      await adminApi.teams.create({ name: newName.trim() });
      toast.success(`Created ${newName.trim()}`);
      setNewName('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not create this team');
      return false;
    }
  };

  const saveTeam = async () => {
    if (!editTeam || !editName.trim()) return false;
    try {
      await adminApi.teams.update(editTeam.id, {
        name: editName.trim(),
        // undefined leaves the manager untouched; the API has no "clear manager"
        // path, and FR-3.7 wants exactly one manager per team anyway.
        manager_id: editManagerId === NO_MANAGER ? undefined : editManagerId,
      });
      toast.success(`Updated ${editName.trim()}`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update this team');
      return false;
    }
  };

  const deleteTeam = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.teams.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.name}`);
      await load();
    } catch (err: any) {
      // The API refuses with a specific 409 while the team still holds
      // in-flight tickets — show that, not a generic failure.
      toast.error(err?.response?.data?.message ?? 'Could not delete this team');
      throw err; // keep the dialog open so the reason stays on screen
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return teams;
    const q = query.toLowerCase();
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, query]);

  const columns: Column<Team>[] = [
    {
      key: 'name',
      header: 'Team',
      cell: (t) => <span className="font-medium text-foreground">{t.name}</span>,
    },
    {
      key: 'manager',
      header: 'Manager',
      cell: (t) => {
        const m = managerOf(t);
        return m ? (
          <span className="text-foreground">{m.name}</span>
        ) : (
          <span className="text-status-amber">No manager assigned</span>
        );
      },
    },
    {
      key: 'members',
      header: 'Members',
      align: 'right',
      width: 'w-28',
      hideBelowLg: true,
      cell: (t) => <span className="tabular text-muted-foreground">{memberCount(t)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      cell: (t) => <Badge variant={t.active ? 'green' : 'gray'}>{t.active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-44',
      cell: (t) => (
        <span className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditTeam(t);
              setEditName(t.name);
              setEditManagerId(t.manager_id ?? NO_MANAGER);
            }}
          >
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(t)}>
            Delete
          </Button>
        </span>
      ),
    },
  ];

  if (!allowed || isLoading) {
    return <PageSkeleton stats={0} rows={5} cols={5} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Teams"
        subtitle="Teams own categories, and a ticket's category decides which team works it"
        action={<Button onClick={() => setCreateOpen(true)}>New team</Button>}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(t) => t.id}
        empty={
          teams.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No teams yet"
              description="Create a team, then give it a category so tickets can be routed to it."
              action={<Button onClick={() => setCreateOpen(true)}>New team</Button>}
            />
          ) : (
            <EmptyState icon={SearchX} title="No teams match your search" />
          )
        }
      />

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New team"
        description="You can assign a manager and members once the team exists."
        submitLabel="Create team"
        submitDisabled={!newName.trim()}
        onSubmit={createTeam}
      >
        <Field label="Name" htmlFor="team-name" required>
          <Input
            id="team-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Network Operations"
          />
        </Field>
      </FormDialog>

      <FormDialog
        open={!!editTeam}
        onOpenChange={(o) => !o && setEditTeam(null)}
        title={editTeam ? `Edit ${editTeam.name}` : 'Edit team'}
        submitLabel="Save changes"
        submitDisabled={!editName.trim()}
        onSubmit={saveTeam}
      >
        <Field label="Name" htmlFor="edit-team-name" required>
          <Input id="edit-team-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </Field>
        <Field
          label="Manager"
          hint="Each team has exactly one manager. They can reassign work within the team and approve their members' leave."
        >
          <Select value={editManagerId} onValueChange={setEditManagerId}>
            <SelectTrigger>
              <SelectValue placeholder="No manager assigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MANAGER}>No manager assigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? 'this team'}?`}
        description="This cannot be undone. Deletion is refused while the team still has tickets that aren't closed — reassign or close those first."
        confirmLabel="Delete team"
        destructive
        onConfirm={deleteTeam}
      />
    </div>
  );
}
