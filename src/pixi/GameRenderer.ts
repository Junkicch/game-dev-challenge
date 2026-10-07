import {
  Container,
  Graphics,
  Sprite,
  TilingSprite,
  type Application,
  type Texture,
} from 'pixi.js';
import type { GameConfig } from '@/types/game';
import type { Island } from '@/game/arena';
import type { Effect, Ship, SimState } from '@/game/types';
import type { AssetLoader } from '@/pixi/assetLoader';

const SHIP_SCALE = 0.8;
const HEADING_OFFSET = Math.PI / 2;
const SAND_INSET = 12;
const GRASS_INSET = 26;
const WATER_BASE = 0x64788f;
const SAND_COLOR = 0xf2cf96;
const SAND_EDGE = 0xb08f57;

type BarStyle = {
  frame: Texture;
  fills: Record<'green' | 'amber' | 'red', Texture>;
  textureWidth: number;
  textureHeight: number;
  /** Coloured window inside the frame texture, in texture pixels. */
  band: { x: number; width: number; centerY: number };
  scale: number;
};

type ShipView = {
  sprite: Sprite;
  bar: Container;
  fill: Sprite;
  style: BarStyle;
  barKey: string;
  tint: number;
};

type EffectView = {
  sprite: Sprite | null;
  graphics: Graphics | null;
};

/**
 * Mirrors the simulation state into PixiJS objects. It only draws what the
 * simulation owns: no rule, no timer and no input lives here.
 */
export class GameRenderer {
  private readonly world: Container;
  private readonly background: TilingSprite;
  private readonly islandLayer = new Container();
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly barLayer = new Container();
  private readonly effectLayer = new Container();

  private readonly shipTextures: Record<string, Texture>;
  private readonly projectileTexture: Texture;
  private readonly explosionTextures: Texture[];
  private readonly muzzleTexture: Texture;
  private readonly grassTexture: Texture;
  private readonly sandTexture: Texture;
  private readonly playerBar: BarStyle;
  private readonly enemyBar: BarStyle;

  private readonly ships = new Map<number, ShipView>();
  private readonly projectiles = new Map<number, Sprite>();
  private readonly effects = new Map<number, EffectView>();

  constructor(
    private readonly app: Application,
    private readonly config: GameConfig,
    private readonly islands: Island[],
    loader: AssetLoader
  ) {
    this.shipTextures = {
      player: requireTexture(loader, 'ship_player'),
      chaser: requireTexture(loader, 'ship_chaser'),
      shooter: requireTexture(loader, 'ship_shooter'),
    };
    this.projectileTexture = requireTexture(loader, 'cannon_ball');
    this.muzzleTexture = requireTexture(loader, 'fire_1');
    this.explosionTextures = [
      requireTexture(loader, 'explosion_1'),
      requireTexture(loader, 'explosion_2'),
      requireTexture(loader, 'explosion_3'),
    ];
    this.grassTexture = requireTexture(loader, 'tile_grass');
    this.sandTexture = requireTexture(loader, 'tile_sand');
    this.playerBar = {
      frame: requireTexture(loader, 'health_frame'),
      fills: {
        green: requireTexture(loader, 'health_fill_green'),
        amber: requireTexture(loader, 'health_fill_amber'),
        red: requireTexture(loader, 'health_fill_red'),
      },
      textureWidth: 256,
      textureHeight: 48,
      band: { x: 30, width: 196, centerY: 25 },
      scale: 0.38,
    };
    this.enemyBar = {
      frame: requireTexture(loader, 'enemy_health_frame'),
      fills: {
        green: requireTexture(loader, 'enemy_health_fill_green'),
        amber: requireTexture(loader, 'enemy_health_fill_green'),
        red: requireTexture(loader, 'enemy_health_fill_red'),
      },
      textureWidth: 160,
      textureHeight: 40,
      band: { x: 24, width: 112, centerY: 19.5 },
      scale: 0.4,
    };

    this.world = new Container();
    this.background = new TilingSprite({
      texture: requireTexture(loader, 'tile_water'),
      width: config.world.width,
      height: config.world.height,
    });

    this.world.addChild(new Graphics().rect(0, 0, config.world.width, config.world.height).fill(WATER_BASE));
    this.world.addChild(this.background);
    this.world.addChild(this.islandLayer);
    this.world.addChild(this.shipLayer);
    this.world.addChild(this.projectileLayer);
    this.world.addChild(this.barLayer);
    this.world.addChild(this.effectLayer);

    this.buildIslands();
    app.stage.addChild(this.world);
  }

