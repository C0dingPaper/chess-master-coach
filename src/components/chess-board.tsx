import { lazy, memo, Suspense, useEffect, useState } from "react";
import type { ChessboardOptions, PositionDataType } from "react-chessboard";
import { cn } from "@/lib/utils";

const InteractiveBoard = lazy(() =>
  import("react-chessboard").then((module) => ({ default: module.Chessboard })),
);

const START_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const DARK_SQUARE = "#789489";
const LIGHT_SQUARE = "#eef0e7";
const EMPTY_OPTIONS: ChessboardOptions = {};

function squaresFromPosition(position: string | PositionDataType) {
  if (typeof position !== "string") {
    return Object.entries(position).map(([square, piece]) => ({
      file: square.charCodeAt(0) - 97,
      rank: 8 - Number(square[1]),
      type: piece.pieceType.slice(-1).toLowerCase(),
      white: piece.pieceType[0] === "w",
    }));
  }

  return position
    .split(" ")[0]
    .split("/")
    .flatMap((row, rank) => {
      let file = 0;
      return [...row].flatMap((character) => {
        if (/\d/.test(character)) {
          file += Number(character);
          return [];
        }
        const piece = {
          file: file++,
          rank,
          type: character.toLowerCase(),
          white: character === character.toUpperCase(),
        };
        return [piece];
      });
    });
}

function PreviewPiece({ type, white }: { type: string; white: boolean }) {
  const detail = white ? "#26372f" : "#c5d0c8";
  return (
    <g
      fill={white ? "#fffef9" : "#293830"}
      stroke="#26372f"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {type === "p" && (
        <>
          <circle cx="22.5" cy="12" r="5" />
          <path d="M17.5 17c-4 4-3 8 0 10l-4 8h18l-4-8c3-2 4-6 0-10Z" />
          <path d="M12 35h21v4H12Z" />
        </>
      )}
      {type === "r" && (
        <>
          <path d="M12 7h5v5h4V7h4v5h4V7h5v11l-4 4v12l3 2v3H12v-3l3-2V22l-3-4Z" />
          <path d="M14 18h18M16 23h13M16 33h13" stroke={detail} />
        </>
      )}
      {type === "n" && (
        <>
          <path d="m13 35 2-8 6-7-7 3-5-4 5-7 8-4 5-3v6c10 5 10 16 6 24Z" />
          <path d="m15 14 6-2M25 17c-1 5-5 8-6 13" fill="none" stroke={detail} />
          <circle cx="19" cy="14" r="1.1" fill={detail} stroke="none" />
          <path d="M11 35h24v4H11Z" />
        </>
      )}
      {type === "b" && (
        <>
          <circle cx="22.5" cy="6" r="2" />
          <path d="M22.5 9c-14 9-9 17 0 18 9-1 14-9 0-18Z" />
          <path d="m23 13-4 7" stroke={detail} />
          <path d="m18 27-3 7h15l-3-7M12 35h21v4H12Z" />
          <path d="M17 30h11" stroke={detail} />
        </>
      )}
      {type === "q" && (
        <>
          <path d="m10 13 4 18h17l4-18-8 10-4.5-15L18 23Z" />
          <circle cx="10" cy="11" r="2.5" />
          <circle cx="22.5" cy="6" r="2.5" />
          <circle cx="35" cy="11" r="2.5" />
          <path d="m15 31-3 5v3h21v-3l-3-5Z" />
          <path d="M16 28h13M14 35h17" stroke={detail} />
        </>
      )}
      {type === "k" && (
        <>
          <path d="M22.5 4v8m-4-5h8" fill="none" strokeWidth="2.3" />
          <path d="M22.5 13c-5-8-13-2-10 5l4 12h13l4-12c3-7-5-13-10.5-5Z" />
          <path d="M22.5 13v13" stroke={detail} />
          <path d="m16 30-3 5v4h19v-4l-3-5Z" />
          <path d="M15 35h15" stroke={detail} />
        </>
      )}
    </g>
  );
}

