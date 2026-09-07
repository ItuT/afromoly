'use client';

import { useEffect, useRef } from 'react';
import { BOARD, type GameState, type Tile } from '@afromoly/engine';
import { GROUP_COLOUR, gridPosition, rand, seatColour, tileLabel } from '@/lib/display';
import type { LogLine } from '@/lib/useGame';

function TileCell({ tile, state }: { tile: Tile; state: GameState }) {
  const ts = state.tiles[tile.index];
  const ownerSeat = ts?.ownerId ? state.players.findIndex((p) => p.id === ts.ownerId) : -1;
  const isCorner = ['go', 'impound', 'freerest', 'gotoimpound'].includes(tile.kind);
  const here = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.position === tile.index && !p.bankrupt);
  const { row, column } = gridPosition(tile.index);

  return (
    <div
      className={`tile${isCorner ? ' corner' : ''}${ownerSeat >= 0 ? ' owned' : ''}`}
      style={{ gridRow: row, gridColumn: column }}
      title={`${tile.index}. ${tile.name}`}
    >
      {tile.kind === 'street' && <div className="band" style={{ background: GROUP_COLOUR[tile.group] }} />}
      {tile.kind === 'hub' && <div className="band" style={{ background: 'var(--petrol)' }} />}
      {tile.kind === 'utility' && <div className="band" style={{ background: 'var(--ochre-dim)' }} />}

      <div className={isCorner ? 'corner-label' : 'name'}>{tileLabel(tile)}</div>
      {'price' in tile && <div className="price">{rand(tile.price)}</div>}
      {tile.kind === 'tax' && <div className="price">{rand(tile.amount)}{tile.allowPercent ? ' or 10%' : ''}</div>}

      {ownerSeat >= 0 && <span className="owner-dot" style={{ background: seatColour(ownerSeat) }} />}
      {ts?.mortgaged && <span className="mortgaged" />}

      {(ts?.vans || ts?.depot) && (
        <div className="dev">
          {ts.depot
            ? <span className="depot" title="Terminal Depot" />
            : Array.from({ length: ts.vans }, (_, i) => <span key={i} className="van" title="Quantum van" />)}
        </div>
      )}

      {here.length > 0 && (
        <div className="tokens">
          {here.map(({ p, i }) => (
            <span key={p.id} className="token" style={{ background: seatColour(i) }} title={p.name}>
              {i + 1}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Board({ state, log }: { state: GameState; log: LogLine[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  const lastId = log.at(-1)?.id ?? 0;

  // Keep the newest line in view, the way a chat log behaves.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div className="board-wrap">
      <div className="board">
        {BOARD.map((tile) => <TileCell key={tile.index} tile={tile} state={state} />)}
        <div className="board-centre">
          <div className="wordmark">
            AFROMOLY
            <small>Johannesburg Edition</small>
          </div>
          {state.options.jackpot && (
            <div className="muted mono" style={{ fontSize: 12, textAlign: 'center' }}>
              Rank pot: {rand(state.pot)}
            </div>
          )}
          <div className="log" ref={logRef}>
            {log.slice(-40).map((line) => (
              <div key={line.id} className={`entry ${line.tone}`}>{line.text}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
