import { useEffect, useId, useState } from 'react';

// The daily garlic bulb. Five cloves, filled centre-out. A new clove fills
// with a rising "liquid" wave and pops; completing the bulb makes it bounce,
// glow, sprout and throw sparkles.

// Five individually lobed cloves (index 0-4, left to right) with their tips
// gathered at the neck and rounded bottoms on the root plate - the scalloped
// outline is what makes it read as garlic rather than an onion.
const CLOVES = [
  'M90 62 C 54 74, 18 120, 20 160 C 22 186, 36 200, 54 201 C 70 202, 78 192, 76 168 C 74 126, 80 90, 90 62 Z',
  'M94 56 C 64 72, 38 124, 40 166 C 42 194, 60 206, 78 206 C 94 206, 104 194, 104 166 C 104 120, 100 80, 94 56 Z',
  'M100 50 C 122 72, 136 128, 130 170 C 126 196, 112 208, 100 208 C 88 208, 74 196, 70 170 C 64 128, 78 72, 100 50 Z',
  'M106 56 C 136 72, 162 124, 160 166 C 158 194, 140 206, 122 206 C 106 206, 96 194, 96 166 C 96 120, 100 80, 106 56 Z',
  'M110 62 C 146 74, 182 120, 180 160 C 178 186, 164 200, 146 201 C 130 202, 122 192, 124 168 C 126 126, 120 90, 110 62 Z',
];
// A soft ridge down the middle of each clove.
const VEINS = [
  'M86 72 C 58 100, 44 140, 48 186',
  'M92 66 C 74 96, 64 140, 70 196',
  'M100 62 C 104 100, 104 160, 100 200',
  'M108 66 C 126 96, 136 140, 130 196',
  'M114 72 C 142 100, 156 140, 152 186',
];
const clovePath = (i: number) => CLOVES[i];

/** Fill order: centre, the two inner cloves, then the outer two. */
export const FILL_ORDER = [2, 1, 3, 0, 4];
const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const ang = (i / 12) * Math.PI * 2;
  return { dx: Math.cos(ang) * 108, dy: Math.sin(ang) * 108, delay: (i % 4) * 0.06 };
});
const LIQUID =
  'M-100 0 Q -87 -7 -75 0 T -50 0 T -25 0 T 0 0 T 25 0 T 50 0 T 75 0 T 100 0 T 125 0 T 150 0 T 175 0 T 200 0 T 225 0 T 250 0 T 275 0 T 300 0 V 260 H -100 Z';

export interface GarlicBulbProps {
  filled: number;
  /** Start from this many cloves and animate up to `filled`. */
  from?: number;
  size?: number;
  celebrate?: boolean;
  onClove?: (count: number) => void;
}

export default function GarlicBulb({ filled, from, size = 160, celebrate = true, onClove }: GarlicBulbProps) {
  const uid = useId().replace(/:/g, '');
  const target = Math.min(5, filled);
  const [shown, setShown] = useState(Math.min(5, from ?? filled));
  const [newest, setNewest] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (target < shown) {
      setShown(target); // e.g. a new day started
      return;
    }
    if (shown >= target) return;
    const t = setTimeout(() => {
      const next = shown + 1;
      setShown(next);
      setNewest(FILL_ORDER[next - 1]);
      onClove?.(next);
      if (next >= 5 && celebrate) setTimeout(() => setCelebrating(true), 950);
    }, from != null && shown === from ? 450 : 750);
    return () => clearTimeout(t);
  }, [shown, target, from, celebrate, onClove]);

  const filledSet = new Set(FILL_ORDER.slice(0, shown));
  const cls = ['garlic'];
  if (shown >= 5) cls.push('complete');
  if (celebrating) cls.push('celebrating');

  return (
    <div className={cls.join(' ')} style={{ width: size, height: size * 1.2 }} role="img" aria-label={`Garlic bulb: ${shown} of 5 cloves`}>
      <svg viewBox="0 -20 200 260" width="100%" height="100%" overflow="visible">
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffdf6" />
            <stop offset="0.55" stopColor="#f6ecd6" />
            <stop offset="0.85" stopColor="#ecd3e3" />
            <stop offset="1" stopColor="#c99ac2" />
          </linearGradient>
          <radialGradient id={`glow-${uid}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffd96a" stopOpacity="0.75" />
            <stop offset="1" stopColor="#ffd96a" stopOpacity="0" />
          </radialGradient>
          {FILL_ORDER.map((i) => (
            <clipPath id={`clip-${uid}-${i}`} key={i}>
              <path d={clovePath(i)} />
            </clipPath>
          ))}
        </defs>

        <circle className="garlic-halo" cx="100" cy="132" r="112" fill={`url(#glow-${uid})`} />

        <g className="garlic-body">
          <path className="garlic-sprout" d="M100 16 C 98 2, 104 -8, 116 -14" />
          <path className="garlic-sprout leaf" d="M100 12 C 92 4, 84 2, 76 -4" />
          <path className="garlic-neck" d="M89 64 C 91 42, 94 24, 97 12 Q 100 5 103 12 C 106 24, 109 42, 111 64 Z" />
          <path className="garlic-skin" d="M100 44 C 50 58, 10 112, 14 160 C 18 196, 50 212, 100 212 C 150 212, 182 196, 186 160 C 190 112, 150 58, 100 44 Z" />
          <g className="garlic-roots">
            <path d="M92 208 q -6 10 -14 14" />
            <path d="M98 209 q -2 12 -6 18" />
            <path d="M102 209 q 2 12 6 18" />
            <path d="M108 208 q 6 10 14 14" />
            <path d="M86 207 q -10 6 -20 6" />
            <path d="M114 207 q 10 6 20 6" />
          </g>
          {[0, 4, 1, 3, 2].map((i) => {
            const isFilled = filledSet.has(i);
            return (
              <g key={i} className={`clove ${isFilled ? 'filled' : ''} ${newest === i ? 'new' : ''}`}>
                <path className="clove-base" d={clovePath(i)} />
                <g clipPath={`url(#clip-${uid}-${i})`}>
                  <g className="clove-level" style={{ transform: isFilled ? 'translateY(30px)' : 'translateY(232px)' }}>
                    <path className="clove-liquid" fill={`url(#fill-${uid})`} d={LIQUID} />
                  </g>
                  <path className="clove-vein" d={VEINS[i]} />
                </g>
                <path className="clove-outline" d={clovePath(i)} />
              </g>
            );
          })}
          <ellipse className="garlic-plate" cx="100" cy="206" rx="22" ry="4.5" />
        </g>

        <g transform="translate(100 130)">
          {SPARKS.map((s, i) => (
            <path
              key={i}
              className="spark"
              d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z"
              style={{ ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px`, animationDelay: `${s.delay}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
