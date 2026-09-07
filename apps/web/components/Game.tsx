'use client';

import { useMemo, useState } from 'react';
import type { GameOptions, PlayerSetup } from '@afromoly/engine';
import { useHotSeat } from '@/lib/useGame';
import { Board } from '@/components/Board';
import { Board3D } from '@/components/Board3D';
import { LogPanel } from '@/components/LogPanel';
import { ViewSwitch, type BoardView } from '@/components/ViewSwitch';
import { Seats } from '@/components/Seats';
import { Holdings } from '@/components/Holdings';
import { Actions } from '@/components/Actions';

interface Props {
  seats: PlayerSetup[];
  seed: string;
  jackpot: boolean;
  onQuit: () => void;
}

export function Game(props: Props) {
  // Restarting remounts the table, which is the cleanest way to reset a hook
  // and also deals a genuinely different game rather than replaying the seed.
  const [round, setRound] = useState(0);
  return (
    <Table
      key={round}
      {...props}
      seed={round === 0 ? props.seed : `${props.seed}-r${round}`}
      onRestart={() => setRound((n) => n + 1)}
    />
  );
}

function Table({ seats, seed, jackpot, onQuit, onRestart }: Props & { onRestart: () => void }) {
  const options = useMemo<Partial<GameOptions>>(() => ({ jackpot }), [jackpot]);
  const { state, log, events, batch, waitingOn, legal, dispatch } = useHotSeat(seats, seed, options);
  const [view, setView] = useState<BoardView>('2d');

  return (
    <div className="shell">
      <div>
        <div className="masthead">
          <h1>Afromoly</h1>
          <span className="tag">Johannesburg Edition · hot seat · turn {state.turnNumber}</span>
          <ViewSwitch view={view} onChange={setView} />
        </div>
        {view === '2d' ? <Board state={state} log={log} /> : <Board3D state={state} events={events} batch={batch} focusPlayerId={waitingOn} />}
      </div>

      <aside className="rail">
        <Seats state={state} waitingOn={waitingOn} />
        <Actions
          state={state}
          waitingOn={waitingOn}
          legal={legal}
          dispatch={dispatch}
          restart={onRestart}
        />
        <LogPanel log={log} className={view === '2d' ? 'only-narrow' : undefined} />
        <Holdings state={state} playerId={waitingOn} />
        <div className="panel">
          <h2>Table</h2>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Seed <span className="mono">{seed}</span>
            <br />
            Jackpot rule {state.options.jackpot ? 'on' : 'off'}
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button onClick={onRestart}>Restart</button>
            <button onClick={onQuit}>Leave table</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
