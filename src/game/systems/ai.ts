import type { Effect, EntityId, Projectile, Ship } from '@/game/types';
import type { GameConfig } from '@/types/game';
import type { Island } from '@/game/arena';
import { angleBetween } from '@/engine/math';
import { pointInIsland } from '@/game/arena';
import { steerToward } from '@/game/systems/movement';
import { fireEnemyShot } from '@/game/systems/weapons';

const AVOID_PROBE_DISTANCE = 92;
const FIRE_ANGLE_TOLERANCE = 0.4;
const ISLAND_AVOID_ANGLE = 1.05;

export type EnemyContext = {
  config: GameConfig;
  islands: Island[];
  projectiles: Projectile[];
  effects: Effect[];
  nextId: () => EntityId;
};

function probeBlocked(ship: Ship, islands: Island[], angle: number): boolean {
  const distance = ship.radius + AVOID_PROBE_DISTANCE;
  const x = ship.position.x + Math.cos(angle) * distance;
  const y = ship.position.y + Math.sin(angle) * distance;
  return pointInIsland(x, y, islands, 6);
}

/**
 * Picks a steering correction so the ship does not drive straight into an
 * island. The chosen side is remembered until the path is clear again.
 */
function islandAvoidance(
  ship: Ship,
  desired: number,
  islands: Island[]
): number {
  if (!probeBlocked(ship, islands, ship.heading)) {
    ship.avoidSide = 0;
    return 0;
  }

  if (ship.avoidSide === 0) {
    const leftBlocked = probeBlocked(ship, islands, ship.heading + ISLAND_AVOID_ANGLE);
    const rightBlocked = probeBlocked(ship, islands, ship.heading - ISLAND_AVOID_ANGLE);
    if (leftBlocked && !rightBlocked) ship.avoidSide = -1;
    else if (rightBlocked && !leftBlocked) ship.avoidSide = 1;
    else ship.avoidSide = ship.id % 2 === 0 ? -1 : 1;
  }

  const blockedDrift = probeBlocked(ship, islands, desired)
    ? Math.PI / 2
    : ISLAND_AVOID_ANGLE;
  return ship.avoidSide * blockedDrift;
}

/**
 * Chaser / Shooter behaviour: steer towards the player, slide around islands
 * and let the Shooter attack inside its range. Returns the thrust factor used
 * by the movement system.
 */
export function updateEnemy(
  ship: Ship,
  player: Ship,
  ctx: EnemyContext,
  dt: number
): number {
  const toPlayer = angleBetween(ship.position, player.position);
  const distance = Math.hypot(
    player.position.x - ship.position.x,
    player.position.y - ship.position.y
  );

  let desired = toPlayer;
  let thrust = 1;
  let turnSpeed = ctx.config.chaser.turnSpeed;

  if (ship.kind === 'shooter') {
    turnSpeed = ctx.config.shooter.turnSpeed;
    const stopDistance = ctx.config.shooter.stopDistance;
    if (distance < stopDistance * 0.72) {
      desired = toPlayer + Math.PI;
      thrust = 0.8;
    } else if (distance <= stopDistance) {
      thrust = 0.15;
    } else {
      thrust = 1;
    }
  }

  desired += islandAvoidance(ship, desired, ctx.islands);

  const steer = steerToward(ship.heading, desired, turnSpeed, dt);
  ship.heading = steer.heading;

  if (ship.kind === 'shooter') {
    const inRange = distance <= ctx.config.shooter.attackRange;
    const aligned = Math.abs(steer.error) < FIRE_ANGLE_TOLERANCE;
    if (inRange && aligned) {
      fireEnemyShot(
        ship,
        player.position,
        ctx.config,
        ctx.nextId,
        ctx.projectiles,
        ctx.effects
      );
    }
  }

  return thrust;
}
