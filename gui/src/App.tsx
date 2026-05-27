import { useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { Local } from "boardgame.io/multiplayer";
import { MandateGame } from "./game";
import { makeMCTSBot } from "./ai";
import { MandateBoard } from "./Board";
import { Rulebook } from "./Rulebook";
import { WHITE, RED, FACTION_NAME, type SeatId } from "./config";

type Control = "human" | "ai";
type Tab = "board" | "rulebook";

// AI strength: MCTS iterations per decision. Modest so the GUI stays responsive (~a beat per
// AI move); the determinizing bot keeps it honest (doesn't peek at the hidden deck order).
const AI_ITERATIONS = 60;

// Build a boardgame.io React Client for a given per-seat control map.
//   - both human → plain hotseat Client (no transport, no fixed playerID — one screen drives
//     whichever side is to act, as before).
//   - any AI seat → Local({bots}) with a determinizing MCTSBot on each AI seat; the human
//     plays the (single) human seat via playerID. Both-AI → spectate (playerID null).
function makeClient(control: Record<SeatId, Control>) {
  const aiSeats = (Object.keys(control) as SeatId[]).filter((s) => control[s] === "ai");
  if (aiSeats.length === 0) {
    return { Comp: Client({ game: MandateGame, numPlayers: 2, board: MandateBoard, debug: { collapseOnLoad: true } }), humanSeat: null as SeatId | null };
  }
  const Bot = makeMCTSBot(MandateGame, { iterations: AI_ITERATIONS });
  const bots: Record<string, typeof Bot> = {};
  for (const s of aiSeats) bots[s] = Bot;
  const humanSeats = (Object.keys(control) as SeatId[]).filter((s) => control[s] === "human");
  return {
    Comp: Client({
      game: MandateGame,
      numPlayers: 2,
      board: MandateBoard,
      multiplayer: Local({ bots }),
      debug: { collapseOnLoad: true },
    }),
    humanSeat: humanSeats[0] ?? null, // the seat this screen controls (null = spectate both-AI)
  };
}

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  const [control, setControl] = useState<Record<SeatId, Control>>({ [WHITE]: "human", [RED]: "human" });

  // Rebuild the Client only when the control map changes (boardgame.io bakes multiplayer at
  // Client() creation). matchID is keyed to the control so switching starts a fresh game.
  const controlKey = `${control[WHITE]}-${control[RED]}`;
  const { Comp: MandateClient, humanSeat } = useMemo(() => makeClient(control), [controlKey]);

  const toggle = (seat: SeatId) =>
    setControl((c) => ({ ...c, [seat]: c[seat] === "human" ? "ai" : "human" }));

  return (
    <div className="app">
      <nav className="tabs">
        <button className={tab === "board" ? "tab active" : "tab"} onClick={() => setTab("board")}>
          Board
        </button>
        <button className={tab === "rulebook" ? "tab active" : "tab"} onClick={() => setTab("rulebook")}>
          Rulebook
        </button>
      </nav>

      {tab === "board" ? (
        <>
          <div className="seat-control">
            <span>Controls:</span>
            {([WHITE, RED] as SeatId[]).map((seat) => (
              <button key={seat} className="seat-toggle" onClick={() => toggle(seat)}>
                {FACTION_NAME[seat].split(" ")[0]}: <strong>{control[seat] === "ai" ? "AI" : "Human"}</strong>
              </button>
            ))}
            <span className="rb-muted">(changing a seat starts a fresh game)</span>
          </div>
          <MandateClient playerID={humanSeat ?? undefined} matchID={controlKey} />
        </>
      ) : (
        <Rulebook />
      )}
    </div>
  );
}
