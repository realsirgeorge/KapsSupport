'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin, SearchX } from 'lucide-react';
import { sitesApi, adminApi, Site } from '@/lib/api-client';
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
import { toast } from 'sonner';

export default function AdminSitesPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin);
  const { query } = useSearch();

  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRegion, setNewRegion] = useState('');

  const [editSite, setEditSite] = useState<Site | null>(null);
  const [editName, setEditName] = useState('');
  const [editRegion, setEditRegion] = useState('');

  const [toggleTarget, setToggleTarget] = useState<Site | null>(null);

  const load = () => sitesApi.list().then((res) => setSites(res.data.data || []));

  useEffect(() => {
    if (!allowed) return;
    load()
      .catch(() => toast.error('Could not load sites'))
      .finally(() => setIsLoading(false));
  }, [allowed]);

  const createSite = async () => {
    if (!newName.trim()) return false;
    try {
      await adminApi.sites.create({ name: newName.trim(), region: newRegion.trim() || undefined });
      toast.success(`Added ${newName.trim()}`);
      setNewName('');
      setNewRegion('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not add this site');
      return false;
    }
  };

  const saveSite = async () => {
    if (!editSite || !editName.trim()) return false;
    try {
      await adminApi.sites.update(editSite.id, { name: editName.trim(), region: editRegion.trim() });
      toast.success('Site updated');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update this site');
      return false;
    }
  };

  const toggleActive = async () => {
    if (!toggleTarget) return;
    try {
      await adminApi.sites.update(toggleTarget.id, { active: !toggleTarget.active });
      toast.success(toggleTarget.active ? `${toggleTarget.name} deactivated` : `${toggleTarget.name} reactivated`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update this site');
      throw err;
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return sites;
    const q = query.toLowerCase();
    return sites.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.region ?? '').toLowerCase().includes(q),
    );
  }, [sites, query]);

  const columns: Column<Site>[] = [
    {
      key: 'name',
      header: 'Site',
      cell: (s) => <span className="font-medium text-foreground">{s.name}</span>,
    },
    {
      key: 'region',
      header: 'Region',
      cell: (s) => <span className="text-muted-foreground">{s.region || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-32',
      cell: (s) => <Badge variant={s.active ? 'green' : 'gray'}>{s.active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-52',
      cell: (s) => (
        <span className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditSite(s);
              setEditName(s.name);
              setEditRegion(s.region ?? '');
            }}
          >
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setToggleTarget(s)}>
            {s.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </span>
      ),
    },
  ];

  if (!allowed || isLoading) {
    return <PageSkeleton stats={0} rows={5} cols={4} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Sites"
        subtitle="The locations a ticket can be raised against"
        action={<Button onClick={() => setCreateOpen(true)}>New site</Button>}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(s) => s.id}
        empty={
          sites.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No sites yet"
              description="Add the locations your teams support so requesters can say where a problem is."
              action={<Button onClick={() => setCreateOpen(true)}>New site</Button>}
            />
          ) : (
            <EmptyState icon={SearchX} title="No sites match your search" />
          )
        }
      />

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New site"
        submitLabel="Add site"
        submitDisabled={!newName.trim()}
        onSubmit={createSite}
      >
        <Field label="Name" htmlFor="site-name" required>
          <Input id="site-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Westgate" />
        </Field>
        <Field label="Region" htmlFor="site-region" hint="Optional — helps tell similarly named sites apart.">
          <Input id="site-region" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder="e.g. Nairobi" />
        </Field>
      </FormDialog>

      <FormDialog
        open={!!editSite}
        onOpenChange={(o) => !o && setEditSite(null)}
        title={editSite ? `Edit ${editSite.name}` : 'Edit site'}
        submitLabel="Save changes"
        submitDisabled={!editName.trim()}
        onSubmit={saveSite}
      >
        <Field label="Name" htmlFor="edit-site-name" required>
          <Input id="edit-site-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </Field>
        <Field label="Region" htmlFor="edit-site-region">
          <Input id="edit-site-region" value={editRegion} onChange={(e) => setEditRegion(e.target.value)} />
        </Field>
      </FormDialog>

      {/* FR-11.2: deactivating only stops future selection; history is untouched. */}
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={
          toggleTarget?.active
            ? `Deactivate ${toggleTarget?.name}?`
            : `Reactivate ${toggleTarget?.name}?`
        }
        description={
          toggleTarget?.active
            ? 'It stops appearing as a choice on new tickets. Tickets already raised against it keep it, and stay visible in reporting.'
            : 'It becomes selectable on new tickets again.'
        }
        confirmLabel={toggleTarget?.active ? 'Deactivate' : 'Reactivate'}
        onConfirm={toggleActive}
      />
    </div>
  );
}
