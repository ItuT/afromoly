'use client';

import { useState } from 'react';
import { useOnline } from '@/lib/useOnline';
import type { Seat } from '@/lib/api';
import { Board } from '@/components/Board';
import { Board3D } from '@/components/Board3D';
import { LogPanel } from '@/components/LogPanel';
import { ViewSwitch, type BoardView } from '@/components/ViewSwitch';
import { Seats } from '@/components/Seats';
import { Holdings } from '@/components/Holdings';
import { Actions } from '@/components/Actions';
import { seatColour } from '@/lib/display';

export function Online({ seat, onLeave }: { seat: Seat; onLeave: () => void }) {
  const table = useOnline(seat);
  const [view, setView] = useState<BoardView>('2d');
  const isHost = table.hostId === seat.playerId;

  if (!table.state) {
    return (
      <main className="setup">
        <h1>
          Table <span className="mono" style={{ letterSpacing: '0.08em', color: 'var(--ochre)' }}>{table.code}</span>
          <small>
            Read the code out to whoever is joining. Everyone plays from their own screen.
          </small>
        </h1>

        <div className="panel">
          <h2>At the table</h2>
          {table.players.length === 0 && <p className="faint" style={{ margin: 0 }}>Waiting for the rank to answer.</p>}
          {table.players.map((player) => (
            <div key={player.id} className="seat">
              <span className="chip" style={{ background: seatColour(player.seat) }}>{player.seat + 1}</span>
              <span className="who">
                <span className="nm">{player.name}{player.id === seat.playerId ? ' (you)' : ''}</span>
                <span className="sub">{player.connected ? 'connected' : 'away'}</span>
              </span>
              <span className="cash faint">{player.id === table.hostId ? 'host' : ''}</span>
            </div>
          ))}
        </div>

        {table.error && <div className="prompt" style={{ borderLeftColor: 'var(--warn)' }}>{table.error}</div>}

        <div className="row">
          {isHost ? (
            <button
              className="primary"
              disabled={table.players.length < 2 || table.connection !== 'open'}
              onClick={table.startGame}
            >
              {table.players.length < 2 ? 'Waiting for one more' : 'Start the game'}
            </button>
          ) : (
            <span className="muted">Waiting for the host to start.</span>
          )}
          <button onClick={onLeave}>Leave</button>
        </div>

        <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
          Connection: {table.connection}
        </p>
      </main>
    );
  }

  return (
    <div className="shell">
      <div>
        <div className="masthead">
          <h1>Afromoly</h1>
          <span className="tag">
            Table {table.code} · turn {table.state.turnNumber} · {table.connection}
          </span>
          <ViewSwitch view={view} onChange={setView} />
        </div>
        {view === '2d'
          ? <Board state={table.state} log={table.log} />
          : <Board3D state={table.state} events={table.events} batch={table.batch} focusPlayerId={seat.playerId} />}
      </div>

      <aside className="rail">
        <Seats state={table.state} waitingOn={table.waitingOn} />
        <Actions
          state={table.state}
          waitingOn={seat.playerId}
          legal={table.legal}
          dispatch={table.send}
          restart={onLeave}
          waitingLabel={
            table.waitingOn === seat.playerId
              ? null
              : table.state.players.find((p) => p.id === table.waitingOn)?.name ?? null
          }
        />
        <LogPanel log={table.log} className={view === '2d' ? 'only-narrow' : undefined} />
        <Holdings state={table.state} playerId={seat.playerId} />
        <div className="panel">
          <h2>Table</h2>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Code <span className="mono">{table.code}</span>
            <br />
            You are <span className="mono">{seat.name}</span>
            <br />
            {table.players.filter((p) => p.connected).length} of {table.players.length} connected
          </div>
          {table.error && (
            <div className="prompt" style={{ marginTop: 10, borderLeftColor: 'var(--warn)' }}>
              {table.error}
            </div>
          )}
          <div className="actions" style={{ marginTop: 10 }}>
            <button onClick={onLeave}>Leave table</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
