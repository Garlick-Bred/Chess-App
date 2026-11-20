import { useEffect, useState } from 'react';
import { GRADUATE_AFTER, ACTIVE_SIZE, REVIEW_DAYS } from '@shared/curriculum.js';
import { RATING_SOURCES } from '@shared/cloves.js';
import { api, localDay, type Me } from '../api';
import { go, useApp } from '../App';
import { Material, TierChip } from '../components/ui';
import { curriculumFor, myRating } from '../school';
import { addDays } from '@shared/scoring.js';

type Item = ReturnType<typeof curriculumFor>['active'][number];

function niceDay(day: string | null): string {
  if (!day) return '';
  if (day === localDay()) return 'today';
  if (day === addDays(localDay(), 1)) return 'tomorrow';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function StreakDots({ n, of = GRADUATE_AFTER }: { n: number; of?: number }) {
  return (
    <span className="streak-dots" title={`${n} of ${of} clean solves in a row`} aria-label={`${n} of ${of} clean solves in a row`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < n ? 'on' : ''} />
      ))}
    </span>
  );
}

function Row({ item, kind }: { item: Item; kind: 'active' | 'due' | 'upcoming' | 'graduated' | 'placed' }) {
  const d = item.drill;
  let detail: JSX.Element | string = '';
  if (kind === 'active') {
    detail = (
      <>
        <StreakDots n={item.cleanStreak} /> {item.cleanStreak}/{GRADUATE_AFTER} clean in a row
        {item.attempts > 0 && (
          <span className="muted school-rate">
            solved {Math.round((item.rate ?? 0) * 100)}% of {item.attempts}
          </span>
        )}
      </>
    );
  } else if (kind === 'due') detail = 'Check-up due';
  else if (kind === 'graduated') detail = `Graduated · next check-up ${niceDay(item.reviewDue)}`;
  else if (kind === 'upcoming') detail = item.stretch ? 'Stretch goal: comes in once the drills below it are learned' : 'Comes in when a drill graduates';
  else detail = 'Well below your rating: skipped';
  return (
    <button className={`school-row ${kind}`} onClick={() => go(`/play/${d.id}`)}>
      <span className="school-row-material">
        <Material drillId={d.id} size={16} />
      </span>
      <span className="grow">
        <span className="school-name">
          <b>{d.name}</b> {item.struggling && kind === 'active' && <span className="tag warn">needs work</span>}
        </span>
        <small className="school-detail">{detail}</small>
      </span>
      <TierChip tier={d.tier} />
    </button>
  );
}

/** Compact School card for the Home page. */
export function SchoolSummary({ me }: { me: Me }) {
  const cur = curriculumFor(me);
  return (
    <section className="card school-card">
      <div className="row between">
        <div>
          <div className="eyebrow">🎓 Endgame School</div>
          <b className="school-title">Endgames at your level</b>
        </div>
        <div className="eg-rating" title="Endgame rating">
          <b>{myRating(me)}</b>
          <small>endgame rating</small>
        </div>
      </div>
      {cur.due.length > 0 && (
        <div className="school-due">
          🩺 Check-up due: <b>{cur.due.map((i) => i.drill.name).join(', ')}</b>
        </div>
      )}
      <div className="school-rows">
        {cur.active.map((i) => (
          <Row key={i.id} item={i} kind="active" />
        ))}
      </div>
      <div className="row gap wrap">
        <button className="btn primary" onClick={() => go('/play/school')}>
          Start School ▸
        </button>
        <button className="btn ghost" onClick={() => go('/school')}>
          Your curriculum
        </button>
      </div>
    </section>
  );
}

