export type GameAction =
  | 'forward'
  | 'turnLeft'
  | 'turnRight'
  | 'fireFront'
  | 'fireLeft'
  | 'fireRight';

export const KEY_BINDINGS: Record<string, GameAction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyJ: 'fireFront',
  KeyQ: 'fireLeft',
  KeyF: 'fireLeft',
  KeyE: 'fireRight',
  KeyH: 'fireRight',
};

export const ACTION_LABELS: Record<GameAction, string> = {
  forward: 'Move forward',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  fireFront: 'Fire front',
  fireLeft: 'Fire broadside left',
  fireRight: 'Fire broadside right',
};

/**
 * Holds the current gameplay input. The simulation only ever reads it, so the
 * same buffer can be fed by the keyboard, by touch buttons or by tests.
 *
 * `suppressHeld()` makes keys that are still pressed when the match resumes do
 * nothing until they are released and pressed again, so nothing from the
 * paused period leaks into the match.
 *
 * A press is also latched: a tap that starts and ends between two simulation
 * steps still fires once (`consumePress`), which keeps short taps from being
 * dropped on slow frames.
 */
export class GameInput {
  private held = new Set<GameAction>();
  private suppressed = new Set<GameAction>();
  private presses = new Set<GameAction>();

  setAction(action: GameAction, isDown: boolean): void {
    if (isDown) {
      if (!this.held.has(action)) this.presses.add(action);
      this.held.add(action);
    } else {
      // the latched press survives the keyup: a tap that starts and ends
      // before the next simulation step must still fire exactly once
      this.held.delete(action);
      this.suppressed.delete(action);
    }
  }

  isDown(action: GameAction): boolean {
    return this.held.has(action) && !this.suppressed.has(action);
  }

  /** True exactly once per press, until the key is released or input resets. */
  consumePress(action: GameAction): boolean {
    return this.presses.delete(action);
  }

  suppressHeld(): void {
    this.suppressed = new Set(this.held);
    this.presses.clear();
  }

  reset(): void {
    this.held.clear();
    this.suppressed.clear();
    this.presses.clear();
  }

  getHeldActions(): GameAction[] {
    return [...this.held].filter((action) => !this.suppressed.has(action));
  }
}
