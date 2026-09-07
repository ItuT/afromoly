'use client';

import { netWorth, tileAt, type GameState } from '@afromoly/engine';
import { rand, seatColour } from '@/lib/display';

export function Seats({ state, waitingOn }: { state: GameState; waitingOn: string }) {
  return (
    <div className="panel">
      <h2>Operators</h2>
      {state.players.map((player, seat) => {
        const deeds = state.tiles.filter((t) => t.ownerId === player.id).length;
        const status = player.bankrupt
          ? 'Out of the game'
          : player.inImpound
            ? `Impounded, attempt ${player.impoundAttempts} of 3`
            : tileAt(player.position).name;
        return (
          <div
            key={player.id}
            className={`seat${player.id === waitingOn && !player.bankrupt ? ' active' : ''}${player.bankrupt ? ' out' : ''}`}
          >
            <span className="chip" style={{ background: seatColour(seat) }}>{seat + 1}</span>
            <span className="who">
              <span className="nm">{player.name}</span>
              <span className="sub">
                {deeds} deed{deeds === 1 ? '' : 's'}
                {player.getOutCards.length > 0 && ` · ${player.getOutCards.length} exit card`}
                {' · '}{status}
              </span>
            </span>
            <span className="cash">
              {rand(player.cash)}
              <span className="faint" style={{ display: 'block', fontSize: 10, textAlign: 'right' }}>
                worth {rand(netWorth(state, player.id))}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
