import { useState } from 'react';
import {
  DEFAULT_PLAYER_OPTIONS,
  SESSION_TIME_LIMITS,
  SPAWN_INTERVAL_DOC,
  loadPlayerOptions,
  savePlayerOptions,
  validatePlayerOptions,
  type OptionErrors,
  type PlayerOptions,
} from '@/ui/storage';

type OptionsScreenProps = {
  onBack: () => void;
};

function clampToLimits(options: PlayerOptions): PlayerOptions {
  const errors = validatePlayerOptions(options);
  return { ...options, ...Object.fromEntries(
    Object.keys(errors).map((key) => [key, (DEFAULT_PLAYER_OPTIONS as PlayerOptions)[key as keyof PlayerOptions]])
  ) };
}

/**
 * Options screen: game session time and enemy spawn time with their
 * documented limits, persisted in localStorage for the next match.
 */
export function OptionsScreen({ onBack }: OptionsScreenProps) {
  const [values, setValues] = useState<PlayerOptions>(() => loadPlayerOptions());
  const [errors, setErrors] = useState<OptionErrors>({});

  const update = (field: keyof PlayerOptions, raw: string) => {
    setValues((previous) => ({ ...previous, [field]: Number(raw) }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validatePlayerOptions(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    savePlayerOptions(clampToLimits(values));
    onBack();
  };

  const { minSeconds, maxSeconds } = SESSION_TIME_LIMITS;
  const { minMs, maxMs } = SPAWN_INTERVAL_DOC;

  return (
    <div className="shell shell--options">
      <main className="menu" aria-label="Options">
        <div className="menu__panel">
          <h1 className="panel__title-text">Options</h1>
          <form className="options-form" onSubmit={handleSubmit} noValidate>
            <div className="options-form__field">
              <label htmlFor="opt-session">Game session time (seconds)</label>
              <input
                id="opt-session"
                type="number"
                inputMode="numeric"
                min={minSeconds}
                max={maxSeconds}
                step={5}
                value={values.sessionTimeSeconds}
                aria-invalid={Boolean(errors.sessionTimeSeconds)}
                aria-describedby={errors.sessionTimeSeconds ? 'opt-session-error' : 'opt-session-hint'}
                onChange={(event) => update('sessionTimeSeconds', event.target.value)}
              />
              <p className="options-form__hint" id="opt-session-hint">
                Between {minSeconds} and {maxSeconds} seconds. Default:{' '}
                {DEFAULT_PLAYER_OPTIONS.sessionTimeSeconds}.
              </p>
              {errors.sessionTimeSeconds && (
                <p className="options-form__error" id="opt-session-error" role="alert">
                  {errors.sessionTimeSeconds}
                </p>
              )}
            </div>

            <div className="options-form__field">
              <label htmlFor="opt-spawn">Enemy spawn time (ms)</label>
              <input
                id="opt-spawn"
                type="number"
                inputMode="numeric"
                min={minMs}
                max={maxMs}
                step={250}
                value={values.spawnIntervalMs}
                aria-invalid={Boolean(errors.spawnIntervalMs)}
                aria-describedby={errors.spawnIntervalMs ? 'opt-spawn-error' : 'opt-spawn-hint'}
                onChange={(event) => update('spawnIntervalMs', event.target.value)}
              />
              <p className="options-form__hint" id="opt-spawn-hint">
                Between {minMs} and {maxMs} ms. Lower values spawn enemies more
                often. Default: {DEFAULT_PLAYER_OPTIONS.spawnIntervalMs}.
              </p>
              {errors.spawnIntervalMs && (
                <p className="options-form__error" id="opt-spawn-error" role="alert">
                  {errors.spawnIntervalMs}
                </p>
              )}
            </div>

            <div className="panel__actions">
              <button type="submit" className="btn btn--primary">
                Save
              </button>
              <button type="button" className="btn btn--secondary" onClick={onBack}>
                Back
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
