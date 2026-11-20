import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { STAGES_PER_WORLD, WORLDS, worldInfo, stageStart, stageCost, stageLabel, bulbBonusFor } from '@shared/path.js';
import type { Me, PathInfo, WorldInfo } from '../api';
import { go, useApp } from '../App';
import GarlickBulb from '../components/GarlickBulb';
import { PIECE_IMG } from '../components/Board';

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

// ---- The map -------------------------------------------------------------
// An isometric board per world, with raised tiles for the stages climbing
// upward, your piece on the current tile and a landmark beside the path.

const STEP = 100; // vertical distance between tiles (px)
const PAD_BOTTOM = 120; // room for the world banner at the bottom
const PAD_TOP = 120;
// Horizontal offsets (px from the path's centre line), a diagonal zigzag.
const XS = [-48, -12, 24, 58, 24, -12];

type TileState = 'done' | 'here' | 'ahead' | 'locked';

const TILE: Record<TileState, { top: string; left: string; right: string; edge: string; ink: string }> = {
  done: { top: '#86c94a', left: '#64a332', right: '#538b29', edge: '#4d8a25', ink: '#ffffff' },
  here: { top: '#ffffff', left: '#d3dce7', right: '#bccada', edge: '#9fb2c7', ink: '#2d3b4e' },
  ahead: { top: '#e9f0f7', left: '#c8d5e3', right: '#b2c2d4', edge: '#a8bacd', ink: '#5d7189' },
  locked: { top: '#d9dee4', left: '#b9c1ca', right: '#a5aeb9', edge: '#9aa4b0', ink: '#7b8794' },
};

/** A raised isometric tile (our own drawing): top face, two sides, label or check. */
function Tile({ state, label }: { state: TileState; label: string }) {
  const c = TILE[state];
  return (
    <svg className={`tile ${state}`} viewBox="0 0 104 78" aria-hidden="true">
      <ellipse cx="52" cy="66" rx="44" ry="10" fill="rgba(0,0,0,0.22)" />
      <path d="M6 32 L52 55 L52 69 L6 46 Z" fill={c.left} stroke={c.left} strokeWidth="6" strokeLinejoin="round" />
      <path d="M98 32 L52 55 L52 69 L98 46 Z" fill={c.right} stroke={c.right} strokeWidth="6" strokeLinejoin="round" />
      <path d="M52 9 L98 32 L52 55 L6 32 Z" fill={c.top} stroke={c.edge} strokeWidth="3" strokeLinejoin="round" />
      <path d="M52 15 L86 32 L52 49 L18 32 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinejoin="round" />
      {state === 'done' ? (
        <path d="M38 31 L48 40 L67 23" fill="none" stroke={c.ink} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text x="52" y="38" textAnchor="middle" fontSize="18" fontWeight="900" fill={c.ink} fontFamily="inherit">
          {label}
        </text>
      )}
    </svg>
  );
}

function Landmark({ w, side }: { w: WorldInfo; side: 'left' | 'right' }) {
  return (
    <div className={`landmark ${side}`} aria-hidden="true">
      <span className="landmark-shadow" />
      {w.landmark === 'garlic' ? <GarlickBulb filled={5} size={120} celebrate={false} /> : <span className="landmark-emoji">{w.landmark}</span>}
    </div>
  );
}

function WorldBoard({ world, current, avatar, color }: { world: number; current: PathInfo; avatar: string; color: string }) {
  const w = worldInfo(world) as WorldInfo;
  const first = (world - 1) * STAGES_PER_WORLD;
  const locked = world > current.world;
  const height = PAD_BOTTOM + (STAGES_PER_WORLD - 1) * STEP + PAD_TOP;
  // Landmarks alternate sides; the path leans the other way.
  const side: 'left' | 'right' = world % 2 ? 'left' : 'right';
  const centre = side === 'left' ? 60 : 40; // % of width
  const style: CSSProperties = {
    height,
    ['--b1' as any]: w.board[0],
    ['--b2' as any]: w.board[1],
    ['--world-accent' as any]: w.accent,
    background: `linear-gradient(180deg, ${w.bg[0]}, ${w.bg[1]})`,
  };
  return (
    <section className={`iso-world ${locked ? 'locked' : ''}`} style={style}>
      <div className="iso-board" aria-hidden="true" />
      <div className="iso-shade" aria-hidden="true" />
      <Landmark w={w} side={side} />
      {w.deco.slice(0, 2).map((e, k) => (
        <span key={k} className={`iso-deco ${side === 'left' ? 'r' : 'l'}${k}`} aria-hidden="true">
          {e}
        </span>
      ))}
      {Array.from({ length: STAGES_PER_WORLD }, (_, k) => {
        const i = first + k;
        const state: TileState = locked ? 'locked' : i < current.index ? 'done' : i === current.index ? 'here' : 'ahead';
        const x = XS[i % XS.length];
        const y = PAD_BOTTOM + k * STEP;
        const nextUp = i === current.index + 1;
        return (
          <div
            key={i}
            className={`iso-stage ${state}`}
            style={{ left: `calc(${centre}% + ${x}px)`, bottom: y, zIndex: 20 - k }}
            data-current={state === 'here' || undefined}
            title={`Stage ${stageLabel(i)} · ${stageStart(i).toLocaleString()} points`}
          >
            <Tile state={state} label={stageLabel(i)} />
            {state === 'here' && (
              <div className="token">
                <span className="token-avatar" style={{ background: color }}>
                  {avatar}
                </span>
                <img className="token-piece" src={PIECE_IMG.wP} alt="" />
              </div>
            )}
            {nextUp && <small className="stage-need">{stageStart(i).toLocaleString()} pts</small>}
          </div>
        );
      })}
      <div className="world-banner">
        <span className="world-banner-icon">{w.icon}</span>
        <span>
          <b>
            World {world} · {w.name}
          </b>
          <small>{locked ? `🔒 ${stageStart(first).toLocaleString()} points` : w.tagline}</small>
        </span>
      </div>
    </section>
  );
}

