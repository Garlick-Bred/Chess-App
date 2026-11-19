import { useEffect, useState } from 'react';
import { DRILLS } from '@shared/drills.js';
import { api, localDay } from '../api';
import { useApp } from '../App';
import GarlicBulb from '../components/GarlicBulb';
import { Material } from '../components/ui';

interface Board {
  players: {
    displayName: string;
    username: string;
    avatar: string;
    color: string;
    points: number;
    weekPoints: number;
    solves: number;
    streak: number;
    bulbs: number;
    todayCloves: number;
    rank: string;
  }[];
  records: Record<string, { name: string; avatar: string; secondsPerMove: number }>;
}

export default function LeaderboardPage() {
  const { me } = useApp();
  const [b, setB] = useState<Board | null>(null);
  const [tab, setTab] = useState<'week' | 'all'>('week');
  useEffect(() => {
    api.get<Board>(`/api/leaderboard?day=${localDay()}`).then(setB).catch(() => undefined);
  }, []);
  if (!b) return <div className="page">Loading…</div>;
  const players = [...b.players].sort((x, y) => (tab === 'week' ? y.weekPoints - x.weekPoints : y.points - x.points));
  return (
    <div className="page family">
      <h1>Family leaderboard</h1>
      <div className="tabs inline">
        <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>
          This week
        </button>
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
          All time
        </button>
      </div>
      <div className="card list">
        {players.map((p, i) => (
          <div key={p.username} className={`list-row lb-row ${p.username === me.user.username ? 'me' : ''}`}>
            <span className={`lb-pos pos${i + 1}`}>{i + 1}</span>
            <span className="avatar" style={{ background: p.color }}>
              {p.avatar}
            </span>
            <span className="grow">
              <b>{p.displayName}</b>
              <small className="muted">
                {' '}
                · {p.rank} · {p.solves} solve{p.solves === 1 ? '' : 's'}
              </small>
            </span>
            <span title={`${p.todayCloves}/5 cloves today`}>
              <GarlicBulb filled={p.todayCloves} size={22} celebrate={false} />
            </span>
            {p.streak > 0 && <span className="flame small">🔥{p.streak}</span>}
            <b className="pts">{(tab === 'week' ? p.weekPoints : p.points).toLocaleString()}</b>
          </div>
        ))}
        {players.length === 1 && <div className="muted small pad">Invite the family: they can create their own accounts from the login screen.</div>}
      </div>

      <section className="card">
        <h3>Family records · fastest pace</h3>
        <div className="records">
          {DRILLS.map((d: any) => {
            const r = b.records[d.id];
            return (
              <div key={d.id} className="record">
                <Material drillId={d.id} size={14} />
                <span className="grow">{d.name}</span>
                {r ? (
                  <span>
                    {r.avatar} {r.name} <b>{r.secondsPerMove.toFixed(1)}s</b>
                    <small className="muted">/move</small>
                  </span>
                ) : (
                  <span className="muted small">unclaimed</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
