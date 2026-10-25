'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameOptions, PlayerSetup } from '@afromoly/engine';
import { useHotSeat, type HotSeatSnapshot } from '@/lib/useGame';
import { clearHotSeat, saveHotSeat } from '@/lib/storage';
import { useSounds } from '@/lib/useSounds';
import { Board } from '@/components/Board';
import { Board3D } from '@/components/Board3D';
import { LogPanel } from '@/components/LogPanel';
import { ViewSwitch, type BoardView } from '@/components/ViewSwitch';
import { SoundSwitch } from '@/components/SoundSwitch';
import { Seats } from '@/components/Seats';
import { Holdings } from '@/components/Holdings';
import { Actions } from '@/components/Actions';

interface Props {
  seats: PlayerSetup[];
  seed: string;
  jackpot: boolean;
  /** A game saved by an earlier visit, to carry on from. */
  resume?: HotSeatSnapshot | null;
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
      resume={round === 0 ? props.resume ?? null : null}
      onRestart={() => setRound((n) => n + 1)}
    />
  );
}

function Table({ seats, seed, jackpot, resume, onQuit, onRestart }: Props & { onRestart: () => void }) {
  const options = useMemo<Partial<GameOptions>>(() => ({ jackpot }), [jackpot]);
  const { state, log, events, batch, waitingOn, legal, dispatch, snapshot } = useHotSeat(seats, seed, options, resume ?? null);
  const [view, setView] = useState<BoardView>('2d');
  useSounds(events, batch);

  // Every move is saved, so a refresh or a closed tab does not end the game.
  useEffect(() => {
    saveHotSeat({ seats, seed, jackpot, snapshot });
  }, [seats, seed, jackpot, snapshot]);

  const inProgress = state.phase !== 'gameOver' && state.turnNumber > 1;
  const confirmThen = (question: string, go: () => void) => () => {
    if (!inProgress || window.confirm(question)) {
      clearHotSeat();
      go();
    }
  };
  const restart = confirmThen('Start a new game? This one will be lost.', onRestart);
  const quit = confirmThen('Leave the table? This game will be lost.', onQuit);

  return (
    <div className="shell">
      <div>
        <div className="masthead">
          <h1>Afromoly</h1>
          <span className="tag">Johannesburg Edition · hot seat · turn {state.turnNumber}</span>
          <ViewSwitch view={view} onChange={setView} />
          <SoundSwitch />
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
          restart={restart}
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
            <button onClick={restart}>Restart</button>
            <button onClick={quit}>Leave table</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
