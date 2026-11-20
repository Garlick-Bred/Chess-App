import { useEffect, useMemo, useState } from 'react';
import { DRILL_BY_ID, bankLevel } from '@shared/drills.js';
import { LESSON_CLOVES_PER_DAY } from '@shared/cloves.js';
import bank from '@shared/puzzles.json';
import { go, useApp } from '../App';
import Board from '../components/Board';
import { Material, TierChip } from '../components/ui';
import { useLesson } from '../game/useLesson';
import { sfx } from '../sound';

/** A representative position for a lesson started from the Learn page. */
function demoPosition(drillId: string, level: number): { fen: string; mateIn: number | null } {
  const all: { fen: string; mateIn: number | null; level: number }[] = (bank as any).drills[drillId] ?? [];
  const pool = all.filter((p) => p.level === bankLevel(level));
  const list = (pool.length ? pool : all).slice().sort((a, b) => (a.mateIn ?? 0) - (b.mateIn ?? 0));
  const p = list[Math.floor(list.length / 2)];
  return { fen: p.fen, mateIn: p.mateIn };
}

const EMPTY = new Map<string, string[]>();

export default function LessonPage({ drillId, query }: { drillId: string; query: URLSearchParams }) {
  const { me } = useApp();
  const drill = DRILL_BY_ID[drillId];
  const fenParam = query.get('fen');
  const level = Number(query.get('level')) || me.progress[drillId]?.level || 1;
  const start = useMemo(
    () => (fenParam ? { fen: fenParam, mateIn: query.get('mate') ? Number(query.get('mate')) : null } : drill ? demoPosition(drillId, level) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drillId, fenParam],
  );
  if (!drill || !start) {
    return (
      <div className="page">
        <p>Unknown lesson.</p>
        <a href="#/learn">All lessons</a>
      </div>
    );
  }
  return <Lesson key={`${drillId}-${start.fen}`} drill={drill} startFen={start.fen} mateIn={start.mateIn} level={level} fromPuzzle={!!fenParam} />;
}

