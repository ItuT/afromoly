/**
 * The rules engine.
 *
 * `reduce` is total and pure: it never throws for a bad action, never touches
 * the clock, the network or Math.random, and returns a fresh state alongside
 * the events that describe what happened. Every dice roll comes from the
 * seeded generator held in state, so a game replays exactly from its seed plus
 * its action log.
 */

import {
  BOARD_SIZE,
  DEFAULT_OPTIONS,
  GO,
  IMPOUND,
  tileAt,
} from './board.js';
import { DECKS, cardById, type Card, type CardEffect } from './cards.js';
import { nextInt, seedRng, shuffle } from './rng.js';
import {
  activePlayers,
  buildLevel,
  buildingsFor,
  currentPlayer,
  depotsOwned,
  groupStreets,
  maxRaisable,
  netWorth,
  ownedTiles,
  ownsWholeGroup,
  playerById,
  rentFor,
  tileState,
  vansOwned,
} from './selectors.js';
import type { Action } from './actions.js';
import type { GameEvent } from './events.js';
import type {
  DeckId,
  GameOptions,
  GameState,
  Phase,
  Player,
  PlayerId,
  PlayerSetup,
  TileIndex,
  TradeOffer,
} from './types.js';

const MORTGAGE_INTEREST = 0.1;

