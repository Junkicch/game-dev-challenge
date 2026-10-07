import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import {
  AssetLoader,
  type AssetLoadError,
  type AssetLoadProgress,
} from './assetLoader';

export type PixiAppProps = {
  onReady?: (app: Application, loader: AssetLoader) => void;
  onLoadProgress?: (progress: AssetLoadProgress) => void;
  onLoadError?: (error: AssetLoadError) => void;
};

/**
 * Creates the PixiJS application, loads the match textures and only reports
 * ready once everything succeeded. Callbacks are read through refs so a parent
 * re-render never restarts the canvas (important under React Strict Mode).
 */
export function PixiApp({ onReady, onLoadProgress, onLoadError }: PixiAppProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const onProgressRef = useRef(onLoadProgress);
  const onErrorRef = useRef(onLoadError);
  const [progress, setProgress] = useState<AssetLoadProgress | null>(null);
  const [error, setError] = useState<AssetLoadError | null>(null);
  const [attempt, setAttempt] = useState(0);

  onReadyRef.current = onReady;
  onProgressRef.current = onLoadProgress;
  onErrorRef.current = onLoadError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let destroyed = false;
    const app = new Application();
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      try {
        app.destroy(true, true);
      } catch {
        // the app never finished init; nothing to release
      }
    };

    (async () => {
      try {
        await app.init({
          background: '#123a52',
          resizeTo: container,
          antialias: false,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
        if (cancelled) {
          destroy();
          return;
        }

        container.appendChild(app.canvas);

        const loader = new AssetLoader();
        await loader.loadAll((value) => {
          if (cancelled) return;
          setProgress(value);
          onProgressRef.current?.(value);
        });

        if (cancelled) {
          loader.destroy();
          destroy();
          return;
        }

        onReadyRef.current?.(app, loader);
      } catch (err) {
        const loadError = err as AssetLoadError;
        if (cancelled) return;
        setError(loadError);
        onErrorRef.current?.(loadError);
      }
    })();

    return () => {
      cancelled = true;
      destroy();
    };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setProgress(null);
    setAttempt((value) => value + 1);
  };

  if (error) {
    return (
      <div className="pixi-status" role="alert">
        <p>
          Failed to load asset: <code>{error.url}</code>
        </p>
        <button type="button" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="pixi-stage" ref={containerRef}>
      {!progress || progress.progress < 100 ? (
        <div className="pixi-loading" role="status" aria-live="polite">
          <span>Loading assets…</span>
          <div
            className="pixi-loading__bar"
            style={{ width: `${progress?.progress ?? 0}%` }}
          />
          <span>{Math.round(progress?.progress ?? 0)}%</span>
        </div>
      ) : null}
    </div>
  );
}
