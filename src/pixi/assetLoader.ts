import { Assets, type Spritesheet, type Texture } from 'pixi.js';

export type AssetLoadProgress = {
  loaded: number;
  total: number;
  progress: number;
};

export type AssetLoadError = {
  url: string;
  error: unknown;
};

type AssetEntry = {
  name: string;
  src: string;
};

const BASE_PATH = '/assets';

/**
 * Texture registry for the match. Every asset is loaded once, stored under a
 * stable key and reused by the renderer; a failed load throws before the
 * combat screen can start.
 */
export class AssetLoader {
  private readonly entries: AssetEntry[] = [
    { name: 'ui_sheet', src: `${BASE_PATH}/spritesheet/ui_sheet.json` },
    { name: 'ui_sheet_retina', src: `${BASE_PATH}/spritesheet/ui_sheet_retina.json` },
    { name: 'ships_sheet', src: `${BASE_PATH}/spritesheet/ships_miscellaneous_sheet.png` },
    { name: 'tiles_sheet', src: `${BASE_PATH}/tilesheet/tiles_sheet.png` },
    { name: 'ship_player', src: `${BASE_PATH}/png/default/ships/ship_1.png` },
    { name: 'ship_chaser', src: `${BASE_PATH}/png/default/ships/ship_3.png` },
    { name: 'ship_shooter', src: `${BASE_PATH}/png/default/ships/ship_5.png` },
    { name: 'cannon_ball', src: `${BASE_PATH}/png/default/ship_parts/cannon_ball.png` },
    { name: 'explosion_1', src: `${BASE_PATH}/png/default/effects/explosion_1.png` },
    { name: 'explosion_2', src: `${BASE_PATH}/png/default/effects/explosion_2.png` },
    { name: 'explosion_3', src: `${BASE_PATH}/png/default/effects/explosion_3.png` },
    { name: 'fire_1', src: `${BASE_PATH}/png/default/effects/fire_1.png` },
    { name: 'fire_2', src: `${BASE_PATH}/png/default/effects/fire_2.png` },
    { name: 'tile_water', src: `${BASE_PATH}/png/default/tiles/tile_13.png` },
    { name: 'tile_grass', src: `${BASE_PATH}/png/default/tiles/tile_39.png` },
    { name: 'tile_sand', src: `${BASE_PATH}/png/default/tiles/tile_1.png` },
    { name: 'health_frame', src: `${BASE_PATH}/png/default/ui/hud/health_frame.png` },
    { name: 'health_fill_green', src: `${BASE_PATH}/png/default/ui/hud/health_fill_green.png` },
    { name: 'health_fill_amber', src: `${BASE_PATH}/png/default/ui/hud/health_fill_amber.png` },
    { name: 'health_fill_red', src: `${BASE_PATH}/png/default/ui/hud/health_fill_red.png` },
    { name: 'enemy_health_frame', src: `${BASE_PATH}/png/default/ui/hud/enemy_health_frame.png` },
    { name: 'enemy_health_fill_green', src: `${BASE_PATH}/png/default/ui/hud/enemy_health_fill_green.png` },
    { name: 'enemy_health_fill_red', src: `${BASE_PATH}/png/default/ui/hud/enemy_health_fill_red.png` },
  ];

  private readonly loaded = new Map<string, Texture | Spritesheet>();

  async loadAll(onProgress?: (progress: AssetLoadProgress) => void): Promise<void> {
    this.loaded.clear();
    const total = this.entries.length;
    let count = 0;

    // Test hook: setting window.__pirateBattleAssetsError to a URL fragment
    // makes the matching entry fail, so e2e can exercise the Retry flow
    // without depending on how the network reaches the decoding worker.
    const blockedFragment =
      (window as unknown as { __pirateBattleAssetsError?: string }).__pirateBattleAssetsError ?? null;

    const tasks = this.entries.map(async (entry) => {
      try {
        if (blockedFragment && entry.src.includes(blockedFragment)) {
          throw new Error(`asset intentionally blocked for e2e (${blockedFragment})`);
        }
        const resource = await Assets.load<Texture | Spritesheet>(entry.src);
        this.loaded.set(entry.name, resource);
      } catch (error) {
        throw { url: entry.src, error } satisfies AssetLoadError;
      } finally {
        count++;
        onProgress?.({ loaded: count, total, progress: (count / total) * 100 });
      }
    });

    await Promise.all(tasks);
  }

  getUISpritesheet(retina = false): Spritesheet | undefined {
    const sheet = this.loaded.get(retina ? 'ui_sheet_retina' : 'ui_sheet');
    return sheet && 'textures' in sheet ? (sheet as Spritesheet) : undefined;
  }

  getTexture(name: string): Texture | undefined {
    const entry = this.loaded.get(name);
    return entry && !('textures' in entry) ? (entry as Texture) : undefined;
  }

  destroy(): void {
    this.loaded.clear();
  }
}
