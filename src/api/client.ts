import axios from 'axios';

/**
 * HTTP client for the ranking/history APIs. The mocks are installed at the
 * network layer (MSW service worker), so this instance is identical in
 * development, tests and the published build.
 */
export const api = axios.create({
  baseURL: '/api',
  timeout: 3_000,
  headers: { 'Content-Type': 'application/json' },
});

/** Short, human readable reason for the UI (error rows and toasts). */
export function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'The request timed out.';
    if (!error.response) return 'Could not reach the server.';
    return `Server answered ${error.response.status}.`;
  }
  return 'Unexpected error.';
}
