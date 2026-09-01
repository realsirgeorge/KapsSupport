'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api-client';
import { PageHeader } from '@/components/app/page-header';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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

export default function AdminUsersPage() {
  const currentUser = useUser();
  const allowed = useRequireRole(currentUser.is_admin);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [draft, setDraft] = useState({ is_admin: false, is_support_triage: false, is_executive: false });
  const [saving, setSaving] = useState(false);

  const load = () => adminApi.users.list().then((res) => setUsers(res.data.data || []));

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setDraft({ is_admin: u.is_admin, is_support_triage: u.is_support_triage, is_executive: u.is_executive });
  };

  const save = async () => {
    if (!editUser) return;
    if (editUser.id === currentUser.id && !draft.is_admin) {
      toast.error("You can't remove your own admin access");
      return;
    }
    setSaving(true);
    try {
      await adminApi.users.updateRoles(editUser.id, draft);
      toast.success('Roles updated');
      setEditUser(null);
      await load();
    } catch {
      toast.error('Could not update roles');
    } finally {
      setSaving(false);
    }
  };

  const roleBadges = (u: UserRow) => {
    const badges: React.ReactNode[] = [];
    if (u.is_admin) badges.push(<Badge key="admin">Admin</Badge>);
    if (u.is_support_triage) badges.push(<Badge key="triage" variant="blue">Support/Triage</Badge>);
    if (u.is_executive) badges.push(<Badge key="exec" variant="purple">Executive</Badge>);
    if (badges.length === 0) badges.push(<Badge key="member" variant="outline">Member</Badge>);
    return badges;
  };

  if (!allowed || isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader name={currentUser.name} title="Users & roles" subtitle="Grant or revoke Admin, Support/Triage, and Executive access" />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Email</th>
              <th className="px-6 py-3 font-medium">Roles</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-6 py-3 font-medium text-foreground">{u.name}</td>
                <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-1.5">{roleBadges(u)}</div>
                </td>
                <td className="px-6 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                    Edit roles
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit roles for {editUser?.name}</DialogTitle>
            <DialogDescription>
              These are additive to whatever team the user already belongs to — team membership and manager
              assignment happen on the Teams page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(
              [
                ['is_admin', 'Admin — full read/write access everywhere'],
                ['is_support_triage', 'Support/Triage — triage queue access'],
                ['is_executive', 'Executive — read-only system-wide view'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                />
                {label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
