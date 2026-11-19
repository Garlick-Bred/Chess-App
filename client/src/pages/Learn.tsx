import { DRILLS, TIERS } from '@shared/drills.js';
import { LESSON_CLOVES_PER_DAY } from '@shared/cloves.js';
import { go } from '../App';
import { Material } from '../components/ui';

export default function LearnPage() {
  return (
    <div className="page learn">
      <h1>Lessons</h1>
      <p className="muted">
        Step through the perfect line for each endgame, with the idea behind every move explained. Then play the position yourself: solving it right
        after a lesson earns a full clove (up to {LESSON_CLOVES_PER_DAY} a day). After a failed puzzle, the lesson starts from that exact position.
      </p>
      {Object.entries(TIERS).map(([tier, t]: [string, any]) => (
        <section key={tier}>
          <h3 className="section-title" style={{ color: t.color }}>
            {t.name} <small className="muted">· {t.difficulty}</small>
          </h3>
          <div className="drill-grid">
            {DRILLS.filter((d: any) => String(d.tier) === tier).map((d: any) => (
              <button key={d.id} className="card drill-card" onClick={() => go(`/lesson/${d.id}`)}>
                <Material drillId={d.id} />
                <b className="drill-name">{d.name}</b>
                <span className="small muted">{d.summary}</span>
                <span className="lesson-cta">📖 Start lesson ▸</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
