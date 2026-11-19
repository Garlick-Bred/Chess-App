"""Pass 4: turn the parsed games, Stockfish evals and tablebase probes into an
endgame report (markdown + JSON) and drill recommendations.

Usage: report.py pass1.json pass2.json tb_cache.json out_dir [username]
"""
import collections
import json
import math
import os
import statistics
import sys
import time

import chess

P1, P2, TB, OUT = sys.argv[1:5]
USER = sys.argv[5] if len(sys.argv) > 5 else "ham_sandmitch"
rows = json.load(open(P1))
evals = {int(k): v for k, v in json.load(open(P2)).items()}
tb = json.load(open(TB)) if os.path.exists(TB) else {}
NOW = max(r["end_time"] for r in rows)
RECENT = NOW - 730 * 86400  # last 24 months


def wc(cp):
    """Lichess 'winning chances' in [-1, 1] from centipawns (user POV)."""
    if cp >= 9000:
        return 1.0
    if cp <= -9000:
        return -1.0
    cp = max(-1000, min(1000, cp))
    return 2 / (1 + math.exp(-0.00368208 * cp)) - 1


def score(res):
    return {"W": 1.0, "D": 0.5, "L": 0.0}[res]


def bucket(cp):
    if cp >= 200:
        return "winning"
    if cp >= 75:
        return "better"
    if cp > -75:
        return "equal"
    if cp > -200:
        return "worse"
    return "losing"


def outcome(cat):
    if cat in ("win", "syzygy-win", "maybe-win"):
        return "win"
    if cat in ("loss", "syzygy-loss", "maybe-loss"):
        return "loss"
    if cat in ("draw", "cursed-win", "blessed-loss"):
        return "draw"
    return None


def mover_outcome(cat):
    o = outcome(cat)
    return {"win": "loss", "loss": "win"}.get(o, o)


def board_type(b):
    """Endgame type of a position (material families as in endgame manuals)."""
    def kinds(c):
        return {sym for pt, sym in ((chess.QUEEN, "Q"), (chess.ROOK, "R"), (chess.BISHOP, "B"), (chess.KNIGHT, "N")) if b.pieces(pt, c)}
    w, k = kinds(chess.WHITE), kinds(chess.BLACK)
    if not w and not k:
        return "Pawn"
    if not w or not k:
        return "Pieces vs pawns"
    if w == k == {"R"}:
        return "Rook"
    if w == k == {"Q"}:
        return "Queen"
    if w <= {"B", "N"} and k <= {"B", "N"}:
        return "Minor piece"
    if "Q" in w | k:
        return "Queen + other"
    if "R" in w and "R" in k:
        return "Rook + minor"
    return "Rook vs minor"


def material(b, c):
    return sum(len(b.pieces(pt, c)) * v for pt, v in ((chess.QUEEN, 9), (chess.ROOK, 5), (chess.BISHOP, 3), (chess.KNIGHT, 3), (chess.PAWN, 1)))


games = []
for i, r in enumerate(rows):
    if not r.get("eg") or i not in evals:
        continue
    ev = evals[i]
    sign = 1 if r["user_white"] else -1
    user_cp = [sign * e for e in ev]
    fens = r["fens"]
    # per-user-move losses in winning chances
    losses = []
    for j in range(len(fens) - 1):
        b = chess.Board(fens[j])
        if b.turn != (chess.WHITE if r["user_white"] else chess.BLACK):
            continue
        before = wc(user_cp[j])
        after = wc(user_cp[j + 1])
        losses.append(max(0.0, before - after))
    # Every endgame type the game passes through for >= 4 plies, with the
    # user's eval at the moment that type was reached.
    types = []
    run_t, run_start = None, 0
    for j, f in enumerate(fens + [None]):
        t = board_type(chess.Board(f)) if f else None
        if t != run_t:
            if run_t is not None and (j - run_start >= 4 or f is None) and run_t not in [x[0] for x in types]:
                types.append((run_t, user_cp[run_start]))
            run_t, run_start = t, j
    base = int(str(r["time_control"]).split("+")[0].split("/")[-1] or 0) if r["time_class"] != "daily" else None
    g = dict(r)
    g.update(
        entry_cp=user_cp[0],
        final_cp=user_cp[-1],
        max_cp=max(user_cp),
        losses=losses,
        blunders=sum(1 for x in losses if x > 0.3),
        mistakes=sum(1 for x in losses if 0.2 < x <= 0.3),
        user_moves=len(losses),
        base_time=base,
        recent=r["end_time"] >= RECENT,
        types=types,
        final_mat=material(chess.Board(fens[-1]), chess.WHITE if r["user_white"] else chess.BLACK)
        - material(chess.Board(fens[-1]), chess.BLACK if r["user_white"] else chess.WHITE),
    )
    games.append(g)


