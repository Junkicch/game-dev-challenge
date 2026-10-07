import { useState } from 'react';
import { useRegistration } from '@/api/registrationContext';
import {
  SCENARIOS,
  getLatencyOverride,
  getSeed,
  getScenario,
  resetNetworkState,
  setLatency,
  setSeed,
  useScenario,
  type ScenarioId,
} from '@/mocks/scenario';

/**
 * Dev/demo controls for the mocked API: pick how ranking/history/register
 * should behave, pin the seed behind the "random" delays and put every
 * stored record and pending registration back to day one.
 */
export function NetworkPanel() {
  const [scenario, changeScenario] = useScenario();
  const [seed, changeSeed] = useState(() => String(getSeed()));
  const [latency, changeLatency] = useState(() => {
    const value = getLatencyOverride();
    return value === null ? '' : String(value);
  });
  const { resetQueue, pendingCount } = useRegistration();

  const handleScenario = (value: string) => {
    if (SCENARIOS.some((item) => item.id === value)) {
      changeScenario(value as ScenarioId);
    }
  };

  const handleSeed = (value: string) => {
    changeSeed(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed)) setSeed(parsed);
  };

  const handleLatency = (value: string) => {
    changeLatency(value);
    if (value.trim() === '') {
      setLatency(null);
      return;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) setLatency(parsed);
  };

  const handleReset = () => {
    resetNetworkState();
    resetQueue();
    changeScenario(getScenario());
    changeSeed(String(getSeed()));
    changeLatency('');
  };

  const description = SCENARIOS.find((item) => item.id === scenario)?.description ?? '';

  return (
    <section className="menu__network" aria-label="Network scenarios">
      <details className="network">
        <summary>Network scenarios (mock API)</summary>

        <p className="network__hint">{description}</p>

        <label className="network__field" htmlFor="network-scenario">
          Scenario
          <select
            id="network-scenario"
            value={scenario}
            onChange={(event) => handleScenario(event.target.value)}
          >
            {SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="network__field" htmlFor="network-seed">
          Seed
          <input
            id="network-seed"
            type="number"
            value={seed}
            onChange={(event) => handleSeed(event.target.value)}
          />
        </label>

        <label className="network__field" htmlFor="network-latency">
          Latency override (ms, blank = automatic)
          <input
            id="network-latency"
            type="number"
            min={0}
            placeholder="auto"
            value={latency}
            onChange={(event) => handleLatency(event.target.value)}
          />
        </label>

        <div className="network__actions">
          <button type="button" className="btn btn--text" onClick={handleReset}>
            Reset state
          </button>
          <span className="network__pending" role="status">
            {pendingCount} pending registration{pendingCount === 1 ? '' : 's'}
          </span>
        </div>
      </details>
    </section>
  );
}
