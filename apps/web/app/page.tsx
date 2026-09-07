'use client';

import { useState } from 'react';
import { TOKENS, TOKEN_NAMES, type PlayerSetup } from '@afromoly/engine';
import { Game } from '@/components/Game';

const DEFAULT_NAMES = ['Thabo', 'Naledi', 'Sipho', 'Zanele', 'Kagiso', 'Lerato'];

export default function Home() {
  const [seatCount, setSeatCount] = useState(3);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [jackpot, setJackpot] = useState(true);
  const [started, setStarted] = useState<{ seats: PlayerSetup[]; seed: string; jackpot: boolean } | null>(null);

  if (started) {
    return (
      <Game
        seats={started.seats}
        seed={started.seed}
        jackpot={started.jackpot}
        onQuit={() => setStarted(null)}
      />
    );
  }

  const setName = (i: number, value: string) =>
    setNames((current) => current.map((n, index) => (index === i ? value : n)));

  return (
    <main className="setup">
      <h1>
        Afromoly
        <small>
          Johannesburg Edition. Buy the corridors from Ferreirasdorp to Sandton CBD, run Quantum
          fleets out of the ranks, and squeeze every rival off the board.
        </small>
      </h1>

      <div className="field">
        <label htmlFor="count">Operators</label>
        <select
          id="count"
          value={seatCount}
          onChange={(e) => setSeatCount(Number.parseInt(e.target.value, 10))}
          style={{ maxWidth: 120 }}
        >
          {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="seats">
        {Array.from({ length: seatCount }, (_, i) => (
          <div key={i} className="seat-row">
            <span className="mono muted">{i + 1}</span>
            <input
              value={names[i] ?? ''}
              onChange={(e) => setName(i, e.target.value)}
              placeholder={DEFAULT_NAMES[i]}
              aria-label={`Name for operator ${i + 1}`}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {TOKEN_NAMES[TOKENS[i] ?? 'quantum']}
            </span>
          </div>
        ))}
      </div>

      <label className="toggle">
        <input type="checkbox" checked={jackpot} onChange={(e) => setJackpot(e.target.checked)} />
        Jackpot house rule: card penalties and the e-toll feed a pot at the Taxi Rank Queue.
      </label>

      <div>
        <button
          className="primary"
          onClick={() =>
            setStarted({
              seats: Array.from({ length: seatCount }, (_, i) => ({
                id: `p${i + 1}`,
                name: names[i]?.trim() || DEFAULT_NAMES[i] || `Operator ${i + 1}`,
                token: TOKENS[i] ?? 'quantum',
              })),
              seed: `jozi-${Date.now()}`,
              jackpot,
            })
          }
        >
          Open the rank
        </button>
      </div>

      <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
        Hot-seat play: everyone shares this screen. Online multiplayer arrives in phase 3.
      </p>
    </main>
  );
}
