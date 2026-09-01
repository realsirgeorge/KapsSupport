'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ticketApi, sitesApi, categoriesApi, Site, Category } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function CreateTicketPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [siteId, setSiteId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => {
    Promise.all([sitesApi.list(), categoriesApi.list()]).then(([sitesRes, catsRes]) => {
      setSites(sitesRes.data.data || []);
      setCategories(catsRes.data.data || []);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await ticketApi.create({
        subject,
        description,
        site_id: siteId,
        suggested_category_id: categoryId || undefined,
      });
      toast.success('Ticket submitted');
      router.push(`/dashboard/tickets/${res.data.data.id}`);
    } catch (err) {
      setError('Failed to create ticket. Check that all required fields are filled in.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-border bg-card p-8">
        <h1 className="text-xl font-bold text-foreground">New ticket</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what you need help with — support will confirm the category and route it.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of the issue"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site">Site</Label>
            <Select value={siteId} onValueChange={setSiteId} required>
              <SelectTrigger id="site">
                <SelectValue placeholder="Which site is this about?" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.region ? ` — ${s.region}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, when, and any details that help"
              rows={5}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category (your best guess — support will confirm)</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const selected = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(selected ? '' : c.id)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      selected
                        ? 'border-status-blue bg-status-blue/10 text-status-blue'
                        : 'border-border bg-secondary text-foreground hover:bg-accent',
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Attachments (optional)</Label>
            <div className="flex h-24 cursor-not-allowed items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              File uploads aren&apos;t available yet
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Submitting...' : 'Submit ticket'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
