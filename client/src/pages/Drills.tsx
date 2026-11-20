import { useState } from 'react';
import { DRILLS, DRILL_BY_ID, TIERS, MAX_LEVEL } from '@shared/drills.js';
import { go, useApp } from '../App';
import { Material, Stars, TierChip, LevelDots, CloveChip } from '../components/ui';
import { curriculumFor, myRating } from '../school';

const GOAL_LABEL: Record<string, string> = {
  mate: 'Checkmate',
  promote: 'Promote safely',
  convert: 'Win the material',
  hold: 'Hold the draw',
};

export default function DrillsPage({ open }: { open?: string }) {
  const { me } = useApp();
  const cur = curriculumFor(me);
  const atLevel = (id: string) => cur.active.some((i: any) => i.id === id) || cur.due.some((i: any) => i.id === id);
  const detail = open ? DRILL_BY_ID[open] : null;
  return (
    <div className="page drills">
      <div className="row between wrap">
        <div>
          <h1>Endgame drills</h1>
          <p className="muted">Pick one to drill, or mix them up. Each drill has 5 levels: longer positions first, then speed.</p>
        </div>
        <button className="btn primary big" onClick={() => go('/play/random')}>
          🎲 Random mix
        </button>
      </div>
      {Object.entries(TIERS).map(([tier, t]: [string, any]) => (
        <section key={tier}>
          <h3 className="section-title" style={{ color: t.color }}>
            {t.name} <small className="muted">· {t.difficulty}</small>
          </h3>
          <div className="drill-grid">
            {DRILLS.filter((d: any) => String(d.tier) === tier).map((d: any) => {
              const p = me.progress[d.id];
              return (
                <button key={d.id} className="card drill-card" onClick={() => go(`/drills/${d.id}`)}>
                  <div className="row between">
                    <Material drillId={d.id} />
                    <span className="goal-chip">{GOAL_LABEL[d.goal]}</span>
                  </div>
                  <b className="drill-name">{d.name}</b>
                  <CloveChip drill={d} level={p?.level ?? 1} rating={myRating(me)} atLevel={atLevel(d.id)} />
                  <span className="small muted">{d.summary}</span>
                  <span className="row between drill-foot">
                    <Stars n={p?.stars ?? 0} />
                    <span className="small">
                      Level {p?.level ?? 1} <LevelDots qualifying={p?.qualifying ?? 0} level={p?.level ?? 1} />
                    </span>
                  </span>
                  <span className="row between small muted">
                    <span>{p?.solves ?? 0} solved</span>
                    <span>{p?.bestSecondsPerMove ? `best ${p.bestSecondsPerMove.toFixed(1)}s/move` : `${d.basePoints} pts base`}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {detail && <DrillDetail drill={detail} onClose={() => go('/drills')} />}
    </div>
  );
}

function DrillDetail({ drill, onClose }: { drill: any; onClose: () => void }) {
  const { me } = useApp();
  const cur = curriculumFor(me);
  const atLevel = (id: string) => cur.active.some((i: any) => i.id === id) || cur.due.some((i: any) => i.id === id);
  const p = me.progress[drill.id];
  const current = p?.level ?? 1;
  const [level, setLevel] = useState(current);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal drill-detail" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="row gap">
          <TierChip tier={drill.tier} />
          <span className="goal-chip">{GOAL_LABEL[drill.goal]}</span>
        </div>
        <h2>{drill.name}</h2>
        <Material drillId={drill.id} size={30} />
        <div style={{ marginTop: 8 }}>
          <CloveChip drill={drill} level={level} rating={myRating(me)} atLevel={atLevel(drill.id)} />
        </div>
        <p className="muted">{drill.material}</p>
        <h4>How to win this</h4>
        <ul className="tip-list">
          {drill.tips.map((t: string, i: number) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        <h4>Level</h4>
        <div className="level-picker">
          {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
            <button key={l} className={`level-btn ${l === level ? 'on' : ''}`} disabled={l > current} onClick={() => setLevel(l)} title={l > current ? 'Locked' : ''}>
              {l > current ? '🔒' : l}
              <small>{l <= 3 ? ['short', 'medium', 'full'][l - 1] : 'speed'}</small>
            </button>
          ))}
        </div>
        <p className="small muted">
          Level up with 3 solves at your level: at least 70% efficiency and no takebacks. Levels 4-5 also need you to beat par time.
        </p>
        <button className="btn primary big full" onClick={() => go(`/play/${drill.id}?level=${level}`)}>
          Start drilling ▸
        </button>
      </div>
    </div>
  );
}
