'use client';

import { useCallback, useMemo, useReducer } from 'react';
import {
  createGame,
  legalActions,
  reduce,
  tileAt,
  type Action,
  type ActionKind,
  type GameEvent,
  type GameOptions,
  type GameState,
  type ObservableState,
  type PlayerSetup,
} from '@afromoly/engine';

export interface LogLine {
  id: number;
  text: string;
  tone: 'plain' | 'head' | 'good' | 'bad' | 'card';
}

export interface HotSeat {
  state: GameState;
  log: LogLine[];
  /** The seat the game is waiting on, which is not always the seat whose turn it is. */
  waitingOn: string;
  legal: Action[];
  can: (kind: ActionKind) => boolean;
  dispatch: (action: Action) => void;
}

/**
 * Turn engine events into narration.
 *
 * Takes a name lookup rather than the state, so the online client can narrate
 * events that arrive before the matching state does.
 */
export function toLines(
  events: GameEvent[],
  startId: number,
  nameOf: (id: string) => string,
): LogLine[] {
  const who = nameOf;
  const at = (index: number) => tileAt(index).name;
  const out: LogLine[] = [];
  let id = startId;
  const push = (text: string, tone: LogLine['tone'] = 'plain') => {
    out.push({ id: id++, text, tone });
  };

  for (const event of events) {
    switch (event.kind) {
      case 'turnStarted': push(`Turn ${event.turnNumber}. ${who(event.playerId)} is up.`, 'head'); break;
      case 'turnSkipped': push(`${who(event.playerId)} loses a turn in the municipal queue.`, 'bad'); break;
      case 'diceRolled':
        push(`${who(event.playerId)} rolls ${event.dice[0]} and ${event.dice[1]}${event.isDoubles ? ', doubles' : ''}.`);
        break;
      case 'moved': push(`${who(event.playerId)} moves to ${at(event.to)}.`); break;
      case 'salaryPaid': push(`${who(event.playerId)} collects R${event.amount.toLocaleString('en-ZA')} for passing Payday.`, 'good'); break;
      case 'propertyBought': push(`${who(event.playerId)} buys ${at(event.tileIndex)}.`, 'good'); break;
      case 'rentPaid':
        push(`${who(event.fromId)} pays ${who(event.toId)} R${event.amount.toLocaleString('en-ZA')} at ${at(event.tileIndex)}${event.doubled ? ', doubled' : ''}.`);
        break;
      case 'rentWaived':
        if (event.reason !== 'ownProperty') {
          push(`No rent at ${at(event.tileIndex)}: ${event.reason === 'mortgaged' ? 'mortgaged' : 'the substation is out'}.`);
        }
        break;
      case 'taxPaid': push(`${who(event.playerId)} pays R${event.amount.toLocaleString('en-ZA')} in tax.`); break;
      case 'cardDrawn': push(`${event.deck === 'kombi' ? 'Kombi Hustle' : 'City Watch'}: ${event.title}. ${event.text}`, 'card'); break;
      case 'potChanged': push(`The rank pot holds R${event.total.toLocaleString('en-ZA')}.`); break;
      case 'potCollected': push(`${who(event.playerId)} sweeps R${event.amount.toLocaleString('en-ZA')} from the rank pot.`, 'good'); break;
      case 'sentToImpound': push(`${who(event.playerId)} is impounded${event.reason === 'threeDoubles' ? ' for reckless driving' : ''}.`, 'bad'); break;
      case 'impoundExit': push(`${who(event.playerId)} is released from the impound lot.`, 'good'); break;
      case 'impoundAttemptFailed': push(`${who(event.playerId)} misses doubles. Attempt ${event.attempts} of 3.`); break;
      case 'buildingBought': push(`${who(event.playerId)} adds a ${event.building === 'van' ? 'Quantum van' : 'Terminal Depot'} at ${at(event.tileIndex)}.`); break;
      case 'buildingSold': push(`${who(event.playerId)} sells a ${event.building} at ${at(event.tileIndex)}.`); break;
      case 'mortgaged': push(`${who(event.playerId)} mortgages ${at(event.tileIndex)}.`); break;
      case 'unmortgaged': push(`${who(event.playerId)} lifts the mortgage on ${at(event.tileIndex)}.`); break;
      case 'auctionStarted': push(`Auction: ${at(event.tileIndex)}. Bidding opens at R500.`, 'head'); break;
      case 'bidPlaced': push(`${who(event.playerId)} bids R${event.amount.toLocaleString('en-ZA')}.`); break;
      case 'bidPassed': push(`${who(event.playerId)} passes.`); break;
      case 'auctionWon': push(`${who(event.playerId)} takes ${at(event.tileIndex)} for R${event.amount.toLocaleString('en-ZA')}.`, 'good'); break;
      case 'auctionUnsold': push(`${at(event.tileIndex)} goes unsold.`); break;
      case 'tradeProposed': push(`${who(event.offer.fromId)} offers a deal to ${who(event.offer.toId)}.`, 'head'); break;
      case 'tradeAccepted': push('The deal is struck.', 'good'); break;
      case 'tradeDeclined': push('The offer is turned down.'); break;
      case 'utilitiesSuspended': push(`Substation down. Utilities collect nothing until turn ${event.untilTurn}.`, 'bad'); break;
      case 'debtRaised': push(`${who(event.debtorId)} owes R${event.amount.toLocaleString('en-ZA')} and must raise it.`, 'bad'); break;
      case 'debtSettled': push(`${who(event.debtorId)} settles the debt.`); break;
      case 'bankrupt': push(`${who(event.playerId)} is bankrupt.`, 'bad'); break;
      case 'gameOver': push(`${who(event.winnerId)} is the Undisputed Transit Tycoon of Gauteng.`, 'head'); break;
      case 'illegalAction': push(event.reason, 'bad'); break;
      default: break;
    }
  }
  return out;
}

