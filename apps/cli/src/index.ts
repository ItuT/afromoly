/**
 * Afromoly hot-seat: a whole game of Johannesburg Edition around one terminal.
 *
 * Everything here is presentation. The rules live in @afromoly/engine and are
 * reached only through reduce(), exactly as the server will reach them.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv } from 'node:process';
import {
  BOARD,
  TOKENS,
  createGame,
  legalActions,
  netWorth,
  reduce,
  tileAt,
  type Action,
  type GameState,
  type PlayerSetup,
  type TradeOffer,
} from '@afromoly/engine';
import { colour as C, rand, renderBoard, renderHoldings, renderPlayers } from './render.js';
import { narrate } from './narrate.js';

const HELP = `
${C.bold}Commands${C.reset}
  roll                    roll the dice
  buy                     buy the property you are standing on
  pass                    decline it and send it to auction
  bid <amount>            bid in the running auction
  fold                    drop out of the auction
  build <tile>            add a Quantum van, or upgrade four vans to a depot
  sell <tile>             sell a van or depot back at half price
  mortgage <tile>         mortgage a deed for half its price
  unmortgage <tile>       lift a mortgage, plus ten percent
  fine                    pay the R5,000 impound fine
  exitcard                play a Get Out of JMPD Impound Free card
  tax flat|percent        choose how to pay SARS Road Tax
  settle                  pay off the debt in front of you
  bankrupt                declare bankruptcy
  offer <player> give:<tiles> get:<tiles> pay:<n> want:<n>
                          propose a trade, e.g. offer 2 give:39 get:1,3 want:20000
  accept | decline        answer a trade offer
  end                     end your turn
  board | me | deeds <n> | worth | help | quit
`;

function parseTiles(part: string | undefined, prefix: string): number[] {
  if (!part || !part.startsWith(prefix)) return [];
  const body = part.slice(prefix.length);
  if (!body) return [];
  return body.split(',').map((n) => Number.parseInt(n, 10)).filter((n) => Number.isInteger(n));
}

function parseNumber(parts: string[], prefix: string): number {
  const found = parts.find((p) => p.startsWith(prefix));
  if (!found) return 0;
  const value = Number.parseInt(found.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : 0;
}

/** Translate a typed line into an engine action, or a local command. */
function toAction(state: GameState, playerId: string, line: string): Action | 'local' | null {
  const parts = line.trim().split(/\s+/);
  const verb = (parts[0] ?? '').toLowerCase();
  const arg = Number.parseInt(parts[1] ?? '', 10);

  switch (verb) {
    case 'roll': return { kind: 'rollDice', playerId };
    case 'buy': return { kind: 'buyProperty', playerId };
    case 'pass': return { kind: 'declineAndAuction', playerId };
    case 'bid': return { kind: 'placeBid', playerId, amount: arg };
    case 'fold': return { kind: 'passBid', playerId };
    case 'build': return { kind: 'buyBuilding', playerId, tileIndex: arg };
    case 'sell': return { kind: 'sellBuilding', playerId, tileIndex: arg };
    case 'mortgage': return { kind: 'mortgage', playerId, tileIndex: arg };
    case 'unmortgage': return { kind: 'unmortgage', playerId, tileIndex: arg };
    case 'fine': return { kind: 'payImpoundFine', playerId };
    case 'exitcard': return { kind: 'useImpoundCard', playerId };
    case 'settle': return { kind: 'settleDebt', playerId };
    case 'bankrupt': return { kind: 'declareBankruptcy', playerId };
    case 'accept': return { kind: 'acceptTrade', playerId };
    case 'decline': return { kind: 'declineTrade', playerId };
    case 'end': return { kind: 'endTurn', playerId };
    case 'tax':
      return {
        kind: 'chooseTaxOption',
        playerId,
        option: (parts[1] ?? 'flat').toLowerCase() === 'percent' ? 'percent' : 'flat',
      };
    case 'offer': {
      const target = state.players[arg - 1];
      if (!target) return null;
      const offer: TradeOffer = {
        fromId: playerId,
        toId: target.id,
        fromTiles: parseTiles(parts.find((p) => p.startsWith('give:')), 'give:'),
        toTiles: parseTiles(parts.find((p) => p.startsWith('get:')), 'get:'),
        fromCash: parseNumber(parts, 'pay:'),
        toCash: parseNumber(parts, 'want:'),
        fromGetOutCards: 0,
        toGetOutCards: 0,
      };
      return { kind: 'proposeTrade', playerId, offer };
    }
    default:
      return 'local';
  }
}

/** Whoever the game is waiting on right now. */
function waitingOn(state: GameState): { id: string; name: string; prompt: string } {
  if (state.phase === 'auction' && state.auction) {
    const id = state.auction.activeIds[state.auction.turnIndex] ?? state.players[0]?.id ?? '';
    const p = state.players.find((x) => x.id === id);
    return { id, name: p?.name ?? id, prompt: `bid (currently ${rand(state.auction.currentBid)})` };
  }
  if (state.phase === 'tradeReview' && state.trade) {
    const p = state.players.find((x) => x.id === state.trade?.toId);
    return { id: state.trade.toId, name: p?.name ?? '', prompt: 'accept or decline' };
  }
  if (state.phase === 'debtSettlement' && state.debts[0]) {
    const debt = state.debts[0];
    const p = state.players.find((x) => x.id === debt.debtorId);
    return { id: debt.debtorId, name: p?.name ?? '', prompt: `settle ${rand(debt.amount)}` };
  }
  const current = state.players[state.currentPlayerIndex];
  const prompt =
    state.phase === 'awaitingRoll' ? (current?.inImpound ? 'impounded' : 'roll')
      : state.phase === 'awaitingBuyDecision' ? 'buy or pass'
        : state.phase === 'awaitingTaxChoice' ? 'tax flat or percent'
          : 'your move';
  return { id: current?.id ?? '', name: current?.name ?? '', prompt };
}

