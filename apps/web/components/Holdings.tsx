'use client';

import { BOARD, GROUP_NAMES, type GameState } from '@afromoly/engine';
import { GROUP_COLOUR, rand } from '@/lib/display';

export function Holdings({ state, playerId }: { state: GameState; playerId: string }) {
  const owned = BOARD.filter((tile) => state.tiles[tile.index]?.ownerId === playerId);
  const player = state.players.find((p) => p.id === playerId);

  return (
    <div className="panel">
      <h2>{player?.name ?? 'Holdings'}</h2>
      {owned.length === 0 && <p className="faint" style={{ margin: 0, fontSize: 13 }}>No deeds yet.</p>}
      <div className="holdings">
        {owned.map((tile) => {
          const ts = state.tiles[tile.index];
          const swatch =
            tile.kind === 'street' ? GROUP_COLOUR[tile.group]
              : tile.kind === 'hub' ? 'var(--petrol)'
                : 'var(--ochre-dim)';
          const detail =
            tile.kind === 'street' ? GROUP_NAMES[tile.group]
              : tile.kind === 'hub' ? 'Transit hub'
                : 'Utility';
          const dev = ts?.depot ? 'Depot' : ts?.vans ? `${ts.vans} van${ts.vans === 1 ? '' : 's'}` : '';
          return (
            <div key={tile.index} className="holding">
              <span className="swatch" style={{ background: swatch }} />
              <span>
                {tile.name}
                <span className="faint" style={{ display: 'block', fontSize: 10.5 }}>
                  {detail}{ts?.mortgaged ? ' · mortgaged' : ''}
                </span>
              </span>
              <span className="meta">{dev || rand('price' in tile ? tile.price : 0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
