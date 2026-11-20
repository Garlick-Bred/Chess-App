import { describe, it, expect } from 'vitest';
import { DRILLS } from '../shared/drills.js';
import { buildCurriculum, pickSchoolDrill, advanceSchool, countsForSchool, atYourLevel, GRADUATE_AFTER, ACTIVE_SIZE } from '../shared/curriculum.js';

const today = '2026-11-20';
const ids = (list) => list.map((i) => i.id);

describe('Endgame School curriculum', () => {
  it('starts a 1200 player on drills near their rating, skipping far-below ones', () => {
    const cur = buildCurriculum({ drills: DRILLS, progress: {}, rating: 1200, today });
    expect(cur.active).toHaveLength(ACTIVE_SIZE);
    // King + pawn (1000) is 200 below; the 1400 drills 200 above: easier ones first.
    expect(ids(cur.active).slice(0, 2)).toEqual(['kpk-win', 'kpk-draw']);
    expect(ids(cur.placed)).toEqual(expect.arrayContaining(['krrk', 'kqk']));
    // Queen vs rook and bishop + knight (2000) are stretch goals, last in line.
    expect(ids(cur.upcoming).slice(-2)).toEqual(expect.arrayContaining(['kbnk', 'kqkr']));
  });
  it('puts drills you are struggling with first, even easy ones', () => {
    const progress = { krk: { attempts: 4, solves: 1 }, kqkp: { attempts: 4, solves: 3 } };
    const cur = buildCurriculum({ drills: DRILLS, progress, rating: 1200, today });
    expect(cur.active[0].id).toBe('krk');
    expect(atYourLevel(cur, 'krk')).toBe(true);
  });
  it('a stretch drill you fail is not treated as struggling', () => {
    const cur = buildCurriculum({ drills: DRILLS, progress: { kbnk: { attempts: 5, solves: 0 } }, rating: 1200, today });
    expect(ids(cur.active)).not.toContain('kbnk');
  });
  it('graduates after ten solves in a row; only a failure resets the run', () => {
    expect(GRADUATE_AFTER).toBe(10);
    let s = advanceSchool(undefined, { success: true, counted: true }, today);
    s = advanceSchool(s, { success: true, counted: false }, today); // needed "Show piece": no change
    expect(s.cleanStreak).toBe(1);
    s = advanceSchool(s, { success: false, counted: false }, today);
    expect(s.cleanStreak).toBe(0);
    for (let i = 0; i < GRADUATE_AFTER - 1; i++) s = advanceSchool(s, { success: true, counted: true }, today);
    expect(s.status).toBe('learning');
    s = advanceSchool(s, { success: true, counted: true }, today);
    expect(s.status).toBe('graduated');
    expect(s.events.graduated).toBe(true);
    expect(s.reviewDue).toBe('2026-11-23');
  });
  it('graduated drills leave the rotation and the next one moves in', () => {
    const before = buildCurriculum({ drills: DRILLS, progress: {}, rating: 1200, today });
    const first = before.active[0].id;
    const after = buildCurriculum({ drills: DRILLS, progress: { [first]: { status: 'graduated', reviewDue: '2026-11-23' } }, rating: 1200, today });
    expect(ids(after.active)).not.toContain(first);
    expect(ids(after.active)).toContain(before.upcoming[0].id);
  });
  it('check-ups: passing spaces them out, failing sends the drill back', () => {
    const grad = { status: 'graduated', reviewDue: today, reviewStep: 0, cleanStreak: 5 };
    const pass = advanceSchool(grad, { success: true, counted: true }, today);
    expect(pass.events.reviewPassed).toBe(true);
    expect(pass.reviewDue).toBe('2026-11-27'); // 7 days
    const shaky = advanceSchool(grad, { success: true, counted: false }, today);
    expect(shaky.status).toBe('graduated');
    expect(shaky.reviewDue).toBe('2026-11-21');
    const fail = advanceSchool(grad, { success: false, counted: false }, today);
    expect(fail.status).toBe('learning');
    expect(fail.events.demoted).toBe(true);
  });
  it('serves a due check-up first (a couple a day), then rotates', () => {
    const progress = { kpk_win: {}, krk: { status: 'graduated', reviewDue: '2026-11-19' } };
    const cur = buildCurriculum({ drills: DRILLS, progress, rating: 1200, today });
    expect(pickSchoolDrill(cur, { reviewsToday: 0 })).toEqual({ drillId: 'krk', mode: 'review' });
    const next = pickSchoolDrill(cur, { reviewsToday: 2 });
    expect(next.mode).toBe('school');
    // Rotation: never the same drill twice in a row, least-played first.
    const a = cur.active.map((i) => i.id);
    expect(pickSchoolDrill(cur, { reviewsToday: 2, recent: [a[0]] }).drillId).toBe(a[1]);
    expect(pickSchoolDrill(cur, { reviewsToday: 2, recent: [a[0], a[1]] }).drillId).toBe(a[2]);
  });
  it('any solve counts toward graduating unless the piece had to be shown', () => {
    expect(countsForSchool({ success: true, efficiency: 0.4, takebacks: 2, writtenHints: 1 })).toBe(true);
    expect(countsForSchool({ success: true, hints: 1 })).toBe(false);
    expect(countsForSchool({ success: false })).toBe(false);
  });
});
