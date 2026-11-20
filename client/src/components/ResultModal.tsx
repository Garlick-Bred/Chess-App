import { useEffect, useRef, useState } from 'react';
import type { AttemptResult } from '../api';
import { sfx } from '../sound';
import GarlickBulb from './GarlickBulb';
import GoldenClove from './GoldenClove';
import { fmtTime, AchIcon } from './ui';
import { formatCloves } from '@shared/cloves.js';

function niceDay(day: string | null): string {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Garlic braid progress once the bulb is full, a new shield, or a repaired streak. */
function BraidNote({ result, bulbFull }: { result: AttemptResult; bulbFull: boolean }) {
  const b = result.braid;
  if (result.repaired) {
    return (
      <div className="school-note pass">
        💨 <b>Streak repaired!</b> Your double bulb saved it: 🔥 {result.repaired.streak} days and counting.
      </div>
    );
  }
  if (b?.earned) {
    return (
      <div className="school-note grad shield-note">
        🛡️ <b>Streak shield woven!</b> You hold {b.shields} of {b.max}. It's used automatically if you miss a day.
      </div>
    );
  }
  if (!bulbFull || !b || result.cloveGain <= 0 || result.day.bulbCompletedNow) return null;
  return (
    <div className="braid-note">
      <span className="braid-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (b.braid / b.size) * 100)}%` }} />
      </span>
      {b.shields >= b.max
        ? `🛡️ ${b.shields}/${b.max} shields held: your braid is full.`
        : `Braid ${formatCloves(b.braid)}/${b.size} toward a streak shield${b.shields ? ` · 🛡️ ${b.shields} held` : ''}`}
    </div>
  );
}

/** Endgame rating change and Endgame School progress for this attempt. */
function RatingAndSchool({ result, drill }: { result: AttemptResult; drill: any }) {
  const r = result.rating;
  const sc = result.school;
  const ev = sc?.events ?? {};
  let school: JSX.Element | null = null;
  if (ev.graduated) {
    school = (
      <div className="school-note grad">
        🎓 <b>Graduated!</b> {drill.name} leaves your daily rotation; a harder endgame takes its place. Check-up on {niceDay(sc.reviewDue)}.
      </div>
    );
  } else if (ev.reviewPassed) {
    school = (
      <div className="school-note pass">
        🩺 <b>Check-up passed.</b> Next one on {niceDay(sc.reviewDue)}.
      </div>
    );
  } else if (ev.recheck) {
    school = <div className="school-note">🩺 Solved with help, so this check-up comes back tomorrow.</div>;
  } else if (ev.demoted) {
    school = <div className="school-note warn">↩ {drill.name} is back in your School rotation for more practice.</div>;
  } else if (r.rated && sc && sc.status === 'graduated') {
    school = (
      <div className="school-note">
        🎓 You've graduated {drill.name}. Next check-up: {niceDay(sc.reviewDue)}.
      </div>
    );
  } else if (r.rated && sc && sc.status === 'learning' && (sc.mode || sc.atLevel)) {
    school = (
      <div className="school-note">
        <span className="streak-dots" aria-label={`${sc.cleanStreak} of ${sc.needed} solves in a row`}>
          {Array.from({ length: sc.needed }, (_, i) => (
            <i key={i} className={i < sc.cleanStreak ? 'on' : ''} />
          ))}
        </span>{' '}
        {sc.cleanStreak === 0
          ? `Solves in a row: 0/${sc.needed}. Any solve counts (unless you used Show piece); a failed puzzle starts the run again.`
          : `${sc.cleanStreak}/${sc.needed} solves in a row to graduate ${drill.name}.`}
      </div>
    );
  }
  return (
    <>
      {r && (
        <div className={`rating-line ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}`}>
          {r.rated ? (
            <>
              Endgame rating <b>{r.after}</b>{' '}
              <span className="rating-delta">{r.delta > 0 ? `+${r.delta}` : r.delta === 0 ? '±0' : r.delta}</span>
              <small className="muted"> · puzzle rated {r.puzzle}</small>
            </>
          ) : (
            <span className="muted">Lesson replays don't change your endgame rating.</span>
          )}
        </div>
      )}
      {school}
    </>
  );
}

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
  onLesson: () => void;
  onReview: () => void;
  onDrills: () => void;
  onDone: () => void;
}

