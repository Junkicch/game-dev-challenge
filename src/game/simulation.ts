import type {
  DamageSource,
  Effect,
  GamePhase,
  HudSnapshot,
  Projectile,
  Ship,
  SimState,
  WeaponSlot,
} from '@/game/types';
import type { GameConfig, GameEndReason } from '@/types/game';
import type { GameInput } from '@/game/input';
import { DEFAULT_ISLANDS, type Island } from '@/game/arena';
import { explosionAt, updateEffects } from '@/game/systems/effects';
import { integrateShip } from '@/game/systems/movement';
import { updateEnemy, type EnemyContext } from '@/game/systems/ai';
import { updateProjectiles } from '@/game/systems/projectiles';
import { fireWeapon, tickCooldowns } from '@/game/systems/weapons';
import { createPlayer, updateSpawns } from '@/game/systems/spawning';

/** Longest simulation step, keeps fast objects from tunneling through hulls. */
const MAX_STEP_MS = 1000 / 60;
/** Upper bound for a single `update` call (tests may jump the clock). */
const MAX_ADVANCE_MS = 5000;

const WEAPON_SLOTS: WeaponSlot[] = ['front', 'left', 'right'];

export type SimulationOptions = {
  islands?: Island[];
  random?: () => number;
};

/**
 * Frame-rate independent game simulation. It owns all combat state, never
 * touches PixiJS or React and only advances while the match is running, so a
 * paused game accumulates no time, cooldowns or input.
 */
export class GameSimulation {
  readonly config: GameConfig;
  readonly islands: Island[];
  private readonly input: GameInput;
  private readonly random: () => number;
  private state: SimState;

  constructor(config: GameConfig, input: GameInput, options: SimulationOptions = {}) {
    this.config = config;
    this.input = input;
    this.random = options.random ?? Math.random;
    this.islands = options.islands ?? DEFAULT_ISLANDS;
    this.state = this.createState();
  }

  private createState(): SimState {
    const player = createPlayer(this.config);
    player.id = 1;
    return {
      phase: 'ready',
      score: 0,
      elapsedMs: 0,
      timeRemainingMs: this.config.sessionTimeSeconds * 1000,
      endReason: null,
      nextId: 2,
      spawnTimerMs: this.config.enemySpawn.intervalMs,
      player,
      enemies: [],
      projectiles: [],
      effects: [],
    };
  }

  getState(): SimState {
    return this.state;
  }

  getPhase(): GamePhase {
    return this.state.phase;
  }

  getSnapshot(): HudSnapshot {
    const { player } = this.state;
    return {
      phase: this.state.phase,
      score: this.state.score,
      timeRemainingMs: this.state.timeRemainingMs,
      elapsedMs: this.state.elapsedMs,
      playerHealth: player.health,
      playerMaxHealth: player.maxHealth,
      enemyCount: this.state.enemies.length,
      endReason: this.state.endReason,
    };
  }

  start(): void {
    if (this.state.phase === 'running') return;
    this.state.phase = 'running';
    this.input.suppressHeld();
  }

  reset(): void {
    this.state = this.createState();
    this.input.reset();
  }

  pause(): void {
    if (this.state.phase !== 'running') return;
    this.state.phase = 'paused';
  }

  resume(): void {
    if (this.state.phase !== 'paused') return;
    this.state.phase = 'running';
    this.input.suppressHeld();
  }

  togglePause(): void {
    if (this.state.phase === 'running') this.pause();
    else if (this.state.phase === 'paused') this.resume();
  }

  end(reason: GameEndReason): void {
    if (this.state.phase === 'ended') return;
    this.state.phase = 'ended';
    this.state.endReason = reason;
    this.state.projectiles.length = 0;
    this.input.reset();
  }

  /** Advances the simulation by `deltaMs` of real time. */
  update(deltaMs: number): void {
    if (this.state.phase !== 'running') return;

    let remaining = Math.min(deltaMs, MAX_ADVANCE_MS);
    while (remaining > 0 && this.state.phase === 'running') {
      const step = Math.min(remaining, MAX_STEP_MS);
      this.step(step);
      remaining -= step;
    }
  }

  private nextId = (): number => this.state.nextId++;

  private step(dtMs: number): void {
    const state = this.state;
    const config = this.config;
    const dt = dtMs / 1000;

    state.timeRemainingMs -= dtMs;
    if (state.timeRemainingMs <= 0) {
      state.timeRemainingMs = 0;
      this.end('timeUp');
      return;
    }
    state.elapsedMs += dtMs;

    this.updatePlayer(dtMs, dt);
    this.updateEnemies(dtMs, dt);
    this.resolveShipCollisions();
    this.updateProjectiles(dtMs);
    this.updateVisualTimers(dtMs);
    updateEffects(state.effects, dtMs);

    if (state.phase === 'running') {
      updateSpawns(state, config, this.islands, dtMs, this.random);
    }

    state.enemies = state.enemies.filter((enemy) => enemy.alive);
    state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
  }

