import { createContext, useContext } from 'react';
import type { MatchConfig, RegistrationState } from '@/api/contracts';
import type { MatchResult } from '@/ui/storage';

export type RegistrationContextValue = {
  /** Queues the finished match and fires the first registration attempt. */
  register: (result: MatchResult, config: MatchConfig) => void;
  /** Re-sends everything still in the queue (manual retry). */
  retryPending: () => void;
  /** How many finished matches still wait for confirmation. */
  pendingCount: number;
  /** Status of the match the result dialog is showing, if any. */
  latestState: RegistrationState | null;
  /** Drops every pending registration (used by "reset state"). */
  resetQueue: () => void;
};

export const RegistrationContext = createContext<RegistrationContextValue | null>(null);

export function useRegistration(): RegistrationContextValue {
  const context = useContext(RegistrationContext);
  if (!context) throw new Error('useRegistration must be used inside RegistrationProvider');
  return context;
}
