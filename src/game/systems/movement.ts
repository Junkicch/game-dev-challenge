import type { Ship } from '@/game/types';
import type { Island } from '@/game/arena';
import type { ShipConfig, WorldConfig } from '@/types/game';
import { clamp, wrapAngle } from '@/engine/math';
import { clampToBounds, resolveShipVsIslands } from '@/game/arena';

/**
 * Rotates `heading` towards `targetHeading` using at most `turnSpeed` radians
 * per second. Returns how far the ship still is from the target direction.
 */
export function steerToward(
  heading: number,
  targetHeading: number,
  turnSpeed: number,
  dt: number
): { heading: number; error: number } {
  const diff = wrapAngle(targetHeading - heading);
  const maxStep = turnSpeed * dt;
  const step = clamp(diff, -maxStep, maxStep);
  return { heading: heading + step, error: diff - step };
}

const DRIFT_EPSILON = 0.02;

/**
 * Applies thrust, rotation and drag, then integrates the position while
 * resolving arena bounds and island collisions. All movement is derived from
 * the elapsed time, so the result does not depend on the frame rate.
 */
export function integrateShip(
  ship: Ship,
  config: ShipConfig,
  world: WorldConfig,
  islands: Island[],
  dt: number,
  thrust: number
): void {
  if (thrust !== 0) {
    ship.velocity.x += Math.cos(ship.heading) * config.acceleration * thrust * dt;
    ship.velocity.y += Math.sin(ship.heading) * config.acceleration * thrust * dt;
  }

  const dragFactor = Math.pow(config.drag, dt * 60);
  ship.velocity.x *= dragFactor;
  ship.velocity.y *= dragFactor;

  const speed = Math.sqrt(ship.velocity.x ** 2 + ship.velocity.y ** 2);
  if (speed > config.maxSpeed) {
    const scale = config.maxSpeed / speed;
    ship.velocity.x *= scale;
    ship.velocity.y *= scale;
  } else if (speed < DRIFT_EPSILON) {
    ship.velocity.x = 0;
    ship.velocity.y = 0;
  }

  ship.position.x += ship.velocity.x * dt;
  ship.position.y += ship.velocity.y * dt;

  if (clampToBounds(ship.position, ship.radius, world)) {
    const intoWall =
      (ship.position.x <= ship.radius && ship.velocity.x < 0) ||
      (ship.position.x >= world.width - ship.radius && ship.velocity.x > 0) ||
      (ship.position.y <= ship.radius && ship.velocity.y < 0) ||
      (ship.position.y >= world.height - ship.radius && ship.velocity.y > 0);
    if (intoWall) {
      if (ship.position.x <= ship.radius || ship.position.x >= world.width - ship.radius) {
        ship.velocity.x = 0;
      }
      if (ship.position.y <= ship.radius || ship.position.y >= world.height - ship.radius) {
        ship.velocity.y = 0;
      }
    }
  }

  resolveShipVsIslands(ship, islands, world);
}
