import { useEffect, useState } from 'react';
import { DRILLS, DRILL_BY_ID } from '@shared/drills.js';
import { BULB_BONUS } from '@shared/scoring.js';
import insights from '@shared/insights.json';
import { api, localDay } from '../api';
import { go, useApp } from '../App';
import GarlicBulb from '../components/GarlicBulb';
import { Material, Stars, TierChip, LevelDots, fmtTime } from '../components/ui';

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night grind' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

interface Rec {
  drillId: string;
  why: string;
}

function recommendations(progress: Record<string, any>, chesscom?: string): Rec[] {
  const out: Rec[] = [];
  const add = (r: Rec) => {
    if (DRILL_BY_ID[r.drillId] && !out.some((o) => o.drillId === r.drillId)) out.push(r);
  };
  const player = chesscom ? (insights as any).players?.[chesscom.toLowerCase()] : null;
  for (const r of player?.recommended ?? []) add({ drillId: r.drillId, why: `From your chess.com games: ${r.reason}` });
  const next = DRILLS.find((d: any) => (progress[d.id]?.stars ?? 0) < 3);
  if (next) add({ drillId: next.id, why: progress[next.id]?.solves ? 'Your next step on the path - get it to level 3.' : 'Next fundamental to learn.' });
  const weak = DRILLS.filter((d: any) => (progress[d.id]?.attempts ?? 0) >= 3)
    .map((d: any) => ({ d, rate: progress[d.id].solves / progress[d.id].attempts }))
    .sort((a, b) => a.rate - b.rate)[0];
  if (weak && weak.rate < 0.8) add({ drillId: weak.d.id, why: `Only ${Math.round(weak.rate * 100)}% solved so far - worth another look.` });
  const stretch = DRILLS.find((d: any) => d.tier >= 3 && !progress[d.id]?.solves);
  if (stretch) add({ drillId: stretch.id, why: 'Stretch goal: a harder technique you have not tried yet.' });
  return out.slice(0, 3);
}

export default function HomePage() {
  const { me } = useApp();
  const [recent, setRecent] = useState<any[]>([]);
  useEffect(() => {
    api
      .get<any>(`/api/stats?day=${localDay()}`)
      .then((s) => setRecent(s.recent.slice(0, 6)))
      .catch(() => undefined);
  }, []);
  const recs = recommendations(me.progress, me.user.settings.chesscom);
  const player = me.user.settings.chesscom ? (insights as any).players?.[me.user.settings.chesscom.toLowerCase()] : null;
  const left = Math.max(0, 5 - me.today.cloves);
  const r = me.totals.rank;

  return (
    <div className="page home">
      <section className="hero card">
        <div className="hero-text">
          <div className="eyebrow">
            {greeting()}, {me.user.displayName}
          </div>
          <h1>{me.today.bulbDone ? 'Bulb complete. Nice work!' : left === 5 ? "Let's fill today's bulb" : `${left} clove${left === 1 ? '' : 's'} to go today`}</h1>
          <p className="muted">
            Every solved drill fills a clove. Fill all five for <b>+{BULB_BONUS}</b> bonus points
            {me.totals.streak > 0 ? (
              <>
                {' '}
                and keep your <b className="flame">🔥 {me.totals.streak}-day streak</b> alive
              </>
            ) : null}
            .
          </p>
          <div className="row gap wrap">
            <button className="btn primary big" onClick={() => go('/play/random')}>
              🎲 Random drill
            </button>
            <button className="btn big" onClick={() => go('/drills')}>
              Choose a drill
            </button>
          </div>
        </div>
        <div className="hero-bulb">
          <GarlicBulb filled={me.today.cloves} size={170} />
          <div className="bulb-count">
            <b>{Math.min(5, me.today.cloves)}</b>/5 cloves
          </div>
        </div>
      </section>

      <section className="rank card">
        <div className="row between">
          <div>
            <div className="eyebrow">Rank</div>
            <div className="rank-name">{r.name}</div>
          </div>
          <div className="right">
            <div className="rank-points">{me.totals.points.toLocaleString()} pts</div>
            {r.next && (
              <div className="small muted">
                {r.toNext.toLocaleString()} to {r.next}
              </div>
            )}
          </div>
        </div>
        <div className="bar">
          <div style={{ width: `${Math.round(r.progress * 100)}%` }} />
        </div>
        <div className="row gap small muted wrap">
          <span>{plural(me.totals.solves, 'solve')}</span>
          <span>{me.totals.perfects} perfect</span>
          <span>{plural(me.totals.bulbs, 'full bulb')}</span>
        </div>
      </section>

      {player?.headline && (
        <section className="card insight">
          <div className="eyebrow">From your chess.com games · {player.games} games analysed</div>
          <b className="insight-headline">{player.headline}</b>
          <ul>
            {(player.facts ?? []).map((f: string, i: number) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {recs.length > 0 && (
        <section>
          <h3 className="section-title">Recommended for you</h3>
          <div className="rec-grid">
            {recs.map((rec) => {
              const d = DRILL_BY_ID[rec.drillId];
              return (
                <button key={rec.drillId} className="card rec" onClick={() => go(`/play/${d.id}`)}>
                  <div className="row between">
                    <TierChip tier={d.tier} />
                    <Material drillId={d.id} size={18} />
                  </div>
                  <b>{d.name}</b>
                  <span className="small muted">{rec.why}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="row between">
          <h3 className="section-title">Your drills</h3>
          <a href="#/drills" className="small">
            See all ▸
          </a>
        </div>
        <div className="mini-drills">
          {DRILLS.map((d: any) => {
            const p = me.progress[d.id];
            return (
              <button key={d.id} className="card mini-drill" onClick={() => go(`/drills/${d.id}`)}>
                <Material drillId={d.id} size={16} />
                <span className="mini-name">{d.name}</span>
                <span className="row between">
                  <Stars n={p?.stars ?? 0} />
                  <span className="small muted">L{p?.level ?? 1}</span>
                </span>
                <LevelDots qualifying={p?.qualifying ?? 0} level={p?.level ?? 1} />
              </button>
            );
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <h3 className="section-title">Recent</h3>
          <div className="card list">
            {recent.map((a) => (
              <div key={a.id} className="list-row">
                <span className={`result-dot ${a.success ? 'ok' : 'bad'}`} />
                <span className="grow">
                  {DRILL_BY_ID[a.drillId]?.name} <small className="muted">L{a.level}</small>
                </span>
                <span className="muted small">{fmtTime(a.durationMs)}</span>
                <b className="pts">{a.points ? `+${a.points}` : '-'}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
