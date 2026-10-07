import { useEffect, useState } from 'react';
import { queryClient } from '@/api/queryClient';
import { resetRecords } from '@/mocks/store';

/**
 * Reproducible network scenarios for the ranking/history APIs. The selection
 * lives in localStorage (and can be forced with `?scenario=`), so it survives
 * refreshes and works in the published build; `?seed=` and `?latency=` make
 * randomness and delay deterministic for tests.
 */
export const SCENARIOS = [
  { id: 'success', label: 'Success', description: 'Normal answers for both APIs.' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history answer with no items.' },
  { id: 'multi-page', label: 'Multiple pages', description: 'Large fixtures: several pages on both tabs.' },
  { id: 'slow', label: 'Slow network', description: 'Every answer takes about 1.8s.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Seeded random delay between 150ms and 1.4s.' },
  { id: 'out-of-order', label: 'Out of order', description: 'First answer of each query is the slowest, later ones overtake it.' },
  { id: 'timeout', label: 'Timeout', description: 'Queries never answer before the client gives up.' },
  { id: 'network-error', label: 'Connection failure', description: 'Requests fail as if the network were down.' },
  { id: 'server-error', label: 'HTTP errors (500/422)', description: 'Queries answer 500, registration is rejected with 422.' },
  { id: 'ranking-unavailable', label: 'Ranking unavailable', description: 'Ranking answers 503, history keeps working.' },
  { id: 'history-unavailable', label: 'History unavailable', description: 'History answers 503, ranking keeps working.' },
  { id: 'register-timeout', label: 'Register timeout', description: 'The match is stored but the answer arrives too late; retrying recovers without duplicating.' },
  { id: 'offline-at-end', label: 'Offline at match end', description: 'Registration fails on a network error; switch back to Success and retry.' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

const SCENARIO_KEY = 'pirate-battle.net-scenario';
const SEED_KEY = 'pirate-battle.net-seed';
const LATENCY_KEY = 'pirate-battle.net-latency';
const CHANGED_EVENT = 'pirate-battle:network';

/** Client budget (axios timeout); "timeout" scenarios wait past it. */
export const REQUEST_TIMEOUT_MS = 3_000;

export function isScenarioId(value: string | null | undefined): value is ScenarioId {
  return Boolean(value) && SCENARIOS.some((scenario) => scenario.id === value);
}

function urlParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function getScenario(): ScenarioId {
  const fromUrl = urlParam('scenario');
  if (isScenarioId(fromUrl)) {
    localStorage.setItem(SCENARIO_KEY, fromUrl);
    return fromUrl;
  }
  const stored = localStorage.getItem(SCENARIO_KEY);
  return isScenarioId(stored) ? stored : 'success';
}

export function setScenario(id: ScenarioId): void {
  localStorage.setItem(SCENARIO_KEY, id);
  window.dispatchEvent(new Event(CHANGED_EVENT));
  invalidateLeaderboards();
}

/** Seed for every "random" delay / fixture decision. Tests pin it via `?seed=`. */
export function getSeed(): number {
  const fromUrl = Number(urlParam('seed'));
  if (Number.isFinite(fromUrl) && urlParam('seed') !== null) {
    localStorage.setItem(SEED_KEY, String(fromUrl));
    return fromUrl;
  }
  const stored = Number(localStorage.getItem(SEED_KEY));
  return Number.isFinite(stored) && stored !== 0 ? stored : 1337;
}

export function setSeed(seed: number): void {
  localStorage.setItem(SEED_KEY, String(seed));
}

/** Hard latency override (`?latency=0` in tests) that beats every scenario. */
export function getLatencyOverride(): number | null {
  const fromUrl = urlParam('latency');
  if (fromUrl !== null && Number.isFinite(Number(fromUrl))) {
    localStorage.setItem(LATENCY_KEY, fromUrl);
    return Number(fromUrl);
  }
  const stored = localStorage.getItem(LATENCY_KEY);
  return stored !== null && Number.isFinite(Number(stored)) ? Number(stored) : null;
}

export function setLatency(ms: number | null): void {
  if (ms === null) localStorage.removeItem(LATENCY_KEY);
  else localStorage.setItem(LATENCY_KEY, String(ms));
}

/** Deterministic PRNG so a scenario always behaves the same run to run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let variableIndex = 0;

const requestCounts: Record<string, number> = {};

/** Called by every handler so tests can assert that a request really fired. */
export function trackRequest(kind: 'ranking' | 'history' | 'register'): void {
  requestCounts[kind] = (requestCounts[kind] ?? 0) + 1;
}

export function getRequestCount(): number {
  return Object.values(requestCounts).reduce((total, count) => total + count, 0);
}

/** Base delay for one answer, in milliseconds. */
export function latencyFor(kind: 'ranking' | 'history' | 'register'): number {
  const override = getLatencyOverride();
  if (override !== null) return override;
  const scenario = getScenario();
  if (scenario === 'slow') return 1800;
  if (scenario === 'variable-latency') {
    const random = mulberry32(getSeed() + variableIndex++ * 7919);
    return Math.round(150 + random() * 1250);
  }
  if (scenario === 'register-timeout' && kind === 'register') return REQUEST_TIMEOUT_MS + 700;
  return 120;
}

/**
 * Delay by page: odd pages are the slow ones, even pages come back fast, so
 * paging back and forth always produces an answer that arrives late for a
 * page the player has already left.
 */
export function outOfOrderLatency(page: number): number {
  return page % 2 === 1 ? 1500 : 120;
}

function invalidateLeaderboards(): void {
  void queryClient.invalidateQueries({ queryKey: ['ranking'] });
  void queryClient.invalidateQueries({ queryKey: ['history'] });
}

/** Scenario selection + stored records + pending queue back to day one. */
export function resetNetworkState(): void {
  localStorage.removeItem(SCENARIO_KEY);
  localStorage.removeItem(SEED_KEY);
  localStorage.removeItem(LATENCY_KEY);
  variableIndex = 0;
  for (const key of Object.keys(requestCounts)) delete requestCounts[key];
  resetRecords();
  invalidateLeaderboards();
}

/** Live view of the current scenario for the UI. */
export function useScenario(): [ScenarioId, (id: ScenarioId) => void] {
  const [scenario, setScenarioState] = useState<ScenarioId>(getScenario);

  useEffect(() => {
    const onChange = () => setScenarioState(getScenario());
    window.addEventListener(CHANGED_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return [scenario, setScenario];
}

export type NetworkTestApi = {
  getScenario: typeof getScenario;
  setScenario: typeof setScenario;
  getSeed: typeof getSeed;
  setSeed: typeof setSeed;
  getLatencyOverride: typeof getLatencyOverride;
  setLatency: typeof setLatency;
  getRequestCount: typeof getRequestCount;
  reset: typeof resetNetworkState;
};

declare global {
  interface Window {
    /** Test/demo hook: control the mocked network without the UI. */
    __pirateBattleNet?: NetworkTestApi;
  }
}

export function installNetworkTestApi(): void {
  window.__pirateBattleNet = {
    getScenario,
    setScenario,
    getSeed,
    setSeed,
    getLatencyOverride,
    setLatency,
    getRequestCount,
    reset: resetNetworkState,
  };
}
