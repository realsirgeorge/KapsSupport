import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Support Ticketing System',
  description: 'In-house support ticket management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