def summarize(gs):
    n = len(gs)
    if not n:
        return None
    res = collections.Counter(g["result"] for g in gs)
    win_entry = [g for g in gs if g["entry_cp"] >= 200]
    lose_entry = [g for g in gs if g["entry_cp"] <= -200]
    eq_entry = [g for g in gs if -75 < g["entry_cp"] < 75]
    moves = sum(g["user_moves"] for g in gs)
    exp = sum((wc(g["entry_cp"]) + 1) / 2 for g in gs)
    act = sum(score(g["result"]) for g in gs)
    return {
        "games": n,
        "W": res["W"],
        "D": res["D"],
        "L": res["L"],
        "score_pct": round(100 * act / n, 1),
        "expected_pct": round(100 * exp / n, 1),
        "points_vs_expected": round(act - exp, 1),
        "winning_entries": len(win_entry),
        "conversion_pct": round(100 * sum(1 for g in win_entry if g["result"] == "W") / len(win_entry), 1) if win_entry else None,
        "thrown": sum(1 for g in win_entry if g["result"] != "W"),
        "losing_entries": len(lose_entry),
        "save_pct": round(100 * sum(1 for g in lose_entry if g["result"] != "L") / len(lose_entry), 1) if lose_entry else None,
        "equal_entries": len(eq_entry),
        "equal_score_pct": round(100 * sum(score(g["result"]) for g in eq_entry) / len(eq_entry), 1) if eq_entry else None,
        "blunders_per_100": round(100 * sum(g["blunders"] for g in gs) / moves, 2) if moves else None,
        "avg_wc_loss": round(statistics.mean(x for g in gs for x in g["losses"]) * 100, 2) if moves else None,
    }


report = {"user": USER, "generated": time.strftime("%Y-%m-%d"), "window_recent_from": time.strftime("%Y-%m-%d", time.gmtime(RECENT))}
report["totals"] = {
    "games": len(rows),
    "endgames": len(games),
    "endgame_share_pct": round(100 * len(games) / len(rows), 1),
    "by_time_class": {tc: sum(1 for r in rows if r["time_class"] == tc) for tc in ("bullet", "blitz", "rapid", "daily")},
    "endgames_by_time_class": {tc: sum(1 for g in games if g["time_class"] == tc) for tc in ("bullet", "blitz", "rapid", "daily")},
}
report["overall"] = {"all": summarize(games), "recent": summarize([g for g in games if g["recent"]])}

fam_order = ["Rook + minor", "Rook", "Pawn", "Minor piece", "Pieces vs pawns", "Rook vs minor", "Queen", "Queen + other"]
report["families"] = {}
for fam in fam_order:
    # Re-base each game on the moment this type was reached.
    gs = []
    for g in games:
        for t, cp in g["types"]:
            if t == fam:
                gs.append({**g, "entry_cp": cp})
    report["families"][fam] = {"all": summarize(gs), "recent": summarize([g for g in gs if g["recent"]])}

sig_count = collections.Counter(g["sig"] for g in games)
report["signatures"] = []
for sig, n in sig_count.most_common(15):
    gs = [g for g in games if g["sig"] == sig]
    s = summarize(gs)
    report["signatures"].append({"sig": sig, **s})

# Material advantage at entry (no engine needed): conversion when a piece or exchange up.
def mat_bucket(d):
    if d >= 3:
        return "up a piece or more (+3)"
    if d >= 2:
        return "up the exchange-ish (+2)"
    if d >= 1:
        return "up a pawn (+1)"
    if d == 0:
        return "level material"
    if d >= -1:
        return "down a pawn (-1)"
    return "down 2+"


report["material_at_entry"] = {}
for g in games:
    report["material_at_entry"].setdefault(mat_bucket(g["mat_diff"]), []).append(g)
report["material_at_entry"] = {k: summarize(v) for k, v in report["material_at_entry"].items()}

