import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Application } from 'pixi.js';
import { GameLoop } from '@/engine/gameLoop';
import { GameInput, KEY_BINDINGS, type GameAction } from '@/game/input';
import { GameSimulation } from '@/game/simulation';
import { GameRenderer } from '@/pixi/GameRenderer';
import { PixiApp } from '@/pixi/PixiApp';
import type { AssetLoader } from '@/pixi/assetLoader';
import type { GamePhase, HudSnapshot } from '@/game/types';
import type { GameConfig } from '@/types/game';
import type { RegistrationState } from '@/api/contracts';
import { GameHud } from '@/ui/components/GameHud';
import { TouchControls } from '@/ui/components/TouchControls';
import { ResultScreen } from '@/ui/screens/ResultScreen';
import { END_LABELS, formatTime } from '@/ui/format';
import type { MatchResult } from '@/ui/storage';
import '@/ui/game.css';

const UI = '/assets/png/default/ui';

type Stage = { app: Application; loader: AssetLoader };

type GameHandle = {
  sim: GameSimulation;
  input: GameInput;
  renderer: GameRenderer;
  syncHud: () => void;
};

export type GameTestApi = {
  simulation: GameSimulation;
  input: GameInput;
  app: Application;
  renderer: GameRenderer;
};

declare global {
  interface Window {
    /** Test instrumentation: lets E2E tests observe the running match. */
    __pirateBattle?: GameTestApi;
  }
}

function hudChanged(previous: HudSnapshot, next: HudSnapshot): boolean {
  return (
    previous.phase !== next.phase ||
    previous.score !== next.score ||
    previous.playerHealth !== next.playerHealth ||
    previous.playerMaxHealth !== next.playerMaxHealth ||
    previous.enemyCount !== next.enemyCount ||
    previous.endReason !== next.endReason
  );
}

function buildMatchResult(hud: HudSnapshot, endedAt: number): MatchResult {
  return {
    score: hud.score,
    elapsedMs: hud.elapsedMs,
    endReason: hud.endReason ?? 'timeUp',
    playerHealth: hud.playerHealth,
    playerMaxHealth: hud.playerMaxHealth,
    endedAt,
  };
}

export type GameScreenProps = {
  config: GameConfig;
  /** Called once per finished match so the shell can persist the result. */
  onFinished?: (result: MatchResult) => void;
  /** Registration status of the match shown in the result dialog. */
  registration?: RegistrationState | null;
  onRetryRegistration?: () => void;
  onExit?: () => void;
};

/**
 * Gameplay shell: owns the PixiJS canvas, the simulation, the game loop and
 * the keyboard listeners. React only re-renders when the HUD values change;
 * the countdown is written straight to the DOM every frame.
 */
