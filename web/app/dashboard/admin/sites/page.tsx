'use client';

import { useEffect, useState } from 'react';
import { sitesApi, adminApi, Site } from '@/lib/api-client';
import { PageHeader } from '@/components/app/page-header';
import { useUser } from '@/components/app/user-context';
import { useRequireRole } from '@/hooks/use-require-role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function AdminSitesPage() {
  const user = useUser();
  const allowed = useRequireRole(user.is_admin);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRegion, setNewRegion] = useState('');
  const [creating, setCreating] = useState(false);

  const [editSite, setEditSite] = useState<Site | null>(null);
  const [editName, setEditName] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => sitesApi.list().then((res) => setSites(res.data.data || []));

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, []);

  const createSite = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await adminApi.sites.create({ name: newName.trim(), region: newRegion.trim() || undefined });
      toast.success('Site created');
      setCreateOpen(false);
      setNewName('');
      setNewRegion('');
      await load();
    } catch {
      toast.error('Could not create site');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (site: Site) => {
    setEditSite(site);
    setEditName(site.name);
    setEditRegion(site.region ?? '');
  };

  const saveEdit = async () => {
    if (!editSite) return;
    setSaving(true);
    try {
      await adminApi.sites.update(editSite.id, { name: editName.trim(), region: editRegion.trim() });
      toast.success('Site updated');
      setEditSite(null);
      await load();
    } catch {
      toast.error('Could not update site');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (site: Site) => {
    try {
      await adminApi.sites.update(site.id, { active: !site.active });
      toast.success(site.active ? 'Site deactivated' : 'Site reactivated');
      await load();
    } catch {
      toast.error('Could not update site');
    }
  };

  if (!allowed || isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        name={user.name}
        title="Sites"
        subtitle="Locations tickets can be raised against"
        action={<Button onClick={() => setCreateOpen(true)}>+ New site</Button>}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Region</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-6 py-3 font-medium text-foreground">{site.name}</td>
                <td className="px-6 py-3 text-muted-foreground">{site.region ?? '—'}</td>
                <td className="px-6 py-3">
                  <Badge variant={site.active ? 'green' : 'gray'}>{site.active ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td className="px-6 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(site)}>
                    Edit
                  </Button>{' '}
                  <Button size="sm" variant="outline" onClick={() => toggleActive(site)}>
                    {site.active ? 'Deactivate' : 'Reactivate'}
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
            <DialogTitle>New site</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-name">Name</Label>
              <Input id="site-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-region">Region (optional)</Label>
              <Input id="site-region" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createSite} disabled={creating || !newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editSite} onOpenChange={(open) => !open && setEditSite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit site</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-site-name">Name</Label>
              <Input id="edit-site-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-site-region">Region</Label>
              <Input id="edit-site-region" value={editRegion} onChange={(e) => setEditRegion(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSite(null)}>
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