# Time trouble in endgames (live games only).
live = [g for g in games if g["base_time"] and g.get("my_clock_at_entry") is not None]
tt = [g for g in live if g["my_clock_at_entry"] / g["base_time"] < 0.2]
timeouts = [g for g in games if g["my_code"] == "timeout"]
timeouts_winning = [g for g in timeouts if g["final_cp"] >= 200]
timeouts_was_winning = [g for g in timeouts if g["max_cp"] >= 300]
report["time"] = {
    "live_endgames": len(live),
    "median_clock_share_at_entry_pct": round(100 * statistics.median(g["my_clock_at_entry"] / g["base_time"] for g in live), 1) if live else None,
    "entered_endgame_in_time_trouble": len(tt),
    "time_trouble_score_pct": round(100 * sum(score(g["result"]) for g in tt) / len(tt), 1) if tt else None,
    "non_time_trouble_score_pct": round(100 * sum(score(g["result"]) for g in live if g not in tt) / max(1, len(live) - len(tt)), 1) if live else None,
    "endgame_losses_on_time": len(timeouts),
    "lost_on_time_with_winning_position": len(timeouts_winning),
    "lost_on_time_after_being_winning": len(timeouts_was_winning),
    "drawn_on_time_vs_insufficient": sum(1 for g in games if g["my_code"] == "timevsinsufficient"),
}

# Stalemates and other "won but drawn" endings.
report["draw_traps"] = {
    "stalemates_total": sum(1 for g in games if g["my_code"] == "stalemate"),
    "stalemated_opponent_while_ahead": sum(1 for g in games if g["my_code"] == "stalemate" and g["final_mat"] > 0),
    "got_stalemated_while_behind": sum(1 for g in games if g["my_code"] == "stalemate" and g["final_mat"] < 0),
    "draw_by_repetition_from_winning": sum(1 for g in games if g["my_code"] == "repetition" and g["max_cp"] >= 300),
    "draw_by_insufficient": sum(1 for g in games if g["my_code"] == "insufficient"),
}

# Exact tablebase audit for <= 7 pieces.
tb_rows = []
by_class = collections.defaultdict(lambda: {"positions": 0, "errors": 0, "games": set(), "won_tb": 0, "won_tb_converted": 0, "drawn_tb": 0, "drawn_tb_held": 0})


def tb_class(sig):
    me, opp = sig.split("v")
    mine, theirs = me[1:], opp[1:]
    pieces = set((mine + theirs).replace("P", ""))
    if not pieces:
        return "King + pawns"
    if pieces == {"R"}:
        if "P" not in mine + theirs:
            return "Rook vs rook (no pawns)" if mine.count("R") == theirs.count("R") else "Rook mate"
        return "Rook + pawns"
    if pieces == {"Q"}:
        return "Queen endings" if theirs.count("Q") and mine.count("Q") else "Queen vs pawns / lone king"
    if pieces <= {"B", "N"}:
        return "Minor pieces"
    return "Mixed pieces"


for i, r in enumerate(rows):
    if not r.get("eg") or r.get("le7_ply") is None:
        continue
    user_white = r["user_white"]
    start = r["le7_ply"] - r["entry_ply"]
    fens = r["fens"]
    first = None
    errs = []
    for j in range(start, len(fens) - 1):
        b = chess.Board(fens[j])
        if b.turn != (chess.WHITE if user_white else chess.BLACK) or b.is_game_over():
            continue
        d = tb.get(fens[j])
        if not d:
            continue
        before = outcome(d["category"])
        nb = chess.Board(fens[j + 1])
        move = None
        for m in b.legal_moves:
            b.push(m)
            if b.board_fen() == nb.board_fen() and b.turn == nb.turn:
                move = m
                b.pop()
                break
            b.pop()
        if move is None:
            continue
        mv = next((x for x in d["moves"] if x["uci"] == move.uci()), None)
        if not mv:
            continue
        after = mover_outcome(mv["category"])
        if first is None:
            first = (before, fens[j])
        rank = {"loss": 0, "draw": 1, "win": 2}
        if before in rank and after in rank and rank[after] < rank[before]:
            errs.append({"ply_fen": fens[j], "move": b.san(move), "from": before, "to": after})
    if first is None:
        continue
    cls = tb_class(r["le7_sig"])
    c = by_class[cls]
    c["games"].add(i)
    c["positions"] += 1
    c["errors"] += len(errs)
    if first[0] == "win":
        c["won_tb"] += 1
        c["won_tb_converted"] += r["result"] == "W"
    if first[0] == "draw":
        c["drawn_tb"] += 1
        c["drawn_tb_held"] += r["result"] != "L"
    tb_rows.append({"url": r["url"], "sig": r["le7_sig"], "class": cls, "tb_start": first[0], "result": r["result"], "errors": errs, "my_code": r["my_code"], "time_class": r["time_class"]})

