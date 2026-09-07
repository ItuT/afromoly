'use client';

import { useState } from 'react';
import { TOKENS, TOKEN_NAMES, type PlayerSetup } from '@afromoly/engine';
import { Game } from '@/components/Game';
import { Online } from '@/components/Online';
import { hostTable, joinTable, type Seat } from '@/lib/api';
import { ONLINE_ENABLED } from '@/lib/config';

const DEFAULT_NAMES = ['Thabo', 'Naledi', 'Sipho', 'Zanele', 'Kagiso', 'Lerato'];

type Mode = 'menu' | 'hotseat-setup' | 'hotseat' | 'online';

export default function Home() {
  const [mode, setMode] = useState<Mode>('menu');
  const [seatCount, setSeatCount] = useState(3);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [jackpot, setJackpot] = useState(true);
  const [hotSeat, setHotSeat] = useState<{ seats: PlayerSetup[]; seed: string } | null>(null);

  const [myName, setMyName] = useState('');
  const [code, setCode] = useState('');
  const [seat, setSeat] = useState<Seat | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'hotseat' && hotSeat) {
    return (
      <Game
        seats={hotSeat.seats}
        seed={hotSeat.seed}
        jackpot={jackpot}
        onQuit={() => { setHotSeat(null); setMode('menu'); }}
      />
    );
  }

  if (mode === 'online' && seat) {
    return <Online seat={seat} onLeave={() => { setSeat(null); setMode('menu'); }} />;
  }

  const setName = (i: number, value: string) =>
    setNames((current) => current.map((n, index) => (index === i ? value : n)));

  const run = async (work: () => Promise<Seat>) => {
    setBusy(true);
    setError(null);
    try {
      setSeat(await work());
      setMode('online');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'hotseat-setup') {
    return (
      <main className="setup">
        <h1>
          Hot seat
          <small>Everyone plays from this screen, passing it round the table.</small>
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

        <div className="row">
          <button
            className="primary"
            onClick={() => {
              setHotSeat({
                seats: Array.from({ length: seatCount }, (_, i) => ({
                  id: `p${i + 1}`,
                  name: names[i]?.trim() || DEFAULT_NAMES[i] || `Operator ${i + 1}`,
                  token: TOKENS[i] ?? 'quantum',
                })),
                seed: `jozi-${Date.now()}`,
              });
              setMode('hotseat');
            }}
          >
            Open the rank
          </button>
          <button onClick={() => setMode('menu')}>Back</button>
        </div>
      </main>
    );
  }

  return (
    <main className="setup">
      <h1>
        Afromoly
        <small>
          Johannesburg Edition. Buy the corridors from Ferreirasdorp to Sandton CBD, run Quantum
          fleets out of the ranks, and squeeze every rival off the board.
        </small>
      </h1>

      <div className="panel">
        <h2>One screen</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
          Two to six operators around the same device, passing it on each turn.
        </p>
        <button className="primary" onClick={() => setMode('hotseat-setup')}>Play hot seat</button>
      </div>

      <div className="panel">
        <h2>Own screens</h2>
        {!ONLINE_ENABLED ? (
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Online play is not configured for this build. Set the API and WebSocket addresses at
            build time to enable it.
          </p>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="myname">Your name</label>
              <input
                id="myname"
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="Thabo"
                maxLength={24}
              />
            </div>
            <div className="row" style={{ marginBottom: 12 }}>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void run(() => hostTable(myName, jackpot))}
              >
                Host a table
              </button>
            </div>
            <div className="field">
              <label htmlFor="code">Or join with a code</label>
              <div className="row">
                <input
                  id="code"
                  className="mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC234"
                  maxLength={8}
                  style={{ maxWidth: 140, letterSpacing: '0.16em' }}
                />
                <button
                  disabled={busy || code.trim().length < 4}
                  onClick={() => void run(() => joinTable(code, myName))}
                >
                  Join
                </button>
              </div>
            </div>
            {error && (
              <div className="prompt" style={{ marginTop: 12, borderLeftColor: 'var(--warn)' }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
