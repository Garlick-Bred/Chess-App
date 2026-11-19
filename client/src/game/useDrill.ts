import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { getDrill, parSeconds, moveCap, holdMovesFor, bankLevel } from '@shared/drills.js';
import { gradeMove, GRADE_INFO, bestMoves, pickComputerMove, positionDistance, isStalling } from '@shared/grading.js';
import { writtenHint, bestExplained } from '@shared/hints.js';
import { randomVariant } from '@shared/symmetry.js';
import bank from '@shared/puzzles.json';
import { probe, prefetch, type TbMove, type TbResult } from '../tablebase';
import { api, localDay, type AttemptResult } from '../api';
import { sfx } from '../sound';
import type { Arrow } from '../components/Board';

export type Phase = 'user' | 'thinking' | 'computer' | 'blunder' | 'done';

export interface Puzzle {
  fen: string;
  mateIn: number | null;
  holding: number;
  level: number;
}

export interface MoveRec {
  san: string;
  color: 'w' | 'b';
  by: 'user' | 'computer';
  grade?: string;
}

export interface Premove {
  from: string;
  to: string;
  promotion?: string;
}

export interface DrillView {
  drill: any;
  level: number;
  puzzle: Puzzle;
  startFen: string;
  userColor: 'w' | 'b';
  fen: string;
  phase: Phase;
  moves: MoveRec[];
  lastMove: [string, string] | null;
  badge: { square: string; symbol: string; color: string; key: number } | null;
  hintFrom: string | null;
  arrows: Arrow[];
  userMoves: number;
  cap: number;
  holdMoves: number | null;
  par: number;
  grades: Record<string, number>;
  wastePlies: number;
  hints: number;
  writtenHints: number;
  writtenHintText: string | null;
  takebacks: number;
  onlyMoves: number;
  distance: number | null;
  startDistance: number | null;
  stalled: boolean;
  lastGrade: { grade: string; label: string; text: string; color: string; symbol: string } | null;
  blunder: { san: string; best: string[]; after: string; stalemate: boolean } | null;
  outcome: { success: boolean; reason: string } | null;
  result: AttemptResult | null;
  submitError: string | null;
  tbError: string | null;
  premove: Premove | null;
  lessonReplay: boolean;
}

export interface DrillOptions {
  drillId: string;
  level: number;
  playAs: 'white' | 'black' | 'random';
  /** Play this exact position (e.g. replaying a lesson) instead of a random one. */
  fixed?: { fen: string; mateIn: number | null } | null;
  lessonReplay?: boolean;
}

const RECENT_KEY = 'ge_recent_puzzles';
// The computer replies at most this fast, so its move is visible as a move.
const MIN_REPLY_MS = 220;

function pickPuzzle(drillId: string, level: number): Puzzle {
  const all: Puzzle[] = (bank as any).drills[drillId] ?? [];
  const pool = all.filter((p) => p.level === bankLevel(level));
  const use = pool.length ? pool : all;
  let recent: string[] = [];
  try {
    recent = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    /* ignore */
  }
  const fresh = use.filter((p) => !recent.includes(p.fen));
  const choice = (fresh.length ? fresh : use)[Math.floor(Math.random() * (fresh.length ? fresh.length : use.length))];
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify([choice.fen, ...recent].slice(0, 40)));
  } catch {
    /* ignore */
  }
  return choice;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kingDist = (a: string, b: string) =>
  Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));

function findKing(chess: Chess, color: 'w' | 'b'): string | null {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

function onlyKingLeft(chess: Chess, color: 'w' | 'b') {
  return chess.board().every((row) => row.every((p) => !p || p.color !== color || p.type === 'k'));
}

function hasPawns(chess: Chess, color: 'w' | 'b') {
  return chess.board().some((row) => row.some((p) => p && p.color === color && p.type === 'p'));
}

/** FEN after a move, without touching the game. */
function fenAfter(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return c.fen();
  } catch {
    return null;
  }
}