function Lesson({ drill, startFen, mateIn, level, fromPuzzle }: { drill: any; startFen: string; mateIn: number | null; level: number; fromPuzzle: boolean }) {
  const L = useLesson(drill.id, startFen, level);
  const [showBox, setShowBox] = useState(true);
  const [auto, setAuto] = useState(false);
  const [showIdeas, setShowIdeas] = useState(true);

  // Auto-play: one move every 1.6 seconds until the end.
  useEffect(() => {
    if (!auto) return;
    if (L.atEnd) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => {
      if (L.upcoming) {
        L.next();
        sfx.move();
      }
    }, 1600);
    return () => clearTimeout(t);
  }, [auto, L.shown, L.steps.length, L.atEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && L.upcoming) {
        L.next();
        sfx.move();
      }
      if (e.key === 'ArrowLeft') L.prev();
      if (e.key === ' ') {
        e.preventDefault();
        setAuto((a) => !a);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [L]);

  const replay = () => {
    const q = new URLSearchParams({ fen: startFen, level: String(level), lesson: '1' });
    if (mateIn != null) q.set('mate', String(mateIn));
    go(`/play/${drill.id}?${q.toString()}`);
  };

  const step = (fn: () => void) => () => {
    fn();
    sfx.move();
  };
  const firstColor = startFen.split(' ')[1];
  const startNo = Number(startFen.split(' ')[5]) || 1;
  const moveLabel = (i: number) => {
    const plyFromWhite = i + (firstColor === 'b' ? 1 : 0);
    const n = startNo + Math.floor(plyFromWhite / 2);
    return plyFromWhite % 2 === 0 ? `${n}.` : `${n}...`;
  };
  const youColor = L.userColor === 'w' ? 'White' : 'Black';
  const arrows = L.upcoming ? [{ from: L.upcoming.from, to: L.upcoming.to, color: L.upcoming.by === 'you' ? '#5fae3b' : '#8f8a83' }] : [];

  return (
    <div className="lesson-page">
      {/* Always-visible way out: back to the puzzle (or try the position) at any point. */}
      <div className="lesson-bar">
        <span className="lesson-bar-title">
          📖 Lesson<span className="lesson-bar-name"> · {drill.name}</span>
        </span>
        <button className="btn back-btn" onClick={replay} title="Play this position yourself. Solving it earns a full clove.">
          {fromPuzzle ? '↩ Back to the puzzle' : 'Try it yourself ▸'}
        </button>
      </div>
    <div className="play lesson">
      <div className="board-col">
        <div className="board-wrap">
          <Board
            fen={L.fen}
            orientation={L.userColor}
            userColor={L.userColor}
            interactive={false}
            dests={EMPTY}
            lastMove={L.current ? [L.current.from, L.current.to] : null}
            arrows={arrows}
            region={showBox ? L.region : null}
            onMove={() => undefined}
          />
        </div>
      </div>

      <aside className="panel">
        <div className="panel-head">
          <div className="row between">
            <div>
              <div className="eyebrow">
                📖 Lesson · <TierChip tier={drill.tier} />
              </div>
              <h2>{drill.name}</h2>
            </div>
            <Material drillId={drill.id} size={20} />
          </div>
          <div className="goal">
            <span className={`side-dot ${L.userColor}`} />
            <span>
              You are <b>{youColor}</b>. {fromPuzzle ? 'This is your puzzle, played perfectly.' : drill.summary}
            </span>
          </div>
        </div>

        <div className="lesson-explain" key={L.shown}>
          {L.current ? (
            <>
              <div className="row gap">
                <span className={`who ${L.current.by}`}>{L.current.by === 'you' ? 'You' : 'Opponent'}</span>
                <b>
                  {moveLabel(L.shown - 1)} {L.current.san}
                </b>
              </div>
              <p>{L.current.text}</p>
            </>
          ) : (
            <p>
              Here's the starting position. Step through the perfect line: each move explains the idea behind it.
              {L.region && ' The red squares are the defending king’s box: watch it shrink.'}
            </p>
          )}
          {L.upcoming && <div className="small muted">Next: {L.upcoming.by === 'you' ? 'you play' : 'the opponent plays'} {L.upcoming.san} (arrow on the board)</div>}
        </div>

        {L.error && <div className="warn small">{L.error}</div>}

        <div className="lesson-controls">
          <button className="btn" onClick={() => L.jump(0)} disabled={L.shown === 0} aria-label="Restart">
            ⏮
          </button>
          <button className="btn" onClick={L.prev} disabled={L.shown === 0} aria-label="Back">
            ◀
          </button>
          <button className="btn primary grow" onClick={step(L.next)} disabled={!L.upcoming}>
            {L.upcoming ? 'Next move ▶' : L.finished ? 'End of the line' : 'Preparing…'}
          </button>
          <button className="btn" onClick={() => setAuto((a) => !a)} disabled={L.atEnd} aria-label={auto ? 'Pause' : 'Auto-play'}>
            {auto ? '⏸' : '▶▶'}
          </button>
        </div>
        <div className="row between small muted">
          <span>
            Move {L.shown} of {L.steps.length}
            {L.finished ? '' : '+'}
          </span>
          {L.region && (
            <label className="check-inline">
              <input type="checkbox" checked={showBox} onChange={(e) => setShowBox(e.target.checked)} /> Show the king's box
            </label>
          )}
        </div>

        {L.atEnd && (
          <div className="lesson-done">
            <b>✓ {L.finished}</b>
            <p className="small">
              Now play it yourself from the same position. Solving it earns a <b>full clove</b> (up to {LESSON_CLOVES_PER_DAY} lesson cloves a day), at half
              points since you've seen the answer.
            </p>
            <button className="btn primary big full" onClick={replay}>
              Play it yourself ▸
            </button>
          </div>
        )}

        <div className="moves">
          {L.steps.length === 0 && <div className="muted small">Working out the perfect line…</div>}
          <div className="lesson-moves">
            {L.steps.map((s, i) => (
              <button key={i} className={`lesson-move ${s.by} ${i === L.shown - 1 ? 'on' : ''}`} onClick={() => L.jump(i + 1)}>
                <span className="move-n">{moveLabel(i)}</span> {s.san}
              </button>
            ))}
          </div>
        </div>

        <div className="tips">
          <button className="tips-toggle" onClick={() => setShowIdeas((v) => !v)}>
            {showIdeas ? '▾' : '▸'} Key ideas
          </button>
          {showIdeas && (
            <ul>
              {drill.tips.map((t: string, i: number) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
        <a className="small" href="#/learn">
          ◂ All lessons
        </a>
      </aside>
    </div>
    </div>
  );
}
