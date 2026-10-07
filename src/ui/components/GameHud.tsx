import type { CSSProperties, Ref } from 'react';
import type { HudSnapshot } from '@/game/types';

const UI = '/assets/png/default/ui';

type GameHudProps = {
  hud: HudSnapshot;
  timeRef: Ref<HTMLSpanElement>;
  onPause: () => void;
};

export function GameHud({ hud, timeRef, onPause }: GameHudProps) {
  const ratio =
    hud.playerMaxHealth > 0 ? hud.playerHealth / hud.playerMaxHealth : 0;
  const tone = ratio > 0.5 ? 'green' : ratio > 0.25 ? 'amber' : 'red';

  return (
    <div className="hud">
      <div className="hud__slot">
        <img className="hud__icon" src={`${UI}/hud/icon_heart.png`} alt="" />
        <div
          className="healthbar"
          style={{ '--hp': ratio.toFixed(3) } as CSSProperties}
        >
          <img
            className="healthbar__frame"
            src={`${UI}/hud/health_frame.png`}
            alt=""
          />
          <span className="healthbar__clip">
            <img src={`${UI}/hud/health_fill_${tone}.png`} alt="" />
          </span>
        </div>
        <span className="hud__value">
          {hud.playerHealth}
          <span className="hud__max">/{hud.playerMaxHealth}</span>
        </span>
      </div>

      <div className="hud__slot hud__slot--center">
        <img className="hud__icon" src={`${UI}/hud/icon_time.png`} alt="" />
        <span className="counter" ref={timeRef}>
          0:00
        </span>
        <span className="visually-hidden">time remaining</span>
      </div>

      <div className="hud__slot hud__slot--right">
        <img className="hud__icon" src={`${UI}/hud/icon_score.png`} alt="" />
        <span className="counter">{hud.score}</span>
        <button
          type="button"
          className="icon-button"
          onClick={onPause}
          aria-label="Pause match"
        >
          <img src={`${UI}/controls/icon_pause.png`} alt="" />
        </button>
      </div>
    </div>
  );
}
