import { TIERS, MAX_LEVEL } from '@shared/drills.js';
import bank from '@shared/puzzles.json';
import { PIECE_IMG } from './Board';
import GarlickBulb from './GarlickBulb';
import { cloveValue, drillFit, formatCloves } from '@shared/cloves.js';

const FIT_LABEL: Record<string, string> = { warmup: 'Warm-up', easy: 'Easy for you', core: 'Your level', stretch: 'Stretch' };

/** What a solve of this drill is worth to this player, e.g. "Warm-up · ¼ clove". */
export function CloveChip({
  drill,
  level,
  rating,
  lessonReplay = false,
  atLevel = false,
}: {
  drill: any;
  level: number;
  rating: number | null;
  lessonReplay?: boolean;
  /** In your Endgame School rotation: always "your level", a whole clove. */
  atLevel?: boolean;
}) {
  const fit = atLevel ? 'core' : drillFit(drill, rating);
  const v = cloveValue({ drill, level, rating, atLevel });
  if (lessonReplay) {
    return (
      <span className="clove-chip fit-core" title="Solving a puzzle after its lesson earns a full clove (twice a day)">
        <GarlickBulb filled={5} size={12} celebrate={false} />
        Lesson replay · 1 clove
      </span>
    );
  }
  return (
    <span className={`clove-chip fit-${fit}`} title="Clove value of a solve at your current level (halved if you use hints or takebacks)">
      <GarlickBulb filled={5} size={12} celebrate={false} />
      {FIT_LABEL[fit]} · {formatCloves(v)} clove
    </span>
  );
}

/** Badge icon: 'garlick-N' draws a Garlick bulb with N cloves, otherwise an emoji. */
export function AchIcon({ icon, size = 40 }: { icon: string; size?: number }) {
  const m = /^garlick-(\d)$/.exec(icon);
  if (m) return <GarlickBulb filled={Number(m[1])} size={size * 0.85} celebrate={false} />;
  return <>{icon}</>;
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${n} of ${max} mastery stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

export function LevelDots({ qualifying, needed = 3, level }: { qualifying: number; needed?: number; level: number }) {
  if (level >= MAX_LEVEL && qualifying >= needed) return <span className="level-dots done">Mastered</span>;
  return (
    <span className="level-dots" title={`${qualifying}/${needed} qualifying solves to the next level`}>
      {Array.from({ length: needed }, (_, i) => (
        <i key={i} className={i < qualifying ? 'on' : ''} />
      ))}
    </span>
  );
}

export function TierChip({ tier }: { tier: number }) {
  const t = (TIERS as any)[tier];
  return (
    <span className="tier-chip" style={{ color: t.color, borderColor: t.color }}>
      {t.difficulty}
    </span>
  );
}

const ORDER = 'KQRBNP';
/** Piece icons for a drill, derived from its first puzzle: attacker | defender. */
export function Material({ drillId, size = 22 }: { drillId: string; size?: number }) {
  const fen: string | undefined = (bank as any).drills[drillId]?.[0]?.fen;
  if (!fen) return null;
  const placement = fen.split(' ')[0].replace(/[\d/]/g, '');
  const white = [...placement].filter((c) => c === c.toUpperCase()).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const black = [...placement].filter((c) => c === c.toLowerCase()).sort((a, b) => ORDER.indexOf(a.toUpperCase()) - ORDER.indexOf(b.toUpperCase()));
  return (
    <span className="material">
      {white.map((c, i) => (
        <img key={`w${i}`} src={PIECE_IMG['w' + c]} width={size} height={size} alt={c} />
      ))}
      <span className="vs">vs</span>
      {black.map((c, i) => (
        <img key={`b${i}`} src={PIECE_IMG['b' + c.toUpperCase()]} width={size} height={size} alt={c} />
      ))}
    </span>
  );
}

export function fmtTime(ms: number) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function fmtClock(ms: number) {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export function Sparkline({ values, width = 120, height = 32, color = '#81b64c' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <span className="muted small">not enough data</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 2 - ((v - min) / span) * (height - 4)}`);
  return (
    <svg width={width} height={height} className="sparkline" role="img" aria-label="trend">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3" fill={color} />
    </svg>
  );
}