  /** `dtMs` drives millisecond timers (cooldowns), `dt` the physics in seconds. */
  private updatePlayer(dtMs: number, dt: number): void {
    const { player } = this.state;
    if (!player.alive) return;

    tickCooldowns(player, dtMs);

    let turn = 0;
    if (this.input.isDown('turnLeft')) turn -= 1;
    if (this.input.isDown('turnRight')) turn += 1;
    player.heading += turn * this.config.player.turnSpeed * dt;

    const thrust = this.input.isDown('forward') ? 1 : 0;
    integrateShip(player, this.config.player, this.config.world, this.islands, dt, thrust);

    for (const slot of WEAPON_SLOTS) {
      const action = actionForSlot(slot);
      if (this.input.consumePress(action) || this.input.isDown(action)) {
        fireWeapon(
          player,
          slot,
          this.config.player.weapons[slot],
          this.nextId,
          this.state.projectiles,
          this.state.effects
        );
      }
    }
  }

  private updateEnemies(dtMs: number, dt: number): void {
    const ctx: EnemyContext = {
      config: this.config,
      islands: this.islands,
      projectiles: this.state.projectiles,
      effects: this.state.effects,
      nextId: this.nextId,
    };

    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue;
      tickCooldowns(enemy, dtMs);
      const config =
        enemy.kind === 'shooter' ? this.config.shooter : this.config.chaser;
      const thrust = updateEnemy(enemy, this.state.player, ctx, dt);
      integrateShip(enemy, config, this.config.world, this.islands, dt, thrust);
    }
  }

  /**
   * Ramming Chasers explode and damage the player without scoring; every other
   * overlapping pair is pushed apart so ships never stack on top of each other.
   */
  private resolveShipCollisions(): void {
    const { player, enemies } = this.state;
    const enemiesToDestroy: Ship[] = [];

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const overlap = shipOverlap(player, enemy);
      if (overlap <= 0) continue;

      if (enemy.kind === 'chaser') {
        this.damagePlayer(this.config.chaser.damageOnCollision, 'chaser');
        enemiesToDestroy.push(enemy);
        continue;
      }

      separate(player, enemy, overlap);
    }

    for (const enemy of enemiesToDestroy) {
      if (!enemy.alive) continue;
      enemy.alive = false;
      this.explode(enemy.position.x, enemy.position.y, 1.1);
    }

    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (!b.alive) continue;
        const overlap = shipOverlap(a, b);
        if (overlap > 0) separate(a, b, overlap);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    updateProjectiles(
      {
        config: this.config,
        projectiles: this.state.projectiles,
        islands: this.islands,
        player: this.state.player,
        enemies: this.state.enemies,
        effects: this.state.effects,
        nextId: this.nextId,
        onHit: (projectile, target) => {
          if (target.kind === 'player') {
            this.damagePlayer(projectile.damage, 'enemy');
          } else {
            this.damageEnemy(target, projectile.damage, 'player');
          }
        },
      },
      dt
    );
  }

  private updateVisualTimers(dt: number): void {
    const ships: Ship[] = [this.state.player, ...this.state.enemies];
    for (const ship of ships) {
      ship.hitFlashMs = Math.max(0, ship.hitFlashMs - dt);
      ship.invulnerableMs = Math.max(0, ship.invulnerableMs - dt);
    }
  }

  private damagePlayer(amount: number, source: DamageSource): void {
    const { player } = this.state;
    if (!player.alive || this.state.phase !== 'running') return;
    if (player.invulnerableMs > 0 && source !== 'chaser') return;

    player.health = Math.max(0, player.health - amount);
    player.invulnerableMs = this.config.player.invulnerabilityMs;
    player.hitFlashMs = 160;

    if (player.health <= 0) {
      player.alive = false;
      this.explode(player.position.x, player.position.y, 1.4);
      this.end('playerDead');
    }
  }

  private damageEnemy(enemy: Ship, amount: number, source: DamageSource): void {
    if (!enemy.alive) return;
    enemy.health = Math.max(0, enemy.health - amount);
    enemy.hitFlashMs = 140;

    if (enemy.health > 0) return;

    enemy.alive = false;
    this.explode(enemy.position.x, enemy.position.y, 1);
    if (source === 'player') {
      this.state.score += 1;
    }
  }

  private explode(x: number, y: number, scale: number): void {
    explosionAt(this.state.effects, this.nextId(), x, y, scale);
  }
}

function actionForSlot(slot: WeaponSlot) {
  if (slot === 'front') return 'fireFront' as const;
  if (slot === 'left') return 'fireLeft' as const;
  return 'fireRight' as const;
}

function shipOverlap(a: Ship, b: Ship): number {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDistance = a.radius + b.radius;
  if (distance >= minDistance || distance === 0) return distance >= minDistance ? 0 : minDistance;
  return minDistance - distance;
}

function separate(a: Ship, b: Ship, overlap: number): void {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;
  const push = overlap / 2;
  a.position.x -= nx * push;
  a.position.y -= ny * push;
  b.position.x += nx * push;
  b.position.y += ny * push;

  const relative = (b.velocity.x - a.velocity.x) * nx + (b.velocity.y - a.velocity.y) * ny;
  if (relative < 0) {
    const impulse = relative * 0.7;
    a.velocity.x += impulse * nx;
    a.velocity.y += impulse * ny;
    b.velocity.x -= impulse * nx;
    b.velocity.y -= impulse * ny;
  }
}

export type { Effect, Projectile, SimState };
