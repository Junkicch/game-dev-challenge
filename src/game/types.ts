import type { Vector2, EnemyType, GameEndReason } from '@/types/game';

export type EntityId = number;

export type ShipKind = 'player' | EnemyType;

export type WeaponSlot = 'front' | 'left' | 'right';

export type Ship = {
  id: EntityId;
  kind: ShipKind;
  /** Removed once destroyed; dead ships never move, shoot or collide. */
  alive: boolean;
  position: Vector2;
  velocity: Vector2;
  heading: number;
  health: number;
  maxHealth: number;
  radius: number;
  /** Time left of the invulnerability window after taking damage. */
  invulnerableMs: number;
  /** Per-weapon cooldown timers (time left until the weapon can fire again). */
  cooldowns: Record<WeaponSlot, number>;
  /** Shooter-only timer between attacks. */
  attackTimerMs: number;
  /** Visual feedback: time left of the red hit flash. */
  hitFlashMs: number;
  /** Deterministic-ish steering bias used to slide around islands. */
  avoidSide: -1 | 0 | 1;
};

export type ProjectileOwner = 'player' | 'enemy';

export type Projectile = {
  id: EntityId;
  owner: ProjectileOwner;
  position: Vector2;
  velocity: Vector2;
  damage: number;
  radius: number;
  ageMs: number;
  lifetimeMs: number;
  range: number;
  travelled: number;
  alive: boolean;
};

export type EffectKind = 'muzzle' | 'explosion' | 'splash';

export type Effect = {
  id: EntityId;
  kind: EffectKind;
  position: Vector2;
  rotation: number;
  ageMs: number;
  durationMs: number;
  scale: number;
};

export type GamePhase = 'ready' | 'running' | 'paused' | 'ended';

export type DamageSource = 'player' | 'enemy' | 'chaser';

export type SimState = {
  phase: GamePhase;
  score: number;
  elapsedMs: number;
  timeRemainingMs: number;
  endReason: GameEndReason | null;
  nextId: EntityId;
  spawnTimerMs: number;
  player: Ship;
  enemies: Ship[];
  projectiles: Projectile[];
  effects: Effect[];
};

export type HudSnapshot = {
  phase: GamePhase;
  score: number;
  timeRemainingMs: number;
  elapsedMs: number;
  playerHealth: number;
  playerMaxHealth: number;
  enemyCount: number;
  endReason: GameEndReason | null;
};
