import {
  CONFIG,
  DECREES,
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
  return ids.map((i) => (i === WHITE ? "White" : "Red")).join(" + ");
}

// Plain-language summary of a decree's hook, derived from its data.
function decreeHook(id: string): string {
  const d = DECREES[id];
  if (!d) return "";
  const parts: string[] = [];
  if (d.rider && d.score?.when === "compliance") {
    parts.push(
      `On ${d.trigger.on}${d.trigger.detail ? ` (${Object.values(d.trigger.detail)})` : ""}: actor may "${d.rider.describe}". If they do, White +${d.score.amount}.`,
    );
  } else if (d.score?.when === "always") {
    const eff = d.effect?.yield_delta ? ` (+${d.effect.yield_delta} to the actor too)` : "";
    parts.push(`On ${d.trigger.on}: White +${d.score.amount} each time${eff}.`);
  }
  if (d.effect?.cost_delta) parts.push(`Ambient tax: ${d.trigger.on} costs ${d.effect.cost_delta > 0 ? "+" : ""}${d.effect.cost_delta}.`);
  if (d.effect?.yield_delta && !d.score) parts.push(`Ambient: ${d.trigger.on} yields ${d.effect.yield_delta > 0 ? "+" : ""}${d.effect.yield_delta}.`);
  return parts.join(" ");
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
        <h2>The three-tier character model</h2>
        <p>
          Every faction is a character with three tiers: <strong>(1) a scoring
          rule</strong> — how it wins, unique to it; <strong>(2) a signature
          verb</strong> — only it can do, unshareable; <strong>(3) shared
          verbs</strong> — drawn from a common pool, granted when the verb's
          colours overlap the character's <em>shard</em> (centre + two wings on
          the wheel). "Running the wheel" = leaning into wing-colour verbs you
          share with neighbours.
        </p>
        <p className="rb-muted">
          Units are two currencies, one per green edge:{" "}
          <strong>supporters</strong> (G–W community, soft stock — White's edict
          fuel) and <strong>zealots</strong> (G–R authenticity, hard flow — spent
          on strikes). White's shard (GWU) has no R, so it is structurally
          non-militant: it can never muster zealots or strike.
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
                <dt>Signature</dt><dd>{f.signature}</dd>
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
              <th>Tier · colours</th>
              <th>Scores?</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            {MOVES.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td>{factionsLabel(m.factions)}</td>
                <td>
                  <em>{m.tier}</em>
                  <div className="rb-muted">{m.colours}</div>
                </td>
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
        <p className="rb-muted">
          Decrees are standing <em>rules on the table</em> that hook every player's
          verbs. White scores not by acting, but by skimming Mandate when others
          live under its rules — when they comply with a "may" rider, or via an
          "always" clause. This is White's theory of governance: legitimacy.
        </p>
        <table className="rb-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Type</th>
              <th>Copies</th>
              <th>Hook</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(DECREES).map((d) => (
              <tr key={d.id} className={`rb-decree-row ${d.type}`}>
                <td><strong>{d.name}</strong></td>
                <td><span className={`rb-type ${d.type}`}>{d.type}</span></td>
                <td>{counts[d.id] ?? 0}</td>
                <td>{decreeHook(d.id) || d.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rb-block">
        <h2>What's not built yet</h2>
        <ul>
          <li>Blue (Institute), Green (Orthodoxy), Black (Ledger).</li>
          <li>Real Research card pool / Archive for Blue.</li>
          <li>Green's procession (units → Mandate cash-out) and the supporter/zealot spring.</li>
          <li>Black's Convert action and throughput scoring.</li>
          <li>Smarter compliance policies (currently every beneficial rider is taken).</li>
          <li>Cross-shard wing tools (see <code>running-the-wheel.md</code>) — currently mono-vs-mono, which the design brief calls out as unbalanced by design.</li>
        </ul>
      </section>
    </div>
  );
}
