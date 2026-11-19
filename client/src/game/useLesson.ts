import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { getDrill, holdMovesFor } from '@shared/drills.js';
import { bestMoves, moverOutcome, outcomeOf } from '@shared/grading.js';
import { analyseMove, bestExplained, attackerColor, kingRegion } from '@shared/hints.js';
import { probe, type TbMove, type TbResult } from '../tablebase';

export interface LessonStep {
  fenBefore: string;
  fenAfter: string;
  uci: string;
  san: string;
  from: string;
  to: string;
  by: 'you' | 'opponent';
  text: string;
  concept: string;
}

const MAX_PLIES = 120;
const kingDist = (a: string, b: string) =>
  Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));

function findKing(c: Chess, color: 'w' | 'b') {
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

/** The opponent's reply: toughest defence, or (when it can only draw) the most pressing drawing move. */
function opponentMove(fen: string, tb: TbResult): TbMove | null {
  const moves = tb.moves ?? [];
  if (!moves.length) return null;
  if (outcomeOf(tb.category) !== 'draw') return (bestMoves(tb) as TbMove[])[0] ?? moves[0];
  const c = new Chess(fen);
  const other = c.turn() === 'w' ? 'b' : 'w';
  const theirKing = findKing(c, other);
  const drawing = moves.filter((m) => moverOutcome(m.category) === 'draw');
  const score = (m: TbMove) => {
    const piece = c.get(m.uci.slice(0, 2) as Square);
    let w = 0;
    if (piece?.type === 'p') w += 3;
    if (m.san.includes('+')) w += 1.5;
    if (piece?.type === 'k' && theirKing && kingDist(m.uci.slice(2, 4), theirKing) < kingDist(m.uci.slice(0, 2), theirKing)) w += 1;
    return w;
  };
  return [...(drawing.length ? drawing : moves)].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Builds the perfect line from a position, one ply at a time, in the
 * background. `shown` is how many plies the player has stepped through.
 */
export function useLesson(drillId: string, startFen: string, level: number) {
  const drill = getDrill(drillId);
  const userColor = new Chess(startFen).turn();
  const [steps, setSteps] = useState<LessonStep[]>([]);
  const [shown, setShown] = useState(0);
  const [finished, setFinished] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    const id = ++run.current;
    setSteps([]);
    setShown(0);
    setFinished(null);
    setError(null);
    (async () => {
      const c = new Chess(startFen);
      const attacker = attackerColor(startFen);
      const defender = attacker === 'w' ? 'b' : 'w';
      const hold = drill.goal === 'hold' ? holdMovesFor(drill, level) : null;
      let yourMoves = 0;
      const out: LessonStep[] = [];
      for (let ply = 0; ply < MAX_PLIES; ply++) {
        if (c.isGameOver()) break;
        const fen = c.fen();
        let tb: TbResult;
        try {
          tb = await probe(fen);
        } catch {
          if (run.current === id) setError('The tablebase is unreachable right now, so the lesson cannot continue.');
          return;
        }
        if (run.current !== id) return;
        const yours = c.turn() === userColor;
        let uci: string;
        let analysis;
        if (yours) {
          const pick = bestExplained(fen, tb, drill);
          if (!pick) break;
          uci = pick.uci;
          analysis = pick.analysis;
        } else {
          const m = opponentMove(fen, tb);
          if (!m) break;
          uci = m.uci;
          analysis = analyseMove(fen, uci, drill);
        }
        const move = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        out.push({
          fenBefore: fen,
          fenAfter: c.fen(),
          uci,
          san: move.san,
          from: move.from,
          to: move.to,
          by: yours ? 'you' : 'opponent',
          text: analysis.text,
          concept: analysis.concept,
        });
        setSteps([...out]);
        if (yours) yourMoves++;
        // Stop where the drill would count it as solved.
        if (c.isCheckmate()) break;
        if (yours && drill.goal === 'promote' && move.promotion) break;
        if (yours && drill.goal === 'convert' && c.board().every((r) => r.every((p) => !p || p.color !== defender || p.type === 'k'))) break;
        if (yours && hold != null && yourMoves >= hold) break;
      }
      if (run.current !== id) return;
      const last = out[out.length - 1];
      const summary =
        drill.goal === 'hold'
          ? `Held the draw for ${yourMoves} moves.`
          : last && new Chess(last.fenAfter).isCheckmate()
            ? `Checkmate in ${yourMoves} move${yourMoves === 1 ? '' : 's'} with perfect play.`
            : `Goal reached in ${yourMoves} move${yourMoves === 1 ? '' : 's'} with perfect play.`;
      setFinished(summary);
    })();
  }, [drillId, startFen, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const fen = shown === 0 ? startFen : steps[shown - 1]?.fenAfter ?? startFen;
  const defender = attackerColor(startFen) === 'w' ? 'b' : 'w';
  const region = /p/i.test(fen.split(' ')[0]) ? null : kingRegion(fen, defender);

  const next = useCallback(() => setShown((n) => Math.min(n + 1, steps.length)), [steps.length]);
  const prev = useCallback(() => setShown((n) => Math.max(0, n - 1)), []);
  const jump = useCallback((n: number) => setShown(Math.max(0, Math.min(n, steps.length))), [steps.length]);

  return {
    drill,
    userColor,
    steps,
    shown,
    fen,
    region,
    current: shown > 0 ? steps[shown - 1] : null,
    upcoming: steps[shown] ?? null,
    atEnd: !!finished && shown >= steps.length,
    finished,
    error,
    next,
    prev,
    jump,
  };
}
