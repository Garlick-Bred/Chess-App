"""Pass 1: replay every chess.com game, find where the endgame starts, and
record material, clocks and results. No engine yet.

Endgame start = first position with <= 6 non-pawn, non-king pieces on the
board (the same rule Lichess uses to split game phases).
"""
import glob
import io
import json
import sys

import chess
import chess.pgn

USER = sys.argv[3] if len(sys.argv) > 3 else "ham_sandmitch"
ARCH = sys.argv[1]
OUT = sys.argv[2]

DRAW_CODES = {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}
PIECE_ORDER = "QRBN"
VAL = {chess.QUEEN: 9, chess.ROOK: 5, chess.BISHOP: 3, chess.KNIGHT: 3, chess.PAWN: 1}


def pieces_str(board, color):
    s = ""
    for sym, pt in zip(PIECE_ORDER, (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT)):
        s += sym * len(board.pieces(pt, color))
    return s


def material(board, color):
    return sum(len(board.pieces(pt, color)) * v for pt, v in VAL.items())


def family(board):
    types = set()
    for pt, name in ((chess.QUEEN, "Q"), (chess.ROOK, "R"), (chess.BISHOP, "B"), (chess.KNIGHT, "N")):
        if board.pieces(pt, chess.WHITE) or board.pieces(pt, chess.BLACK):
            types.add(name)
    if not types:
        return "Pawn"
    if types == {"R"}:
        return "Rook"
    if types <= {"B", "N"}:
        return "Minor piece"
    if types == {"Q"}:
        return "Queen"
    if "Q" not in types:
        return "Rook + minor"
    return "Queen + other"


def tb_signature(board, user_color):
    """e.g. KRPvKR from the user's side first."""
    def side(c):
        s = "K"
        for pt, sym in ((chess.QUEEN, "Q"), (chess.ROOK, "R"), (chess.BISHOP, "B"), (chess.KNIGHT, "N"), (chess.PAWN, "P")):
            s += sym * len(board.pieces(pt, c))
        return s
    return side(user_color) + "v" + side(not user_color)


def main():
    rows = []
    for f in sorted(glob.glob(f"{ARCH}/*.json")):
        for g in json.load(open(f)).get("games", []):
            if g.get("rules") != "chess" or "pgn" not in g:
                continue
            white_is_user = g["white"]["username"].lower() == USER
            me = g["white"] if white_is_user else g["black"]
            opp = g["black"] if white_is_user else g["white"]
            code = me["result"]
            res = "W" if code == "win" else ("D" if code in DRAW_CODES else "L")
            game = chess.pgn.read_game(io.StringIO(g["pgn"]))
            if game is None:
                continue
            user_color = chess.WHITE if white_is_user else chess.BLACK
            board = game.board()
            fens = [board.fen()]
            clocks = [None]
            entry = None
            le7 = None
            node = game
            ply = 0
            for node in game.mainline():
                board.push(node.move)
                ply += 1
                fens.append(board.fen())
                clocks.append(node.clock())
                majors_minors = sum(
                    len(board.pieces(pt, c)) for pt in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT) for c in (chess.WHITE, chess.BLACK)
                )
                if entry is None and majors_minors <= 6:
                    entry = ply
                if le7 is None and len(board.piece_map()) <= 7:
                    le7 = ply
            total = ply
            row = {
                "url": g["url"],
                "end_time": g["end_time"],
                "time_class": g["time_class"],
                "time_control": g["time_control"],
                "rated": g.get("rated"),
                "color": "white" if white_is_user else "black",
                "my_rating": me.get("rating"),
                "opp_rating": opp.get("rating"),
                "result": res,
                "my_code": code,
                "opp_code": opp["result"],
                "plies": total,
                "entry_ply": entry,
                "le7_ply": le7,
            }
            if entry is not None and entry < total:
                b = chess.Board(fens[entry])
                row.update(
                    {
                        "eg": True,
                        "family": family(b),
                        "sig": pieces_str(b, user_color) + " vs " + pieces_str(b, not user_color),
                        "mat_diff": material(b, user_color) - material(b, not user_color),
                        "fens": fens[entry:],  # positions from endgame start to the end
                        "clocks": clocks[entry:],
                        "user_white": white_is_user,
                    }
                )
                # clock the user had when the endgame began (their most recent clock reading)
                my_clock = None
                for i in range(entry, 0, -1):
                    side_moved_white = (i % 2 == 1)  # ply 1 = white's move
                    if side_moved_white == white_is_user and clocks[i] is not None:
                        my_clock = clocks[i]
                        break
                row["my_clock_at_entry"] = my_clock
                if le7 is not None:
                    row["le7_fen"] = fens[le7]
                    row["le7_sig"] = tb_signature(chess.Board(fens[le7]), user_color)
            else:
                row["eg"] = False
            final = chess.Board(fens[-1])
            row["final_fen"] = fens[-1]
            row["final_sig"] = tb_signature(final, user_color)
            rows.append(row)
    json.dump(rows, open(OUT, "w"))
    eg = [r for r in rows if r["eg"]]
    print("games", len(rows), "reached endgame", len(eg))
    tb_positions = 0
    for r in eg:
        if r.get("le7_ply") is not None:
            n_after = r["plies"] - r["le7_ply"] + 1
            tb_positions += (n_after + 1) // 2
    print("games reaching <=7 pieces", sum(1 for r in eg if r.get("le7_ply") is not None), "approx user-to-move TB positions", tb_positions)


if __name__ == "__main__":
    main()
