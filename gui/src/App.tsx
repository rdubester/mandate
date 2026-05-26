import { useState } from "react";
import { Client } from "boardgame.io/react";
import { MandateGame } from "./game";
import { MandateBoard } from "./Board";
import { Rulebook } from "./Rulebook";

// Single hotseat client with playerID=null: one screen controls whichever side is to
// act, so there's no seat to switch (moves are accepted for ctx.currentPlayer).
const MandateClient = Client({
  game: MandateGame,
  numPlayers: 2,
  board: MandateBoard,
  debug: { collapseOnLoad: true },
});

type Tab = "board" | "rulebook";

export default function App() {
  const [tab, setTab] = useState<Tab>("board");

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
        <MandateClient />
      ) : (
        <Rulebook />
      )}
    </div>
  );
}