export function GameScreen({
  config,
  onFinished,
  registration,
  onRetryRegistration,
  onExit,
}: GameScreenProps) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const finishSentRef = useRef(false);

  const handleReady = useCallback((app: Application, loader: AssetLoader) => {
    setStage({ app, loader });
  }, []);

  useEffect(() => {
    if (!stage) return;

    const input = new GameInput();
    let renderer: GameRenderer;
    let sim: GameSimulation;

    try {
      sim = new GameSimulation(config, input);
      renderer = new GameRenderer(stage.app, config, sim.islands, stage.loader);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the renderer');
      return;
    }

    const syncHud = () => {
      const snapshot = sim.getSnapshot();
      setHud((previous) => (previous && !hudChanged(previous, snapshot) ? previous : snapshot));
      const clock = timeRef.current;
      if (clock) {
        const text = formatTime(snapshot.timeRemainingMs);
        if (clock.textContent !== text) clock.textContent = text;
        clock.classList.toggle('is-urgent', snapshot.timeRemainingMs <= 10_000);
      }
    };

    const loop = new GameLoop(
      (deltaMs) => {
        sim.update(deltaMs);
        syncHud();
      },
      () => renderer.sync(sim.getState())
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        sim.togglePause();
        syncHud();
        return;
      }
      const action = KEY_BINDINGS[event.code];
      if (!action) return;
      event.preventDefault();
      input.setAction(action, true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const action = KEY_BINDINGS[event.code];
      if (!action) return;
      event.preventDefault();
      input.setAction(action, false);
    };

    const pauseWhenHidden = () => {
      if (document.hidden && sim.getPhase() === 'running') {
        sim.pause();
        syncHud();
      }
    };

    const pauseOnBlur = () => {
      if (sim.getPhase() === 'running') {
        sim.pause();
        syncHud();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', pauseOnBlur);
    document.addEventListener('visibilitychange', pauseWhenHidden);

    gameRef.current = { sim, input, renderer, syncHud };
    window.__pirateBattle = { simulation: sim, input, app: stage.app, renderer };
    syncHud();
    loop.start();

    return () => {
      loop.stop();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', pauseOnBlur);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      gameRef.current = null;
      delete window.__pirateBattle;
      input.reset();
      renderer.destroy();
    };
  }, [stage, config]);

  const phase: GamePhase = hud?.phase ?? 'ready';

  useEffect(() => {
    if (phase === 'running') {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }
    const button = primaryActionRef.current;
    if (button && document.activeElement !== button) button.focus();
  }, [phase, hud]);

  useEffect(() => {
    if (!statusRef.current || !hud) return;
    const message =
      hud.phase === 'running'
        ? 'Match in progress'
        : hud.phase === 'paused'
          ? 'Match paused'
          : hud.phase === 'ended'
            ? `Match over. Score ${hud.score}. ${END_LABELS[hud.endReason ?? 'timeUp']}.`
            : 'Ready to start';
    if (statusRef.current.textContent !== message) {
      statusRef.current.textContent = message;
    }
  }, [hud]);

  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // Runs before paint: the result dialog appears in the same frame the match
  // ends, and the shell hears about a finished match exactly once.
  useLayoutEffect(() => {
    if (!hud || hud.phase !== 'ended') return;
    const result = buildMatchResult(hud, Date.now());
    setMatchResult(result);
    if (
      (result.endReason === 'timeUp' || result.endReason === 'playerDead') &&
      !finishSentRef.current
    ) {
      finishSentRef.current = true;
      onFinished?.(result);
    }
  }, [hud, onFinished]);

  const startMatch = useCallback(() => {
    finishSentRef.current = false;
    setMatchResult(null);
    gameRef.current?.sim.start();
    gameRef.current?.syncHud();
  }, []);

  const togglePause = useCallback(() => {
    gameRef.current?.sim.togglePause();
    gameRef.current?.syncHud();
  }, []);

  const resumeMatch = useCallback(() => {
    gameRef.current?.sim.resume();
    gameRef.current?.syncHud();
  }, []);

  const restartMatch = useCallback(() => {
    const handle = gameRef.current;
    if (!handle) return;
    finishSentRef.current = false;
    setMatchResult(null);
    handle.sim.reset();
    handle.sim.start();
    handle.syncHud();
  }, []);

  const handleTouchAction = useCallback((action: GameAction, isDown: boolean) => {
    gameRef.current?.input.setAction(action, isDown);
  }, []);

  const handleExit = useCallback(() => {
    const handle = gameRef.current;
    if (handle && handle.sim.getPhase() !== 'ended') {
      handle.sim.end('abandoned');
      handle.syncHud();
    }
    onExit?.();
  }, [onExit]);

  return (
    <div className="game">
      <h1 className="visually-hidden">Pirate Battle</h1>
      <PixiApp onReady={handleReady} />

      {error && (
        <div className="overlay" role="alert">
          <div className="panel">
            <p className="panel__lead">{error}</p>
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )}

      {hud && (
        <>
          <GameHud hud={hud} timeRef={timeRef} onPause={togglePause} />
          <p className="visually-hidden" role="status" aria-live="polite" ref={statusRef} />
          <TouchControls onAction={handleTouchAction} />

          <ul className="controls-legend" aria-label="Controls">
            <li>
              <img src={`${UI}/controls/icon_forward.png`} alt="" />
              <kbd>W</kbd>
            </li>
            <li>
              <img src={`${UI}/controls/icon_turn_left.png`} alt="" />
              <kbd>A</kbd>
            </li>
            <li>
              <img src={`${UI}/controls/icon_turn_right.png`} alt="" />
              <kbd>D</kbd>
            </li>
            <li>
              <img src={`${UI}/controls/icon_fire_front.png`} alt="" />
              <kbd>Space</kbd>
            </li>
            <li>
              <img src={`${UI}/controls/icon_fire_left.png`} alt="" />
              <kbd>Q</kbd>
            </li>
            <li>
              <img src={`${UI}/controls/icon_fire_right.png`} alt="" />
              <kbd>E</kbd>
            </li>
          </ul>

          {phase === 'ended' && matchResult && (
            <ResultScreen
              result={matchResult}
              registration={registration ?? undefined}
              onPlayAgain={restartMatch}
              onMainMenu={handleExit}
              onRetryRegistration={onRetryRegistration}
              primaryActionRef={primaryActionRef}
            />
          )}

          {(phase === 'ready' || phase === 'paused') && (
            <div className="overlay">
              <div className="panel" role="dialog" aria-modal="true" aria-label={panelLabel(phase)}>
                {phase === 'ready' && (
                  <>
                    <img
                      className="panel__title"
                      src={`${UI}/menu/title_pirate_battle.png`}
                      alt="Pirate Battle"
                    />
                    <p className="panel__lead">
                      Sink every enemy you can before the clock runs out. Islands
                      block ships and cannonballs — use them as cover.
                    </p>
                    <button
                      type="button"
                      ref={primaryActionRef}
                      className="btn btn--primary"
                      onClick={startMatch}
                    >
                      Start match
                    </button>
                  </>
                )}

                {phase === 'paused' && (
                  <>
                    <h2 className="panel__title-text">Paused</h2>
                    <p className="panel__lead">
                      The clock, your weapons and the enemies are frozen until
                      you resume.
                    </p>
                    <div className="panel__actions">
                      <button
                        type="button"
                        ref={primaryActionRef}
                        className="btn btn--primary"
                        onClick={resumeMatch}
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={restartMatch}
                      >
                        Restart
                      </button>
                      <button type="button" className="btn btn--secondary" onClick={handleExit}>
                        Main menu
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="rotate-hint" role="status">
            <p>Rotate your device to landscape — the battle is played sideways.</p>
          </div>
        </>
      )}
    </div>
  );
}

function panelLabel(phase: GamePhase): string {
  return phase === 'paused' ? 'Match paused' : 'Start a match';
}
