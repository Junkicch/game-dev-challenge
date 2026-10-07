import type { Ship, ShipKind, SimState } from '@/game/types';
import type { GameConfig, Vector2 } from '@/types/game';
import type { Island } from '@/game/arena';
import { PLAYER_SPAWN, findSpawnPoint } from '@/game/arena';

export const PLAYER_RADIUS = 30;
export const ENEMY_RADIUS = 27;

function baseShip(kind: ShipKind, position: Vector2, health: number, radius: number): Ship {
  return {
    id: 0,
    kind,
    alive: true,
    position: { x: position.x, y: position.y },
    velocity: { x: 0, y: 0 },
    heading: -Math.PI / 2,
    health,
    maxHealth: health,
    radius,
    invulnerableMs: 0,
    cooldowns: { front: 0, left: 0, right: 0 },
    attackTimerMs: 0,
    hitFlashMs: 0,
    avoidSide: 0,
  };
}

export function createPlayer(config: GameConfig): Ship {
  const player = baseShip('player', PLAYER_SPAWN, config.player.health, PLAYER_RADIUS);
  player.heading = -Math.PI / 2;
  player.invulnerableMs = config.player.invulnerabilityMs;
  return player;
}

export function createEnemy(
  kind: Exclude<ShipKind, 'player'>,
  position: Vector2,
  config: GameConfig
): Ship {
  const health = kind === 'chaser' ? config.chaser.health : config.shooter.health;
  const enemy = baseShip(kind, position, health, ENEMY_RADIUS);
  enemy.heading = Math.atan2(
    config.world.height / 2 - position.y,
    config.world.width / 2 - position.x
  );
  enemy.attackTimerMs = kind === 'shooter' ? config.shooter.attackCooldownMs : 0;
  return enemy;
}

/**
 * Spawns a single enemy at a point that is free of obstacles and far enough
 * from the player. Returns false when no valid point was found.
 */
export function spawnEnemy(
  state: SimState,
  config: GameConfig,
  islands: Island[],
  random: () => number = Math.random
): boolean {
  const { enemySpawn } = config;
  const point = findSpawnPoint(
    {
      world: config.world,
      islands,
      minDistanceFromPlayer: enemySpawn.minSpawnDistanceFromPlayer,
      maxTries: enemySpawn.maxSpawnTries,
    },
    state.player.position,
    [state.player.position, ...state.enemies.map((enemy) => enemy.position)],
    random
  );

  if (!point) return false;

  const roll = random();
  const kind = roll < enemySpawn.distribution.chaserRatio ? 'chaser' : 'shooter';
  const enemy = createEnemy(kind, point, config);
  enemy.id = state.nextId++;
  state.enemies.push(enemy);
  return true;
}

export function updateSpawns(
  state: SimState,
  config: GameConfig,
  islands: Island[],
  dt: number,
  random: () => number = Math.random
): void {
  state.spawnTimerMs -= dt;
  while (state.spawnTimerMs <= 0) {
    state.spawnTimerMs += config.enemySpawn.intervalMs;
    spawnEnemy(state, config, islands, random);
  }
}