  private buildIslands(): void {
    for (const island of this.islands) {
      const sandBase = new Graphics()
        .roundRect(island.x, island.y, island.width, island.height, island.cornerRadius)
        .fill(SAND_COLOR)
        .stroke({ width: 4, color: SAND_EDGE });

      const sand = new TilingSprite({
        texture: this.sandTexture,
        width: island.width - SAND_INSET * 2,
        height: island.height - SAND_INSET * 2,
      });
      sand.position.set(island.x + SAND_INSET, island.y + SAND_INSET);

      const grass = new TilingSprite({
        texture: this.grassTexture,
        width: island.width - GRASS_INSET * 2,
        height: island.height - GRASS_INSET * 2,
      });
      grass.position.set(island.x + GRASS_INSET, island.y + GRASS_INSET);

      this.islandLayer.addChild(sandBase, sand, grass);
    }
  }

  /** Keeps the 1280x720 world proportional and centred inside the canvas. */
  layout(): void {
    const screen = this.app.screen;
    const scale = Math.min(
      screen.width / this.config.world.width,
      screen.height / this.config.world.height
    );
    this.world.scale.set(scale);
    this.world.position.set(
      (screen.width - this.config.world.width * scale) / 2,
      (screen.height - this.config.world.height * scale) / 2
    );
  }

  sync(state: SimState): void {
    this.layout();
    this.syncShips(state);
    this.syncProjectiles(state);
    this.syncEffects(state);
  }

  private syncShips(state: SimState): void {
    const ships: Ship[] = [state.player, ...state.enemies];
    const aliveIds = new Set<number>();

    for (const ship of ships) {
      if (!ship.alive) continue;
      aliveIds.add(ship.id);

      const view = this.getShipView(ship);
      view.sprite.position.set(ship.position.x, ship.position.y);
      view.sprite.rotation = ship.heading + HEADING_OFFSET;
      view.sprite.alpha = blinkAlpha(ship, state.elapsedMs);

      const tint = tintFor(ship);
      if (tint !== view.tint) {
        view.tint = tint;
        view.sprite.tint = tint;
      }

      this.layoutBar(view, ship);
    }

    for (const id of [...this.ships.keys()]) {
      if (aliveIds.has(id)) continue;
      const view = this.ships.get(id)!;
      view.sprite.destroy();
      view.bar.destroy({ children: true });
      this.ships.delete(id);
    }
  }

  private getShipView(ship: Ship): ShipView {
    const existing = this.ships.get(ship.id);
    if (existing) return existing;

    const sprite = new Sprite(this.shipTextures[ship.kind]);
    sprite.anchor.set(0.5);
    sprite.scale.set(SHIP_SCALE);

    const style = ship.kind === 'player' ? this.playerBar : this.enemyBar;
    const frame = new Sprite(style.frame);
    frame.anchor.set(0.5);
    const fill = new Sprite(style.fills.green);
    fill.anchor.set(style.band.x / style.textureWidth, style.band.centerY / style.textureHeight);
    fill.position.set(-style.textureWidth / 2 + style.band.x, 0);

    const bar = new Container();
    bar.scale.set(style.scale);
    // frame first: the fill has to sit in the frame's window, not under it
    bar.addChild(frame, fill);

    this.shipLayer.addChild(sprite);
    this.barLayer.addChild(bar);

    const view: ShipView = { sprite, bar, fill, style, barKey: '', tint: -1 };
    this.ships.set(ship.id, view);
    return view;
  }

  private layoutBar(view: ShipView, ship: Ship): void {
    const ratio = ship.maxHealth > 0 ? ship.health / ship.maxHealth : 0;
    const color = ratio > 0.5 ? 'green' : ratio > 0.25 ? 'amber' : 'red';
    const key = `${ratio.toFixed(3)}-${color}`;

    view.bar.position.set(
      ship.position.x,
      ship.position.y - ship.radius - view.style.scale * view.style.frame.height * 0.5 - 6
    );

    if (key === view.barKey) return;
    view.barKey = key;
    view.fill.texture = view.style.fills[color as 'green' | 'amber' | 'red'];
    view.fill.width = view.style.band.width * ratio;
  }

