import { setupWorker } from 'msw/browser';
import { handlers } from '@/mocks/handlers';

/**
 * Mock service worker: intercepts `/api/*` at the network layer, so the app
 * keeps its real Axios + TanStack Query code path in every environment.
 */
export const worker = setupWorker(...handlers);
