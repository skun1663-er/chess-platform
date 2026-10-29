import { useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import "./App.css";

const files = "abcdefgh";

const symbols: Record<"w" | "b", Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

function squareName(square: Square) {
  return square;
}

export default function App() {
  // Keep one Chess instance so its full move history remains available for undo.
  const game = useRef(new Chess());
  const [, setRevision] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
    color: "w" | "b";
  } | null>(null);
  const [notice, setNotice] = useState("");

  const chess = game.current;
  const board = chess.board();
  const turn = chess.turn();
  const history = chess.history({ verbose: true });

  const capturedByWhite = history
    .filter((move) => move.color === "w" && move.captured)
    .map((move) => move.captured!);

  const capturedByBlack = history
    .filter((move) => move.color === "b" && move.captured)
    .map((move) => move.captured!);

  const pieceValues: Record<string, number> = {
    q: 9,
    r: 5,
    b: 3,
    n: 3,
    p: 1,
  };

  const whiteMaterial = capturedByWhite.reduce(
    (total, piece) => total + pieceValues[piece],
    0,
  );

  const blackMaterial = capturedByBlack.reduce(
    (total, piece) => total + pieceValues[piece],
    0,
  );

  // const materialBalance = whiteMaterial - blackMaterial;

  const capturedSymbols = (pieces: string[], capturedColor: "w" | "b") =>
    pieces.map((piece, index) => (
      <span key={`${piece}-${index}`} className="captured-piece">
        {symbols[capturedColor][piece]}
      </span>
    ));

  const gameOver = chess.isGameOver();

  const legalMoves = selected
    ? chess.moves({ square: selected, verbose: true })
    : [];

  const targets = legalMoves.map((move) => move.to);

  function refresh() {
    setRevision((revision) => revision + 1);
  }

  function playMove(
    from: Square,
    to: Square,
    promotionPiece?: "q" | "r" | "b" | "n",
  ) {
    try {
      const move = chess.move({
        from,
        to,
        ...(promotionPiece ? { promotion: promotionPiece } : {}),
      });

      setLastMove([move.from, move.to]);
      setSelected(null);
      setPromotion(null);
      setNotice("");
      refresh();
    } catch {
      setNotice("That move is not legal. Select a highlighted destination.");
    }
  }

  function handleSquareClick(square: Square) {
    if (gameOver || promotion) return;

    const piece = chess.get(square);

    if (selected) {
      const move = legalMoves.find((candidate) => candidate.to === square);

      if (move) {
        if (move.flags.includes("p")) {
          setPromotion({
            from: selected,
            to: square,
            color: turn,
          });
          return;
        }

        playMove(selected, square);
        return;
      }
    }

    if (piece?.color === turn) {
      setSelected(square);
      setNotice("");
    } else {
      setSelected(null);
      setNotice("Select one of your pieces, then choose a highlighted square.");
    }
  }

  function undo() {
    if (!chess.undo()) return;

    // const previous = chess.history({ verbose: true }).at(-1);
    const previousMoves = chess.history({ verbose: true });
    const previous = previousMoves[previousMoves.length - 1];
    setLastMove(previous ? [previous.from, previous.to] : null);
    setSelected(null);
    setPromotion(null);
    setNotice("");
    refresh();
  }

  function restart() {
    chess.reset();
    setSelected(null);
    setLastMove(null);
    setPromotion(null);
    setNotice("");
    refresh();
  }

  function getStatus() {
    if (chess.isCheckmate()) {
      return `Checkmate — ${turn === "w" ? "Black" : "White"} wins.`;
    }
    if (chess.isStalemate()) return "Draw — stalemate.";
    if (chess.isThreefoldRepetition()) return "Draw — threefold repetition.";
    if (chess.isInsufficientMaterial()) return "Draw — insufficient material.";
    if (chess.isDraw()) return "Draw — draw condition reached.";
    if (chess.isCheck())
      return `${turn === "w" ? "White" : "Black"} to move — Check!`;
    return `${turn === "w" ? "White" : "Black"} to move`;
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
              <span>{turn === "b" ? "Your turn" : "Waiting for White"}</span>
            </div>
            <span className="player-rating">1200</span>
            <div
              className="captured-pieces"
              aria-label="Pieces captured by Black">
              {capturedSymbols(capturedByBlack, "w")}
              {blackMaterial > whiteMaterial && (
                <span className="material-advantage">
                  +{blackMaterial - whiteMaterial}
                </span>
              )}
            </div>
          </div>

          <div className="chessboard">
            {board.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const square = `${files[colIndex]}${8 - rowIndex}` as Square;
                const isLight = (rowIndex + colIndex) % 2 === 0;
                const isSelected = selected === square;
                const isTarget = targets.includes(square);
                const isLastMove = lastMove?.includes(square) ?? false;
                const isKingInCheck =
                  piece?.type === "k" &&
                  piece.color === turn &&
                  chess.isCheck();

                return (
                  <button
                    key={square}
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
                    aria-label={`${squareName(square)}${piece ? ` ${piece.color === "w" ? "White" : "Black"} ${piece.type}` : ""}`}>
                    {colIndex === 0 && (
                      <span className="rank-label">{8 - rowIndex}</span>
                    )}
                    {rowIndex === 7 && (
                      <span className="file-label">{files[colIndex]}</span>
                    )}
                    {piece && (
                      <span
                        className={`chess-piece ${
                          piece.color === "w" ? "white-piece" : "black-piece"
                        }`}>
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
              <span>{turn === "w" ? "Your turn" : "Waiting for Black"}</span>
            </div>
            <span className="player-rating">1200</span>
            <div
              className="captured-pieces"
              aria-label="Pieces captured by White">
              {capturedSymbols(capturedByWhite, "b")}
              {whiteMaterial > blackMaterial && (
                <span className="material-advantage">
                  +{whiteMaterial - blackMaterial}
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
              <span className="eyebrow">GAME STATUS</span>
              <strong>{getStatus()}</strong>
            </div>
          </div>

          {promotion && (
            <div className="promotion-panel">
              <strong>Choose your promotion</strong>
              <div className="promotion-options">
                {(["q", "r", "b", "n"] as const).map((type) => (
                  <button
                    key={type}
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

                  return (
                    <div className="move-row" key={index}>
                      <span className="move-number">{index + 1}.</span>

                      <span
                        className={[
                          "move-cell",
                          index * 2 === history.length - 1 ? "latest-move" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}>
                        {whiteMove?.san ?? "—"}
                      </span>

                      <span
                        className={[
                          "move-cell",
                          index * 2 + 1 === history.length - 1
                            ? "latest-move"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}>
                        {blackMove?.san ?? ""}
                      </span>
                    </div>
                  );
                },
              )
            )}
          </div>

          {notice && <p className="game-notice">{notice}</p>}

          <div className="game-actions">
            <button
              className="secondary-button"
              onClick={undo}
              disabled={history.length === 0}>
              ↶ Undo
            </button>
            <button className="primary-button" onClick={restart}>
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
