export class Time {
  private lastTime: number = 0;
  private delta: number = 0;
  private elapsed: number = 0;
  private paused: boolean = false;
  private scale: number = 1.0;

  start(): void {
    this.lastTime = performance.now();
    this.delta = 0;
    this.elapsed = 0;
  }

  update(currentTime: number = performance.now()): void {
    if (this.paused) {
      this.lastTime = currentTime;
      this.delta = 0;
      return;
    }

    const frameTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.delta = (frameTime / 1000) * this.scale;
    this.elapsed += frameTime;
  }

  getDelta(): number {
    return this.delta;
  }

  getDeltaMs(): number {
    return this.delta * 1000;
  }

  getElapsedMs(): number {
    return this.elapsed;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setScale(scale: number): void {
    this.scale = Math.max(0, scale);
  }

  getScale(): number {
    return this.scale;
  }

  reset(): void {
    this.start();
  }
}
