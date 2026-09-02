'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, SearchX } from 'lucide-react';
import { adminApi } from '@/lib/api-client';
import { PageHeader } from '@/components/app/page-header';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { useSearch } from '@/components/app/search-context';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { FormDialog, Field } from '@/components/ui/form-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';

interface UserRow {
  id: string;
  email: string;
  name: string;
  team_id?: string | null;
  is_admin: boolean;
  is_support_triage: boolean;
  is_executive: boolean;
  active: boolean;
}

interface Team {
  id: string;
  name: string;
  manager_id?: string | null;
}

/** Sentinel for "no team" — Radix Select cannot hold an empty string value. */
const NO_TEAM = '__none';

const ROLE_FLAGS = [
  { key: 'is_admin', label: 'Admin', hint: 'Full read and write access across the whole system.' },
  { key: 'is_support_triage', label: 'Support / Triage', hint: 'Works the incoming queue: confirms categories and assigns tickets.' },
  { key: 'is_executive', label: 'Executive', hint: 'Sees everything system-wide, but read-only.' },
] as const;

export default function AdminUsersPage() {
  const currentUser = useUser();
  const allowed = useRequireRole(currentUser.is_admin);
  const { query } = useSearch();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [draft, setDraft] = useState({
    is_admin: false,
    is_support_triage: false,
    is_executive: false,
    team_id: NO_TEAM,
  });

  const load = () =>
    Promise.all([adminApi.users.list(), adminApi.teams.list()]).then(([usersRes, teamsRes]) => {
      setUsers(usersRes.data.data || []);
      setTeams(teamsRes.data.data || []);
    });

  useEffect(() => {
    if (!allowed) return;
    load()
      .catch(() => toast.error('Could not load users'))
      .finally(() => setIsLoading(false));
  }, [allowed]);

  const teamName = (id?: string | null) => teams.find((t) => t.id === id)?.name;
  const managedTeam = (userId: string) => teams.find((t) => t.manager_id === userId);

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setDraft({
      is_admin: u.is_admin,
      is_support_triage: u.is_support_triage,
      is_executive: u.is_executive,
      team_id: u.team_id ?? NO_TEAM,
    });
  };

  const save = async () => {
    if (!editUser) return false;
    // An admin removing their own admin rights would lock themselves out of
    // this very screen, so block it here as well as explaining why.
    if (editUser.id === currentUser.id && !draft.is_admin) {
      toast.error("You can't remove your own admin access.");
      return false;
    }
    try {
      await adminApi.users.updateRoles(editUser.id, {
        is_admin: draft.is_admin,
        is_support_triage: draft.is_support_triage,
        is_executive: draft.is_executive,
        team_id: draft.team_id === NO_TEAM ? null : draft.team_id,
      });
      toast.success(`Updated ${editUser.name}`);
      await load();
    } catch (err: any) {
      // The API returns a specific 409 when removing a team's manager from it.
      toast.error(err?.response?.data?.message ?? 'Could not update this user');
      return false;
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, query]);

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={u.name} size="sm" />
          <span className="font-medium text-foreground">{u.name}</span>
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      hideBelowLg: true,
      cell: (u) => <span className="text-muted-foreground">{u.email}</span>,
    },
    {
      key: 'team',
      header: 'Team',
      cell: (u) => {
        const manages = managedTeam(u.id);
        if (manages) {
          return (
            <span className="flex items-center gap-1.5">
              <span className="text-foreground">{manages.name}</span>
              <Badge variant="green">Manager</Badge>
            </span>
          );
        }
        return <span className="text-muted-foreground">{teamName(u.team_id) ?? 'No team'}</span>;
      },
    },
    {
      key: 'roles',
      header: 'Roles',
      cell: (u) => {
        const badges: React.ReactNode[] = [];
        if (u.is_admin) badges.push(<Badge key="a">Admin</Badge>);
        if (u.is_support_triage)
          badges.push(
            <Badge key="s" variant="blue">
              Support / Triage
            </Badge>,
          );
        if (u.is_executive)
          badges.push(
            <Badge key="e" variant="purple">
              Executive
            </Badge>,
          );
        if (badges.length === 0)
          badges.push(
            <Badge key="m" variant="outline">
              {u.team_id ? 'Team member' : 'Requester'}
            </Badge>,
          );
        return <span className="flex flex-wrap gap-1.5">{badges}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-28',
      cell: (u) => (
        <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
          Edit
        </Button>
      ),
    },
  ];

  if (!allowed || isLoading) {
    return <PageSkeleton stats={0} rows={6} cols={5} />;
  }

  const editingManagedTeam = editUser ? managedTeam(editUser.id) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        name={currentUser.name}
        title="Users & roles"
        subtitle="Grant access and decide which team each person belongs to"
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        empty={
          users.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No users match your search"
              description={`Nothing matches "${query.trim()}".`}
            />
          )
        }
      />

      <FormDialog
        open={!!editUser}
        onOpenChange={(o) => !o && setEditUser(null)}
        title={editUser ? `Edit ${editUser.name}` : 'Edit user'}
        description="Roles grant system-wide access. Team decides which tickets this person can be assigned."
        submitLabel="Save changes"
        onSubmit={save}
      >
        {/* FR-5.2: add or remove staff from a team's member list. */}
        <Field
          label="Team"
          hint={
            editingManagedTeam
              ? `They manage ${editingManagedTeam.name}. Assign a different manager on the Teams page before moving them out of it.`
              : 'Determines which tickets they can be assigned. Choose "No team" for a plain requester.'
          }
        >
          <Select
            value={draft.team_id}
            onValueChange={(v) => setDraft((d) => ({ ...d, team_id: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEAM}>No team</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Roles">
          <div className="space-y-2.5">
            {ROLE_FLAGS.map(({ key, label, hint }) => {
              const selfDemotion = key === 'is_admin' && editUser?.id === currentUser.id;
              return (
                <label key={key} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    disabled={selfDemotion && draft.is_admin}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[hsl(var(--primary))] disabled:opacity-50"
                  />
                  <span>
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {selfDemotion && draft.is_admin
                        ? "You can't remove your own admin access."
                        : hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </Field>
      </FormDialog>
    </div>
  );
}
