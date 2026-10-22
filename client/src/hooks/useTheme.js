import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'myhealthaid.theme';

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Reads/writes the `data-theme` attribute set by the inline bootstrap script
 * in index.html, persists explicit choices to localStorage, and otherwise
 * tracks the OS theme live.
 */
export function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || readStoredTheme() || systemTheme(),
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (readStoredTheme()) return undefined; // user already made an explicit choice
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* localStorage unavailable - theme still applies for this session */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