/** Whichever seat the game is waiting on right now. */
export function waitingSeat(state: ObservableState): string {
  if (state.phase === 'auction' && state.auction) {
    return state.auction.activeIds[state.auction.turnIndex] ?? state.players[0]?.id ?? '';
  }
  if (state.phase === 'tradeReview' && state.trade) return state.trade.toId;
  if (state.phase === 'debtSettlement' && state.debts[0]) return state.debts[0].debtorId;
  return state.players[state.currentPlayerIndex]?.id ?? '';
}

/**
 * One reducer holds the game and its log together.
 *
 * React invokes reducers twice in development strict mode, so it matters that
 * this one is pure: the engine's reduce() is deterministic for a given state
 * and action, and appending log lines happens here rather than as a side
 * effect inside a state updater.
 */
interface Shell {
  state: GameState;
  log: LogLine[];
  nextId: number;
}

function makeShell(state: GameState, opening: string): Shell {
  return { state, log: [{ id: 0, text: opening, tone: 'head' }], nextId: 1 };
}

function shellReducer(shell: Shell, action: Action): Shell {
  const result = reduce(shell.state, action);
  const nameOf = (id: string) => result.state.players.find((p) => p.id === id)?.name ?? id;
  const lines = toLines(result.events, shell.nextId, nameOf);
  return {
    state: result.state,
    log: [...shell.log, ...lines].slice(-300),
    nextId: shell.nextId + lines.length,
  };
}

export function useHotSeat(
  seats: PlayerSetup[],
  seed: string,
  options: Partial<GameOptions>,
): HotSeat {
  const [shell, send] = useReducer(
    shellReducer,
    null,
    () => makeShell(createGame(seats, seed, options), 'The rank is open. Roll to begin.'),
  );
  const dispatch = useCallback((action: Action) => send(action), []);

  const waitingOn = waitingSeat(shell.state);
  const legal = useMemo(() => legalActions(shell.state, waitingOn), [shell.state, waitingOn]);
  const can = useCallback((kind: ActionKind) => legal.some((a) => a.kind === kind), [legal]);

  return { state: shell.state, log: shell.log, waitingOn, legal, can, dispatch };
}
