import {
  CONFIG,
  DECREES,
  DECREE_BITE_RULES,
  FACTION_SPECS,
  MOVES,
  WHITE_DECK_TEMPLATE,
  WHITE,
  type FactionId,
} from "./config";

function deckCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of WHITE_DECK_TEMPLATE) out[id] = (out[id] ?? 0) + 1;
  return out;
}

function factionsLabel(ids: FactionId[]): string {
  return ids
    .map((i) => (i === WHITE ? "White" : "Red"))
    .join(" + ");
}

export function Rulebook() {
  const counts = deckCounts();

  return (
    <div className="rulebook">
      <section className="rb-block">
        <h2>Victory</h2>
        <p>
          First faction to reach <strong>{CONFIG.mandate_target}</strong> Mandate
          wins. Game caps at {CONFIG.max_turns} turns (higher Mandate wins;
          tie = draw).
        </p>
        <p>
          Each turn: the active player takes exactly{" "}
          <strong>{CONFIG.actions_per_turn} moves</strong>, then passes. Turn
          order: White → Red → White → …
        </p>
      </section>

      <section className="rb-block">
        <h2>Factions</h2>
        <div className="rb-grid">
          {FACTION_SPECS.map((f) => (
            <div key={f.id} className={`rb-faction ${f.id === WHITE ? "white" : "red"}`}>
              <h3>
                {f.name} <span className="rb-muted">— {f.centre}</span>
              </h3>
              <dl>
                <dt>Shard</dt><dd>{f.shard}</dd>
                <dt>Archetype</dt><dd>{f.archetype}</dd>
                <dt>Primitive</dt><dd>{f.primitive}</dd>
                <dt>Scoring</dt><dd>{f.scoringRule}</dd>
                <dt>Starting</dt><dd>{f.startingResources}</dd>
                <dt>Upkeep draw</dt><dd>{f.draw}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="rb-block">
        <h2>Moves</h2>
        <table className="rb-table">
          <thead>
            <tr>
              <th>Move</th>
              <th>Available to</th>
              <th>Primitive</th>
              <th>Scores?</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            {MOVES.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td>{factionsLabel(m.factions)}</td>
                <td><em>{m.primitive}</em></td>
                <td>
                  {m.scoresFor !== undefined
                    ? (m.scoresFor === WHITE ? "White" : "Red")
                    : "—"}
                </td>
                <td>
                  {m.description}
                  {m.details && (
                    <div className="rb-muted rb-detail">{m.details}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rb-block">
        <h2>Decrees ({WHITE_DECK_TEMPLATE.length} cards in White's deck)</h2>
        <table className="rb-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Type</th>
              <th>Copies</th>
              <th>Bites when</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(DECREES).map((d) => (
              <tr key={d.id} className={`rb-decree-row ${d.type}`}>
                <td><strong>{d.name}</strong></td>
                <td><span className={`rb-type ${d.type}`}>{d.type}</span></td>
                <td>{counts[d.id] ?? 0}</td>
                <td>{DECREE_BITE_RULES[d.id] ?? d.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rb-muted">
          Each decree that "bites" at end of White's turn pays White{" "}
          +{CONFIG.white_scoring.mandate_per_bite} Mandate. A decree can bite at most once per turn.
        </p>
      </section>

      <section className="rb-block">
        <h2>What's not built yet</h2>
        <ul>
          <li>Blue (Institute), Green (Orthodoxy), Black (Ledger).</li>
          <li>Real Research card pool for Blue.</li>
          <li>Green's procession (units → Mandate cash-out).</li>
          <li>Black's Convert action and throughput scoring.</li>
          <li>Cross-shard wing tools (see <code>running-the-wheel.md</code>) — currently the prototype is mono-vs-mono, which the design brief calls out as unbalanced by design.</li>
        </ul>
      </section>
    </div>
  );
}
