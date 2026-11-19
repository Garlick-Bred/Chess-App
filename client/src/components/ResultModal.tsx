import { useEffect, useState } from 'react';
import type { AttemptResult } from '../api';
import { sfx } from '../sound';
import GarlicBulb from './GarlicBulb';
import { fmtTime } from './ui';

function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{v}</>;
}

interface Props {
  drill: any;
  level: number;
  outcome: { success: boolean; reason: string };
  result: AttemptResult | null;
  submitError: string | null;
  durationMs: number;
  prevCloves: number;
  isMaxLevel: boolean;
  onNext: () => void;
  onRetry: () => void;
  onReview: () => void;
  onDrills: () => void;
}

export default function ResultModal({ drill, level, outcome, result, submitError, durationMs, prevCloves, isMaxLevel, onNext, onRetry, onReview, onDrills }: Props) {
  const ok = outcome.success;
  const cloves = result?.day.cloves ?? prevCloves;
  const bulbFull = cloves >= 5;
  const gotClove = ok && result && cloves > prevCloves && prevCloves < 5;

  return (
    <div className="modal-backdrop" onClick={onReview}>
      <div className={`modal result ${ok ? 'win' : 'loss'}`} onClick={(e) => e.stopPropagation()}>
        <div className="result-head">
          <div className="result-title">{ok ? 'Solved!' : 'Not this time'}</div>
          <div className="muted">{outcome.reason}</div>
        </div>

        {ok && (
          <div className="result-bulb">
            {result ? (
              <GarlicBulb
                key="final"
                filled={Math.min(5, cloves)}
                from={gotClove ? Math.min(5, prevCloves) : undefined}
                size={128}
                onClove={(n) => (n >= 5 ? sfx.bulb() : sfx.clove())}
              />
            ) : (
              <GarlicBulb key="pending" filled={Math.min(5, prevCloves)} size={128} celebrate={false} />
            )}
            <div className="bulb-caption">
              {result?.day.bulbCompletedNow ? (
                <span className="bulb-complete-text">Bulb complete! +{result.day.bulbBonus}</span>
              ) : bulbFull ? (
                <span>Today's bulb is full - keep going for points</span>
              ) : (
                <span>
                  Clove {Math.min(5, cloves)} of 5 today
                </span>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="result-points">
            <div className="points-big">
              +<CountUp to={result.points + (result.day.bulbBonus ?? 0)} />
              <small> pts</small>
            </div>
            <ul className="breakdown">
              {result.breakdown.map((b, i) => (
                <li key={i} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                  <span>{b.label}</span>
                  <b className={b.points < 0 ? 'neg' : ''}>{b.points > 0 ? `+${b.points}` : b.points}</b>
                </li>
              ))}
              {result.day.bulbCompletedNow && (
                <li className="bulb-line" style={{ animationDelay: `${0.15 + result.breakdown.length * 0.08}s` }}>
                  <span>🧄 Full bulb bonus</span>
                  <b>+{result.day.bulbBonus}</b>
                </li>
              )}
            </ul>
          </div>
        )}
        {!result && !submitError && <div className="muted small center">Saving…</div>}
        {submitError && <div className="form-error">{submitError}</div>}

        <div className="result-stats">
          <div>
            <b>{fmtTime(durationMs)}</b>
            <small>time{result ? ` / par ${result.parSeconds}s` : ''}</small>
          </div>
          {drill.goal !== 'hold' && result && (
            <div>
              <b>{Math.round(result.efficiency * 100)}%</b>
              <small>efficiency</small>
            </div>
          )}
          {result && (
            <div>
              <b>
                L{result.progress.level}
                {result.progress.levelUp ? ' ↑' : ''}
              </b>
              <small>{drill.name}</small>
            </div>
          )}
        </div>

        {result?.progress.levelUp && <div className="level-up">Level up! {drill.name} is now level {result.progress.level}.</div>}
        {result && !result.progress.levelUp && ok && level === result.progress.level && !isMaxLevel && (
          <div className="small muted center">
            {result.progress.qualified
              ? `${result.progress.qualifying}/${result.progress.needed} qualifying solves toward level ${level + 1}`
              : level >= 4
                ? 'Beat par with 70%+ efficiency (no takebacks) to count toward the next level.'
                : 'Solve with 70%+ efficiency and no takebacks to count toward the next level.'}
          </div>
        )}
        {result?.personalBest && <div className="pb">⚡ New personal best pace!</div>}

        {result && result.newAchievements.length > 0 && (
          <div className="new-achievements">
            {result.newAchievements.map((a, i) => (
              <div key={a.id} className="achievement-pop" style={{ animationDelay: `${0.6 + i * 0.25}s` }}>
                <span className="ach-icon">{a.icon}</span>
                <div>
                  <b>{a.name}</b>
                  <small>{a.desc}</small>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="result-actions">
          <button className="btn primary big" onClick={onNext} autoFocus>
            Next puzzle ▸
          </button>
          <div className="row gap center">
            {!ok && (
              <button className="btn" onClick={onRetry}>
                Retry this position
              </button>
            )}
            <button className="btn ghost" onClick={onReview}>
              Review board
            </button>
            <button className="btn ghost" onClick={onDrills}>
              All drills
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
