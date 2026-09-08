'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tags, SearchX } from 'lucide-react';
import { categoriesApi, adminApi, Category } from '@/lib/api-client';
import { PageHeader } from '@/components/app/page-header';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { useSearch } from '@/components/app/search-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';
import { FormDialog, Field } from '@/components/ui/form-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';

interface Team {
  id: string;
  name: string;
}

export default function AdminCategoriesPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin);
  const { query } = useSearch();

  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeamId, setNewTeamId] = useState('');

  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editTeamId, setEditTeamId] = useState('');

  const load = () =>
    Promise.all([categoriesApi.list(), adminApi.teams.list()]).then(([catsRes, teamsRes]) => {
      setCategories(catsRes.data.data || []);
      setTeams(teamsRes.data.data || []);
    });

  useEffect(() => {
    if (!allowed) return;
    load()
      .catch(() => toast.error('Could not load categories'))
      .finally(() => setIsLoading(false));
  }, [allowed]);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? 'Unknown team';

  const createCategory = async () => {
    if (!newName.trim() || !newTeamId) return false;
    try {
      await adminApi.categories.create({ name: newName.trim(), team_id: newTeamId });
      toast.success(`Created ${newName.trim()}`);
      setNewName('');
      setNewTeamId('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not create this category');
      return false;
    }
  };

  const saveCategory = async () => {
    if (!editCategory || !editName.trim() || !editTeamId) return false;
    try {
      await adminApi.categories.update(editCategory.id, { name: editName.trim(), team_id: editTeamId });
      toast.success('Category updated');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update this category');
      return false;
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Category',
      cell: (c) => <span className="font-medium text-foreground">{c.name}</span>,
    },
    {
      key: 'team',
      header: 'Owning team',
      cell: (c) => <span className="text-muted-foreground">{teamName(c.team_id)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-28',
      cell: (c) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditCategory(c);
            setEditName(c.name);
            setEditTeamId(c.team_id);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  if (!allowed || isLoading) {
    return <PageSkeleton stats={0} rows={5} cols={3} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Categories"
        subtitle="What tickets get classified as — and, through the owning team, who works them"
        action={<Button onClick={() => setCreateOpen(true)}>New category</Button>}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => c.id}
        empty={
          categories.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No categories yet"
              description="Tickets can't be assigned until a confirmed category routes them to a team, so add at least one."
              action={<Button onClick={() => setCreateOpen(true)}>New category</Button>}
            />
          ) : (
            <EmptyState icon={SearchX} title="No categories match your search" />
          )
        }
      />

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New category"
        submitLabel="Create category"
        submitDisabled={!newName.trim() || !newTeamId}
        onSubmit={createCategory}
      >
        <Field label="Name" htmlFor="cat-name" required>
          <Input id="cat-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Networking" />
        </Field>
        <Field label="Owning team" required hint="Tickets in this category can only be assigned to members of this team.">
          <Select value={newTeamId} onValueChange={setNewTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Which team handles this?" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <FormDialog
        open={!!editCategory}
        onOpenChange={(o) => !o && setEditCategory(null)}
        title={editCategory ? `Edit ${editCategory.name}` : 'Edit category'}
        submitLabel="Save changes"
        submitDisabled={!editName.trim() || !editTeamId}
        onSubmit={saveCategory}
      >
        <Field label="Name" htmlFor="edit-cat-name" required>
          <Input id="edit-cat-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </Field>
        <Field
          label="Owning team"
          required
          hint="Moving a category to another team changes who can be assigned its tickets. Tickets already assigned to someone outside the new team will need reassigning."
        >
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
        </Field>
      </FormDialog>
    </div>
  );
}
