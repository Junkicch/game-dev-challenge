import type { Vector2 } from '@/types/game';
import type { WorldConfig } from '@/types/game';
import { clamp } from '@/engine/math';

export type Island = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
};

export const PLAYER_SPAWN: Vector2 = { x: 640, y: 655 };

function island(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius = 26
): Island {
  return { id, x, y, width, height, cornerRadius };
}

/**
 * Island layout for the default 1280x720 arena. The centre corridor around the
 * player spawn point is kept open so the match never starts boxed in.
 */
export const DEFAULT_ISLANDS: Island[] = [
  island(1, 150, 96, 240, 150),
  island(2, 880, 84, 270, 168),
  island(3, 545, 262, 190, 128),
  island(4, 96, 470, 214, 160),
  island(5, 966, 452, 236, 176),
  island(6, 372, 548, 168, 120),
  island(7, 1108, 286, 132, 106),
];

export function clampToBounds(
  position: Vector2,
  radius: number,
  world: WorldConfig
): boolean {
  const minX = radius;
  const maxX = world.width - radius;
  const minY = radius;
  const maxY = world.height - radius;
  const x = clamp(position.x, minX, maxX);
  const y = clamp(position.y, minY, maxY);
  const hit = x !== position.x || y !== position.y;
  position.x = x;
  position.y = y;
  return hit;
}

export function isOutOfBounds(
  position: Vector2,
  padding: number,
  world: WorldConfig
): boolean {
  return (
    position.x < -padding ||
    position.y < -padding ||
    position.x > world.width + padding ||
    position.y > world.height + padding
  );
}

type RectHit = { dx: number; dy: number; nx: number; ny: number; depth: number };

/**
 * Circle vs. rounded rectangle (treated as a plain rectangle plus rounded
 * corners). Returns the minimal push-out vector or null when there is no
 * overlap.
 */
function circleVsIsland(
  x: number,
  y: number,
  radius: number,
  isl: Island
): RectHit | null {
  const minX = isl.x;
  const maxX = isl.x + isl.width;
  const minY = isl.y;
  const maxY = isl.y + isl.height;
  const closestX = clamp(x, minX, maxX);
  const closestY = clamp(y, minY, maxY);
  let dx = x - closestX;
  let dy = y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq > radius * radius) return null;

  if (distSq === 0) {
    // Centre is inside the rectangle: escape through the nearest edge.
    const toLeft = x - minX;
    const toRight = maxX - x;
    const toTop = y - minY;
    const toBottom = maxY - y;
    const min = Math.min(toLeft, toRight, toTop, toBottom);
    if (min === toLeft) return { dx: -toLeft, dy: 0, nx: -1, ny: 0, depth: toLeft + radius };
    if (min === toRight) return { dx: toRight, dy: 0, nx: 1, ny: 0, depth: toRight + radius };
    if (min === toTop) return { dx: 0, dy: -toTop, nx: 0, ny: -1, depth: toTop + radius };
    return { dx: 0, dy: toBottom, nx: 0, ny: 1, depth: toBottom + radius };
  }

  const dist = Math.sqrt(distSq);
  dx /= dist;
  dy /= dist;
  return { dx: dx * (radius - dist), dy: dy * (radius - dist), nx: dx, ny: dy, depth: radius - dist };
}

export type ShipBody = {
  position: Vector2;
  velocity: Vector2;
  radius: number;
};

/**
 * Resolves ship/island overlap, removing only the velocity component that
 * points into the obstacle so ships slide along the shoreline instead of
 * stopping dead. Returns true when a collision happened.
 */
export function resolveShipVsIslands(
  body: ShipBody,
  islands: Island[],
  world: WorldConfig
): boolean {
  if (!world.islandCollision) return false;
  let collided = false;
  for (const isl of islands) {
    const hit = circleVsIsland(body.position.x, body.position.y, body.radius, isl);
    if (!hit) continue;
    collided = true;
    body.position.x += hit.dx;
    body.position.y += hit.dy;
    const inward = body.velocity.x * hit.nx + body.velocity.y * hit.ny;
    if (inward < 0) {
      body.velocity.x -= inward * hit.nx;
      body.velocity.y -= inward * hit.ny;
    }
    body.velocity.x *= 0.86;
    body.velocity.y *= 0.86;
  }
  return collided;
}

export function pointInIsland(
  x: number,
  y: number,
  islands: Island[],
  margin = 0
): boolean {
  for (const isl of islands) {
    if (
      x > isl.x - margin &&
      x < isl.x + isl.width + margin &&
      y > isl.y - margin &&
      y < isl.y + isl.height + margin
    ) {
      return true;
    }
  }
  return false;
}

export function circleTouchesIsland(
  x: number,
  y: number,
  radius: number,
  islands: Island[]
): boolean {
  for (const isl of islands) {
    if (circleVsIsland(x, y, radius, isl)) return true;
  }
  return false;
}

export type SpawnQuery = {
  world: WorldConfig;
  islands: Island[];
  minDistanceFromPlayer: number;
  maxTries: number;
};

/**
 * Picks a spawn point that is inside the arena, clear of every island and far
 * enough from the player (and from other ships) to avoid unavoidable damage.
 * Returns null when no valid point could be found.
 */
export function findSpawnPoint(
  query: SpawnQuery,
  player: Vector2,
  others: Vector2[],
  random: () => number = Math.random
): Vector2 | null {
  const { world, islands, minDistanceFromPlayer, maxTries } = query;
  const margin = Math.max(world.boundsPadding, 48);
  const clearRadius = 70;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const x = margin + random() * (world.width - margin * 2);
    const y = margin + random() * (world.height - margin * 2);

    if (circleTouchesIsland(x, y, clearRadius, islands)) continue;
    if (distance(x, y, player) < minDistanceFromPlayer) continue;

    let blocked = false;
    for (const other of others) {
      if (distance(x, y, other) < 110) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    return { x, y };
  }

  return null;
}

function distance(x: number, y: number, target: Vector2): number {
  const dx = x - target.x;
  const dy = y - target.y;
  return Math.sqrt(dx * dx + dy * dy);
}
