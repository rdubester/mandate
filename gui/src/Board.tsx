import { useState } from "react";
import type { BoardProps } from "boardgame.io/react";
import { strikeCost, decreeStrikeCost, canDo, allDecreesInPlay, type GameState } from "./game";
import { CONFIG, DECREES, WHITE, RED, FACTION_NAME, type FactionId } from "./config";

type Props = BoardProps<GameState>;

// What a click on a decree-in-play does, during White's turn.
type WhiteMode = "mark" | "shield";

function MandateBar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div className="mandate-bar">
      <div className="mandate-bar-fill" style={{ width: `${pct}%`, background: color }} />
      <span className="mandate-bar-label">
        {value} / {target}
      </span>
    </div>
  );
}

function DecreeCard({
  id,
  onClick,
  label,
  marked,
  shields,
  pending,
}: {
  id: string;
  onClick?: () => void;
  label?: string;
  marked?: boolean;
  shields?: number;
  pending?: number;
}) {
  const d = DECREES[id];
  if (!d) return <span className="card">{id}</span>;
  const shieldStr =
    (shields ?? 0) > 0 || (pending ?? 0) > 0
      ? "●".repeat(shields ?? 0) + (pending ? `+${"●".repeat(pending)}` : "")
      : "";
  return (
    <button
      className={`card decree ${d.type}`}
      onClick={onClick}
      disabled={!onClick}
      title={d.text}
    >
      <div className="card-name">
        {marked && "◆ "}
        {d.name}
      </div>
      <div className="card-type">
        {d.type}
        {shieldStr && <span className="card-shields"> · {shieldStr}</span>}
      </div>
      {label && <div className="card-label">{label}</div>}
    </button>
  );
}

