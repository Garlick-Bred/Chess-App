import { useEffect, useMemo, useRef, useState } from 'react';
import { DRILLS, getDrill, MAX_LEVEL } from '@shared/drills.js';
import { useApp, go } from '../App';
import { useDrill } from '../game/useDrill';
import Board from '../components/Board';
import ResultModal from '../components/ResultModal';
import { Material, TierChip, fmtClock, CloveChip } from '../components/ui';
import { drillFit } from '@shared/cloves.js';
import { pickSchoolDrill } from '@shared/curriculum.js';
import { curriculumFor, myRating } from '../school';

// Stretch drills (far above you) still come up in random mode, just less often.
const FIT_WEIGHT: Record<string, number> = { stretch: 0.3, core: 1, easy: 0.6, warmup: 0.25 };

/** Random mode: favour drills at your level that you have not mastered. */
function pickRandomDrill(progress: Record<string, { stars: number }>, rating: number | null, exclude?: string): string {
  const pool = DRILLS.filter((d: any) => d.id !== exclude);
  const weights = pool.map((d: any) => (6 - (progress[d.id]?.stars ?? 0)) * FIT_WEIGHT[drillFit(d, rating)] * (d.tier === 4 && drillFit(d, rating) === 'core' ? 0.6 : 1));
  let r = Math.random() * weights.reduce((a: number, b: number) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].id;
  }
  return pool[0].id;
}

export default function PlayPage({ drillId, query }: { drillId: string; query: URLSearchParams }) {
  const levelParam = query.get('level');
  // A lesson replay plays the exact position from the lesson.
  const fixedFen = query.get('fen');
  const lessonReplay = query.get('lesson') === '1' && !!fixedFen;
  const mateParam = query.get('mate');
  const { me } = useApp();
  const random = drillId === 'random';
  const school = drillId === 'school';
  const [round, setRound] = useState(0);
  // Drills played this School session, so the rotation can cycle through them.
  const recent = useRef<string[]>([]);
  const { actualId, mode } = useMemo(() => {
    if (school) {
      const pick = pickSchoolDrill(curriculumFor(me), { reviewsToday: me.today.reviews ?? 0, recent: recent.current });
      const id = pick?.drillId ?? pickRandomDrill(me.progress, myRating(me));
      recent.current = [...recent.current, id];
      return { actualId: id, mode: pick?.mode ?? null };
    }
    return { actualId: random ? pickRandomDrill(me.progress, myRating(me)) : drillId, mode: null };
    // a new drill each round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillId, round]);
  if (!DRILLS.some((d: any) => d.id === actualId)) {
    return (
      <div className="page">
        <p>Unknown drill.</p>
        <a href="#/drills">Back to drills</a>
      </div>
    );
  }
  // Freeze the level for this round: a level-up mid-round must not restart the
  // puzzle (and close the result screen that announces it).
  const requested = useMemo(() => {
    const current = me.progress[actualId]?.level ?? 1;
    return levelParam ? Math.max(1, Math.min(current, Number(levelParam) || current)) : current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualId, round, levelParam]);
  // Replays are one-off: "Next" after a replay moves on to a fresh puzzle.
  const fixed = round === 0 && fixedFen ? { fen: fixedFen, mateIn: mateParam ? Number(mateParam) : null } : null;
  return (
    <Session
      key={`${actualId}-${requested}-${round}-${fixed ? 'fixed' : 'bank'}`}
      drillId={actualId}
      level={requested}
      random={random}
      mode={mode}
      fixed={fixed}
      lessonReplay={lessonReplay && round === 0}
      onNext={() => setRound((r) => r + 1)}
    />
  );
}

function Clock({ getElapsed, running, par }: { getElapsed: () => number; running: boolean; par: number }) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [running]);
  const ms = getElapsed();
  const over = ms / 1000 > par;
  return (
    <div className={`clock ${running ? 'running' : ''} ${over ? 'over' : ''}`}>
      <span className="clock-time">{fmtClock(ms)}</span>
      <span className="clock-par">par {par}s</span>
    </div>
  );
}