/** A dependency-free FEN preview for cards and the interactive board's first paint. */
export const ChessPositionPreview = memo(function ChessPositionPreview({
  position = START_POSITION,
  boardOrientation = "white",
  showNotation = false,
  className,
  label = "Chess position",
}: {
  position?: string | PositionDataType;
  boardOrientation?: "white" | "black";
  showNotation?: boolean;
  className?: string;
  label?: string;
}) {
  const flipped = boardOrientation === "black";
  return (
    <svg
      viewBox="0 0 360 360"
      role="img"
      aria-label={label}
      className={cn("block aspect-square h-auto w-full", className)}
    >
      {Array.from({ length: 64 }, (_, index) => {
        const x = index % 8;
        const y = Math.floor(index / 8);
        const light = (x + y) % 2 === 0;
        return (
          <g key={index}>
            <rect
              x={x * 45}
              y={y * 45}
              width="45"
              height="45"
              fill={light ? LIGHT_SQUARE : DARK_SQUARE}
            />
            {showNotation && x === 0 && (
              <text
                x="3"
                y={y * 45 + 10}
                fontSize="9"
                fontWeight="600"
                fill={light ? "#456356" : LIGHT_SQUARE}
              >
                {flipped ? y + 1 : 8 - y}
              </text>
            )}
            {showNotation && y === 7 && (
              <text
                x={x * 45 + 35}
                y="357"
                fontSize="9"
                fontWeight="600"
                fill={light ? "#456356" : LIGHT_SQUARE}
              >
                {"abcdefgh"[flipped ? 7 - x : x]}
              </text>
            )}
          </g>
        );
      })}
      {squaresFromPosition(position).map((piece) => (
        <g
          key={`${piece.file}-${piece.rank}`}
          transform={`translate(${(flipped ? 7 - piece.file : piece.file) * 45} ${(flipped ? 7 - piece.rank : piece.rank) * 45})`}
        >
          <PreviewPiece type={piece.type} white={piece.white} />
        </g>
      ))}
    </svg>
  );
});

function sameOptions(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = Object.keys(a);
  const right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        sameOptions((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

/** Shared, square and server-safe board. Options preserve react-chessboard's API. */
export const ChessBoard = memo(
  function ChessBoard({
    options = EMPTY_OPTIONS,
    className,
  }: {
    options?: ChessboardOptions;
    className?: string;
  }) {
    const [mounted, setMounted] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => {
      setMounted(true);
      const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(preference.matches);
      const update = () => setReducedMotion(preference.matches);
      preference.addEventListener("change", update);
      return () => preference.removeEventListener("change", update);
    }, []);

    const fallback = (
      <ChessPositionPreview
        position={options.position}
        boardOrientation={options.boardOrientation}
        showNotation={options.showNotation ?? true}
      />
    );

    return (
      <div
        className={cn(
          "relative isolate aspect-square w-full overflow-hidden rounded-lg bg-[#eef0e7] shadow-[0_2px_12px_rgba(27,45,35,0.08)]",
          className,
        )}
      >
        {mounted ? (
          <Suspense fallback={fallback}>
            <InteractiveBoard
              options={{
                allowDragging: false,
                showNotation: true,
                ...options,
                animationDurationInMs: reducedMotion ? 0 : (options.animationDurationInMs ?? 140),
                showAnimations: reducedMotion ? false : (options.showAnimations ?? true),
                darkSquareStyle: { backgroundColor: DARK_SQUARE, ...options.darkSquareStyle },
                lightSquareStyle: { backgroundColor: LIGHT_SQUARE, ...options.lightSquareStyle },
                darkSquareNotationStyle: {
                  color: LIGHT_SQUARE,
                  fontSize: "11px",
                  fontWeight: 600,
                  ...options.darkSquareNotationStyle,
                },
                lightSquareNotationStyle: {
                  color: "#456356",
                  fontSize: "11px",
                  fontWeight: 600,
                  ...options.lightSquareNotationStyle,
                },
                boardStyle: { width: "100%", height: "100%", ...options.boardStyle },
              }}
            />
          </Suspense>
        ) : (
          fallback
        )}
      </div>
    );
  },
  (previous, next) =>
    previous.className === next.className && sameOptions(previous.options, next.options),
);
