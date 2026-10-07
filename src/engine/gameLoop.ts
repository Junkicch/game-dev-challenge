import { Time } from './time';

export type GameLoopUpdate = (deltaMs: number, delta: number) => void;
export type GameLoopRender = () => void;

export class GameLoop {
  private time: Time;
  private updateCallback: GameLoopUpdate;
  private renderCallback: GameLoopRender;
  private running: boolean = false;
  private rafId: number | null = null;

  constructor(update: GameLoopUpdate, render: GameLoopRender) {
    this.time = new Time();
    this.updateCallback = update;
    this.renderCallback = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.time.start();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  pause(): void {
    this.time.pause();
  }

  resume(): void {
    this.time.resume();
  }

  isPaused(): boolean {
    return this.time.isPaused();
  }

  getTime(): Time {
    return this.time;
  }

  private loop = (currentTime: number = performance.now()): void => {
    if (!this.running) return;

    this.time.update(currentTime);
    const delta = this.time.getDelta();
    const deltaMs = this.time.getDeltaMs();

    this.updateCallback(deltaMs, delta);
    this.renderCallback();

    this.rafId = requestAnimationFrame(this.loop);
  };
}