function Session({
  drillId,
  level,
  random,
  mode,
  fixed,
  lessonReplay,
  onNext,
}: {
  drillId: string;
  level: number;
  random: boolean;
  mode: 'school' | 'review' | null;
  fixed: { fen: string; mateIn: number | null } | null;
  lessonReplay: boolean;
  onNext: () => void;
}) {
  const { me, refresh } = useApp();
  const drill = getDrill(drillId);
  const { view, dests, premoveDests, check, onMove, onSelect, setPremove, cancelPremove, textHint, pieceHint, takeBack, giveUp, restart, getElapsed } = useDrill({
    drillId,
    level,
    playAs: me.user.settings.playAs,
    fixed,
    lessonReplay,
    mode: lessonReplay ? null : mode,
  });
  // Is this drill at your level (in your School rotation or a due check-up)?
  const atLevel = useMemo(() => {
    const cur = curriculumFor(me);
    return cur.active.some((i: any) => i.id === drillId) || cur.due.some((i: any) => i.id === drillId);
    // judged at the start of the puzzle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillId]);
  const openLesson = () => {
    if (!view) return;
    const q = new URLSearchParams({ fen: view.startFen, level: String(level) });
    if (view.puzzle.mateIn != null) q.set('mate', String(view.puzzle.mateIn));
    go(`/lesson/${drillId}?${q.toString()}`);
  };
  const [flipped, setFlipped] = useState(false);
  const [showTips, setShowTips] = useState(level <= 1);
  const [modalOpen, setModalOpen] = useState(true);
  const prevCloves = useMemo(() => me.today.cloves, [view?.startFen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view?.result) void refresh();
  }, [view?.result, refresh]);
  useEffect(() => {
    if (view?.phase === 'done') setModalOpen(true);
  }, [view?.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'h' && view?.phase === 'user') void textHint();
      if (e.key === 'p' && view?.phase === 'user') void pieceHint();
      if (e.key === 'f') setFlipped((f) => !f);
      if (e.key === 'Enter' && view?.phase === 'done' && !view.result?.day.bulbCompletedNow) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view?.phase, view?.result, textHint, pieceHint, onNext]);

  if (!view) return <div className="page">Loading…</div>;
  const userSide = view.userColor === 'w' ? 'White' : 'Black';
  const orientation = flipped ? (view.userColor === 'w' ? 'b' : 'w') : view.userColor;
  const goalText =
    drill.goal === 'mate'
      ? 'checkmate the king'
      : drill.goal === 'promote'
        ? 'promote the pawn safely'
        : drill.goal === 'convert'
          ? 'win all the enemy material'
          : `hold the draw for ${view.holdMoves} moves`;
  const showDistance = level <= 3 && view.distance != null && drill.goal !== 'hold';
  const mateIn = view.distance != null ? Math.ceil(view.distance / 2) : null;
  const startMate = view.startDistance != null ? Math.ceil(view.startDistance / 2) : null;
  const progressPct = mateIn != null && startMate ? Math.max(4, Math.min(100, (1 - mateIn / (startMate + 1)) * 100)) : 0;
  const movePairs: { n: number; w?: (typeof view.moves)[number]; b?: (typeof view.moves)[number] }[] = [];
  const firstColor = view.startFen.split(' ')[1];
  view.moves.forEach((m, i) => {
    const idx = firstColor === 'w' ? Math.floor(i / 2) : Math.floor((i + 1) / 2);
    movePairs[idx] ??= { n: idx + 1 };
    movePairs[idx][m.color] = m;
  });

  return (
    <div className="play">
      <div className="board-col">
        <div className={`board-wrap ${view.phase === 'computer' || view.phase === 'thinking' ? 'waiting' : ''}`}>
          <Board
            fen={view.fen}
            orientation={orientation}
            userColor={view.userColor}
            interactive={view.phase === 'user'}
            dests={dests}
            premovable={view.phase === 'computer' || view.phase === 'thinking'}
            premoveDests={premoveDests}
            premove={view.premove}
            onPremove={setPremove}
            onCancelPremove={cancelPremove}
            onSelect={onSelect}
            lastMove={view.lastMove}
            check={check}
            hintFrom={view.hintFrom}
            arrows={view.arrows}
            badge={view.badge}
            coordinates={me.user.settings.coordinates}
            autoQueen={me.user.settings.autoQueen}
            onMove={onMove}
          />
          {view.phase === 'blunder' && view.blunder && (
            <div className="board-overlay">
              <div className="blunder-card">
                <div className="blunder-title">
                  <span className="grade-dot" style={{ background: '#fa412d' }}>
                    ??
                  </span>
                  {view.blunder.stalemate ? 'Stalemate!' : 'Blunder'}
                </div>
                <p>
                  <b>{view.blunder.san}</b>{' '}
                  {view.blunder.stalemate
                    ? 'leaves the king with no legal moves - that is a draw.'
                    : view.blunder.after === 'draw'
                      ? 'lets the win slip to a draw.'
                      : 'loses the game.'}
                </p>
                {view.blunder.best.length > 0 && (
                  <p className="muted">
                    Better was <b>{view.blunder.best.join(' or ')}</b>.
                  </p>
                )}
                <div className="row gap">
                  <button className="btn primary" onClick={takeBack}>
                    Take back <small>(-25%)</small>
                  </button>
                  <button className="btn" onClick={giveUp}>
                    Give up
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="panel">
        <div className="panel-head">
          <div className="row between">
            <div>
              <div className="eyebrow">
                {view.lessonReplay ? '📖 Lesson replay · ' : mode === 'review' ? '🩺 School check-up · ' : mode === 'school' ? '🎓 School · ' : random ? '🎲 Random · ' : ''}
                <TierChip tier={drill.tier} /> Level {level}
                {level >= 4 ? ' · speed' : ''}
              </div>
              <h2>{drill.name}</h2>
            </div>
            <Material drillId={drill.id} size={20} />
          </div>
          <div style={{ marginTop: 6 }}>
            <CloveChip drill={drill} level={level} rating={myRating(me)} lessonReplay={view.lessonReplay} atLevel={atLevel} />
          </div>
          <div className="goal">
            <span className={`side-dot ${view.userColor}`} />
            <span>
              <b>{userSide}</b> to move - {goalText}
            </span>
          </div>
          {view.lessonReplay && (
            <button className="btn ghost lesson-again" onClick={openLesson}>
              📖 Watch the lesson again
            </button>
          )}
        </div>

        <div className="clock-row">
          <Clock getElapsed={getElapsed} running={view.phase === 'user'} par={view.par} />
          <div className="move-count">
            {view.holdMoves != null ? (
              <>
                <span className="of">
                  <b>{view.userMoves}</b>/{view.holdMoves}
                </span>
                <small>moves held</small>
              </>
            ) : (
              <>
                <span className="of">
                  <b>{view.userMoves}</b>/{view.cap}
                </span>
                <small>moves</small>
              </>
            )}
          </div>
        </div>

        {showDistance && (
          <div className="distance">
            <div className="row between small">
              <span>{drill.goal === 'mate' ? 'Mate' : 'Win'} in {mateIn} with perfect play</span>
              <span className="muted">started at {startMate}</span>
            </div>
            <div className="bar">
              <div style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className="feedback" key={view.badge?.key ?? 0}>
          {view.lastGrade ? (
            <>
              <span className="grade-dot" style={{ background: view.lastGrade.color }}>
                {view.lastGrade.symbol}
              </span>
              <div>
                <b>{view.lastGrade.label}</b>
                <div className="small">{view.lastGrade.text}</div>
              </div>
            </>
          ) : (
            <div className="small muted">{drill.summary}</div>
          )}
        </div>

        {view.writtenHintText && view.phase === 'user' && (
          <div className="hint-box">
            <b>💬 Hint</b> {view.writtenHintText}
          </div>
        )}
        {view.premove && (
          <div className="premove-note small">
            Premove queued: {view.premove.from}→{view.premove.to}. It plays the moment it's your turn (tap an empty square to cancel).
          </div>
        )}

        {view.stalled && view.phase === 'user' && (
          <div className="stall">
            <b>Going in circles?</b> No progress toward mate in your last 5 moves. Try the plan in the tips, or take a hint.
          </div>
        )}
        {view.tbError && <div className="warn small">{view.tbError}</div>}

        <div className="moves">
          {movePairs.length === 0 && <div className="muted small">Your moves will appear here.</div>}
          {movePairs.map((p) => (
            <div key={p.n} className="move-row">
              <span className="move-n">{p.n}.</span>
              <MoveCell m={p.w} />
              <MoveCell m={p.b} />
            </div>
          ))}
        </div>

        <div className="actions">
          <button className="btn" onClick={() => void textHint()} disabled={view.phase !== 'user' || !!view.writtenHintText} title="A written idea, not the move (keyboard: H)">
            💬 Hint <small>-10%</small>
          </button>
          <button className="btn" onClick={() => void pieceHint()} disabled={view.phase !== 'user' || !!view.hintFrom} title="Highlights the piece to move (keyboard: P)">
            🎯 Show piece <small>-20%</small>
          </button>
          <button className="btn" onClick={() => setFlipped((f) => !f)} title="Keyboard: F">
            ⇅ Flip
          </button>
          {view.phase !== 'done' ? (
            <button className="btn ghost" onClick={giveUp}>
              Give up
            </button>
          ) : (
            <button className="btn primary" onClick={onNext}>
              Next ▸
            </button>
          )}
        </div>

        <div className="tips">
          <button className="tips-toggle" onClick={() => setShowTips((s) => !s)}>
            {showTips ? '▾' : '▸'} How to win this
          </button>
          {showTips && (
            <ul>
              {drill.tips.map((t: string, i: number) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {view.phase === 'done' && view.outcome && modalOpen && (
        <ResultModal
          drill={drill}
          level={level}
          outcome={view.outcome}
          result={view.result}
          submitError={view.submitError}
          durationMs={getElapsed()}
          prevCloves={prevCloves}
          onNext={onNext}
          onRetry={() => restart(true)}
          onLesson={openLesson}
          onReview={() => setModalOpen(false)}
          onDrills={() => go('/drills')}
          onDone={() => go('/done')}
          isMaxLevel={level >= MAX_LEVEL}
        />
      )}
    </div>
  );
}

function MoveCell({ m }: { m?: { san: string; by: string; grade?: string } }) {
  if (!m) return <span className="move-cell" />;
  return (
    <span className={`move-cell ${m.by} ${m.grade ? `g-${m.grade}` : ''}`}>
      {m.san}
      {m.grade && m.grade !== 'best' && m.grade !== 'good' && <i className={`g-mark g-${m.grade}`} />}
    </span>
  );
}