export function MandateBoard(props: Props) {
  const { G, ctx, moves } = props;
  const active = ctx.currentPlayer as FactionId;
  const gameOver = ctx.gameover;
  const canStrike = G.red.zealots >= strikeCost(G);

  // White's click-mode + a pending shield allocation (decree id → count) being staged
  // before commit. Cleared after committing or switching mode.
  const [mode, setMode] = useState<WhiteMode>("mark");
  const [pending, setPending] = useState<Record<string, number>>({});
  const pendingTotal = Object.values(pending).reduce((a, b) => a + b, 0);
  const k = CONFIG.supporter_allocate_k;

  const resetAlloc = () => setPending({});
  const stageShield = (id: string) => {
    if (pendingTotal >= k || pendingTotal >= G.white.supporters) return;
    setPending((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
  };
  const commitShields = () => {
    const list: string[] = [];
    for (const [id, n] of Object.entries(pending)) for (let i = 0; i < n; i++) list.push(id);
    if (list.length) moves.allocateSupporters(list);
    resetAlloc();
  };

  return (
    <div className="board">
      <header>
        <h1>The Mandate</h1>
        <div className="status">
          {gameOver ? (
            <span className="winner">
              GAME OVER —{" "}
              {gameOver.draw
                ? "draw"
                : `${FACTION_NAME[gameOver.winner as FactionId]} wins`}
            </span>
          ) : (
            <span>
              Turn {ctx.turn} · <strong>{FACTION_NAME[active]}</strong> to act ·
              moves left: {CONFIG.actions_per_turn - (ctx.numMoves ?? 0)}
            </span>
          )}
        </div>
      </header>

      <section className="scoreboard">
        <div className="player-score white">
          <div className="label">{FACTION_NAME[WHITE]}</div>
          <MandateBar
            value={G.mandate[WHITE]}
            target={CONFIG.mandate_target}
            color="#e8e6df"
          />
        </div>
        <div className="player-score red">
          <div className="label">{FACTION_NAME[RED]}</div>
          <MandateBar
            value={G.mandate[RED]}
            target={CONFIG.mandate_target}
            color="#c0392b"
          />
        </div>
      </section>

      {/* WHITE panel */}
      <section className={`faction-panel ${active === WHITE ? "active" : ""}`}>
        <h2>White — Assembly</h2>
        <div className="resources">
          deck: {G.white.deck.length} · supporters: {G.white.supporters} · markers:{" "}
          {"●".repeat(G.whiteMarkers)}
          {"○".repeat(G.marks.length)} ({G.whiteMarkers} of {CONFIG.white.markers} free)
        </div>

        <div className="row">
          <div className="col">
            <h3>Hand ({G.white.hand.length})</h3>
            <div className="card-list">
              {G.white.hand.map((id, i) => (
                <DecreeCard
                  key={i}
                  id={id}
                  onClick={active === WHITE && !gameOver ? () => moves.enactDecree(id) : undefined}
                  label={active === WHITE ? "enact" : undefined}
                />
              ))}
              {G.white.hand.length === 0 && <em>empty</em>}
            </div>
          </div>
          <div className="col">
            <h3>
              Decrees in play{" "}
              {active === WHITE && !gameOver && (
                <span className="rb-muted">
                  — click to {mode === "mark" ? "mark" : "shield"}
                </span>
              )}
            </h3>
            <div className="card-list">
              {allDecreesInPlay(G).map(({ id, owner }, i) => {
                const marked = G.marks.includes(id);
                const shields = G.shields[id] ?? 0;
                const isWhiteTurn = active === WHITE && !gameOver;
                const canMark = isWhiteTurn && mode === "mark" && !marked && G.whiteMarkers > 0;
                const canShield =
                  isWhiteTurn &&
                  mode === "shield" &&
                  pendingTotal < k &&
                  pendingTotal < G.white.supporters;
                const onClick = canMark
                  ? () => moves.mark(id)
                  : canShield
                    ? () => stageShield(id)
                    : undefined;
                return (
                  <DecreeCard
                    key={i}
                    id={id}
                    onClick={onClick}
                    marked={marked}
                    shields={shields}
                    pending={pending[id] ?? 0}
                    label={owner === RED ? "(red's)" : undefined}
                  />
                );
              })}
              {allDecreesInPlay(G).length === 0 && <em>none</em>}
            </div>
          </div>
        </div>

        {active === WHITE && !gameOver && (
          <div className="action-bar">
            {canDo(WHITE, "rally_supporters") && (
              <button onClick={() => moves.rallySupporters()}>
                Rally Supporters (+{CONFIG.unit_yield.rally_supporters})
              </button>
            )}
            {canDo(WHITE, "deliberate") && (
              <button onClick={() => moves.deliberate()}>Deliberate (draw 1)</button>
            )}
            {/* mark / shield mode toggle for what clicking a decree does */}
            <button
              className={mode === "mark" ? "active" : ""}
              onClick={() => { setMode("mark"); resetAlloc(); }}
            >
              Mode: Mark
            </button>
            {canDo(WHITE, "allocate_supporters") && (
              <button
                className={mode === "shield" ? "active" : ""}
                onClick={() => { setMode("shield"); resetAlloc(); }}
              >
                Mode: Shield
              </button>
            )}
            {mode === "shield" && (
              <>
                <span className="rb-muted">
                  staged {pendingTotal}/{Math.min(k, G.white.supporters)}
                </span>
                <button disabled={pendingTotal === 0} onClick={commitShields}>
                  Allocate {pendingTotal} supporter(s)
                </button>
                {pendingTotal > 0 && (
                  <button onClick={resetAlloc} className="rb-muted">
                    clear
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* RED panel */}
      <section className={`faction-panel ${active === RED ? "active" : ""}`}>
        <h2>Red — Vanguard</h2>
        <div className="resources">
          zealots: {G.red.zealots} · supporters: {G.red.supporters}
        </div>

        {active === RED && !gameOver && (
          <div className="action-bar">
            {canDo(RED, "muster_zealots") && (
              <button onClick={() => moves.musterZealots()}>
                Muster Zealots (+{CONFIG.unit_yield.muster_zealots})
              </button>
            )}
            {canDo(RED, "strike") && (
              <button
                disabled={!canStrike}
                onClick={() => moves.strikeMandate()}
                title={`cost: ${strikeCost(G)} zealot(s)`}
              >
                Strike White's Mandate (cost {strikeCost(G)})
              </button>
            )}
            {canDo(RED, "strike") && G.white.decreesInPlay.length > 0 && (
              <div className="strike-decree-group">
                <span>Remove a decree (cost {decreeStrikeCost(G)}, +0 Mandate):</span>
                {G.white.decreesInPlay.map((id, i) => (
                  <button
                    key={i}
                    disabled={G.red.zealots < decreeStrikeCost(G)}
                    onClick={() => moves.strikeDecree(id)}
                  >
                    {DECREES[id]?.name ?? id}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Log */}
      <section className="log-panel">
        <h3>Log</h3>
        <div className="log">
          {G.log.slice(-30).map((line, i) => (
            <div key={i} className={line.startsWith("---") ? "log-turn" : "log-line"}>
              {line}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
