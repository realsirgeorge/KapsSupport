'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Paperclip } from 'lucide-react';
import { ticketApi, sitesApi, categoriesApi, uploadAttachment, Site, Category } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv']);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function CreateTicketPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [siteId, setSiteId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    Promise.all([sitesApi.list(), categoriesApi.list()]).then(([sitesRes, catsRes]) => {
      setSites(sitesRes.data.data || []);
      setCategories(catsRes.data.data || []);
    });
  }, []);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const rejected: string[] = [];
    const accepted: File[] = [];
    Array.from(incoming).forEach((f) => {
      if (f.size > MAX_SIZE_BYTES) {
        rejected.push(`${f.name} (over 25MB)`);
      } else if (!ALLOWED_TYPES.has(f.type)) {
        rejected.push(`${f.name} (unsupported file type)`);
      } else {
        accepted.push(f);
      }
    });
    if (rejected.length) {
      toast.error(`Skipped: ${rejected.join(', ')}`);
    }
    setFiles((prev) => [...prev, ...accepted]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    let ticketId: string;
    try {
      const res = await ticketApi.create({
        subject,
        description,
        site_id: siteId,
        suggested_category_id: categoryId || undefined,
      });
      ticketId = res.data.data.id;
    } catch (err) {
      setError('Failed to create ticket. Check that all required fields are filled in.');
      setIsLoading(false);
      return;
    }

    if (files.length > 0) {
      const failures: string[] = [];
      for (const file of files) {
        try {
          await uploadAttachment(ticketId, file);
        } catch {
          failures.push(file.name);
        }
      }
      if (failures.length) {
        toast.error(`Ticket created, but these files didn't upload: ${failures.join(', ')}. You can retry from the ticket page.`);
      } else {
        toast.success('Ticket submitted with attachments');
      }
    } else {
      toast.success('Ticket submitted');
    }

    router.push(`/dashboard/tickets/${ticketId}`);
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
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed text-sm transition-colors',
                dragOver ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              Drag files here or click to upload (max 25MB — images, PDF, text, CSV)
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-md bg-secondary px-3 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2 text-foreground">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                      {f.name} <span className="text-muted-foreground">({formatSize(f.size)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
