'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { authApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/form-dialog';
import { primaryRoute } from '@/components/app/nav-config';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Until React has hydrated, onSubmit is not attached and the browser would
  // submit the form natively — putting the password in the URL, and from
  // there into history and any access log. Submitting is blocked until then,
  // and method="post" keeps credentials out of the query string even if a
  // native submit somehow gets through.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await authApi.login(email, password);
      // Each role has a different home screen — send them straight to the
      // one that is actually their job rather than a generic landing page.
      router.push(primaryRoute(res.data.data));
    } catch {
      setError("That email and password don't match an account.");
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      {/* A single soft pool of brand colour behind the card — the one piece
          of atmosphere on an otherwise flat, matte surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-[100px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground">
            S
          </span>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-primary">Support</span>
            <span className="text-foreground">Desk</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to raise and track support tickets.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-7 shadow-raised">
          <form method="post" onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-invalid={!!error}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-invalid={!!error}
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={isLoading || !ready} className="w-full">
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Trouble signing in? Contact your system administrator.
        </p>
      </div>
    </main>
  );
}
