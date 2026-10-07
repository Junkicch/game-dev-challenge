import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';
import { queryClient } from '@/api/queryClient';
import { RegistrationProvider } from '@/api/registration';
import { worker } from '@/mocks/browser';
import { installNetworkTestApi } from '@/mocks/scenario';

/**
 * Boots the mocked API first, so every request the app makes from the very
 * first render already goes through MSW. Works the same in dev, in tests and
 * in the published build (the worker is served from `public/`).
 */
async function mount(): Promise<void> {
  installNetworkTestApi();

  if ('serviceWorker' in navigator) {
    try {
      await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
    } catch {
      // No worker (blocked or unsupported): requests fail as if offline and
      // the UI falls back to its error states.
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RegistrationProvider>
          <App />
        </RegistrationProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

void mount();
