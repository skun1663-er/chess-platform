import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import "./App.css";

const files = "abcdefgh";

const symbols: Record<"w" | "b", Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

// function squareName(square: Square) {
//   return square;
// }
function formatClock(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function App() {
  // The live Chess instance owns the actual game and its full move history.
  const game = useRef(new Chess());
  const [revision, setRevision] = useState(0);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  // const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
    color: "w" | "b";
  } | null>(null);
  const [notice, setNotice] = useState("");
  // const INITIAL_TIME = 5 * 60 * 1000;
  const INITIAL_TIME = 10 * 1000;

  const [clocks, setClocks] = useState({
    w: INITIAL_TIME,
    b: INITIAL_TIME,
  });

  const [activeClock, setActiveClock] = useState<"w" | "b" | null>("w");
  const [timedOut, setTimedOut] = useState<"w" | "b" | null>(null);

  const clockSnapshots = useRef<
    Array<{
      clocks: { w: number; b: number };
      activeClock: "w" | "b" | null;
      timedOut: "w" | "b" | null;
    }>
  >([]);

  const chess = game.current;
  const liveHistory = chess.history({ verbose: true });

  // Rebuild historical positions separately so browsing never mutates the live game.
  const displayChess = useMemo(() => {
    const replay = new Chess();
    const movesToShow = viewPly ?? liveHistory.length;

    for (const move of liveHistory.slice(0, movesToShow)) {
      replay.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
    }

    return replay;
  }, [revision, viewPly]);

  const board = displayChess.board();
  const turn = displayChess.turn();
  const history = liveHistory;
  const displayedHistory = displayChess.history({ verbose: true });
  const displayedLastMove = displayedHistory[displayedHistory.length - 1];
  const currentPly = viewPly ?? liveHistory.length;
  const isViewingHistory = viewPly !== null;

  const pieceValues: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
  };

  // Captures and material are calculated for the position currently displayed.
  const whiteCaptured = displayedHistory.filter(
    (move) => move.color === "w" && move.captured,
  );
  const blackCaptured = displayedHistory.filter(
    (move) => move.color === "b" && move.captured,
  );

  const whiteMaterial = whiteCaptured.reduce(
    (total, move) => total + pieceValues[move.captured!],
    0,
  );
  const blackMaterial = blackCaptured.reduce(
    (total, move) => total + pieceValues[move.captured!],
    0,
  );
  const materialDifference = whiteMaterial - blackMaterial;

  const gameOver = chess.isGameOver() || timedOut !== null;
  const legalMoves = selected
    ? chess.moves({ square: selected, verbose: true })
    : [];
  const targets = legalMoves.map((move) => move.to);

  useEffect(() => {
    if (activeClock === null || timedOut !== null) return;

    const startedAt = Date.now();
    const startingTime = clocks[activeClock];

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, startingTime - elapsed);

      setClocks((previous) => ({
        ...previous,
        [activeClock]: remaining,
      }));

      if (remaining === 0) {
        setTimedOut(activeClock);
        setActiveClock(null);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [activeClock, timedOut]);

  function refresh() {
    setRevision((revision) => revision + 1);
  }

  function showPly(ply: number) {
    const boundedPly = Math.max(0, Math.min(ply, liveHistory.length));
    setViewPly(boundedPly === liveHistory.length ? null : boundedPly);
    setSelected(null);
    setPromotion(null);
    setNotice("");
  }

  function playMove(
    from: Square,
    to: Square,
    promotionPiece?: "q" | "r" | "b" | "n",
  ) {
    if (viewPly !== null || timedOut !== null) return;

    // Save the clock state before making the move.
    const clockSnapshot = {
      clocks: { ...clocks },
      activeClock,
      timedOut,
    };

    try {
      chess.move({
        from,
        to,
        ...(promotionPiece ? { promotion: promotionPiece } : {}),
      });

      // Save the snapshot only after a successful move.
      clockSnapshots.current.push(clockSnapshot);

      // Switch to the opponent's clock.
      setActiveClock(chess.turn());

      setSelected(null);
      setPromotion(null);
      setNotice("");
      refresh();
    } catch {
      setNotice("That move is not legal. Select a highlighted destination.");
    }
  }

  function handleSquareClick(square: Square) {
    if (gameOver || timedOut || promotion || viewPly !== null) return;

    const piece = chess.get(square);

    if (selected) {
      const move = legalMoves.find((candidate) => candidate.to === square);

      if (move) {
        if (move.flags.includes("p")) {
          setPromotion({ from: selected, to: square, color: chess.turn() });
          return;
        }

        playMove(selected, square);
        return;
      }
    }

    if (piece?.color === chess.turn()) {
      setSelected(square);
      setNotice("");
    } else {
      setSelected(null);
      setNotice("Select one of your pieces, then choose a highlighted square.");
    }
  }

  function undo() {
    if (!chess.undo()) return;
    const previousClock = clockSnapshots.current.pop();

    if (previousClock) {
      setClocks(previousClock.clocks);
      setActiveClock(previousClock.activeClock);
      setTimedOut(previousClock.timedOut);
    }

    // const previousMoves = chess.history({ verbose: true });
    // const previous = previousMoves[previousMoves.length - 1];
    // setLastMove(previous ? [previous.from, previous.to] : null);
    setSelected(null);
    setPromotion(null);
    setNotice("");
    setViewPly(null);
    refresh();
  }

  function restart() {
    chess.reset();
    clockSnapshots.current = [];
    setClocks({
      w: INITIAL_TIME,
      b: INITIAL_TIME,
    });
    setActiveClock("w");
    setTimedOut(null);

    setSelected(null);
    // setLastMove(null);
    setPromotion(null);
    setNotice("");
    setViewPly(null);
    refresh();
  }

  function getStatus() {
    if (timedOut && !isViewingHistory) {
      const winner = timedOut === "w" ? "Black" : "White";
      const loser = timedOut === "w" ? "White" : "Black";

      return `${loser} lost on time — ${winner} wins!`;
    }

    if (displayChess.isCheckmate()) {
      return `Checkmate — ${displayChess.turn() === "w" ? "Black" : "White"} wins.`;
    }
    if (displayChess.isStalemate()) return "Draw — stalemate.";
    if (displayChess.isThreefoldRepetition())
      return "Draw — threefold repetition.";
    if (displayChess.isInsufficientMaterial())
      return "Draw — insufficient material.";
    if (displayChess.isDraw()) return "Draw — draw condition reached.";
    if (displayChess.isCheck()) {
      return `${displayChess.turn() === "w" ? "White" : "Black"} to move — Check!`;
    }
    return `${displayChess.turn() === "w" ? "White" : "Black"} to move`;
  }

  return (
    <main className="chess-app">
      <header className="topbar">
        <a className="brand" href="#">
          Chess<span className="brand-light">Platform</span>
        </a>
        <span className="online-status">
          <span className="status-dot" /> Local game
        </span>
      </header>

      <section className="game-layout">
        <div className="board-section">
          <div className="player-bar">
            <div className="player-avatar">♟</div>
            <div>
              <strong>Black Player</strong>
              <span>
                {turn === "b" ? "Black to move" : "Waiting for Black"}
              </span>
            </div>
            <span className="player-rating">1200</span>
            <div
              className={`chess-clock ${activeClock === "b" ? "clock-active" : ""}`}>
              {formatClock(clocks.b)}
            </div>
            <div
              className="captured-pieces"
              aria-label="Pieces captured by Black">
              {blackCaptured.map((move, index) => (
                <span
                  className="captured-piece"
                  key={`${move.from}-${move.to}-${index}`}>
                  {symbols.w[move.captured!]}
                </span>
              ))}
              {materialDifference < 0 && (
                <span className="material-advantage">
                  +{Math.abs(materialDifference)}
                </span>
              )}
            </div>
          </div>

          <div className="chessboard">
            {board.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const square = `${files[colIndex]}${8 - rowIndex}` as Square;
                const isLight = (rowIndex + colIndex) % 2 === 0;
                const isSelected = !isViewingHistory && selected === square;
                const isTarget = !isViewingHistory && targets.includes(square);
                const isLastMove = displayedLastMove
                  ? displayedLastMove.from === square ||
                    displayedLastMove.to === square
                  : false;
                const isKingInCheck =
                  piece?.type === "k" &&
                  piece.color === turn &&
                  displayChess.isCheck();

                return (
                  <button
                    key={square}
                    type="button"
                    className={[
                      "square",
                      isLight ? "light-square" : "dark-square",
                      isSelected ? "selected-square" : "",
                      isLastMove ? "last-move-square" : "",
                      isTarget
                        ? piece
                          ? "capture-target"
                          : "legal-target"
                        : "",
                      isKingInCheck ? "check-square" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleSquareClick(square)}
                    aria-label={`${square}${piece ? ` ${piece.color === "w" ? "White" : "Black"} ${piece.type}` : ""}`}>
                    {colIndex === 0 && (
                      <span className="rank-label">{8 - rowIndex}</span>
                    )}
                    {rowIndex === 7 && (
                      <span className="file-label">{files[colIndex]}</span>
                    )}
                    {piece && (
                      <span
                        className={`chess-piece ${piece.color === "w" ? "white-piece" : "black-piece"}`}>
                        {symbols[piece.color][piece.type]}
                      </span>
                    )}
                    {isTarget && (
                      <span
                        className={
                          piece ? "capture-indicator" : "move-indicator"
                        }
                      />
                    )}
                  </button>
                );
              }),
            )}
          </div>

          <div className="player-bar bottom-player">
            <div className="player-avatar">♙</div>
            <div>
              <strong>White Player (You)</strong>
              <span>
                {turn === "w" ? "White to move" : "Waiting for White"}
              </span>
            </div>
            <span className="player-rating">1200</span>
            <div
              className={`chess-clock ${activeClock === "w" ? "clock-active" : ""}`}>
              {formatClock(clocks.w)}
            </div>
            <div
              className="captured-pieces"
              aria-label="Pieces captured by White">
              {whiteCaptured.map((move, index) => (
                <span
                  className="captured-piece"
                  key={`${move.from}-${move.to}-${index}`}>
                  {symbols.b[move.captured!]}
                </span>
              ))}
              {materialDifference > 0 && (
                <span className="material-advantage">
                  +{materialDifference}
                </span>
              )}
            </div>
          </div>
        </div>

        <aside className="game-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">GAME ROOM</span>
              <h1>Classic Chess</h1>
            </div>
            <span className="game-badge">1 vs 1</span>
          </div>

          <div className="turn-card">
            <span className="turn-icon">♟</span>
            <div>
              <span className="eyebrow">
                {isViewingHistory ? "HISTORICAL POSITION: " : "GAME STATUS: "}
              </span>
              <strong>{getStatus()}</strong>
            </div>
          </div>

          {promotion && viewPly === null && (
            <div className="promotion-panel">
              <strong>Choose your promotion</strong>
              <div className="promotion-options">
                {(["q", "r", "b", "n"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="promotion-button"
                    onClick={() => playMove(promotion.from, promotion.to, type)}
                    aria-label={`Promote to ${type}`}>
                    {symbols[promotion.color][type]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="moves-heading">
            <h2>Move history</h2>
            <span>{history.length} half-moves</span>
          </div>

          <div className="move-history">
            {history.length === 0 ? (
              <div className="empty-history">
                <span>♘</span>
                <p>Your game begins with the first move.</p>
                <small>Select a piece and then a highlighted square.</small>
              </div>
            ) : (
              Array.from(
                { length: Math.ceil(history.length / 2) },
                (_, index) => {
                  const whiteMove = history[index * 2];
                  const blackMove = history[index * 2 + 1];
                  const whitePly = index * 2 + 1;
                  const blackPly = index * 2 + 2;

                  return (
                    <div className="move-row" key={index}>
                      <span className="move-number">{index + 1}.</span>
                      <button
                        type="button"
                        className={[
                          "move-cell",
                          whitePly === currentPly ? "latest-move" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => showPly(whitePly)}
                        aria-label={`View move ${index + 1}, White: ${whiteMove?.san ?? "none"}`}>
                        {whiteMove?.san ?? "—"}
                      </button>
                      <button
                        type="button"
                        className={[
                          "move-cell",
                          blackMove && blackPly === currentPly
                            ? "latest-move"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => showPly(blackPly)}
                        disabled={!blackMove}
                        aria-label={`View move ${index + 1}, Black: ${blackMove?.san ?? "not played"}`}>
                        {blackMove?.san ?? ""}
                      </button>
                    </div>
                  );
                },
              )
            )}
          </div>

          {notice && <p className="game-notice">{notice}</p>}

          <div className="game-actions history-navigation">
            <button
              type="button"
              className="secondary-button"
              disabled={currentPly === 0}
              onClick={() => showPly(currentPly - 1)}>
              ← Previous
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={currentPly >= liveHistory.length}
              onClick={() => showPly(currentPly + 1)}>
              Next →
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!isViewingHistory}
              onClick={() => showPly(liveHistory.length)}>
              Latest
            </button>
          </div>

          <div className="game-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={undo}
              disabled={history.length === 0}>
              ↶ Undo
            </button>
            <button type="button" className="primary-button" onClick={restart}>
              ↻ New game
            </button>
          </div>

          <p className="disclaimer">Rules powered by chess.js · Local game</p>
        </aside>
      </section>

      <footer className="app-footer">
        <span>ChessPlatform</span>
        <span>Made for the love of chess.</span>
      </footer>
    </main>
  );
}
