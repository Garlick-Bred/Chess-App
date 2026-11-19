import { useEffect, useMemo, useState } from 'react';
import { DRILLS, getDrill, MAX_LEVEL } from '@shared/drills.js';
import { useApp, go } from '../App';
import { useDrill } from '../game/useDrill';
import Board from '../components/Board';
import ResultModal from '../components/ResultModal';
import { Material, TierChip, fmtClock } from '../components/ui';

/** Random mode: favour drills you have not mastered, a bit less of the very hard ones. */
function pickRandomDrill(progress: Record<string, { stars: number }>, exclude?: string): string {
  const pool = DRILLS.filter((d: any) => d.id !== exclude);
  const weights = pool.map((d: any) => (6 - (progress[d.id]?.stars ?? 0)) * (d.tier <= 2 ? 1 : d.tier === 3 ? 0.8 : 0.5));
  let r = Math.random() * weights.reduce((a: number, b: number) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].id;
  }
  return pool[0].id;
}

export default function PlayPage({ drillId, levelParam }: { drillId: string; levelParam: string | null }) {
  const { me } = useApp();
  const random = drillId === 'random';
  const [round, setRound] = useState(0);
  const actualId = useMemo(
    () => (random ? pickRandomDrill(me.progress) : drillId),
    // a new random drill each round
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drillId, round],
  );
  if (!DRILLS.some((d: any) => d.id === actualId)) {
    return (
      <div className="page">
        <p>Unknown drill.</p>
        <a href="#/drills">Back to drills</a>
      </div>
    );
  }
  const current = me.progress[actualId]?.level ?? 1;
  const requested = levelParam ? Math.max(1, Math.min(current, Number(levelParam) || current)) : current;
  return <Session key={`${actualId}-${requested}-${round}`} drillId={actualId} level={requested} random={random} onNext={() => setRound((r) => r + 1)} />;
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

function Session({ drillId, level, random, onNext }: { drillId: string; level: number; random: boolean; onNext: () => void }) {
  const { me, refresh } = useApp();
  const drill = getDrill(drillId);
  const { view, dests, check, onMove, hint, takeBack, giveUp, restart, getElapsed } = useDrill(drillId, level, me.user.settings.playAs);
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
      if (e.key === 'h' && view?.phase === 'user') void hint();
      if (e.key === 'f') setFlipped((f) => !f);
      if (e.key === 'Enter' && view?.phase === 'done') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view?.phase, hint, onNext]);

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
                {random ? '🎲 Random · ' : ''}
                <TierChip tier={drill.tier} /> Level {level}
                {level >= 4 ? ' · speed' : ''}
              </div>
              <h2>{drill.name}</h2>
            </div>
            <Material drillId={drill.id} size={20} />
          </div>
          <div className="goal">
            <span className={`side-dot ${view.userColor}`} />
            <span>
              <b>{userSide}</b> to move - {goalText}
            </span>
          </div>
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
          <button className="btn" onClick={() => void hint()} disabled={view.phase !== 'user'} title="Keyboard: H">
            💡 Hint <small>-20%</small>
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
          onReview={() => setModalOpen(false)}
          onDrills={() => go('/drills')}
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
