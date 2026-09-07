/** Turns engine events into plain sentences for the terminal log. */

import { tileAt, type GameEvent, type GameState } from '@afromoly/engine';
import { colour as C, rand } from './render.js';

export function narrate(state: GameState, event: GameEvent): string | null {
  const who = (id: string): string => state.players.find((p) => p.id === id)?.name ?? id;
  const where = (index: number): string => tileAt(index).name;

  switch (event.kind) {
    case 'diceRolled':
      return `${who(event.playerId)} rolls ${event.dice[0]} and ${event.dice[1]}${event.isDoubles ? ' — doubles' : ''}.`;
    case 'moved':
      return `${who(event.playerId)} moves to ${where(event.to)}.`;
    case 'salaryPaid':
      return `${C.green}Month-End Payday: ${who(event.playerId)} collects ${rand(event.amount)}.${C.reset}`;
    case 'propertyOffered':
      return `${where(event.tileIndex)} is unclaimed. Asking ${rand(event.price)}.`;
    case 'propertyBought':
      return `${C.ochre}${who(event.playerId)} buys ${where(event.tileIndex)} for ${rand(event.price)}.${C.reset}`;
    case 'rentPaid':
      return `${who(event.fromId)} pays ${who(event.toId)} ${rand(event.amount)} at ${where(event.tileIndex)}${event.doubled ? ' (doubled)' : ''}.`;
    case 'rentWaived':
      return event.reason === 'ownProperty'
        ? null
        : `${C.dim}No rent at ${where(event.tileIndex)}: ${event.reason === 'mortgaged' ? 'mortgaged' : 'the substation is out'}.${C.reset}`;
    case 'taxPaid':
      return `${who(event.playerId)} pays ${rand(event.amount)} in tax (${event.option === 'flat' ? 'flat fee' : 'ten percent'}).`;
    case 'cardDrawn':
      return `${C.teal}${event.deck === 'kombi' ? 'Kombi Hustle' : 'City Watch'}: ${C.bold}${event.title}${C.reset}\n  ${event.text}`;
    case 'potChanged':
      return `${C.dim}Rank pot now holds ${rand(event.total)}.${C.reset}`;
    case 'potCollected':
      return `${C.green}${who(event.playerId)} sweeps the rank pot for ${rand(event.amount)}${event.seeded ? ' (bank seeded it)' : ''}.${C.reset}`;
    case 'sentToImpound':
      return `${C.red}${who(event.playerId)} is impounded${event.reason === 'threeDoubles' ? ' for reckless driving' : ''}.${C.reset}`;
    case 'impoundExit':
      return `${who(event.playerId)} is released from the impound lot (${event.via}).`;
    case 'impoundAttemptFailed':
      return `${who(event.playerId)} fails to roll doubles. Attempt ${event.attempts} of 3.`;
    case 'buildingBought':
      return `${who(event.playerId)} adds a ${event.building === 'van' ? 'Quantum van' : 'Terminal Depot'} to ${where(event.tileIndex)} for ${rand(event.cost)}.`;
    case 'buildingSold':
      return `${who(event.playerId)} sells a ${event.building} at ${where(event.tileIndex)} for ${rand(event.refund)}.`;
    case 'mortgaged':
      return `${who(event.playerId)} mortgages ${where(event.tileIndex)} for ${rand(event.amount)}.`;
    case 'unmortgaged':
      return `${who(event.playerId)} lifts the mortgage on ${where(event.tileIndex)} for ${rand(event.cost)}.`;
    case 'auctionStarted':
      return `${C.ochre}Auction: ${where(event.tileIndex)}. Bidding opens at R500.${C.reset}`;
    case 'bidPlaced':
      return `${who(event.playerId)} bids ${rand(event.amount)}.`;
    case 'bidPassed':
      return `${who(event.playerId)} passes.`;
    case 'auctionWon':
      return `${C.ochre}${who(event.playerId)} takes ${where(event.tileIndex)} for ${rand(event.amount)}.${C.reset}`;
    case 'auctionUnsold':
      return `${where(event.tileIndex)} goes unsold and stays with the bank.`;
    case 'tradeProposed':
      return `${who(event.offer.fromId)} offers a deal to ${who(event.offer.toId)}.`;
    case 'tradeAccepted':
      return `${C.green}Deal struck.${C.reset}`;
    case 'tradeDeclined':
      return 'The offer is turned down.';
    case 'utilitiesSuspended':
      return `${C.red}Substation down. Utilities collect nothing until turn ${event.untilTurn}.${C.reset}`;
    case 'debtRaised':
      return `${C.red}${who(event.debtorId)} owes ${rand(event.amount)} to ${event.creditorId ? who(event.creditorId) : 'the bank'} and must raise it.${C.reset}`;
    case 'debtSettled':
      return `${who(event.debtorId)} settles ${rand(event.amount)}.`;
    case 'bankrupt':
      return `${C.red}${who(event.playerId)} is bankrupt. The estate goes to ${event.creditorId ? who(event.creditorId) : 'the bank'}.${C.reset}`;
    case 'gameOver':
      return `${C.bold}${C.ochre}${who(event.winnerId)} is the Undisputed Transit Tycoon of Gauteng.${C.reset}`;
    case 'turnStarted':
      return `${C.dim}--- Turn ${event.turnNumber}: ${who(event.playerId)} ---${C.reset}`;
    case 'turnSkipped':
      return `${who(event.playerId)} is stuck in the municipal queue and loses a turn.`;
    case 'illegalAction':
      return `${C.red}${event.reason}.${C.reset}`;
    default:
      return null;
  }
}
