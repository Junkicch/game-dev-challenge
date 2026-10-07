import type {
  WeaponConfig,
  ChaserConfig,
  ShooterConfig,
  ProjectileConfig,
  EnemySpawnConfig,
  GameConfig,
  PlayerConfig,
  PlayerWeapons,
  WorldConfig,
} from '@/types/game';

const DEFAULT_PROJECTILE: ProjectileConfig = {
  speed: 500,
  damage: 10,
  range: 500,
  lifetimeMs: 1500,
  cooldownMs: 250,
};

const BROADSIDE_PROJECTILE: ProjectileConfig = {
  speed: 450,
  damage: 8,
  range: 400,
  lifetimeMs: 1200,
  cooldownMs: 400,
};

export const PLAYER_WEAPON_FRONT: WeaponConfig = {
  type: 'front',
  projectile: DEFAULT_PROJECTILE,
  spread: 0,
  projectileCount: 1,
};

export const PLAYER_WEAPON_SIDE: WeaponConfig = {
  type: 'side',
  projectile: BROADSIDE_PROJECTILE,
  spread: 0.15,
  projectileCount: 3,
};

export const CHASER_CONFIG: ChaserConfig = {
  health: 40,
  maxSpeed: 180,
  turnSpeed: Math.PI * 1.2,
  acceleration: 300,
  drag: 0.97,
  damageOnCollision: 20,
  stopDistance: 20,
  scoreOnKill: 1,
};

export const SHOOTER_CONFIG: ShooterConfig = {
  health: 60,
  maxSpeed: 120,
  turnSpeed: Math.PI,
  acceleration: 200,
  drag: 0.97,
  attackRange: 280,
  attackCooldownMs: 1200,
  projectile: {
    speed: 320,
    damage: 15,
    range: 350,
    lifetimeMs: 1500,
    cooldownMs: 1200,
  },
  stopDistance: 220,
};

export const ENEMY_SPAWN_CONFIG: EnemySpawnConfig = {
  intervalMs: 3000,
  minSpawnDistanceFromPlayer: 250,
  maxSpawnTries: 10,
  distribution: {
    chaserRatio: 0.6,
    shooterRatio: 0.4,
  },
};

/**
 * Documented limits for the spawn interval exposed in Options. The game logic
 * only requires a positive interval; these bounds keep matches readable.
 */
export const SPAWN_INTERVAL_LIMITS = {
  minMs: 500,
  maxMs: 10000,
} as const;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  sessionTimeSeconds: 120,
  minSessionTimeSeconds: 60,
  maxSessionTimeSeconds: 180,
  enemySpawn: ENEMY_SPAWN_CONFIG,
  player: {
    health: 100,
    maxSpeed: 220,
    turnSpeed: Math.PI,
    acceleration: 400,
    drag: 0.98,
    weapons: {
      front: PLAYER_WEAPON_FRONT,
      left: PLAYER_WEAPON_SIDE,
      right: PLAYER_WEAPON_SIDE,
    },
    invulnerabilityMs: 500,
  },
  chaser: CHASER_CONFIG,
  shooter: SHOOTER_CONFIG,
  world: {
    width: 1280,
    height: 720,
    islandCollision: true,
    boundsPadding: 40,
  },
};

/** Deep-partial overrides: nested sections only need the fields being tuned. */
export type GameConfigOverrides = Partial<
  Omit<GameConfig, 'enemySpawn' | 'player' | 'world'>
> & {
  enemySpawn?: Partial<EnemySpawnConfig>;
  player?: Partial<Omit<PlayerConfig, 'weapons'>> & { weapons?: Partial<PlayerWeapons> };
  world?: Partial<WorldConfig>;
};

export function createGameConfigSnapshot(
  overrides: GameConfigOverrides = {}
): GameConfig {
  return structuredClone({
    ...DEFAULT_GAME_CONFIG,
    ...overrides,
    enemySpawn: {
      ...DEFAULT_GAME_CONFIG.enemySpawn,
      ...overrides.enemySpawn,
      distribution: {
        ...DEFAULT_GAME_CONFIG.enemySpawn.distribution,
        ...(overrides.enemySpawn?.distribution ?? {}),
      },
    },
    player: {
      ...DEFAULT_GAME_CONFIG.player,
      ...overrides.player,
      weapons: {
        ...DEFAULT_GAME_CONFIG.player.weapons,
        ...(overrides.player?.weapons ?? {}),
      },
    },
    world: {
      ...DEFAULT_GAME_CONFIG.world,
      ...overrides.world,
    },
  });
}

export function validateGameConfig(config: GameConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (
    config.sessionTimeSeconds < config.minSessionTimeSeconds ||
    config.sessionTimeSeconds > config.maxSessionTimeSeconds
  ) {
    errors.push(
      `Session time must be between ${config.minSessionTimeSeconds} and ${config.maxSessionTimeSeconds} seconds`
    );
  }

  if (
    config.enemySpawn.intervalMs < SPAWN_INTERVAL_LIMITS.minMs ||
    config.enemySpawn.intervalMs > SPAWN_INTERVAL_LIMITS.maxMs
  ) {
    errors.push(
      `Enemy spawn interval must be between ${SPAWN_INTERVAL_LIMITS.minMs} and ${SPAWN_INTERVAL_LIMITS.maxMs} ms`
    );
  }

  if (config.enemySpawn.minSpawnDistanceFromPlayer < 0) {
    errors.push('Min spawn distance from player must be non-negative');
  }

  const totalRatio =
    config.enemySpawn.distribution.chaserRatio +
    config.enemySpawn.distribution.shooterRatio;
  if (Math.abs(totalRatio - 1) > 0.001) {
    errors.push('Enemy spawn distribution ratios must sum to 1.0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
