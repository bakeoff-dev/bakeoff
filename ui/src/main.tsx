import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * App reads the bootstrap at module scope, so the dev fixture has to be on window before
 * App is evaluated. Both imports are dynamic to keep that order without top-level await.
 */
async function boot() {
  if (import.meta.env.DEV) await import('../dev-data');
  const { App } = await import('./App');
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
void boot();
