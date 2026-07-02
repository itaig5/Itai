'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('revpilot-theme');
    const preferred = stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    apply(preferred as 'light' | 'dark');
  }, []);

  function apply(next: 'light' | 'dark') {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('revpilot-theme', next);
  }

  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => apply(theme === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </Button>
  );
}
