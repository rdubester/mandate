import { useState } from "react";
import { Client } from "boardgame.io/react";
import { Local } from "boardgame.io/multiplayer";
import { MandateGame } from "./game";
import { MandateBoard } from "./Board";
import { Rulebook } from "./Rulebook";

const MandateClient = Client({
  game: MandateGame,
  numPlayers: 2,
  board: MandateBoard,
  multiplayer: Local(),
  debug: { collapseOnLoad: true },
});

type Tab = "board" | "rulebook";

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  const [seat, setSeat] = useState<"0" | "1">("0");

  return (
    <div className="app">
      <nav className="tabs">
        <button
          className={tab === "board" ? "tab active" : "tab"}
          onClick={() => setTab("board")}
        >
          Board
        </button>
        <button
          className={tab === "rulebook" ? "tab active" : "tab"}
          onClick={() => setTab("rulebook")}
        >
          Rulebook
        </button>
      </nav>

      {tab === "board" ? (
        <>
          <div className="seat-switcher">
            <span>seat: </span>
            <button disabled={seat === "0"} onClick={() => setSeat("0")}>White</button>
            <button disabled={seat === "1"} onClick={() => setSeat("1")}>Red</button>
            <span className="seat-hint">
              (switch to whichever side is "to act" — boardgame.io ignores moves from the wrong seat)
            </span>
          </div>
          <MandateClient playerID={seat} matchID="local" />
        </>
      ) : (
        <Rulebook />
      )}
    </div>
  );
}