export default function SchoolPage() {
  const { me } = useApp();
  const cur = curriculumFor(me);
  const [history, setHistory] = useState<{ day: string; rating: number }[] | null>(null);
  useEffect(() => {
    api
      .get<{ ratingHistory: { day: string; rating: number }[] }>(`/api/stats?day=${localDay()}`)
      .then((s) => setHistory(s.ratingHistory ?? []))
      .catch(() => setHistory([]));
  }, []);
  const rating = myRating(me);
  const weekStart = addDays(localDay(), -6);
  // Change over the last 7 days: from the last rating before the week (or the
  // starting rating, if every rated attempt is from this week).
  const beforeWeek = history ? [...history].reverse().find((h) => h.day < weekStart) : undefined;
  const weekBase = beforeWeek ? beforeWeek.rating : history && history.length ? (me.user.rating ?? 1000) : null;
  const weekChange = weekBase != null ? rating - weekBase : null;

  return (
    <div className="page school">
      <section className="card school-hero">
        <div>
          <div className="eyebrow">🎓 Endgame School</div>
          <h1>Endgames at your level</h1>
          <p className="muted">
            You rotate between {ACTIVE_SIZE} endgames close to your rating, starting with the ones you find hardest. {GRADUATE_AFTER} clean solves in a
            row graduates one and a harder endgame moves in. Graduated endgames come back for check-ups after {REVIEW_DAYS.slice(0, 3).join(', ')}{' '}
            and {REVIEW_DAYS[3]} days.
          </p>
          <button className="btn primary big" onClick={() => go('/play/school')}>
            Start School ▸
          </button>
        </div>
        <div className="eg-rating big">
          <b>{rating}</b>
          <small>endgame rating</small>
          {weekChange != null && weekChange !== 0 && (
            <small className={weekChange > 0 ? 'up' : 'down'}>
              {weekChange > 0 ? '+' : ''}
              {weekChange} this week
            </small>
          )}
          {me.user.rating != null && (
            <small className="muted">
              chess {me.user.rating}
              {me.user.ratingSource ? ` (${RATING_SOURCES[me.user.ratingSource as keyof typeof RATING_SOURCES] ?? me.user.ratingSource})` : ''}
            </small>
          )}
        </div>
      </section>

      {cur.due.length > 0 && (
        <section>
          <h3 className="section-title">🩺 Check-ups due</h3>
          <div className="card school-rows">
            {cur.due.map((i) => (
              <Row key={i.id} item={i} kind="due" />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="section-title">Now learning</h3>
        <div className="card school-rows">
          {cur.active.map((i) => (
            <Row key={i.id} item={i} kind="active" />
          ))}
          {cur.active.length === 0 && <div className="muted small pad">Everything is graduated. Check-ups keep it fresh.</div>}
        </div>
      </section>

      {cur.upcoming.length > 0 && (
        <section>
          <h3 className="section-title">Up next</h3>
          <div className="card school-rows">
            {cur.upcoming.map((i) => (
              <Row key={i.id} item={i} kind="upcoming" />
            ))}
          </div>
        </section>
      )}

      {cur.graduated.filter((i) => !cur.due.includes(i)).length > 0 && (
        <section>
          <h3 className="section-title">🎓 Graduated</h3>
          <div className="card school-rows">
            {cur.graduated
              .filter((i) => !cur.due.includes(i))
              .map((i) => (
                <Row key={i.id} item={i} kind="graduated" />
              ))}
          </div>
        </section>
      )}

      {cur.placed.length > 0 && (
        <section>
          <h3 className="section-title">Below your level</h3>
          <div className="card school-rows">
            {cur.placed.map((i) => (
              <Row key={i.id} item={i} kind="placed" />
            ))}
          </div>
        </section>
      )}

      <section className="card small muted">
        <b>Endgame rating</b> works like a chess rating. Each puzzle has a rating (harder drills and higher levels rate higher). Solving one rated
        above you raises yours a lot; one far below you adds nothing. Failing lowers it, by more when the puzzle should have been easy. Help
        (hints, takebacks) counts as a partial solve. It started at your chess rating and is gently pulled back toward it, so it shows how your
        endgames compare with the rest of your game.
      </section>
    </div>
  );
}
