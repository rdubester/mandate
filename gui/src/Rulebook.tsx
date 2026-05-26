// 1-1 data view: this file RENDERS the engine's data, it does not describe it in
// prose. Every line below is a field read off DECREES / VERBS / CHARACTERS / CONFIG
// in config.ts — the same objects game.ts executes. If a rule changes, this changes
// with it; there is no parallel description to drift.

import type { ReactNode } from "react";
import {
  CONFIG,
  DECREES,
  VERBS,
  CHARACTERS,
  SHARD,
  WHITE_DECK_TEMPLATE,
  availableVerbs,
  WHITE,
  type FactionId,
  type Decree,
  type VerbSpec,
} from "./config";

function deckCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of WHITE_DECK_TEMPLATE) out[id] = (out[id] ?? 0) + 1;
  return out;
}

const facName = (id: FactionId) => (id === WHITE ? "White" : "Red");

// A field row: "key: value" in mono, for the spec look.
function Field({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="spec-field">
      <span className="spec-key">{k}</span>
      <span className="spec-val">{v}</span>
    </div>
  );
}

function DecreeSpec({ d }: { d: Decree }) {
  const t = d.trigger;
  return (
    <div className={`spec-card ${d.type}`}>
      <div className="spec-head">
        <span className="spec-id">{d.id}</span>
        <span className={`rb-type ${d.type}`}>{d.type}</span>
      </div>
      <Field
        k="on"
        v={t.detail ? `${t.on} where ${Object.entries(t.detail).map(([k, v]) => `${k}=${v}`).join(", ")}` : t.on}
      />
      {d.effect &&
        Object.entries(d.effect).map(([k, v]) => (
          <Field key={k} k="effect" v={`${k} ${(v as number) >= 0 ? "+" : ""}${v}`} />
        ))}
      {d.rider && (
        <Field
          k="rider"
          v={`may {${Object.entries(d.rider.effect).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ")}}`}
        />
      )}
      {d.score && (
        <Field
          k="score"
          v={`${d.score.when} → owner +${d.score.amount}`}
        />
      )}
    </div>
  );
}

function VerbSpecCard({ v }: { v: VerbSpec }) {
  // Shared verbs: who can use them is "any character whose shard contains one of
  // these colours" — so we just show the colours and let the reader match. Signature
  // verbs aren't colour-gated, so we show their named owner instead.
  return (
    <div className="spec-card">
      <div className="spec-head">
        <span className="spec-id">{v.name}</span>
        <span className="rb-muted">{v.tier}</span>
      </div>
      {v.tier === "signature" ? (
        <Field k="signature of" v={v.signatureOf !== undefined ? facName(v.signatureOf) : "?"} />
      ) : (
        <Field k="colours" v={v.colours.join(" / ")} />
      )}
      {v.yields && <Field k="yields" v={`+${v.yields.amount} ${v.yields.unit}`} />}
      {v.spends && <Field k="spends" v={`${v.spends.amount} ${v.spends.unit} (± decree cost)`} />}
      {v.draws !== undefined && <Field k="draws" v={`${v.draws} card`} />}
      {v.scores && (
        <Field
          k="scores"
          v={`actor +${v.scores.amount}${v.scores.alsoKnocks ? `, target −${v.scores.alsoKnocks}` : ""}`}
        />
      )}
    </div>
  );
}

export function Rulebook() {
  const counts = deckCounts();

  return (
    <div className="rulebook">
      <section className="rb-block">
        <h2>System</h2>
        <Field k="mandate_target" v={CONFIG.mandate_target} />
        <Field k="actions_per_turn" v={CONFIG.actions_per_turn} />
        <Field k="max_turns" v={CONFIG.max_turns} />
        <Field k="win" v="first to mandate_target; at max_turns, higher wins (tie → draw)" />
        <Field k="turn order" v="White → Red → … (alternating)" />
        <p className="rb-muted rb-note">
          A verb is available to a character iff it is their signature, or any of the
          verb's colours is in their <em>shard</em> (centre + two wheel-wings). Decrees
          are standing rules that hook every verb; their owner scores per the{" "}
          <code>score</code> field. Everything below is rendered from the engine data.
        </p>
      </section>

      <section className="rb-block">
        <h2>Characters</h2>
        <div className="spec-grid">
          {CHARACTERS.map((c) => {
            const cfg = c.id === WHITE ? CONFIG.white : CONFIG.red;
            return (
              <div key={c.id} className={`spec-card ${c.id === WHITE ? "white-edge" : "red-edge"}`}>
                <div className="spec-head">
                  <span className="spec-id">{c.name}</span>
                  <span className="rb-muted">{c.character}</span>
                </div>
                <Field k="centre" v={c.centre} />
                <Field k="shard" v={SHARD[c.id].join(" ")} />
                <Field k="tier1 scoring" v={c.scoring} />
                <Field k="tier2 signature" v={c.signature} />
                <Field k="tier3 shared" v={availableVerbs(c.id).filter((x) => x !== c.signature).join(", ") || "—"} />
                <Field k="start" v={`hand ${cfg.starting_hand} · supporters ${cfg.starting_supporters} · zealots ${cfg.starting_zealots}`} />
                <Field k="draw/turn" v={`${cfg.draw_per_turn}${cfg.deck ? ` (${cfg.deck} deck)` : " (no deck)"}`} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="rb-block">
        <h2>Verbs</h2>
        <div className="spec-grid">
          {VERBS.map((v) => (
            <VerbSpecCard key={v.name} v={v} />
          ))}
        </div>
      </section>

      <section className="rb-block">
        <h2>Decrees</h2>
        <div className="spec-grid">
          {Object.values(DECREES).map((d) => (
            <div key={d.id} className="spec-card-wrap">
              <DecreeSpec d={d} />
              <div className="spec-meta rb-muted">×{counts[d.id] ?? 0} in deck</div>
            </div>
          ))}
        </div>
        <p className="rb-muted rb-note">
          Deck: {WHITE_DECK_TEMPLATE.length} cards. <code>effect</code> applies to every
          actor (ambient); <code>rider</code> is the "may" the actor chooses (greedy by
          default); <code>score</code> pays the decree's owner.
        </p>
      </section>

      <section className="rb-block">
        <h2>Not built yet</h2>
        <ul>
          <li>Blue (Institute), Green (Orthodoxy), Black (Ledger).</li>
          <li>Research is a stub draw; no Archive / research pool.</li>
          <li>Green's procession (units → Mandate); the supporter/zealot spring.</li>
          <li>Black's Convert + throughput scoring.</li>
          <li>Smarter compliance (riders are auto-accepted; hook: <code>wantsRider</code>).</li>
          <li>Cross-shard wing tools (see <code>running-the-wheel.md</code>).</li>
        </ul>
      </section>
    </div>
  );
}
