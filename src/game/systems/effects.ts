import type { Effect } from '@/game/types';

export function updateEffects(effects: Effect[], dt: number): void {
  for (const effect of effects) {
    effect.ageMs += dt;
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].ageMs >= effects[i].durationMs) {
      effects.splice(i, 1);
    }
  }
}

export function explosionAt(
  effects: Effect[],
  id: number,
  x: number,
  y: number,
  scale = 1
): void {
  effects.push({
    id,
    kind: 'explosion',
    position: { x, y },
    rotation: Math.random() * Math.PI * 2,
    ageMs: 0,
    durationMs: 460,
    scale,
  });
}