/** Where each of the user's pieces could go if it were their move (for premoves). */
function premoveDestinations(fen: string, color: 'w' | 'b'): Map<string, string[]> {
  const parts = fen.split(' ');
  parts[1] = color;
  parts[3] = '-';
  const out = new Map<string, string[]>();
  try {
    const c = new Chess(parts.join(' '), { skipValidation: true });
    for (const m of c.moves({ verbose: true })) {
      const list = out.get(m.from) ?? [];
      if (!list.includes(m.to)) list.push(m.to);
      out.set(m.from, list);
    }
  } catch {
    /* ignore */
  }
  return out;
}

interface Game extends DrillView {
  chess: Chess;
  elapsed: number;
  turnStart: number | null;
  pieceHintShown: boolean;
  textHintShown: boolean;
  badgeKey: number;
  gameId: number;
  distances: (number | null)[];
}

export function useDrill({ drillId, level, playAs, fixed = null, lessonReplay = false }: DrillOptions) {
  const g = useRef<Game | null>(null);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const gameCounter = useRef(0);
  const onMoveRef = useRef<(from: string, to: string, promotion?: string) => Promise<void>>();

  const start = useCallback(
    (same = false) => {
      const drill = getDrill(drillId);
      const prev = g.current;
      let puzzle: Puzzle;
      let startFen: string;
      if (same && prev) {
        puzzle = prev.puzzle;
        startFen = prev.startFen;
      } else if (fixed) {
        puzzle = { fen: fixed.fen, mateIn: fixed.mateIn, holding: 0, level };
        startFen = fixed.fen;
      } else {
        puzzle = pickPuzzle(drillId, level);
        startFen = randomVariant(puzzle.fen, playAs);
      }
      const chess = new Chess(startFen);
      const id = ++gameCounter.current;
      g.current = {
        drill,
        level,
        puzzle,
        startFen,
        userColor: chess.turn(),
        fen: chess.fen(),
        phase: 'user',
        moves: [],
        lastMove: null,
        badge: null,
        hintFrom: null,
        arrows: [],
        userMoves: 0,
        cap: moveCap(drill, puzzle),
        holdMoves: drill.goal === 'hold' ? holdMovesFor(drill, level) : null,
        par: parSeconds(drill, puzzle, level),
        grades: {},
        wastePlies: 0,
        hints: 0,
        writtenHints: 0,
        writtenHintText: null,
        takebacks: 0,
        onlyMoves: 0,
        distance: null,
        startDistance: null,
        stalled: false,
        lastGrade: null,
        blunder: null,
        outcome: null,
        result: null,
        submitError: null,
        tbError: null,
        premove: null,
        lessonReplay,
        chess,
        elapsed: 0,
        turnStart: performance.now(),
        pieceHintShown: false,
        textHintShown: false,
        badgeKey: 0,
        gameId: id,
        distances: [],
      };
      rerender();
      void trackDistance(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drillId, level, playAs, fixed?.fen, lessonReplay, rerender],
  );

  useEffect(() => {
    start(false);
  }, [start]);

  // A pending async step only continues if this is still the same game and it
  // has not been ended meanwhile (e.g. "Give up" while the computer thinks).
  const sameGame = (id: number) => g.current?.gameId === id;
  const alive = (id: number) => sameGame(id) && g.current!.phase !== 'done';

  const pauseClock = () => {
    const s = g.current!;
    if (s.turnStart != null) s.elapsed += performance.now() - s.turnStart;
    s.turnStart = null;
  };
  const resumeClock = () => {
    g.current!.turnStart = performance.now();
  };
  const getElapsed = useCallback(() => {
    const s = g.current;
    if (!s) return 0;
    return s.elapsed + (s.turnStart != null ? performance.now() - s.turnStart : 0);
  }, []);

  /** At the user's turn: read the distance to the goal and warm likely next positions. */
  async function trackDistance(id: number) {
    const s = g.current!;
    const fen = s.chess.fen();
    try {
      const tb = await probe(fen);
      if (!alive(id)) return;
      // While you think, fetch the computer's answer to your most likely moves.
      prefetch(
        (bestMoves(tb) as TbMove[])
          .slice(0, 3)
          .map((m) => fenAfter(fen, m.uci))
          .filter((f): f is string => !!f),
      );
      const d = positionDistance(tb);
      s.distance = d;
      if (s.startDistance == null) s.startDistance = d;
      s.distances.push(d);
      const stalling = s.drill.goal !== 'hold' && isStalling(s.distances);
      if (stalling && !s.stalled) s.stalled = true;
      else if (!stalling) s.stalled = false;
      s.tbError = null;
      rerender();
    } catch {
      if (alive(id)) {
        s.tbError = 'Tablebase unreachable - moves cannot be graded right now.';
        rerender();
      }
    }
  }

  const goalReached = (s: Game, move: Move) => {
    const attacker = s.drill.role === 'attacker' ? s.userColor : s.userColor === 'w' ? 'b' : 'w';
    const defender = attacker === 'w' ? 'b' : 'w';
    if (s.drill.goal === 'mate') return s.chess.isCheckmate();
    if (s.drill.goal === 'promote') return !!move.promotion || s.chess.isCheckmate();
    if (s.drill.goal === 'convert') return s.chess.isCheckmate() || onlyKingLeft(s.chess, defender);
    return false;
  };

  const finish = async (success: boolean, reason: string) => {
    const s = g.current!;
    if (s.phase === 'done') return;
    pauseClock();
    s.phase = 'done';
    s.outcome = { success, reason };
    s.hintFrom = null;
    s.arrows = [];
    s.premove = null;
    success ? sfx.success() : sfx.fail();
    rerender();
    const id = s.gameId;
    try {
      const result = await api.post<AttemptResult>('/api/attempts', {
        drillId: s.drill.id,
        level: s.level,
        fen: s.startFen,
        success,
        reason,
        durationMs: Math.round(s.elapsed),
        userMoves: s.userMoves,
        wastePlies: s.wastePlies,
        grades: s.grades,
        hints: s.hints,
        writtenHints: s.writtenHints,
        takebacks: s.takebacks,
        onlyMoves: s.onlyMoves,
        mateIn: s.puzzle.mateIn,
        lessonReplay: s.lessonReplay,
        day: localDay(),
      });
      if (!sameGame(id)) return;
      s.result = result;
    } catch (e: any) {
      if (sameGame(id)) s.submitError = e.message ?? 'Could not save this attempt';
    }
    if (sameGame(id)) rerender();
  };

  const computerTurn = async () => {
    const s = g.current!;
    const id = s.gameId;
    s.phase = 'computer';
    rerender();
    const t0 = performance.now();
    let tb: TbResult | null = null;
    try {
      tb = await probe(s.chess.fen());
    } catch {
      s.tbError = 'Tablebase unreachable - the computer is guessing.';
    }
    if (!alive(id)) return;
    const defKing = findKing(s.chess, s.userColor);
    const scoreMove = (m: TbMove) => {
      const from = m.uci.slice(0, 2) as Square;
      const piece = s.chess.get(from);
      let w = 1;
      if (piece?.type === 'p') w += 2.5;
      if (m.san.includes('+')) w += 1.2;
      if (piece?.type === 'k' && defKing && kingDist(m.uci.slice(2, 4), defKing) < kingDist(from, defKing)) w += 1;
      return w;
    };
    let uci = tb ? pickComputerMove(tb, { scoreMove })?.uci : null;
    if (!uci) {
      const legal = s.chess.moves({ verbose: true });
      if (!legal.length) return;
      const m = legal[Math.floor(Math.random() * legal.length)];
      uci = m.from + m.to + (m.promotion ?? '');
    }
    await sleep(Math.max(0, MIN_REPLY_MS - (performance.now() - t0)));
    if (!alive(id)) return;
    const move = s.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    s.fen = s.chess.fen();
    s.lastMove = [move.from, move.to];
    s.moves.push({ san: move.san, color: move.color, by: 'computer' });
    if (s.chess.inCheck()) sfx.check();
    else if (move.captured) sfx.capture();
    else sfx.move();

    const attacker = s.drill.role === 'attacker' ? s.userColor : s.userColor === 'w' ? 'b' : 'w';
    if (s.chess.isCheckmate()) return finish(false, 'You were checkmated');
    if (s.drill.goal === 'hold') {
      if (s.chess.isDraw() || !hasPawns(s.chess, attacker)) return finish(true, 'Draw secured');
    } else if (s.chess.isDraw()) {
      return finish(false, 'The game ended in a draw');
    }
    s.phase = 'user';
    resumeClock();
    // A queued premove plays instantly if it is legal now; otherwise it is dropped.
    const pm = s.premove;
    s.premove = null;
    if (pm) {
      const legal = s.chess.moves({ verbose: true }).find((m) => m.from === pm.from && m.to === pm.to);
      if (legal) {
        void trackDistance(id);
        await onMoveRef.current?.(pm.from, pm.to, legal.promotion ? pm.promotion ?? 'q' : undefined);
        return;
      }
    }
    rerender();
    void trackDistance(id);
  };

  const onMove = useCallback(
    async (from: string, to: string, promotion?: string) => {
      const s = g.current;
      if (!s || s.phase !== 'user') return;
      const fenBefore = s.chess.fen();
      let move: Move;
      try {
        move = s.chess.move({ from, to, promotion });
      } catch {
        return;
      }
      const id = s.gameId;
      pauseClock();
      s.phase = 'thinking';
      s.fen = s.chess.fen();
      // Ask for the computer's reply right away, in parallel with grading.
      prefetch([s.fen]);
      s.lastMove = [from, to];
      s.badge = null;
      s.hintFrom = null;
      s.arrows = [];
      s.writtenHintText = null;
      s.pieceHintShown = false;
      s.textHintShown = false;
      s.moves.push({ san: move.san, color: move.color, by: 'user' });
      if (s.chess.inCheck()) sfx.check();
      else if (move.captured) sfx.capture();
      else sfx.move();
      rerender();

      let tb: TbResult | null = null;
      try {
        tb = await probe(fenBefore);
      } catch {
        s.tbError = 'Tablebase unreachable - this move could not be graded.';
      }
      if (!alive(id)) return;
      const reaches = goalReached(s, move);
      const uci = move.from + move.to + (move.promotion ?? '');
      const res = tb ? gradeMove(tb, uci, { reachesGoal: reaches }) : { grade: 'best', wastePlies: 0, bestUci: [], after: 'unknown' };
      s.userMoves++;
      s.grades[res.grade] = (s.grades[res.grade] ?? 0) + 1;
      s.wastePlies += res.wastePlies;
      if (res.grade === 'only') s.onlyMoves++;
      s.moves[s.moves.length - 1].grade = res.grade;
      const info = (GRADE_INFO as any)[res.grade];
      s.badge = { square: to, symbol: info.symbol, color: info.color, key: ++s.badgeKey };
      let text = info.text;
      if (res.grade === 'good' || res.grade === 'inaccuracy' || res.grade === 'mistake') {
        const lost = Math.round(res.wastePlies / 2);
        text = `${info.text} (${lost} move${lost === 1 ? '' : 's'} slower than perfect play)`;
      }
      s.lastGrade = { grade: res.grade, label: info.label, text, color: info.color, symbol: info.symbol };

      if (res.grade === 'blunder') {
        const sanOf = (u: string) => tb!.moves.find((m) => m.uci === u)?.san ?? u;
        s.blunder = {
          san: move.san,
          best: (res.bestUci ?? []).slice(0, 3).map(sanOf),
          after: res.after,
          stalemate: s.chess.isStalemate(),
        };
        s.premove = null;
        s.phase = 'blunder';
        sfx.blunder();
        rerender();
        return;
      }

      if (s.drill.goal !== 'hold' && reaches) {
        const why = s.drill.goal === 'mate' || s.chess.isCheckmate() ? 'Checkmate!' : s.drill.goal === 'promote' ? 'Pawn promoted - the win is secure' : 'Material won - the win is secure';
        return finish(true, why);
      }
      if (s.drill.goal === 'hold') {
        const attacker = s.userColor === 'w' ? 'b' : 'w';
        if (s.userMoves >= (s.holdMoves ?? 0)) return finish(true, `Held for ${s.userMoves} moves`);
        if (s.chess.isDraw() || !hasPawns(s.chess, attacker)) return finish(true, 'Draw secured');
      } else {
        if (s.chess.isStalemate()) return finish(false, 'Stalemate - it is a draw');
        if (s.chess.isInsufficientMaterial()) return finish(false, 'Not enough material left to win');
        if (s.chess.isThreefoldRepetition()) return finish(false, 'Draw by threefold repetition');
        if (s.chess.isDrawByFiftyMoves()) return finish(false, 'Draw by the 50-move rule');
        if (s.userMoves >= s.cap) return finish(false, `Out of moves (limit ${s.cap})`);
      }
      await computerTurn();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  onMoveRef.current = onMove;

  /** Picking up a piece: warm the computer's replies to each of its moves. */
  const onSelect = useCallback((square: string) => {
    const s = g.current;
    if (!s || s.phase !== 'user') return;
    const fen = s.chess.fen();
    const moves = s.chess.moves({ square: square as Square, verbose: true }).slice(0, 8);
    prefetch(moves.map((m) => fenAfter(fen, m.from + m.to + (m.promotion ?? ''))).filter((f): f is string => !!f));
  }, []);

  /** Queue a move while the computer is thinking. */
  const setPremove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const s = g.current;
      if (!s || (s.phase !== 'computer' && s.phase !== 'thinking')) return;
      s.premove = { from, to, promotion };
      rerender();
    },
    [rerender],
  );
  const cancelPremove = useCallback(() => {
    const s = g.current;
    if (!s || !s.premove) return;
    s.premove = null;
    rerender();
  }, [rerender]);

  /** Written hint: the idea behind a perfect move, in words (-10%). */
  const textHint = useCallback(async () => {
    const s = g.current;
    if (!s || s.phase !== 'user' || s.textHintShown) return;
    const id = s.gameId;
    try {
      const fen = s.chess.fen();
      const tb = await probe(fen);
      if (!alive(id) || s.phase !== 'user' || s.chess.fen() !== fen) return;
      s.writtenHintText = writtenHint(fen, tb, s.drill);
      s.textHintShown = true;
      s.writtenHints++;
      rerender();
    } catch {
      s.tbError = 'Tablebase unreachable - no hint available.';
      rerender();
    }
  }, [rerender]);

  /** Piece hint: highlight the piece to move, never the move itself (-20%). */
  const pieceHint = useCallback(async () => {
    const s = g.current;
    if (!s || s.phase !== 'user' || s.pieceHintShown) return;
    const id = s.gameId;
    try {
      const fen = s.chess.fen();
      const tb = await probe(fen);
      if (!alive(id) || s.phase !== 'user' || s.chess.fen() !== fen) return;
      const pick = bestExplained(fen, tb, s.drill);
      if (!pick) return;
      s.hintFrom = pick.uci.slice(0, 2);
      s.pieceHintShown = true;
      s.hints++;
      rerender();
    } catch {
      s.tbError = 'Tablebase unreachable - no hint available.';
      rerender();
    }
  }, [rerender]);

  const takeBack = useCallback(() => {
    const s = g.current;
    if (!s || s.phase !== 'blunder') return;
    s.chess.undo();
    s.moves.pop();
    s.userMoves--;
    s.takebacks++;
    s.blunder = null;
    s.badge = null;
    s.lastGrade = null;
    s.fen = s.chess.fen();
    const prev = s.chess.history({ verbose: true }).at(-1);
    s.lastMove = prev ? [prev.from, prev.to] : null;
    s.phase = 'user';
    resumeClock();
    rerender();
  }, [rerender]);

  const giveUp = useCallback(() => {
    const s = g.current;
    if (!s || s.phase === 'done') return;
    void finish(false, s.phase === 'blunder' ? 'Blunder - result changed' : 'Gave up');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = g.current;
  const dests = new Map<string, string[]>();
  if (s && s.phase === 'user') {
    for (const m of s.chess.moves({ verbose: true })) {
      const list = dests.get(m.from) ?? [];
      if (!list.includes(m.to)) list.push(m.to);
      dests.set(m.from, list);
    }
  }
  const premoveDests = s && (s.phase === 'computer' || s.phase === 'thinking') ? premoveDestinations(s.chess.fen(), s.userColor) : new Map<string, string[]>();
  const check = s && s.chess.inCheck() ? findKing(s.chess, s.chess.turn()) : null;

  return {
    view: s as DrillView | null,
    dests,
    premoveDests,
    check,
    onMove,
    onSelect,
    setPremove,
    cancelPremove,
    textHint,
    pieceHint,
    takeBack,
    giveUp,
    restart: start,
    getElapsed,
  };
}
