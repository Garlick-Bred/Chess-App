// Endgame School on the client: the same curriculum rules the server uses.
import { DRILLS } from '@shared/drills.js';
import { buildCurriculum } from '@shared/curriculum.js';
import { DEFAULT_RATING } from '@shared/cloves.js';
import { localDay, type Me } from './api';

/** The rating drills are judged against: endgame rating, else chess rating. */
export function myRating(me: Me): number {
  return me.user.egRating ?? me.user.rating ?? DEFAULT_RATING;
}

export function curriculumFor(me: Me) {
  return buildCurriculum({ drills: DRILLS, progress: me.progress, rating: myRating(me), today: localDay() });
}
