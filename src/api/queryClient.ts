import { QueryClient } from '@tanstack/react-query';

/**
 * Single QueryClient for the app. Reads (ranking/history) retry transient
 * failures a couple of times with backoff; 4xx answers are not retried.
 * Registration is a mutation and retries once — the endpoint is idempotent,
 * so a second attempt can never duplicate a match.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => (isRetryable(error) ? failureCount < 2 : false),
      retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 3_000),
    },
    mutations: {
      retry: 1,
      retryDelay: 250,
    },
  },
});

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Timeouts, connection drops and 5xx are worth another try; 4xx are not. */
export function isRetryable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status);
  return true; // axios network/timeout errors carry no response
}