export default function ResultModal({ drill, level, outcome, result, submitError, durationMs, prevCloves, isMaxLevel, onNext, onRetry, onLesson, onReview, onDrills, onDone }: Props) {
  const ok = outcome.success;
  // The solve that fills the 5th clove asks whether to keep going or stop for the day.
  const askDone = !!result?.day.bulbCompletedNow;
  const choiceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!askDone) return;
    // On phones the question sits below the fold: bring it into view after the celebration.
    const t = setTimeout(() => choiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 1600);
    return () => clearTimeout(t);
  }, [askDone]);
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      if (result.golden) sfx.golden();
      if (result.braid?.earned || result.repaired) setTimeout(() => sfx.shield(), result.golden ? 500 : 0);
    }, 1300);
    return () => clearTimeout(t);
  }, [result]);
  const cloves = result?.day.cloves ?? prevCloves;
  const bulbFull = cloves >= 5 - 1e-9;
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
              <GarlickBulb
                key="final"
                filled={Math.min(5, cloves)}
                from={gotClove ? Math.min(5, prevCloves) : undefined}
                size={128}
                onClove={(n, completed) => (n >= 5 - 1e-9 ? sfx.bulb() : completed ? sfx.clove() : sfx.cloveSmall())}
              />
            ) : (
              <GarlickBulb key="pending" filled={Math.min(5, prevCloves)} size={128} celebrate={false} />
            )}
            <div className="bulb-caption">
              {result?.day.bulbCompletedNow ? (
                <span className="bulb-complete-text">Bulb complete! +{result.day.bulbBonus}</span>
              ) : bulbFull ? (
                <span>
                  {result && result.cloveGain > 0 && <b className="clove-gain">+{formatCloves(result.cloveGain)} clove · </b>}
                  Bulb full: extra cloves weave your braid
                </span>
              ) : (
                <span>
                  {result && result.cloveGain > 0 && <b className="clove-gain">+{formatCloves(result.cloveGain)} clove · </b>}
                  {formatCloves(Math.min(5, cloves))} of 5 today
                </span>
              )}
            </div>
            {result?.cloveNote && <div className="small muted clove-note">{formatCloves(result.cloveGain)} clove: {result.cloveNote}</div>}
            {result && <BraidNote result={result} bulbFull={bulbFull} />}
          </div>
        )}

        {result?.golden && (
          <div className="golden-banner" role="status">
            <GoldenClove size={40} />
            <div>
              <b>Golden clove!</b>
              <small>
                +{result.golden.points} bonus points · {result.golden.total} found so far
              </small>
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
                  <span className="row gap">
                    <GarlickBulb filled={5} size={16} celebrate={false} /> Full bulb bonus
                  </span>
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

        {result && <RatingAndSchool result={result} drill={drill} />}

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
                <span className="ach-icon">
                  <AchIcon icon={a.icon} size={34} />
                </span>
                <div>
                  <b>{a.name}</b>
                  <small>{a.desc}</small>
                </div>
              </div>
            ))}
          </div>
        )}

        {result?.lessonReplay && result.lessonCloveCapped && (
          <div className="small muted center">Lesson replays already earned 2 cloves today, so this one earns points only.</div>
        )}

        <div className="result-actions">
          {!ok && (
            <button className="btn lesson-btn big" onClick={onLesson}>
              📖 Show me how <small>step-by-step lesson, then replay for a clove</small>
            </button>
          )}
          {askDone ? (
            <div className="day-choice" ref={choiceRef}>
              <b>Today's bulb is full. Keep going, or call it a day?</b>
              <div className="day-choice-btns">
                <button className="btn primary big" onClick={onNext}>
                  Keep going ▸
                </button>
                <button className="btn gold big" onClick={onDone}>
                  ✓ Done for today
                </button>
              </div>
              <small className="muted">Extra cloves weave your garlic braid: 5 make a streak shield.</small>
            </div>
          ) : (
            <button className={`btn ${ok ? 'primary big' : ''}`} onClick={onNext} autoFocus={ok}>
              Next puzzle ▸
            </button>
          )}
          <div className="row gap center wrap">
            {!ok && (
              <button className="btn" onClick={onRetry}>
                Retry this position
              </button>
            )}
            {ok && (
              <button className="btn ghost" onClick={onLesson}>
                See the perfect line
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
