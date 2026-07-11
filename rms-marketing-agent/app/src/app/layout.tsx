import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/shell/app-shell';

export const metadata: Metadata = {
  title: 'RevPilot — revenue on every channel',
  description:
    'Hybrid RMS + marketing assistant for short-term-rental and small-hotel operators. Approve once, push the promotion to every channel.',
};

const themeInit = `
try {
  const t = localStorage.getItem('revpilot-theme')
    ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
} catch {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="bg-page text-ink antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
