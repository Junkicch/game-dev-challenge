export type UIAtlasFrame = {
  filename: string;
  frame: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  sourceSize: {
    w: number;
    h: number;
  };
  pivot?: {
    x: number;
    y: number;
  };
};

export type UIAtlasMeta = {
  app: string;
  version: string;
  image: string;
  format: string;
  size: {
    w: number;
    h: number;
  };
  scale: string;
  smartupdate: string;
  ui?: unknown;
};

export type UIAtlas = {
  frames: Record<string, UIAtlasFrame>;
  meta: UIAtlasMeta;
};

export type AtlasFrameData = UIAtlasFrame;
