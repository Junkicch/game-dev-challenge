import { useCallback, useState } from 'react';
import { createGameConfigSnapshot } from '@/config/gameConfig';
import type { GameConfig } from '@/types/game';
import { useRegistration } from '@/api/registrationContext';
import { GameScreen } from '@/ui/screens/GameScreen';
import { MenuScreen } from '@/ui/screens/MenuScreen';
import { OptionsScreen } from '@/ui/screens/OptionsScreen';
import { loadPlayerOptions, saveLastResult, type MatchResult } from '@/ui/storage';
import '@/ui/game.css';
import '@/ui/shell.css';
import './App.css';

type ScreenId = 'menu' | 'options' | 'match';

/**
 * Top level state machine. Only one screen is mounted at a time: leaving the
 * match unmounts `GameScreen`, which tears down the Pixi stage, the loop and
 * the input listeners with it.
 */
function App() {
  const [screen, setScreen] = useState<ScreenId>('menu');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const { register, latestState, retryPending, pendingCount } = useRegistration();

  const handlePlay = useCallback(() => {
    const options = loadPlayerOptions();
    setConfig(
      createGameConfigSnapshot({
        sessionTimeSeconds: options.sessionTimeSeconds,
        enemySpawn: { intervalMs: options.spawnIntervalMs },
      })
    );
    setScreen('match');
  }, []);

  const handleFinished = useCallback(
    (result: MatchResult) => {
      saveLastResult(result);
      if (!config) return;
      // Exactly the configuration this match ran with, so the ranking only
      // compares it against matches played the same way.
      register(result, {
        sessionTimeSeconds: config.sessionTimeSeconds,
        enemySpawn: config.enemySpawn,
      });
    },
    [config, register]
  );

  const handleExit = useCallback(() => {
    setConfig(null);
    setScreen('menu');
  }, []);

  if (screen === 'match' && config) {
    return (
      <GameScreen
        config={config}
        onFinished={handleFinished}
        registration={latestState}
        onRetryRegistration={retryPending}
        onExit={handleExit}
      />
    );
  }

  if (screen === 'options') {
    return <OptionsScreen onBack={() => setScreen('menu')} />;
  }

  return (
    <MenuScreen
      onPlay={handlePlay}
      onOptions={() => setScreen('options')}
      pendingCount={pendingCount}
      onRetryRegistration={retryPending}
    />
  );
}

export default App;