function HowPoints({ streak, onClose }: { streak: number; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>How points work</h2>
        <p className="muted">
          Points move you along the path: {stageCost(0)} points to stage 1-2, a little more for each stage after. Five stages make a world. Your
          endgame rating is separate: points reward effort and consistency, the rating measures skill.
        </p>
        <ul className="earn-list">
          <li>🧩 Solving a puzzle: harder drills and higher levels pay more</li>
          <li>⚡ Speed and accuracy bonuses, ⭐ perfect play</li>
          <li>📈 Challenge bonus for puzzles rated above your endgame rating</li>
          <li>🔥 Solve streak: from your 3rd solve in a row, up to +50%</li>
          <li>
            🧄 Full bulb: +{bulbBonusFor(0)}, plus 10 for each day of your streak (now +{bulbBonusFor(streak)})
          </li>
          <li>✨ Golden cloves and personal bests</li>
        </ul>
      </div>
    </div>
  );
}

export default function PathPage() {
  const { me } = useApp();
  const p = me.totals.path;
  const [info, setInfo] = useState(false);
  const lastWorld = Math.max(WORLDS.length, p.world + 1);
  const mapRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Centre your stage in the part of the screen above the bottom panel.
    const el = mapRef.current?.querySelector('[data-current]');
    el?.scrollIntoView({ block: 'center' });
    const hud = hudRef.current?.getBoundingClientRect().height ?? 0;
    window.scrollBy(0, hud / 2);
  }, []);
  // Highest world at the top: the path climbs upward.
  const worlds = Array.from({ length: lastWorld }, (_, k) => lastWorld - k);
  return (
    <div className="path-screen">
      <button className="path-info-btn" onClick={() => setInfo(true)}>
        ⓘ How points work
      </button>
      <div className="iso-map" ref={mapRef}>
        {worlds.map((world) => (
          <WorldBoard key={world} world={world} current={p} avatar={me.user.avatar} color={me.user.color} />
        ))}
      </div>
      <div className="path-hud" ref={hudRef}>
        <div className="hud-top">
          <b className="hud-points">{me.totals.points.toLocaleString()}</b>
          {me.totals.streak > 0 && <span className="hud-chip">🔥 {me.totals.streak}</span>}
          {me.totals.shields > 0 && <span className="hud-chip">🛡️ {me.totals.shields}</span>}
          <span className="grow" />
          <span className="hud-stage" style={{ background: p.worldInfo.bg[0] }}>
            {p.worldInfo.icon} {p.label}
          </span>
        </div>
        <div className="hud-bar" style={{ ['--world-accent' as any]: p.worldInfo.accent }}>
          <div style={{ width: `${Math.max(3, Math.round(p.progress * 100))}%` }} />
        </div>
        <small className="hud-next">
          {p.toNext.toLocaleString()} points to {p.nextIsNewWorld ? `World ${p.world + 1}` : `stage ${p.nextLabel}`}
        </small>
        <div className="hud-actions">
          <button className="btn hud-list" onClick={() => go('/school')} aria-label="Your curriculum" title="Your curriculum">
            ☰
          </button>
          <button className="btn primary big hud-go" onClick={() => go('/play/school')}>
            🎓 Start School
          </button>
        </div>
      </div>
      {info && <HowPoints streak={me.totals.streak} onClose={() => setInfo(false)} />}
    </div>
  );
}
