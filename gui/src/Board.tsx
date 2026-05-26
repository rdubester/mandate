import type { BoardProps } from "boardgame.io/react";
import { strikeCost, canDo, allDecreesInPlay, type GameState } from "./game";
import { CONFIG, DECREES, WHITE, RED, FACTION_NAME, type FactionId } from "./config";

type Props = BoardProps<GameState>;

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

function DecreeCard({ id, onClick, label }: { id: string; onClick?: () => void; label?: string }) {
  const d = DECREES[id];
  if (!d) return <span className="card">{id}</span>;
  return (
    <button
      className={`card decree ${d.type}`}
      onClick={onClick}
      disabled={!onClick}
      title={d.text}
    >
      <div className="card-name">{d.name}</div>
      <div className="card-type">{d.type}</div>
      {label && <div className="card-label">{label}</div>}
    </button>
  );
}

export function MandateBoard(props: Props) {
  const { G, ctx, moves } = props;
  const active = ctx.currentPlayer as FactionId;
  const gameOver = ctx.gameover;
  const canStrike = G.red.zealots >= strikeCost(G);

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
            <h3>Decrees in play (click to mark)</h3>
            <div className="card-list">
              {allDecreesInPlay(G).map(({ id, owner }, i) => {
                const marked = G.marks.includes(id);
                const canMark =
                  active === WHITE && !gameOver && !marked && G.whiteMarkers > 0;
                return (
                  <DecreeCard
                    key={i}
                    id={id}
                    onClick={canMark ? () => moves.mark(id) : undefined}
                    label={marked ? "◆ marked" : owner === RED ? "(red's)" : "mark"}
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
            <span className="rb-muted">
              · enact a decree from hand, or click a decree above to mark it (signature)
            </span>
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
                <span>Strike a decree:</span>
                {G.white.decreesInPlay.map((id, i) => (
                  <button
                    key={i}
                    disabled={!canStrike}
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
