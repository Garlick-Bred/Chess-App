import { useEffect, useRef, type CSSProperties } from 'react';
import { STAGES_PER_WORLD, WORLDS, worldInfo, stageStart, stageCost, stageLabel, bulbBonusFor } from '@shared/path.js';
import type { Me, PathInfo, WorldInfo } from '../api';
import { go, useApp } from '../App';

/** CSS variables that paint a world's theme. */
export function worldStyle(w: WorldInfo): CSSProperties {
  return {
    background: `linear-gradient(160deg, ${w.bg[0]}, ${w.bg[1]})`,
    ['--world-accent' as any]: w.accent,
  };
}

/** Five dots for the stages of the current world. */
function StageDots({ p }: { p: PathInfo }) {
  return (
    <span className="stage-dots" aria-label={`Stage ${p.stage} of ${STAGES_PER_WORLD} in World ${p.world}`}>
      {Array.from({ length: STAGES_PER_WORLD }, (_, i) => (
        <i key={i} className={i + 1 < p.stage ? 'done' : i + 1 === p.stage ? 'here' : ''} />
      ))}
    </span>
  );
}

/** Home-page card: your world, stage and progress to the next one. */
export function PathCard({ me }: { me: Me }) {
  const p = me.totals.path;
  const w = p.worldInfo;
  return (
    <section className="card path-card" style={worldStyle(w)}>
      <div className="row between">
        <div>
          <div className="eyebrow path-eyebrow">
            World {p.world} · {w.icon} {w.name}
          </div>
          <div className="path-stage">Stage {p.label}</div>
        </div>
        <div className="right">
          <div className="path-points">{me.totals.points.toLocaleString()} pts</div>
          <small className="path-next">
            {p.toNext.toLocaleString()} to {p.nextIsNewWorld ? `World ${p.world + 1}` : p.nextLabel}
          </small>
        </div>
      </div>
      <div className="bar path-bar">
        <div style={{ width: `${Math.round(p.progress * 100)}%` }} />
      </div>
      <div className="row between wrap gap">
        <StageDots p={p} />
        <button className="btn path-btn" onClick={() => go('/path')}>
          View the path ▸
        </button>
      </div>
    </section>
  );
}

// Node positions across a world (percent of width), a gentle winding road.
const X = [22, 50, 78, 62, 30];
const ROW = 92;

function WorldSection({ world, current, points, avatar }: { world: number; current: PathInfo; points: number; avatar: string }) {
  const w = worldInfo(world) as WorldInfo;
  const first = (world - 1) * STAGES_PER_WORLD;
  const locked = world > current.world;
  const height = STAGES_PER_WORLD * ROW + 30;
  const pts = Array.from({ length: STAGES_PER_WORLD }, (_, k) => ({ x: X[(k + (world - 1) * 2) % X.length], y: 40 + k * ROW }));
  const d = pts.map((p, k) => (k === 0 ? `M ${p.x} ${p.y}` : `C ${pts[k - 1].x} ${pts[k - 1].y + ROW / 2}, ${p.x} ${p.y - ROW / 2}, ${p.x} ${p.y}`)).join(' ');
  return (
    <section className={`world ${locked ? 'locked' : ''}`} style={worldStyle(w)}>
      <header className="world-head">
        <span className="world-icon">{w.icon}</span>
        <div>
          <div className="eyebrow">World {world}</div>
          <h2>{w.name}</h2>
          <small>{locked ? `Unlocks at ${stageStart(first).toLocaleString()} points` : w.tagline}</small>
        </div>
      </header>
      <div className="world-map" style={{ height }}>
        {w.deco.map((e, k) => (
          <span key={k} className="deco" style={{ left: `${[8, 88, 12, 84][k % 4]}%`, top: `${12 + k * 22}%` }} aria-hidden="true">
            {e}
          </span>
        ))}
        <svg className="road" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={d} vectorEffect="non-scaling-stroke" />
        </svg>
        {pts.map((p, k) => {
          const i = first + k;
          const state = i < current.index ? 'done' : i === current.index ? 'here' : 'ahead';
          return (
            <div key={i} className={`node ${state}`} style={{ left: `${p.x}%`, top: p.y }} data-current={state === 'here' || undefined}>
              {state === 'here' && <span className="node-avatar">{avatar}</span>}
              <span className="node-dot">{state === 'done' ? '✓' : stageLabel(i)}</span>
              <small className="node-label">
                {state === 'here'
                  ? `${(points - current.start).toLocaleString()}/${current.cost.toLocaleString()}`
                  : state === 'ahead'
                    ? `${stageStart(i).toLocaleString()} pts`
                    : stageLabel(i)}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function PathPage() {
  const { me } = useApp();
  const p = me.totals.path;
  const lastWorld = Math.max(WORLDS.length, p.world + 1);
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mapRef.current?.querySelector('[data-current]');
    el?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <div className="page path-page">
      <section className="card path-intro">
        <h1>The Garlick Path</h1>
        <p className="muted">
          Points move you along the path: {stageCost(0)} points to stage 1-2, a little more for each stage after. Five stages make a world, and each
          world has its own look. Your endgame rating is separate: points reward effort and consistency, the rating measures skill.
        </p>
        <ul className="earn-list">
          <li>🧩 Solving a puzzle: harder drills and higher levels pay more</li>
          <li>⚡ Speed and accuracy bonuses, ⭐ perfect play</li>
          <li>📈 Challenge bonus for puzzles rated above your endgame rating</li>
          <li>🔥 Solve streak: from your 3rd solve in a row, up to +50%</li>
          <li>
            🧄 Full bulb: +{bulbBonusFor(0)}, plus 10 for each day of your streak (now +{bulbBonusFor(me.totals.streak)})
          </li>
          <li>✨ Golden cloves and personal bests</li>
        </ul>
      </section>
      <div className="path-map" ref={mapRef}>
        {Array.from({ length: lastWorld }, (_, k) => (
          <WorldSection key={k} world={k + 1} current={p} points={me.totals.points} avatar={me.user.avatar} />
        ))}
      </div>
    </div>
  );
}
