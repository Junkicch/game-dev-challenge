import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameAction } from '@/game/input';

const UI = '/assets/png/default/ui/controls';

const STEERING_PADS: readonly { action: GameAction; icon: string; label: string }[] = [
  { action: 'turnLeft', icon: 'icon_turn_left.png', label: 'Turn left' },
  { action: 'forward', icon: 'icon_forward.png', label: 'Move forward' },
  { action: 'turnRight', icon: 'icon_turn_right.png', label: 'Turn right' },
];

const CANNON_PADS: readonly { action: GameAction; icon: string; label: string }[] = [
  { action: 'fireLeft', icon: 'icon_fire_left.png', label: 'Fire broadside left' },
  { action: 'fireFront', icon: 'icon_fire_front.png', label: 'Fire forward' },
  { action: 'fireRight', icon: 'icon_fire_right.png', label: 'Fire broadside right' },
];

type Pad = (typeof STEERING_PADS)[number];

type TouchControlsProps = {
  onAction: (action: GameAction, isDown: boolean) => void;
};

/**
 * One on-screen pad. Every finger that lands on the pad is tracked on its own,
 * so two thumbs can hold different pads at the same time and the action is
 * only released when the last finger lifts. `setPointerCapture` keeps the
 * release event coming from this pad even if the finger slides away.
 */
function TouchPad({ pad, onAction }: { pad: Pad; onAction: TouchControlsProps['onAction'] }) {
  const pointers = useRef(new Set<number>());
  const [pressed, setPressed] = useState(false);

  const press = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const { pointerId, currentTarget } = event;
      if (pointers.current.has(pointerId)) return;
      event.preventDefault();
      const first = pointers.current.size === 0;
      pointers.current.add(pointerId);
      try {
        currentTarget.setPointerCapture(pointerId);
      } catch {
        // pointer already gone: the pad simply behaves like an unpressed one
      }
      if (first) {
        setPressed(true);
        onAction(pad.action, true);
      }
    },
    [onAction, pad.action]
  );

  const release = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const { pointerId } = event;
      if (!pointers.current.delete(pointerId)) return;
      if (pointers.current.size === 0) {
        setPressed(false);
        onAction(pad.action, false);
      }
    },
    [onAction, pad.action]
  );

  const releaseForeign = useCallback(
    (pointerId: number) => {
      if (!pointers.current.delete(pointerId)) return;
      if (pointers.current.size === 0) {
        setPressed(false);
        onAction(pad.action, false);
      }
    },
    [onAction, pad.action]
  );

  return (
    <button
      type="button"
      tabIndex={-1}
      className={pressed ? 'touch-pad is-pressed' : 'touch-pad'}
      aria-label={pad.label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={(event) => releaseForeign(event.pointerId)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <img src={`${UI}/${pad.icon}`} alt="" draggable={false} />
    </button>
  );
}

/**
 * Touch layout for phones and tablets: steering on the left, cannons on the
 * right, both clusters reachable with the thumbs while holding the device.
 * The pads duplicate the keyboard controls, so they stay out of the tab order
 * and are announced by neither screen readers nor keyboards.
 */
export function TouchControls({ onAction }: TouchControlsProps) {
  return (
    <div className="touch-controls" aria-hidden="true">
      <div className="touch-controls__cluster touch-controls__cluster--left">
        {STEERING_PADS.map((pad) => (
          <TouchPad key={pad.action} pad={pad} onAction={onAction} />
        ))}
      </div>
      <div className="touch-controls__cluster touch-controls__cluster--right">
        {CANNON_PADS.map((pad) => (
          <TouchPad key={pad.action} pad={pad} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}
