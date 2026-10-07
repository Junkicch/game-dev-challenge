export type Vector2 = {
  x: number;
  y: number;
};

export type ProjectileConfig = {
  speed: number;
  damage: number;
  range: number;
  lifetimeMs: number;
  cooldownMs: number;
};

export type WeaponConfig = {
  type: 'front' | 'side';
  projectile: ProjectileConfig;
  spread: number;
  projectileCount: number;
};

export type PlayerWeapons = {
  front: WeaponConfig;
  left: WeaponConfig;
  right: WeaponConfig;
};

export type ShipConfig = {
  health: number;
  maxSpeed: number;
  turnSpeed: number;
  acceleration: number;
  /** Velocity multiplier applied per frame at 60 fps (1 = no drag). */
  drag: number;
};

export type PlayerConfig = ShipConfig & {
  weapons: PlayerWeapons;
  invulnerabilityMs: number;
};

export type ChaserConfig = ShipConfig & {
  damageOnCollision: number;
  stopDistance: number;
  scoreOnKill: number;
};

export type ShooterConfig = ShipConfig & {
  attackRange: number;
  attackCooldownMs: number;
  projectile: ProjectileConfig;
  stopDistance: number;
};

export type EnemySpawnDistribution = {
  chaserRatio: number;
  shooterRatio: number;
};

export type EnemySpawnConfig = {
  intervalMs: number;
  minSpawnDistanceFromPlayer: number;
  maxSpawnTries: number;
  distribution: EnemySpawnDistribution;
};

export type WorldConfig = {
  width: number;
  height: number;
  islandCollision: boolean;
  boundsPadding: number;
};

export type GameConfig = {
  sessionTimeSeconds: number;
  minSessionTimeSeconds: number;
  maxSessionTimeSeconds: number;
  enemySpawn: EnemySpawnConfig;
  player: PlayerConfig;
  chaser: ChaserConfig;
  shooter: ShooterConfig;
  world: WorldConfig;
};

export type GameState = 'menu' | 'playing' | 'paused' | 'gameOver' | 'result';

export type EnemyType = 'chaser' | 'shooter';

export type GameEndReason = 'timeUp' | 'playerDead' | 'abandoned' | 'quit';

export type MatchRecord = {
  id: string;
  playerId: string;
  date: string;
  score: number;
  durationMs: number;
  endReason: GameEndReason;
  config: Pick<GameConfig, 'sessionTimeSeconds' | 'enemySpawn'>;
};

export type RankingEntry = {
  id: string;
  playerId: string;
  playerName: string;
  score: number;
  date: string;
  matchId: string;
  config: Pick<GameConfig, 'sessionTimeSeconds' | 'enemySpawn'>;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
