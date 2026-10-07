import type { Effect, EntityId, Projectile, Ship } from '@/game/types';
import type { GameConfig } from '@/types/game';
import type { Island } from '@/game/arena';
import { circleTouchesIsland, isOutOfBounds } from '@/game/arena';

export type ProjectileContext = {
  config: GameConfig;
  projectiles: Projectile[];
  islands: Island[];
  player: Ship;
  enemies: Ship[];
  effects: Effect[];
  nextId: () => EntityId;
  onHit: (projectile: Projectile, target: Ship) => void;
};

function splash(
  x: number,
  y: number,
  ctx: ProjectileContext
): void {
  ctx.effects.push({
    id: ctx.nextId(),
    kind: 'splash',
    position: { x, y },
    rotation: 0,
    ageMs: 0,
    durationMs: 420,
    scale: 1,
  });
}

/**
 * Moves every projectile and resolves expiry, arena exits, island hits and
 * ship hits. A projectile applies its damage exactly once: as soon as it hits
 * something it is flagged as dead and removed by the caller. `dtMs` is the
 * elapsed time in milliseconds.
 */
export function updateProjectiles(ctx: ProjectileContext, dtMs: number): void {
  const { config, islands, player, enemies } = ctx;
  const padding = config.world.boundsPadding;
  const dt = dtMs / 1000;

  for (const projectile of ctx.projectiles) {
    if (!projectile.alive) continue;

    const stepX = projectile.velocity.x * dt;
    const stepY = projectile.velocity.y * dt;
    projectile.position.x += stepX;
    projectile.position.y += stepY;
    projectile.ageMs += dtMs;
    projectile.travelled += Math.hypot(stepX, stepY);

    if (
      projectile.ageMs >= projectile.lifetimeMs ||
      projectile.travelled >= projectile.range
    ) {
      projectile.alive = false;
      continue;
    }

    if (isOutOfBounds(projectile.position, padding, config.world)) {
      projectile.alive = false;
      splash(projectile.position.x, projectile.position.y, ctx);
      continue;
    }

    if (circleTouchesIsland(projectile.position.x, projectile.position.y, projectile.radius, islands)) {
      projectile.alive = false;
      splash(projectile.position.x, projectile.position.y, ctx);
      continue;
    }

    const targets: Ship[] =
      projectile.owner === 'player' ? enemies : [player];

    for (const target of targets) {
      if (!target.alive) continue;
      const distance = Math.hypot(
        target.position.x - projectile.position.x,
        target.position.y - projectile.position.y
      );
      if (distance <= target.radius + projectile.radius) {
        projectile.alive = false;
        ctx.onHit(projectile, target);
        break;
      }
    }
  }
}
