import { useMemo, useState } from 'react';
import { matchConfigFrom } from '@/api/contracts';
import { HistoryPanel } from '@/ui/components/HistoryPanel';
import { NetworkPanel } from '@/ui/components/NetworkPanel';
import { RankingPanel } from '@/ui/components/RankingPanel';
import { formatTime } from '@/ui/format';
import { loadLastResult, loadPlayerOptions } from '@/ui/storage';

const UI = '/assets/png/default/ui';

type MenuScreenProps = {
  onPlay: () => void;
  onOptions: () => void;
  /** Finished matches still waiting for the API to confirm them. */
  pendingCount: number;
  onRetryRegistration: () => void;
};

type TabId = 'ranking' | 'history' | 'controls';

const COMMANDS = [
  { icon: 'icon_forward.png', label: 'Move forward', keys: ['W'] },
  { icon: 'icon_turn_left.png', label: 'Turn left', keys: ['A'] },
  { icon: 'icon_turn_right.png', label: 'Turn right', keys: ['D'] },
  { icon: 'icon_fire_front.png', label: 'Fire forward', keys: ['Space'] },
  { icon: 'icon_fire_left.png', label: 'Left broadside', keys: ['Q'] },
  { icon: 'icon_fire_right.png', label: 'Right broadside', keys: ['E'] },
  { icon: 'icon_pause.png', label: 'Pause', keys: ['P', 'Esc'] },
];

/**
 * Main menu: entry points for the match and the options, the local summary of
 * the last match and the section tabs (Ranking / Match History / Controls).
 */
export function MenuScreen({
  onPlay,
  onOptions,
  pendingCount,
  onRetryRegistration,
}: MenuScreenProps) {
  const [tab, setTab] = useState<TabId>('ranking');
  const lastResult = loadLastResult();
  const options = loadPlayerOptions();
  // The board the player is about to join: same knobs as the next match.
  const rankingConfig = useMemo(
    () => matchConfigFrom(options.sessionTimeSeconds, options.spawnIntervalMs),
    [options.sessionTimeSeconds, options.spawnIntervalMs]
  );

  return (
    <div className="shell shell--menu">
      <main className="menu" aria-label="Main menu">
        <img
          className="menu__title"
          src={`${UI}/menu/title_pirate_battle.png`}
          alt="Pirate Battle"
        />

        <div className="menu__panel">
          <div className="menu__actions">
            <button type="button" className="btn btn--primary" onClick={onPlay}>
              Play
            </button>
            <button type="button" className="btn btn--secondary" onClick={onOptions}>
              Options
            </button>
          </div>

          {lastResult && (
            <section className="menu__last" aria-label="Last match">
              <h2>Last match</h2>
              <p>
                <strong>{lastResult.score}</strong> points ·{' '}
                {formatTime(lastResult.elapsedMs)} ·{' '}
                {lastResult.endReason === 'playerDead' ? 'Ship destroyed' : "Time's up"}
              </p>
            </section>
          )}

          {pendingCount > 0 && (
            <p className="menu__pending" role="status">
              {pendingCount} match{pendingCount === 1 ? '' : 'es'} waiting to register.{' '}
              <button type="button" className="btn btn--text" onClick={onRetryRegistration}>
                Retry now
              </button>
            </p>
          )}

          <section className="menu__data" aria-label="Ranking, history and controls">
            <div className="tabs" role="tablist" aria-label="Sections">
              <button
                type="button"
                role="tab"
                id="tab-ranking"
                aria-selected={tab === 'ranking'}
                aria-controls="panel-ranking"
                className={tab === 'ranking' ? 'tabs__tab is-active' : 'tabs__tab'}
                onClick={() => setTab('ranking')}
              >
                Ranking
              </button>
              <button
                type="button"
                role="tab"
                id="tab-history"
                aria-selected={tab === 'history'}
                aria-controls="panel-history"
                className={tab === 'history' ? 'tabs__tab is-active' : 'tabs__tab'}
                onClick={() => setTab('history')}
              >
                Match History
              </button>
              <button
                type="button"
                role="tab"
                id="tab-controls"
                aria-selected={tab === 'controls'}
                aria-controls="panel-controls"
                className={tab === 'controls' ? 'tabs__tab is-active' : 'tabs__tab'}
                onClick={() => setTab('controls')}
              >
                Controls
              </button>
            </div>

            <div
              role="tabpanel"
              id="panel-ranking"
              aria-labelledby="tab-ranking"
              className="tabs__panel"
              hidden={tab !== 'ranking'}
            >
              <RankingPanel config={rankingConfig} />
            </div>
            <div
              role="tabpanel"
              id="panel-history"
              aria-labelledby="tab-history"
              className="tabs__panel"
              hidden={tab !== 'history'}
            >
              <HistoryPanel />
            </div>

            <div
              role="tabpanel"
              id="panel-controls"
              aria-labelledby="tab-controls"
              className="tabs__panel"
              hidden={tab !== 'controls'}
            >
              <ul className="command-list">
                {COMMANDS.map((command) => (
                  <li key={command.label}>
                    <img src={`${UI}/controls/${command.icon}`} alt="" />
                    <span>{command.label}</span>
                    <span className="command-list__keys">
                      {command.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="menu__hint">
                Touch devices get on-screen pads during the match: steering on the
                left, cannons on the right — you can sail and fire at the same time.
              </p>
            </div>
          </section>

          <NetworkPanel />
        </div>
      </main>
    </div>
  );
}