report["tablebase"] = {
    "games_audited": len(tb_rows),
    "by_class": {
        k: {
            "games": len(v["games"]),
            "result_changing_moves": v["errors"],
            "tb_won": v["won_tb"],
            "tb_won_converted": v["won_tb_converted"],
            "tb_drawn": v["drawn_tb"],
            "tb_drawn_held": v["drawn_tb_held"],
        }
        for k, v in sorted(by_class.items(), key=lambda kv: -len(kv[1]["games"]))
    },
    "examples": [t for t in tb_rows if t["errors"]][:12],
}
report["basic_endings_reached"] = collections.Counter(t["sig"] for t in tb_rows).most_common(15)

# ---- recommendations --------------------------------------------------------
fam = report["families"]
recs = []


def fam_stat(name, key):
    v = (fam.get(name) or {}).get("all") or {}
    return v.get(key)


pawn_n = fam_stat("Pawn", "games") or 0
rook_n = (fam_stat("Rook", "games") or 0)
pvp_n = fam_stat("Pieces vs pawns", "games") or 0
recs.append(
    {
        "drillId": "kpk-draw",
        "reason": f"{pawn_n} of your games reached a pure king-and-pawn ending (you scored {fam_stat('Pawn', 'score_pct')}%); the opposition decides them.",
        "weight": pawn_n * (1 + max(0, -(fam_stat('Pawn', 'points_vs_expected') or 0)) / 10),
    }
)
recs.append({"drillId": "kpk-win", "reason": "Converting an extra pawn needs key squares and the opposition.", "weight": pawn_n * 0.8})
recs.append(
    {
        "drillId": "lucena",
        "reason": f"{rook_n} of your games reached a pure rook ending (you scored {fam_stat('Rook', 'score_pct')}%); Lucena and Philidor are the backbone.",
        "weight": rook_n * (1 + max(0, -(fam_stat('Rook', 'points_vs_expected') or 0)) / 10),
    }
)
recs.append({"drillId": "philidor", "reason": "Rook endings are the most common type, and Philidor is the drawing method.", "weight": rook_n * 0.9})
mate_cls = report["tablebase"]["by_class"]
qk = mate_cls.get("Queen vs pawns / lone king", {})
if qk.get("games"):
    recs.append({"drillId": "kqk", "reason": f"You reached queen vs lone king/pawns {qk['games']} times - mate fast before the clock or stalemate bites.", "weight": qk["games"] * 3})
rk = mate_cls.get("Rook mate", {})
if rk.get("games"):
    recs.append({"drillId": "krk", "reason": f"You reached a rook-vs-king mate {rk['games']} times.", "weight": rk["games"] * 3})
if report["draw_traps"]["stalemates_total"]:
        recs.append({"drillId": "kqk", "reason": f"{report['draw_traps']['stalemates_total']} of your games ended in stalemate - the queen mate drill trains the stalemate check.", "weight": 30})
if pvp_n:
    recs.append({"drillId": "kqkp", "reason": f"{pvp_n} of your games reached pieces-vs-pawns endings: stopping or escorting a passed pawn.", "weight": pvp_n * 0.7})
recs.sort(key=lambda x: -x["weight"])
seen = set()
final = []
for r in recs:
    if r["drillId"] in seen:
        continue
    seen.add(r["drillId"])
    final.append({"drillId": r["drillId"], "reason": r["reason"]})
report["recommended"] = final[:4]

os.makedirs(OUT, exist_ok=True)
json.dump(report, open(os.path.join(OUT, "summary.json"), "w"), indent=1, default=list)
print(json.dumps({k: report[k] for k in ("totals", "overall", "time", "draw_traps", "recommended")}, indent=1))
print(json.dumps(report["families"], indent=1))
print(json.dumps(report["material_at_entry"], indent=1))
print(json.dumps(report["signatures"][:10], indent=1))
print(json.dumps(report["tablebase"]["by_class"], indent=1))
print(report["basic_endings_reached"])
