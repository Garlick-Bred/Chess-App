import { useEffect, useState } from 'react';
import { DRILLS, DRILL_BY_ID } from '@shared/drills.js';
import { addDays } from '@shared/scoring.js';
import { api, localDay } from '../api';
import { useApp } from '../App';
import { Material, Sparkline, Stars } from '../components/ui';

interface Stats {
  perDrill: { drillId: string; attempts: number; solves: number; successRate: number; efficiency: number | null; avgSecondsPerMove: number | null; bestSecondsPerMove: number | null; points: number }[];
  recent: { drillId: string; success: boolean; durationMs: number; userMoves: number; efficiency: number; day: string }[];
  days: { day: string; cloves: number; bulb_done: number }[];
}

export default function StatsPage() {
  const { me } = useApp();
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    api.get<Stats>(`/api/stats?day=${localDay()}`).then(setS).catch(() => undefined);
  }, []);
  if (!s) return <div className="page">Loading…</div>;

  const today = localDay();
  const dayMap = new Map(s.days.map((d) => [d.day, d]));
  const calendar = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));

  return (
    <div className="page stats">
      <h1>Your stats</h1>
      <div className="tiles">
        <Tile label="Points" value={me.totals.points.toLocaleString()} />
        <Tile label="Solves" value={me.totals.solves} />
        <Tile label="Perfect solves" value={me.totals.perfects} />
        <Tile label="Full bulbs" value={me.totals.bulbs} />
        <Tile label="Bulb streak" value={`🔥 ${me.totals.streak}`} />
      </div>

      <section className="card">
        <h3>Last 30 days</h3>
        <div className="calendar">
          {calendar.map((d) => {
            const c = dayMap.get(d)?.cloves ?? 0;
            return (
              <div key={d} className={`cal-day c${Math.min(5, c)} ${dayMap.get(d)?.bulb_done ? 'full' : ''}`} title={`${d}: ${c} clove${c === 1 ? '' : 's'}`}>
                {dayMap.get(d)?.bulb_done ? '🧄' : ''}
              </div>
            );
          })}
        </div>
        <div className="small muted">Darker = more cloves. A garlic means the full bulb.</div>
      </section>

      <section className="card">
        <h3>By drill</h3>
        <p className="small muted">Pace = seconds per move on solved attempts. The trend line shows your last 15 solves (lower is faster).</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Drill</th>
                <th>Mastery</th>
                <th>Solved</th>
                <th>Efficiency</th>
                <th>Avg pace</th>
                <th>Best pace</th>
                <th>Pace trend</th>
              </tr>
            </thead>
            <tbody>
              {DRILLS.map((d: any) => {
                const row = s.perDrill.find((p) => p.drillId === d.id);
                const trend = s.recent
                  .filter((r) => r.drillId === d.id && r.success && r.userMoves > 0)
                  .slice(0, 15)
                  .reverse()
                  .map((r) => r.durationMs / 1000 / r.userMoves);
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="row gap">
                        <Material drillId={d.id} size={16} />
                        <span>{d.name}</span>
                      </div>
                    </td>
                    <td>
                      <Stars n={me.progress[d.id]?.stars ?? 0} />
                    </td>
                    <td>{row ? `${row.solves}/${row.attempts}` : '-'}</td>
                    <td>{row?.efficiency != null && DRILL_BY_ID[d.id].goal !== 'hold' ? `${Math.round(row.efficiency * 100)}%` : '-'}</td>
                    <td>{row?.avgSecondsPerMove != null ? `${row.avgSecondsPerMove.toFixed(1)}s` : '-'}</td>
                    <td>{row?.bestSecondsPerMove != null ? `${row.bestSecondsPerMove.toFixed(1)}s` : '-'}</td>
                    <td>{trend.length ? <Sparkline values={trend} /> : <span className="muted small">-</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}
