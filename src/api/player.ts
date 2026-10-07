const ID_KEY = 'pirate-battle.player-id';
const NAME_KEY = 'pirate-battle.player-name';

export type Player = { id: string; name: string };

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Stable local identity used by the history query and by the records the
 * player registers. It never leaves the browser: the mocks read it from the
 * request, the fixtures only compare against it.
 */
export function getPlayer(): Player {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = createId();
    localStorage.setItem(ID_KEY, id);
  }
  const name = localStorage.getItem(NAME_KEY) ?? 'You';
  return { id, name };
}