function describeOffer(state: GameState, offer: TradeOffer): string {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const list = (tiles: number[]) => (tiles.length ? tiles.map((t) => tileAt(t).name).join(', ') : 'nothing');
  return [
    `${name(offer.fromId)} gives: ${list(offer.fromTiles)}${offer.fromCash ? ` plus ${rand(offer.fromCash)}` : ''}`,
    `${name(offer.toId)} gives: ${list(offer.toTiles)}${offer.toCash ? ` plus ${rand(offer.toCash)}` : ''}`,
  ].join('\n');
}

async function main(): Promise<void> {
  // A plain line iterator rather than readline's question(), so a piped script
  // and a human at a terminal behave identically.
  const rl = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
  const lines = rl[Symbol.asyncIterator]();
  const say = (s: string) => stdout.write(`${s}\n`);
  const ask = async (prompt: string): Promise<string | null> => {
    stdout.write(prompt);
    const next = await lines.next();
    if (next.done) {
      stdout.write('\n');
      return null;
    }
    const text = String(next.value);
    if (!stdin.isTTY) stdout.write(`${text}\n`);
    return text;
  };

  say(`\n${C.bold}${C.ochre}AFROMOLY: THE JOHANNESBURG EDITION${C.reset}`);
  say(`${C.dim}Hot-seat prototype. The rules engine is authoritative.${C.reset}\n`);

  const seatArg = argv.find((a) => a.startsWith('--players='));
  const count = seatArg
    ? Number.parseInt(seatArg.split('=')[1] ?? '2', 10)
    : Number.parseInt((await ask('How many operators (2-6)? ')) || '2', 10);
  if (!Number.isInteger(count) || count < 2 || count > 6) {
    say('Afromoly seats two to six operators.');
    rl.close();
    return;
  }

  const seats: PlayerSetup[] = [];
  const defaults = ['Thabo', 'Naledi', 'Sipho', 'Zanele', 'Kagiso', 'Lerato'];
  for (let i = 0; i < count; i++) {
    const fallback = defaults[i] ?? `Operator ${i + 1}`;
    const name = seatArg ? fallback : (await ask(`Name for operator ${i + 1} [${fallback}]: `)) || fallback;
    seats.push({ id: `p${i + 1}`, name, token: TOKENS[i] ?? 'quantum' });
  }

  const seed = argv.find((a) => a.startsWith('--seed='))?.split('=')[1] ?? `jozi-${Date.now()}`;
  let state = createGame(seats, seed);
  say(`\n${C.dim}Seed ${seed}. Type help for commands.${C.reset}`);
  say(renderBoard(state));
  say('');
  say(renderPlayers(state));

  while (state.phase !== 'gameOver') {
    const turn = waitingOn(state);
    const legal = legalActions(state, turn.id);
    say(`\n${C.dim}Legal now: ${legal.map((a) => a.kind).join(', ') || 'nothing'}${C.reset}`);
    if (state.phase === 'tradeReview' && state.trade) say(describeOffer(state, state.trade));

    const line = await ask(`${C.ochre}${turn.name} (${turn.prompt}) > ${C.reset}`);
    if (line === null) break;
    const verb = line.trim().split(/\s+/)[0]?.toLowerCase() ?? '';

    if (verb === 'quit') break;
    if (verb === 'help' || verb === '') { say(HELP); continue; }
    if (verb === 'board') { say(renderBoard(state)); say(''); say(renderPlayers(state)); continue; }
    if (verb === 'me') { say(renderHoldings(state, turn.id)); continue; }
    if (verb === 'worth') {
      for (const p of state.players) say(`  ${p.name}: ${rand(netWorth(state, p.id))}`);
      continue;
    }
    if (verb === 'deeds') {
      const n = Number.parseInt(line.trim().split(/\s+/)[1] ?? '', 10);
      const tile = BOARD[n];
      if (!tile) { say('No such tile.'); continue; }
      say(`  ${tile.name} (${tile.kind})`);
      if (tile.kind === 'street') {
        say(`  Price ${rand(tile.price)}, build ${rand(tile.buildCost)}, mortgage ${rand(tile.mortgage)}`);
        say(`  Rent ladder: ${tile.rent.map(rand).join(' / ')}`);
      }
      continue;
    }

    const action = toAction(state, turn.id, line);
    if (action === null) { say('I could not read that. Type help.'); continue; }
    if (action === 'local') { say('Unknown command. Type help.'); continue; }

    const result = reduce(state, action);
    state = result.state;
    for (const event of result.events) {
      const text = narrate(state, event);
      if (text) say(`  ${text}`);
    }
    if (result.events.some((e) => ['moved', 'bankrupt', 'auctionWon', 'propertyBought'].includes(e.kind))) {
      say('');
      say(renderPlayers(state));
    }
  }

  if (state.winnerId) {
    say(`\n${C.bold}Final standings${C.reset}`);
    for (const p of state.players) say(`  ${p.name}: ${rand(netWorth(state, p.id))}${p.bankrupt ? ' (out)' : ''}`);
  }
  rl.close();
}

main().catch((error: unknown) => {
  stdout.write(`${String(error)}\n`);
  process.exitCode = 1;
});
