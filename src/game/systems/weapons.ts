import type { Effect, Projectile, Ship, WeaponSlot } from '@/game/types';
import type { EntityId } from '@/game/types';
import type { GameConfig, Vector2, WeaponConfig } from '@/types/game';

export const PROJECTILE_RADIUS = 5;
const MUZZLE_OFFSET = 8;

export function weaponDirection(ship: Ship, slot: WeaponSlot): number {
  if (slot === 'front') return ship.heading;
  // Screen coordinates grow downwards (y+), so the port side is a quarter turn
  // counter-clockwise from the heading (heading - π/2): a ship facing north
  // (-π/2) fires its left broadside to the west (-π).
  if (slot === 'left') return ship.heading - Math.PI / 2;
  return ship.heading + Math.PI / 2;
}

function spawnProjectile(
  origin: Vector2,
  angle: number,
  owner: 'player' | 'enemy',
  weapon: WeaponConfig,
  id: EntityId,
  out: Projectile[]
): void {
  const { speed, damage, range, lifetimeMs } = weapon.projectile;
  out.push({
    id,
    owner,
    position: { x: origin.x, y: origin.y },
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    damage,
    radius: PROJECTILE_RADIUS,
    ageMs: 0,
    lifetimeMs,
    range,
    travelled: 0,
    alive: true,
  });
}

function muzzleFlash(
  origin: Vector2,
  angle: number,
  out: Effect[],
  id: EntityId
): void {
  out.push({
    id,
    kind: 'muzzle',
    position: { x: origin.x, y: origin.y },
    rotation: angle,
    ageMs: 0,
    durationMs: 140,
    scale: 1,
  });
}

/**
 * Fires a ship weapon when its cooldown allows it. Returns true when the
 * weapon actually fired.
 */
export function fireWeapon(
  ship: Ship,
  slot: WeaponSlot,
  weapon: WeaponConfig,
  idFactory: () => EntityId,
  projectiles: Projectile[],
  effects: Effect[]
): boolean {
  if (ship.cooldowns[slot] > 0) return false;

  ship.cooldowns[slot] = weapon.projectile.cooldownMs;
  const direction = weaponDirection(ship, slot);
  const count = Math.max(1, weapon.projectileCount);
  const spread = weapon.spread;

  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spread;
    const angle = direction + offset;
    const origin = {
      x: ship.position.x + Math.cos(angle) * (ship.radius + MUZZLE_OFFSET),
      y: ship.position.y + Math.sin(angle) * (ship.radius + MUZZLE_OFFSET),
    };
    spawnProjectile(origin, angle, 'player', weapon, idFactory(), projectiles);
    if (i === Math.floor((count - 1) / 2)) {
      muzzleFlash(origin, angle, effects, idFactory());
    }
  }

  return true;
}

/**
 * Enemy shot used by the Shooter: a single round aimed at the target.
 */
export function fireEnemyShot(
  ship: Ship,
  target: Vector2,
  config: GameConfig,
  idFactory: () => EntityId,
  projectiles: Projectile[],
  effects: Effect[]
): boolean {
  if (ship.attackTimerMs > 0) return false;

  ship.attackTimerMs = config.shooter.attackCooldownMs;
  const angle = Math.atan2(
    target.y - ship.position.y,
    target.x - ship.position.x
  );
  const origin = {
    x: ship.position.x + Math.cos(angle) * (ship.radius + MUZZLE_OFFSET),
    y: ship.position.y + Math.sin(angle) * (ship.radius + MUZZLE_OFFSET),
  };

  const { speed, damage, range, lifetimeMs } = config.shooter.projectile;
  projectiles.push({
    id: idFactory(),
    owner: 'enemy',
    position: origin,
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    damage,
    radius: PROJECTILE_RADIUS,
    ageMs: 0,
    lifetimeMs,
    range,
    travelled: 0,
    alive: true,
  });
  muzzleFlash(origin, angle, effects, idFactory());
  return true;
}

export function tickCooldowns(ship: Ship, dt: number): void {
  ship.cooldowns.front = Math.max(0, ship.cooldowns.front - dt);
  ship.cooldowns.left = Math.max(0, ship.cooldowns.left - dt);
  ship.cooldowns.right = Math.max(0, ship.cooldowns.right - dt);
  ship.attackTimerMs = Math.max(0, ship.attackTimerMs - dt);
  ship.invulnerableMs = Math.max(0, ship.invulnerableMs - dt);
  ship.hitFlashMs = Math.max(0, ship.hitFlashMs - dt);
}
