'use client';

import { useEffect, useState } from 'react';
import { TOKENS, TOKEN_NAMES, tileAt, type PlayerSetup } from '@afromoly/engine';
import { Game } from '@/components/Game';
import { Online } from '@/components/Online';
import { hostTable, joinTable, type Seat } from '@/lib/api';
import { useRuntimeConfig } from '@/lib/useConfig';
import { clearHotSeat, clearSeat, loadHotSeat, loadSeat, saveSeat, type HotSeatSave } from '@/lib/storage';
import type { HotSeatSnapshot } from '@/lib/useGame';

const DEFAULT_NAMES = ['Thabo', 'Naledi', 'Sipho', 'Zanele', 'Kagiso', 'Lerato'];

type Mode = 'menu' | 'hotseat-setup' | 'hotseat' | 'online';

export default function Home() {
  const { config, ready, online } = useRuntimeConfig();
  const [mode, setMode] = useState<Mode>('menu');
  const [seatCount, setSeatCount] = useState(3);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [jackpot, setJackpot] = useState(true);
  const [hotSeat, setHotSeat] = useState<{ seats: PlayerSetup[]; seed: string; resume: HotSeatSnapshot | null } | null>(null);

  const [myName, setMyName] = useState('');
  const [code, setCode] = useState('');
  const [seat, setSeat] = useState<Seat | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What an earlier visit left behind. Read after mount, since the server
  // rendering this page has no localStorage to look in.
  const [savedSeat, setSavedSeat] = useState<Seat | null>(null);
  const [savedHotSeat, setSavedHotSeat] = useState<HotSeatSave | null>(null);
  useEffect(() => {
    setSavedSeat(loadSeat());
    setSavedHotSeat(loadHotSeat());
  }, []);

  if (mode === 'hotseat' && hotSeat) {
    return (
      <Game
        seats={hotSeat.seats}
        seed={hotSeat.seed}
        jackpot={jackpot}
        resume={hotSeat.resume}
        onQuit={() => { setHotSeat(null); setSavedHotSeat(null); setMode('menu'); }}
      />
    );
  }

  if (mode === 'online' && seat) {
    return (
      <Online
        seat={seat}
        onLeave={() => {
          clearSeat();
          setSavedSeat(null);
          setSeat(null);
          setMode('menu');
        }}
      />
    );
  }

  const setName = (i: number, value: string) =>
    setNames((current) => current.map((n, index) => (index === i ? value : n)));

  const run = async (work: () => Promise<Seat>) => {
    setBusy(true);
    setError(null);
    try {
      const taken = await work();
      saveSeat(taken);
      setSavedSeat(taken);
      setSeat(taken);
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
              clearHotSeat();
              setHotSeat({
                seats: Array.from({ length: seatCount }, (_, i) => ({
                  id: `p${i + 1}`,
                  name: names[i]?.trim() || DEFAULT_NAMES[i] || `Operator ${i + 1}`,
                  token: TOKENS[i] ?? 'quantum',
                })),
                seed: `jozi-${Date.now()}`,
                resume: null,
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

      {savedHotSeat && (
        <div className="panel">
          <h2>Carry on</h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
            {savedHotSeat.seats.map((s) => s.name).join(', ')} at turn {savedHotSeat.snapshot.state.turnNumber},{' '}
            {savedHotSeat.snapshot.state.players[savedHotSeat.snapshot.state.currentPlayerIndex]?.name ?? 'someone'} to play from{' '}
            {tileAt(savedHotSeat.snapshot.state.players[savedHotSeat.snapshot.state.currentPlayerIndex]?.position ?? 0).name}.
          </p>
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                setJackpot(savedHotSeat.jackpot);
                setHotSeat({ seats: savedHotSeat.seats, seed: savedHotSeat.seed, resume: savedHotSeat.snapshot });
                setMode('hotseat');
              }}
            >
              Continue hot seat
            </button>
            <button onClick={() => { clearHotSeat(); setSavedHotSeat(null); }}>Forget it</button>
          </div>
        </div>
      )}

      {savedSeat && online && (
        <div className="panel">
          <h2>Back to your table</h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
            You hold a seat as <strong>{savedSeat.name}</strong> at table{' '}
            <span className="mono" style={{ letterSpacing: '0.08em' }}>{savedSeat.code}</span>.
          </p>
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                // The socket address comes from this deployment, not the saved one.
                const resumed = { ...savedSeat, wsUrl: config.wsUrl };
                saveSeat(resumed);
                setSeat(resumed);
                setMode('online');
              }}
            >
              Rejoin table {savedSeat.code}
            </button>
            <button onClick={() => { clearSeat(); setSavedSeat(null); }}>Forget it</button>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>One screen</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
          Two to six operators around the same device, passing it on each turn.
        </p>
        <button className="primary" onClick={() => setMode('hotseat-setup')}>Play hot seat</button>
      </div>

      <div className="panel">
        <h2>Own screens</h2>
        {!ready ? (
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Checking for a rank…</p>
        ) : !online ? (
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Online play is not configured for this deployment. Hot seat still works.
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
                onClick={() => void run(() => hostTable(config, myName, jackpot))}
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
                  onClick={() => void run(() => joinTable(config, code, myName))}
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