  private syncProjectiles(state: SimState): void {
    const aliveIds = new Set<number>();

    for (const projectile of state.projectiles) {
      if (!projectile.alive) continue;
      aliveIds.add(projectile.id);

      let sprite = this.projectiles.get(projectile.id);
      if (!sprite) {
        sprite = new Sprite(this.projectileTexture);
        sprite.anchor.set(0.5);
        this.projectileLayer.addChild(sprite);
        this.projectiles.set(projectile.id, sprite);
      }
      sprite.position.set(projectile.position.x, projectile.position.y);
      sprite.tint = projectile.owner === 'player' ? 0xffffff : 0xff9d6b;
    }

    for (const id of [...this.projectiles.keys()]) {
      if (aliveIds.has(id)) continue;
      this.projectiles.get(id)?.destroy();
      this.projectiles.delete(id);
    }
  }

  private syncEffects(state: SimState): void {
    const activeIds = new Set<number>();

    for (const effect of state.effects) {
      activeIds.add(effect.id);
      const view = this.getEffectView(effect);
      const progress = Math.min(1, effect.ageMs / effect.durationMs);

      if (effect.kind === 'splash') {
        const radius = 6 + progress * 22;
        view.graphics?.clear();
        view.graphics
          ?.circle(effect.position.x, effect.position.y, radius)
          .stroke({ width: 3, color: 0xcfe8ff, alpha: (1 - progress) * 0.9 });
        continue;
      }

      const sprite = view.sprite;
      if (!sprite) continue;
      sprite.position.set(effect.position.x, effect.position.y);
      sprite.visible = true;

      if (effect.kind === 'explosion') {
        const index = Math.min(
          this.explosionTextures.length - 1,
          Math.floor(progress * this.explosionTextures.length)
        );
        sprite.texture = this.explosionTextures[index];
        sprite.anchor.set(0.5);
        sprite.rotation = effect.rotation;
        sprite.scale.set(1.35 * effect.scale);
        sprite.alpha = 1 - progress * 0.35;
      } else {
        sprite.texture = this.muzzleTexture;
        sprite.anchor.set(0.5, 0.15);
        sprite.rotation = effect.rotation + HEADING_OFFSET;
        sprite.scale.set(0.9 * effect.scale, (1 - progress * 0.5) * effect.scale);
        sprite.alpha = 1 - progress;
      }
    }

    for (const id of [...this.effects.keys()]) {
      if (activeIds.has(id)) continue;
      const view = this.effects.get(id)!;
      view.sprite?.destroy();
      view.graphics?.destroy();
      this.effects.delete(id);
    }
  }

  private getEffectView(effect: Effect): EffectView {
    const existing = this.effects.get(effect.id);
    if (existing) return existing;

    let view: EffectView;
    if (effect.kind === 'splash') {
      const graphics = new Graphics();
      this.effectLayer.addChild(graphics);
      view = { sprite: null, graphics };
    } else {
      const sprite = new Sprite(this.projectileTexture);
      sprite.visible = false;
      this.effectLayer.addChild(sprite);
      view = { sprite, graphics: null };
    }

    this.effects.set(effect.id, view);
    return view;
  }

  destroy(): void {
    for (const view of this.ships.values()) {
      view.sprite.destroy();
      view.bar.destroy({ children: true });
    }
    for (const sprite of this.projectiles.values()) sprite.destroy();
    for (const view of this.effects.values()) {
      view.sprite?.destroy();
      view.graphics?.destroy();
    }
    this.ships.clear();
    this.projectiles.clear();
    this.effects.clear();
    this.app.stage.removeChild(this.world);
    this.world.destroy({ children: true });
  }
}

function requireTexture(loader: AssetLoader, name: string): Texture {
  const texture = loader.getTexture(name);
  if (!texture) throw new Error(`Missing texture: ${name}`);
  return texture;
}

function tintFor(ship: Ship): number {
  if (ship.hitFlashMs > 0) return 0xff8a80;

  const ratio = ship.maxHealth > 0 ? ship.health / ship.maxHealth : 0;
  const strength = 1 - Math.min(1, ratio / 0.6);
  if (strength <= 0) return 0xffffff;

  const mix = (a: number, b: number) => Math.round(a + (b - a) * strength);
  const red = mix(0xff, 0x8f);
  const green = mix(0xff, 0x4a);
  const blue = mix(0xff, 0x46);
  return (red << 16) | (green << 8) | blue;
}

function blinkAlpha(ship: Ship, elapsedMs: number): number {
  if (ship.kind !== 'player' || ship.invulnerableMs <= 0) return 1;
  return Math.sin(elapsedMs * 0.02) > 0 ? 0.45 : 1;
}
