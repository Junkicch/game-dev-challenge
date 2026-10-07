import type { Ref } from 'react';
import type { RegistrationState } from '@/api/contracts';
import type { MatchResult } from '@/ui/storage';
import { END_LABELS, formatTime } from '@/ui/format';

const UI = '/assets/png/default/ui';

const DEFAULT_REGISTRATION: RegistrationState = {
  state: 'pending',
  message: 'Not registered yet',
};

export type ResultScreenProps = {
  result: MatchResult;
  registration?: RegistrationState;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  /** Shown when the registration failed: sends the queued match again. */
  onRetryRegistration?: () => void;
  primaryActionRef?: Ref<HTMLButtonElement>;
};

/**
 * Full-screen result of a finished match: score, played time, end reason and
 * the leaderboard registration status, with the actions to leave or replay.
 */
export function ResultScreen({
  result,
  registration = DEFAULT_REGISTRATION,
  onPlayAgain,
  onMainMenu,
  onRetryRegistration,
  primaryActionRef,
}: ResultScreenProps) {
  return (
    <div className="overlay">
      <div className="panel" role="dialog" aria-modal="true" aria-label="Match result">
        <h2 className="panel__title-text">{END_LABELS[result.endReason] ?? 'Match over'}</h2>
        <dl className="results">
          <div>
            <dt>
              <img src={`${UI}/hud/icon_score.png`} alt="" /> Score
            </dt>
            <dd>{result.score}</dd>
          </div>
          <div>
            <dt>
              <img src={`${UI}/hud/icon_time.png`} alt="" /> Time played
            </dt>
            <dd>{formatTime(result.elapsedMs)}</dd>
          </div>
          <div>
            <dt>
              <img src={`${UI}/hud/icon_heart.png`} alt="" /> Hull
            </dt>
            <dd>
              {result.playerHealth}/{result.playerMaxHealth}
            </dd>
          </div>
          <div>
            <dt>Leaderboard</dt>
            <dd className={`registration registration--${registration.state}`}>
              {registration.message}
            </dd>
          </div>
        </dl>
        <div className="panel__actions">
          <button type="button" ref={primaryActionRef} className="btn btn--primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="btn btn--secondary" onClick={onMainMenu}>
            Main menu
          </button>
          {registration.state === 'failed' && onRetryRegistration && (
            <button type="button" className="btn btn--text" onClick={onRetryRegistration}>
              Retry registration
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
