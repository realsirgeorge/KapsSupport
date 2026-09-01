'use client';

import { useEffect, useState } from 'react';
import { categoriesApi, adminApi, Category } from '@/lib/api-client';
import { PageHeader } from '@/components/app/page-header';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';

interface Team {
  id: string;
  name: string;
}

export default function AdminCategoriesPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeamId, setNewTeamId] = useState('');
  const [creating, setCreating] = useState(false);

  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editTeamId, setEditTeamId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () =>
    Promise.all([categoriesApi.list(), adminApi.teams.list()]).then(([catsRes, teamsRes]) => {
      setCategories(catsRes.data.data || []);
      setTeams(teamsRes.data.data || []);
    });

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  const teamName = (teamId: string) => teams.find((t) => t.id === teamId)?.name ?? '—';

  const createCategory = async () => {
    if (!newName.trim() || !newTeamId) return;
    setCreating(true);
    try {
      await adminApi.categories.create({ name: newName.trim(), team_id: newTeamId });
      toast.success('Category created');
      setCreateOpen(false);
      setNewName('');
      setNewTeamId('');
      await load();
    } catch {
      toast.error('Could not create category — name may already be in use');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (category: Category) => {
    setEditCategory(category);
    setEditName(category.name);
    setEditTeamId(category.team_id);
  };

  const saveEdit = async () => {
    if (!editCategory) return;
    setSaving(true);
    try {
      await adminApi.categories.update(editCategory.id, { name: editName.trim(), team_id: editTeamId });
      toast.success('Category updated');
      setEditCategory(null);
      await load();
    } catch {
      toast.error('Could not update category');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed || isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Categories"
        subtitle="What tickets get classified as, and which team owns each one"
        action={<Button onClick={() => setCreateOpen(true)}>+ New category</Button>}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Team</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-6 py-3 font-medium text-foreground">{cat.name}</td>
                <td className="px-6 py-3 text-muted-foreground">{teamName(cat.team_id)}</td>
                <td className="px-6 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(cat)}>
                    Edit
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
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={newTeamId} onValueChange={setNewTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Which team owns this category?" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createCategory} disabled={creating || !newName.trim() || !newTeamId}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCategory} onOpenChange={(open) => !open && setEditCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cat-name">Name</Label>
              <Input id="edit-cat-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={editTeamId} onValueChange={setEditTeamId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCategory(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving || !editName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
