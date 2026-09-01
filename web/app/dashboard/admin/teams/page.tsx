'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api-client';
import { PageHeader } from '@/components/app/page-header';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
}

export default function AdminTeamsPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editManagerId, setEditManagerId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () =>
    Promise.all([adminApi.teams.list(), adminApi.users.list()]).then(([teamsRes, usersRes]) => {
      setTeams(teamsRes.data.data || []);
      setUsers(usersRes.data.data || []);
    });

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  const managerName = (managerId?: string | null) => users.find((u) => u.id === managerId)?.name ?? '—';

  const createTeam = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await adminApi.teams.create({ name: newName.trim() });
      toast.success('Team created');
      setCreateOpen(false);
      setNewName('');
      await load();
    } catch {
      toast.error('Could not create team — name may already be in use');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (team: Team) => {
    setEditTeam(team);
    setEditManagerId(team.manager_id ?? '');
  };

  const saveManager = async () => {
    if (!editTeam) return;
    setSaving(true);
    try {
      await adminApi.teams.update(editTeam.id, { manager_id: editManagerId || undefined });
      toast.success('Team updated');
      setEditTeam(null);
      await load();
    } catch {
      toast.error('Could not update team');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.teams.remove(deleteTarget.id);
      toast.success('Team deleted');
      setDeleteTarget(null);
      await load();
    } catch {
      toast.error('Could not delete — the team likely still has in-flight tickets');
    } finally {
      setDeleting(false);
    }
  };

  if (!allowed || isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Teams"
        subtitle="Manage teams and who leads them"
        action={<Button onClick={() => setCreateOpen(true)}>+ New team</Button>}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Manager</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-6 py-3 font-medium text-foreground">{team.name}</td>
                <td className="px-6 py-3 text-muted-foreground">{managerName(team.manager_id)}</td>
                <td className="px-6 py-3">
                  <Badge variant={team.active ? 'green' : 'gray'}>{team.active ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td className="px-6 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(team)}>
                    Edit
                  </Button>{' '}
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget(team)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createTeam} disabled={creating || !newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTeam} onOpenChange={(open) => !open && setEditTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editTeam?.name}</DialogTitle>
            <DialogDescription>Assign or change this team&apos;s manager.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Manager</Label>
            <Select value={editManagerId} onValueChange={setEditManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="No manager assigned" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTeam(null)}>
              Cancel
            </Button>
            <Button onClick={saveManager} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Deletion is blocked if the team has any in-flight tickets.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