interface Ctx {
  state: GameState;
  events: GameEvent[];
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

export function createGame(
  players: PlayerSetup[],
  seed: string,
  options: Partial<GameOptions> = {},
): GameState {
  if (players.length < 2 || players.length > 6) {
    throw new Error('Afromoly seats two to six operators');
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error('Duplicate player id');
  const tokens = new Set(players.map((p) => p.token));
  if (tokens.size !== players.length) throw new Error('Two players cannot share a token');

  const opts: GameOptions = { ...DEFAULT_OPTIONS, ...options };
  let rng = seedRng(seed);

  const kombi = shuffle(rng, DECKS.kombi.map((c) => c.id));
  rng = kombi.state;
  const citywatch = shuffle(rng, DECKS.citywatch.map((c) => c.id));
  rng = citywatch.state;

  return {
    revision: 0,
    options: opts,
    rng,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      cash: opts.startingCash,
      position: GO,
      inImpound: false,
      impoundAttempts: 0,
      getOutCards: [],
      skipNextTurn: false,
      bankrupt: false,
    })),
    currentPlayerIndex: 0,
    phase: 'awaitingRoll',
    tiles: Array.from({ length: BOARD_SIZE }, () => ({
      ownerId: null,
      vans: 0,
      depot: false,
      mortgaged: false,
    })),
    decks: { kombi: { order: kombi.value }, citywatch: { order: citywatch.value } },
    pot: 0,
    turnNumber: 1,
    doublesCount: 0,
    lastRoll: null,
    utilitiesSuspendedUntilTurn: null,
    pendingBuy: null,
    pendingTax: null,
    auction: null,
    trade: null,
    debts: [],
    resumeAfterDebt: null,
    resumeAfterAuction: null,
    resumeAfterTrade: null,
    turnResumePhase: 'awaitingEndTurn',
    pendingTurnAdvance: false,
    winnerId: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

function must(ctx: Ctx, id: PlayerId): Player {
  const p = playerById(ctx.state, id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

function addCash(ctx: Ctx, id: PlayerId, delta: number, reason: string): void {
  if (delta === 0) return;
  must(ctx, id).cash += delta;
  ctx.events.push({ kind: 'cashChanged', playerId: id, delta, reason });
}

function creditTo(ctx: Ctx, creditorId: PlayerId | null, amount: number, toPot: boolean): void {
  if (amount <= 0) return;
  if (creditorId) {
    addCash(ctx, creditorId, amount, 'received');
    return;
  }
  if (toPot && ctx.state.options.jackpot) {
    ctx.state.pot += amount;
    ctx.events.push({ kind: 'potChanged', delta: amount, total: ctx.state.pot });
  }
  // Otherwise the money leaves play into the bank.
}

/**
 * Take money from a player. Returns false when they cannot cover it, in which
 * case a debt is queued and play moves to settlement.
 */
function charge(
  ctx: Ctx,
  debtorId: PlayerId,
  amount: number,
  creditorId: PlayerId | null,
  source: 'rent' | 'tax' | 'card' | 'fee',
  toPot: boolean,
): boolean {
  if (amount <= 0) return true;
  const debtor = must(ctx, debtorId);
  if (debtor.cash >= amount) {
    debtor.cash -= amount;
    ctx.events.push({ kind: 'cashChanged', playerId: debtorId, delta: -amount, reason: source });
    creditTo(ctx, creditorId, amount, toPot);
    return true;
  }
  if (!ctx.state.resumeAfterDebt) {
    ctx.state.resumeAfterDebt = { phase: ctx.state.turnResumePhase, move: null };
  }
  ctx.state.debts.push({ debtorId, creditorId, amount, source, toPot });
  ctx.state.phase = 'debtSettlement';
  ctx.events.push({ kind: 'debtRaised', debtorId, creditorId, amount });
  return false;
}

/* -------------------------------------------------------------------------- */
/* Movement                                                                   */
/* -------------------------------------------------------------------------- */

function paySalary(ctx: Ctx, player: Player): void {
  addCash(ctx, player.id, ctx.state.options.paydaySalary, 'payday');
  ctx.events.push({ kind: 'salaryPaid', playerId: player.id, amount: ctx.state.options.paydaySalary });
}

/** Move forward, paying the Month-End Payday salary on passing or landing on space 0. */
function moveForward(ctx: Ctx, player: Player, steps: number): void {
  const from = player.position;
  const raw = from + steps;
  const to = ((raw % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  const passedGo = steps > 0 && raw >= BOARD_SIZE;
  player.position = to;
  ctx.events.push({ kind: 'moved', playerId: player.id, from, to, passedGo });
  if (passedGo) paySalary(ctx, player);
}

/** Advance to a named tile, always clockwise, so rulebook 4A applies. */
function advanceTo(ctx: Ctx, player: Player, target: TileIndex): void {
  const steps = ((target - player.position + BOARD_SIZE) % BOARD_SIZE) || BOARD_SIZE;
  moveForward(ctx, player, steps);
}

function moveBack(ctx: Ctx, player: Player, spaces: number): void {
  const from = player.position;
  player.position = ((from - spaces) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE;
  ctx.events.push({ kind: 'moved', playerId: player.id, from, to: player.position, passedGo: false });
}

function sendToImpound(ctx: Ctx, player: Player, reason: 'tile' | 'card' | 'threeDoubles'): void {
  player.position = IMPOUND;
  player.inImpound = true;
  player.impoundAttempts = 0;
  ctx.state.doublesCount = 0;
  ctx.state.turnResumePhase = 'awaitingEndTurn';
  ctx.events.push({ kind: 'sentToImpound', playerId: player.id, reason });
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */

function drawCard(ctx: Ctx, player: Player, deck: DeckId): void {
  const deckState = ctx.state.decks[deck];
  const id = deckState.order.shift();
  if (id === undefined) return;
  const card = cardById(deck, id);
  if (!card.retained) deckState.order.push(id);
  ctx.events.push({
    kind: 'cardDrawn',
    playerId: player.id,
    deck,
    cardId: card.id,
    title: card.title,
    text: card.text,
  });
  applyCardEffect(ctx, player, card);
}

function applyCardEffect(ctx: Ctx, player: Player, card: Card): void {
  const effect: CardEffect = card.effect;
  const toPot = ctx.state.options.jackpot;
  switch (effect.type) {
    case 'collect':
      addCash(ctx, player.id, effect.amount, card.title);
      break;
    case 'pay':
      charge(ctx, player.id, effect.amount, null, 'card', toPot);
      break;
    case 'collectFromEach':
      for (const other of activePlayers(ctx.state)) {
        if (other.id === player.id) continue;
        charge(ctx, other.id, effect.amount, player.id, 'card', false);
      }
      break;
    case 'perBuilding': {
      const { vans, depots } = buildingsFor(ctx.state, player.id);
      const amount = vans * effect.perVan + depots * effect.perDepot;
      charge(ctx, player.id, amount, null, 'card', toPot);
      break;
    }
    case 'advance':
      advanceTo(ctx, player, effect.to);
      resolveTile(ctx, player, diceTotal(ctx.state), effect.doubleRent === true);
      break;
    case 'moveBack':
      moveBack(ctx, player, effect.spaces);
      resolveTile(ctx, player, diceTotal(ctx.state), false);
      break;
    case 'goToImpound':
      sendToImpound(ctx, player, 'card');
      break;
    case 'getOutCard':
      player.getOutCards.push({ deck: card.deck, cardId: card.id });
      break;
    case 'skipTurn':
      player.skipNextTurn = true;
      break;
    case 'suspendUtilities': {
      const until = ctx.state.turnNumber + activePlayers(ctx.state).length;
      ctx.state.utilitiesSuspendedUntilTurn = until;
      ctx.events.push({ kind: 'utilitiesSuspended', untilTurn: until });
      break;
    }
  }
}

function diceTotal(state: GameState): number {
  return state.lastRoll ? state.lastRoll[0] + state.lastRoll[1] : 0;
}

/* -------------------------------------------------------------------------- */
/* Tile resolution                                                            */
/* -------------------------------------------------------------------------- */

function collectPot(ctx: Ctx, player: Player): void {
  let seeded = false;
  if (ctx.state.pot === 0) {
    ctx.state.pot = 5_000;
    seeded = true;
  }
  const amount = ctx.state.pot;
  ctx.state.pot = 0;
  addCash(ctx, player.id, amount, 'rank queue jackpot');
  ctx.events.push({ kind: 'potCollected', playerId: player.id, amount, seeded });
}

function resolveTile(ctx: Ctx, player: Player, roll: number, forceDouble: boolean): void {
  const tile = tileAt(player.position);
  switch (tile.kind) {
    case 'go':
    case 'impound':
      break;
    case 'gotoimpound':
      sendToImpound(ctx, player, 'tile');
      break;
    case 'freerest':
      if (ctx.state.options.jackpot) collectPot(ctx, player);
      break;
    case 'card':
      drawCard(ctx, player, tile.deck);
      break;
    case 'tax':
      if (tile.allowPercent) {
        ctx.state.pendingTax = tile.index;
        ctx.state.phase = 'awaitingTaxChoice';
      } else {
        if (charge(ctx, player.id, tile.amount, null, 'tax', tile.toPot)) {
          ctx.events.push({
            kind: 'taxPaid',
            playerId: player.id,
            amount: tile.amount,
            option: 'flat',
            toPot: tile.toPot && ctx.state.options.jackpot,
          });
        }
      }
      break;
    case 'street':
    case 'hub':
    case 'utility': {
      const ts = tileState(ctx.state, tile.index);
      if (!ts.ownerId) {
        ctx.state.pendingBuy = tile.index;
        ctx.state.phase = 'awaitingBuyDecision';
        ctx.events.push({
          kind: 'propertyOffered',
          playerId: player.id,
          tileIndex: tile.index,
          price: tile.price,
        });
      } else if (ts.ownerId === player.id) {
        ctx.events.push({ kind: 'rentWaived', tileIndex: tile.index, reason: 'ownProperty' });
      } else {
        const r = rentFor(ctx.state, tile.index, roll, forceDouble);
        if (r.waived) {
          ctx.events.push({ kind: 'rentWaived', tileIndex: tile.index, reason: r.waived });
        } else if (r.amount > 0) {
          const ownerId = ts.ownerId;
          if (charge(ctx, player.id, r.amount, ownerId, 'rent', false)) {
            ctx.events.push({
              kind: 'rentPaid',
              fromId: player.id,
              toId: ownerId,
              tileIndex: tile.index,
              amount: r.amount,
              doubled: r.doubled,
            });
          }
        }
      }
      break;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Flow control                                                               */
/* -------------------------------------------------------------------------- */

function checkGameOver(ctx: Ctx): boolean {
  const active = activePlayers(ctx.state);
  if (active.length === 1 && active[0]) {
    ctx.state.winnerId = active[0].id;
    ctx.state.phase = 'gameOver';
    ctx.events.push({ kind: 'gameOver', winnerId: active[0].id });
    return true;
  }
  return false;
}

function advanceTurn(ctx: Ctx, depth = 0): void {
  const state = ctx.state;
  if (state.phase === 'gameOver' || depth > state.players.length + 1) return;
  const count = state.players.length;
  let guard = 0;
  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % count;
    guard += 1;
  } while (state.players[state.currentPlayerIndex]?.bankrupt && guard <= count);

  state.turnNumber += 1;
  state.doublesCount = 0;
  state.lastRoll = null;
  state.turnResumePhase = 'awaitingEndTurn';

  const player = currentPlayer(state);
  if (player.skipNextTurn) {
    player.skipNextTurn = false;
    ctx.events.push({ kind: 'turnSkipped', playerId: player.id, reason: 'municipalQueue' });
    advanceTurn(ctx, depth + 1);
    return;
  }
  state.phase = 'awaitingRoll';
  ctx.events.push({ kind: 'turnStarted', playerId: player.id, turnNumber: state.turnNumber });
}

/** Decide where play goes once debts, auctions and interruptions have cleared. */
function resumeFlow(ctx: Ctx): void {
  const state = ctx.state;
  if (state.phase === 'gameOver') return;
  if (state.debts.length > 0) {
    state.phase = 'debtSettlement';
    return;
  }
  if (state.auction) {
    state.phase = 'auction';
    return;
  }
  if (state.pendingTurnAdvance) {
    state.pendingTurnAdvance = false;
    state.resumeAfterDebt = null;
    state.resumeAfterAuction = null;
    advanceTurn(ctx);
    return;
  }
  const afterDebt = state.resumeAfterDebt;
  const afterAuction = state.resumeAfterAuction;
  state.resumeAfterDebt = null;
  state.resumeAfterAuction = null;

  if (afterDebt?.move != null) {
    const player = currentPlayer(state);
    state.phase = afterDebt.phase;
    moveForward(ctx, player, afterDebt.move);
    resolveTile(ctx, player, afterDebt.move, false);
    if (state.phase === afterDebt.phase && state.debts.length === 0 && !state.auction) {
      state.phase = state.turnResumePhase;
    }
    return;
  }
  state.phase = afterAuction ?? afterDebt?.phase ?? state.turnResumePhase;
}

/* -------------------------------------------------------------------------- */
/* Auctions                                                                   */
/* -------------------------------------------------------------------------- */

function startAuction(
  ctx: Ctx,
  tileIndex: TileIndex,
  reason: 'declined' | 'bankruptcy',
  queue: TileIndex[],
  resumePhase: Phase,
): void {
  const state = ctx.state;
  const order = seatOrderFromCurrent(state).filter((p) => !p.bankrupt);
  if (order.length === 0) {
    ctx.events.push({ kind: 'auctionUnsold', tileIndex });
    nextAuctionOrFinish(ctx, queue, resumePhase);
    return;
  }
  state.auction = {
    tileIndex,
    reason,
    currentBid: 0,
    highBidderId: null,
    activeIds: order.map((p) => p.id),
    turnIndex: 0,
    queue,
  };
  state.resumeAfterAuction = resumePhase;
  state.phase = 'auction';
  ctx.events.push({ kind: 'auctionStarted', tileIndex, reason });
}

function seatOrderFromCurrent(state: GameState): Player[] {
  const out: Player[] = [];
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[(state.currentPlayerIndex + i) % state.players.length];
    if (p) out.push(p);
  }
  return out;
}

function nextAuctionOrFinish(ctx: Ctx, queue: TileIndex[], resumePhase: Phase): void {
  ctx.state.auction = null;
  const next = queue.shift();
  if (next !== undefined) {
    startAuction(ctx, next, 'bankruptcy', queue, resumePhase);
    return;
  }
  ctx.state.resumeAfterAuction = resumePhase;
  resumeFlow(ctx);
}

function checkAuctionEnd(ctx: Ctx): void {
  const auction = ctx.state.auction;
  if (!auction) return;
  const { activeIds, highBidderId } = auction;
  const finished =
    activeIds.length === 0 ||
    (activeIds.length === 1 && highBidderId !== null && activeIds[0] === highBidderId);
  if (!finished) return;

  const resumePhase = ctx.state.resumeAfterAuction ?? ctx.state.turnResumePhase;
  const queue = auction.queue;
  if (highBidderId) {
    const winner = must(ctx, highBidderId);
    winner.cash -= auction.currentBid;
    ctx.events.push({
      kind: 'cashChanged',
      playerId: winner.id,
      delta: -auction.currentBid,
      reason: 'auction',
    });
    tileState(ctx.state, auction.tileIndex).ownerId = winner.id;
    ctx.events.push({
      kind: 'auctionWon',
      playerId: winner.id,
      tileIndex: auction.tileIndex,
      amount: auction.currentBid,
    });
  } else {
    ctx.events.push({ kind: 'auctionUnsold', tileIndex: auction.tileIndex });
  }
  nextAuctionOrFinish(ctx, queue, resumePhase);
}

/* -------------------------------------------------------------------------- */
/* Bankruptcy                                                                 */
/* -------------------------------------------------------------------------- */

function liquidateBuildings(ctx: Ctx, player: Player, refund: boolean): void {
  for (const index of ownedTiles(ctx.state, player.id)) {
    const tile = tileAt(index);
    if (tile.kind !== 'street') continue;
    const ts = tileState(ctx.state, index);
    if (ts.depot) {
      if (refund) addCash(ctx, player.id, Math.floor((tile.buildCost * 5) / 2), 'depot sold');
      ts.depot = false;
    }
    if (ts.vans > 0) {
      if (refund) addCash(ctx, player.id, Math.floor((ts.vans * tile.buildCost) / 2), 'vans sold');
      ts.vans = 0;
    }
  }
}

function goBankrupt(ctx: Ctx, debtorId: PlayerId, creditorId: PlayerId | null): void {
  const state = ctx.state;
  const debtor = must(ctx, debtorId);
  const wasCurrent = currentPlayer(state).id === debtorId;

  if (creditorId) {
    liquidateBuildings(ctx, debtor, true);
    const creditor = must(ctx, creditorId);
    const cash = debtor.cash;
    debtor.cash = 0;
    if (cash > 0) addCash(ctx, creditorId, cash, 'estate cash');

    const deeds = ownedTiles(state, debtorId);
    for (const index of deeds) {
      const ts = tileState(state, index);
      ts.ownerId = creditorId;
      if (ts.mortgaged) {
        const tile = tileAt(index);
        if (tile.kind === 'street' || tile.kind === 'hub' || tile.kind === 'utility') {
          const interest = Math.ceil(tile.mortgage * MORTGAGE_INTEREST);
          charge(ctx, creditorId, interest, null, 'fee', false);
        }
      }
    }
    creditor.getOutCards.push(...debtor.getOutCards);
    debtor.getOutCards = [];
    debtor.bankrupt = true;
    ctx.events.push({ kind: 'bankrupt', playerId: debtorId, creditorId });
  } else {
    liquidateBuildings(ctx, debtor, false);
    debtor.cash = 0;
    const deeds = ownedTiles(state, debtorId);
    for (const index of deeds) {
      const ts = tileState(state, index);
      ts.ownerId = null;
      ts.mortgaged = false;
    }
    debtor.getOutCards = [];
    debtor.bankrupt = true;
    ctx.events.push({ kind: 'bankrupt', playerId: debtorId, creditorId: null });

    if (wasCurrent) state.pendingTurnAdvance = true;
    if (!checkGameOver(ctx) && deeds.length > 0) {
      const queue = [...deeds];
      const first = queue.shift() as TileIndex;
      const resumePhase = state.resumeAfterAuction ?? state.turnResumePhase;
      startAuction(ctx, first, 'bankruptcy', queue, resumePhase);
      return;
    }
  }

  if (wasCurrent) state.pendingTurnAdvance = true;
  checkGameOver(ctx);
}

/* -------------------------------------------------------------------------- */
/* Building helpers                                                           */
/* -------------------------------------------------------------------------- */

function groupHasMortgage(state: GameState, group: ReturnType<typeof groupStreets>[number]['group']): boolean {
  return groupStreets(group).some((s) => state.tiles[s.index]?.mortgaged);
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

export function reduce(state: GameState, action: Action): ReduceResult {
  const draft: GameState = structuredClone(state);
  const ctx: Ctx = { state: draft, events: [] };
  const reject = (reason: string): ReduceResult => ({
    state,
    events: [{ kind: 'illegalAction', playerId: action.playerId, reason }],
  });

  const actor = playerById(draft, action.playerId);
  if (!actor) return reject('Unknown player');
  if (draft.phase === 'gameOver') return reject('The game is over');
  if (actor.bankrupt) return reject('Bankrupt operators cannot act');

  const isCurrent = currentPlayer(draft).id === action.playerId;
  const managementPhases: Phase[] = ['awaitingRoll', 'awaitingEndTurn'];

  switch (action.kind) {
    /* ---------------------------------------------------------------- roll */
    case 'rollDice': {
      if (!isCurrent) return reject('Not your turn');
      if (draft.phase !== 'awaitingRoll') return reject('You cannot roll right now');

      const d1 = nextInt(draft.rng, 1, 6);
      const d2 = nextInt(d1.state, 1, 6);
      draft.rng = d2.state;
      const dice: [number, number] = [d1.value, d2.value];
      const total = dice[0] + dice[1];
      const isDoubles = dice[0] === dice[1];
      draft.lastRoll = dice;
      ctx.events.push({ kind: 'diceRolled', playerId: actor.id, dice, isDoubles });

      if (actor.inImpound) {
        if (isDoubles) {
          actor.inImpound = false;
          actor.impoundAttempts = 0;
          ctx.events.push({ kind: 'impoundExit', playerId: actor.id, via: 'doubles' });
          draft.turnResumePhase = 'awaitingEndTurn';
          draft.phase = 'awaitingEndTurn';
          moveForward(ctx, actor, total);
          resolveTile(ctx, actor, total, false);
          if (draft.debts.length === 0 && !draft.auction && draft.phase === 'awaitingEndTurn') {
            draft.phase = draft.turnResumePhase;
          }
          break;
        }
        actor.impoundAttempts += 1;
        ctx.events.push({
          kind: 'impoundAttemptFailed',
          playerId: actor.id,
          attempts: actor.impoundAttempts,
        });
        if (actor.impoundAttempts >= 3) {
          draft.turnResumePhase = 'awaitingEndTurn';
          draft.resumeAfterDebt = { phase: 'awaitingEndTurn', move: total };
          const paid = charge(ctx, actor.id, draft.options.impoundFine, null, 'fee', false);
          if (!paid) break;
          draft.resumeAfterDebt = null;
          actor.inImpound = false;
          actor.impoundAttempts = 0;
          ctx.events.push({ kind: 'impoundExit', playerId: actor.id, via: 'forcedFine' });
          draft.phase = 'awaitingEndTurn';
          moveForward(ctx, actor, total);
          resolveTile(ctx, actor, total, false);
          if (draft.debts.length === 0 && !draft.auction && draft.phase === 'awaitingEndTurn') {
            draft.phase = draft.turnResumePhase;
          }
          break;
        }
        draft.phase = 'awaitingEndTurn';
        break;
      }

      if (isDoubles) {
        draft.doublesCount += 1;
        if (draft.doublesCount >= 3) {
          sendToImpound(ctx, actor, 'threeDoubles');
          draft.phase = 'awaitingEndTurn';
          break;
        }
      } else {
        draft.doublesCount = 0;
      }

      // On doubles the player rolls again immediately, so play returns to
      // awaitingRoll rather than waiting for an endTurn.
      draft.turnResumePhase = isDoubles ? 'awaitingRoll' : 'awaitingEndTurn';
      draft.phase = draft.turnResumePhase;
      moveForward(ctx, actor, total);
      resolveTile(ctx, actor, total, false);
      if (draft.debts.length === 0 && !draft.auction && draft.phase === draft.turnResumePhase) {
        draft.phase = draft.turnResumePhase;
      }
      break;
    }

    /* ------------------------------------------------------------ purchase */
    case 'buyProperty': {
      if (!isCurrent) return reject('Not your turn');
      if (draft.phase !== 'awaitingBuyDecision' || draft.pendingBuy === null) {
        return reject('Nothing is on offer');
      }
      const index = draft.pendingBuy;
      const tile = tileAt(index);
      if (tile.kind !== 'street' && tile.kind !== 'hub' && tile.kind !== 'utility') {
        return reject('That tile cannot be bought');
      }
      if (actor.cash < tile.price) return reject('Not enough cash. Decline and it goes to auction.');
      actor.cash -= tile.price;
      tileState(draft, index).ownerId = actor.id;
      draft.pendingBuy = null;
      ctx.events.push({ kind: 'cashChanged', playerId: actor.id, delta: -tile.price, reason: 'purchase' });
      ctx.events.push({ kind: 'propertyBought', playerId: actor.id, tileIndex: index, price: tile.price });
      draft.phase = draft.turnResumePhase;
      break;
    }

    case 'declineAndAuction': {
      if (!isCurrent) return reject('Not your turn');
      if (draft.phase !== 'awaitingBuyDecision' || draft.pendingBuy === null) {
        return reject('Nothing is on offer');
      }
      const index = draft.pendingBuy;
      draft.pendingBuy = null;
      startAuction(ctx, index, 'declined', [], draft.turnResumePhase);
      break;
    }

    /* ------------------------------------------------------------- auction */
    case 'placeBid': {
      const auction = draft.auction;
      if (draft.phase !== 'auction' || !auction) return reject('No auction is running');
      if (auction.activeIds[auction.turnIndex] !== actor.id) return reject('Not your bid');
      const floor = Math.max(draft.options.auctionFloor, auction.currentBid + 1);
      if (!Number.isInteger(action.amount) || action.amount < floor) {
        return reject(`Bid at least R${floor.toLocaleString('en-ZA')}`);
      }
      if (action.amount > actor.cash) return reject('You cannot bid more cash than you hold');
      auction.currentBid = action.amount;
      auction.highBidderId = actor.id;
      auction.turnIndex = (auction.turnIndex + 1) % auction.activeIds.length;
      ctx.events.push({ kind: 'bidPlaced', playerId: actor.id, amount: action.amount });
      checkAuctionEnd(ctx);
      break;
    }

    case 'passBid': {
      const auction = draft.auction;
      if (draft.phase !== 'auction' || !auction) return reject('No auction is running');
      const at = auction.activeIds.indexOf(actor.id);
      if (at === -1) return reject('You are out of this auction');
      if (auction.activeIds[auction.turnIndex] !== actor.id) return reject('Not your bid');
      auction.activeIds.splice(at, 1);
      if (auction.activeIds.length > 0 && auction.turnIndex >= auction.activeIds.length) {
        auction.turnIndex = 0;
      }
      ctx.events.push({ kind: 'bidPassed', playerId: actor.id });
      checkAuctionEnd(ctx);
      break;
    }

    /* ------------------------------------------------------------ building */
    case 'buyBuilding': {
      if (!isCurrent) return reject('Not your turn');
      if (!managementPhases.includes(draft.phase)) return reject('You cannot build right now');
      const tile = tileAt(action.tileIndex);
      if (tile.kind !== 'street') return reject('Only streets take vans and depots');
      const ts = tileState(draft, action.tileIndex);
      if (ts.ownerId !== actor.id) return reject('You do not own that street');
      if (!ownsWholeGroup(draft, actor.id, tile.group)) return reject('You need the whole colour set');
      if (groupHasMortgage(draft, tile.group)) return reject('Lift the mortgage on that set first');
      const level = buildLevel(ts);
      if (level >= 5) return reject('That street is fully developed');
      const levels = groupStreets(tile.group).map((s) => buildLevel(tileState(draft, s.index)));
      const min = Math.min(...levels);
      if (level !== min) return reject('Build evenly across the set');
      if (actor.cash < tile.buildCost) return reject('Not enough cash');

      if (level < 4) {
        if (vansOwned(draft) >= draft.options.maxVans) return reject('The bank has no Quantum vans left');
        ts.vans += 1;
        actor.cash -= tile.buildCost;
        ctx.events.push({ kind: 'cashChanged', playerId: actor.id, delta: -tile.buildCost, reason: 'van' });
        ctx.events.push({
          kind: 'buildingBought',
          playerId: actor.id,
          tileIndex: action.tileIndex,
          building: 'van',
          cost: tile.buildCost,
        });
      } else {
        if (depotsOwned(draft) >= draft.options.maxDepots) {
          return reject('The bank has no Terminal Depots left');
        }
        ts.vans = 0;
        ts.depot = true;
        actor.cash -= tile.buildCost;
        ctx.events.push({ kind: 'cashChanged', playerId: actor.id, delta: -tile.buildCost, reason: 'depot' });
        ctx.events.push({
          kind: 'buildingBought',
          playerId: actor.id,
          tileIndex: action.tileIndex,
          building: 'depot',
          cost: tile.buildCost,
        });
      }
      break;
    }

    case 'sellBuilding': {
      const settling = draft.phase === 'debtSettlement' && draft.debts[0]?.debtorId === actor.id;
      if (!settling && (!isCurrent || !managementPhases.includes(draft.phase))) {
        return reject('You cannot sell buildings right now');
      }
      const tile = tileAt(action.tileIndex);
      if (tile.kind !== 'street') return reject('Only streets carry vans and depots');
      const ts = tileState(draft, action.tileIndex);
      if (ts.ownerId !== actor.id) return reject('You do not own that street');
      const level = buildLevel(ts);
      if (level === 0) return reject('Nothing to sell there');
      const levels = groupStreets(tile.group).map((s) => buildLevel(tileState(draft, s.index)));
      const max = Math.max(...levels);
      if (level !== max) return reject('Sell evenly across the set');

      if (ts.depot) {
        if (vansOwned(draft) + 4 > draft.options.maxVans) {
          return reject('The bank cannot return four vans right now');
        }
        // The four vans traded in for the depot come back onto the street, so
        // only the depot's own cost is refunded, at half price.
        ts.depot = false;
        ts.vans = 4;
        const refund = Math.floor(tile.buildCost / 2);
        addCash(ctx, actor.id, refund, 'depot sold');
        ctx.events.push({
          kind: 'buildingSold',
          playerId: actor.id,
          tileIndex: action.tileIndex,
          building: 'depot',
          refund,
        });
      } else {
        ts.vans -= 1;
        const refund = Math.floor(tile.buildCost / 2);
        addCash(ctx, actor.id, refund, 'van sold');
        ctx.events.push({
          kind: 'buildingSold',
          playerId: actor.id,
          tileIndex: action.tileIndex,
          building: 'van',
          refund,
        });
      }
      break;
    }

    /* ----------------------------------------------------------- mortgages */
    case 'mortgage': {
      const settling = draft.phase === 'debtSettlement' && draft.debts[0]?.debtorId === actor.id;
      if (!settling && (!isCurrent || !managementPhases.includes(draft.phase))) {
        return reject('You cannot mortgage right now');
      }
      const tile = tileAt(action.tileIndex);
      if (tile.kind !== 'street' && tile.kind !== 'hub' && tile.kind !== 'utility') {
        return reject('That tile cannot be mortgaged');
      }
      const ts = tileState(draft, action.tileIndex);
      if (ts.ownerId !== actor.id) return reject('You do not own that property');
      if (ts.mortgaged) return reject('Already mortgaged');
      if (buildLevel(ts) > 0) return reject('Sell its buildings first');
      ts.mortgaged = true;
      addCash(ctx, actor.id, tile.mortgage, 'mortgage');
      ctx.events.push({
        kind: 'mortgaged',
        playerId: actor.id,
        tileIndex: action.tileIndex,
        amount: tile.mortgage,
      });
      break;
    }

    case 'unmortgage': {
      if (!isCurrent || !managementPhases.includes(draft.phase)) {
        return reject('You cannot lift a mortgage right now');
      }
      const tile = tileAt(action.tileIndex);
      if (tile.kind !== 'street' && tile.kind !== 'hub' && tile.kind !== 'utility') {
        return reject('That tile cannot be mortgaged');
      }
      const ts = tileState(draft, action.tileIndex);
      if (ts.ownerId !== actor.id) return reject('You do not own that property');
      if (!ts.mortgaged) return reject('That property is not mortgaged');
      const cost = tile.mortgage + Math.ceil(tile.mortgage * MORTGAGE_INTEREST);
      if (actor.cash < cost) return reject('Not enough cash to lift the mortgage');
      actor.cash -= cost;
      ts.mortgaged = false;
      ctx.events.push({ kind: 'cashChanged', playerId: actor.id, delta: -cost, reason: 'unmortgage' });
      ctx.events.push({ kind: 'unmortgaged', playerId: actor.id, tileIndex: action.tileIndex, cost });
      break;
    }

    /* -------------------------------------------------------------- trades */
    case 'proposeTrade': {
      if (!isCurrent) return reject('Only the operator whose turn it is may propose');
      if (!managementPhases.includes(draft.phase)) return reject('You cannot trade right now');
      const problem = validateTrade(draft, action.offer, actor.id);
      if (problem) return reject(problem);
      draft.resumeAfterTrade = draft.phase;
      draft.trade = action.offer;
      draft.phase = 'tradeReview';
      ctx.events.push({ kind: 'tradeProposed', offer: action.offer });
      break;
    }

    case 'acceptTrade': {
      const offer = draft.trade;
      if (draft.phase !== 'tradeReview' || !offer) return reject('No trade is on the table');
      if (offer.toId !== actor.id) return reject('That offer is not addressed to you');
      const problem = validateTrade(draft, offer, offer.fromId);
      if (problem) {
        draft.trade = null;
        draft.phase = draft.resumeAfterTrade ?? 'awaitingEndTurn';
        draft.resumeAfterTrade = null;
        return reject(problem);
      }
      executeTrade(ctx, offer);
      draft.trade = null;
      draft.phase = draft.resumeAfterTrade ?? 'awaitingEndTurn';
      draft.resumeAfterTrade = null;
      ctx.events.push({ kind: 'tradeAccepted', offer });
      break;
    }

    case 'declineTrade': {
      const offer = draft.trade;
      if (draft.phase !== 'tradeReview' || !offer) return reject('No trade is on the table');
      if (offer.toId !== actor.id && offer.fromId !== actor.id) return reject('Not your trade');
      draft.trade = null;
      draft.phase = draft.resumeAfterTrade ?? 'awaitingEndTurn';
      draft.resumeAfterTrade = null;
      ctx.events.push({ kind: 'tradeDeclined', offer });
      break;
    }

    /* ------------------------------------------------------------- impound */
    case 'payImpoundFine': {
      if (!isCurrent) return reject('Not your turn');
      if (draft.phase !== 'awaitingRoll') return reject('Pay before you roll');
      if (!actor.inImpound) return reject('You are not detained');
      if (actor.cash < draft.options.impoundFine) return reject('Not enough cash for the fine');
      actor.cash -= draft.options.impoundFine;
      actor.inImpound = false;
      actor.impoundAttempts = 0;
      ctx.events.push({
        kind: 'cashChanged',
        playerId: actor.id,
        delta: -draft.options.impoundFine,
        reason: 'impound fine',
      });
      creditTo(ctx, null, draft.options.impoundFine, false);
      ctx.events.push({ kind: 'impoundExit', playerId: actor.id, via: 'fine' });
      break;
    }

    case 'useImpoundCard': {
      if (!isCurrent) return reject('Not your turn');
      if (draft.phase !== 'awaitingRoll') return reject('Use the card before you roll');
      if (!actor.inImpound) return reject('You are not detained');
      const held = actor.getOutCards.shift();
      if (!held) return reject('You hold no Get Out of Impound card');
      draft.decks[held.deck].order.push(held.cardId);
      actor.inImpound = false;
      actor.impoundAttempts = 0;
      ctx.events.push({ kind: 'impoundExit', playerId: actor.id, via: 'card' });
      break;
    }

    /* ----------------------------------------------------------------- tax */
    case 'chooseTaxOption': {
      if (!isCurrent) return reject('Not your turn');
      if (draft.phase !== 'awaitingTaxChoice' || draft.pendingTax === null) {
        return reject('No tax is due');
      }
      const tile = tileAt(draft.pendingTax);
      if (tile.kind !== 'tax') return reject('No tax is due');
      const amount =
        action.option === 'flat' ? tile.amount : Math.ceil(netWorth(draft, actor.id) * 0.1);
      draft.pendingTax = null;
      draft.phase = draft.turnResumePhase;
      if (charge(ctx, actor.id, amount, null, 'tax', tile.toPot)) {
        ctx.events.push({
          kind: 'taxPaid',
          playerId: actor.id,
          amount,
          option: action.option,
          toPot: tile.toPot && draft.options.jackpot,
        });
      }
      break;
    }

    /* ----------------------------------------------------------- debt      */
    case 'settleDebt': {
      const debt = draft.debts[0];
      if (draft.phase !== 'debtSettlement' || !debt) return reject('Nothing to settle');
      if (debt.debtorId !== actor.id) return reject('That debt is not yours');
      if (actor.cash < debt.amount) return reject('Raise more cash first');
      actor.cash -= debt.amount;
      ctx.events.push({ kind: 'cashChanged', playerId: actor.id, delta: -debt.amount, reason: debt.source });
      creditTo(ctx, debt.creditorId, debt.amount, debt.toPot);
      ctx.events.push({
        kind: 'debtSettled',
        debtorId: debt.debtorId,
        creditorId: debt.creditorId,
        amount: debt.amount,
      });
      draft.debts.shift();
      resumeFlow(ctx);
      break;
    }

    case 'declareBankruptcy': {
      const debt = draft.debts[0];
      if (draft.phase !== 'debtSettlement' || !debt) return reject('You have no debt to default on');
      if (debt.debtorId !== actor.id) return reject('That debt is not yours');
      const raisable = maxRaisable(draft, actor.id);
      if (raisable >= debt.amount) return reject('You can still raise the money. Sell or mortgage.');
      draft.debts.shift();
      goBankrupt(ctx, actor.id, debt.creditorId);
      if ((draft.phase as Phase) !== 'gameOver') resumeFlow(ctx);
      break;
    }

    /* ------------------------------------------------------------ end turn */
    case 'endTurn': {
      if (!isCurrent) return reject('Not your turn');
      if (draft.phase === 'awaitingRoll') return reject('Roll first');
      if (draft.phase !== 'awaitingEndTurn') return reject('Finish what is in front of you first');
      advanceTurn(ctx);
      break;
    }

    default:
      return reject('Unknown action');
  }

  draft.revision = state.revision + 1;
  return { state: draft, events: ctx.events };
}

/* -------------------------------------------------------------------------- */
/* Trade helpers                                                              */
/* -------------------------------------------------------------------------- */

function validateTrade(state: GameState, offer: TradeOffer, expectedFrom: PlayerId): string | null {
  if (offer.fromId !== expectedFrom) return 'That offer is not yours to make';
  if (offer.fromId === offer.toId) return 'You cannot trade with yourself';
  const from = state.players.find((p) => p.id === offer.fromId);
  const to = state.players.find((p) => p.id === offer.toId);
  if (!from || !to) return 'Unknown operator';
  if (from.bankrupt || to.bankrupt) return 'That operator is out of the game';
  if (offer.fromCash < 0 || offer.toCash < 0) return 'Cash cannot be negative';
  if (from.cash < offer.fromCash) return 'You do not hold that much cash';
  if (to.cash < offer.toCash) return 'They do not hold that much cash';
  if (offer.fromGetOutCards > from.getOutCards.length) return 'You do not hold that many cards';
  if (offer.toGetOutCards > to.getOutCards.length) return 'They do not hold that many cards';

  const check = (tiles: TileIndex[], ownerId: PlayerId, who: string): string | null => {
    for (const index of tiles) {
      const tile = tileAt(index);
      if (tile.kind !== 'street' && tile.kind !== 'hub' && tile.kind !== 'utility') {
        return 'That tile cannot be traded';
      }
      const ts = state.tiles[index];
      if (!ts || ts.ownerId !== ownerId) return `${who} does not own ${tile.name}`;
      if (tile.kind === 'street') {
        const developed = groupStreets(tile.group).some((s) => {
          const st = state.tiles[s.index];
          return !!st && (st.vans > 0 || st.depot);
        });
        if (developed) return `Sell the buildings on the ${tile.group} set before trading it`;
      }
    }
    return null;
  };
  return check(offer.fromTiles, offer.fromId, 'You') ?? check(offer.toTiles, offer.toId, 'They');
}

function executeTrade(ctx: Ctx, offer: TradeOffer): void {
  const from = must(ctx, offer.fromId);
  const to = must(ctx, offer.toId);

  from.cash -= offer.fromCash;
  to.cash += offer.fromCash;
  to.cash -= offer.toCash;
  from.cash += offer.toCash;

  for (const index of offer.fromTiles) {
    tileState(ctx.state, index).ownerId = offer.toId;
    chargeMortgageInterest(ctx, index, offer.toId);
  }
  for (const index of offer.toTiles) {
    tileState(ctx.state, index).ownerId = offer.fromId;
    chargeMortgageInterest(ctx, index, offer.fromId);
  }
  for (let i = 0; i < offer.fromGetOutCards; i++) {
    const card = from.getOutCards.shift();
    if (card) to.getOutCards.push(card);
  }
  for (let i = 0; i < offer.toGetOutCards; i++) {
    const card = to.getOutCards.shift();
    if (card) from.getOutCards.push(card);
  }
}

function chargeMortgageInterest(ctx: Ctx, index: TileIndex, newOwnerId: PlayerId): void {
  const ts = tileState(ctx.state, index);
  if (!ts.mortgaged) return;
  const tile = tileAt(index);
  if (tile.kind !== 'street' && tile.kind !== 'hub' && tile.kind !== 'utility') return;
  charge(ctx, newOwnerId, Math.ceil(tile.mortgage * MORTGAGE_INTEREST), null, 'fee', false);
}
