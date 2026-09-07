'use client';

import { useMemo, useState } from 'react';
import { BOARD, tileAt, type Action, type ObservableState, type TradeOffer } from '@afromoly/engine';
import { rand } from '@/lib/display';

interface Props {
  state: ObservableState;
  waitingOn: string;
  legal: Action[];
  dispatch: (action: Action) => void;
  restart: () => void;
  /**
   * Online only: the name of whoever the table is waiting on when it is not
   * this player. Hot seat leaves it undefined, because every seat is here.
   */
  waitingLabel?: string | null;
}

function promptFor(state: ObservableState, waitingOn: string): { title: string; detail: string } {
  const name = state.players.find((p) => p.id === waitingOn)?.name ?? '';
  switch (state.phase) {
    case 'awaitingRoll': {
      const player = state.players.find((p) => p.id === waitingOn);
      return player?.inImpound
        ? { title: `${name} is impounded`, detail: 'Pay the fine, play a card, or roll for doubles.' }
        : { title: `${name} to roll`, detail: 'Roll the dice, or manage your fleet first.' };
    }
    case 'awaitingBuyDecision': {
      const index = state.pendingBuy;
      const tile = index === null ? null : tileAt(index);
      const price = tile && 'price' in tile ? rand(tile.price) : '';
      return {
        title: `${tile?.name ?? 'Property'} is unclaimed`,
        detail: `${name} may buy it for ${price}, or decline and send it to auction.`,
      };
    }
    case 'awaitingTaxChoice':
      return { title: 'SARS Road Tax', detail: `${name} pays a flat R20,000 or ten percent of net worth.` };
    case 'auction': {
      const a = state.auction;
      return {
        title: `Auction: ${a ? tileAt(a.tileIndex).name : ''}`,
        detail: a?.highBidderId
          ? `${name} to bid. Standing bid ${rand(a.currentBid)}.`
          : `${name} to open the bidding at R500 or more.`,
      };
    }
    case 'tradeReview':
      return { title: 'Offer on the table', detail: `${name} must accept or decline.` };
    case 'debtSettlement': {
      const debt = state.debts[0];
      const to = debt?.creditorId
        ? state.players.find((p) => p.id === debt.creditorId)?.name ?? 'a rival'
        : 'the bank';
      return {
        title: `${name} owes ${rand(debt?.amount ?? 0)}`,
        detail: `Payable to ${to}. Sell buildings or mortgage deeds to raise it.`,
      };
    }
    case 'gameOver': {
      const winner = state.players.find((p) => p.id === state.winnerId)?.name ?? '';
      return { title: `${winner} takes Gauteng`, detail: 'Undisputed Transit Tycoon.' };
    }
    default:
      return { title: `${name} to act`, detail: '' };
  }
}

export function Actions({ state, waitingOn, legal, dispatch, restart, waitingLabel }: Props) {
  const prompt = promptFor(state, waitingOn);
  const has = (kind: Action['kind']) => legal.some((a) => a.kind === kind);
  const auction = state.auction;
  const minBid = auction ? Math.max(state.options.auctionFloor, auction.currentBid + 1) : 0;
  const [bid, setBid] = useState<number | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);

  const buildable = useMemo(
    () => legal.filter((a) => a.kind === 'buyBuilding') as Extract<Action, { kind: 'buyBuilding' }>[],
    [legal],
  );
  const sellable = useMemo(
    () => legal.filter((a) => a.kind === 'sellBuilding') as Extract<Action, { kind: 'sellBuilding' }>[],
    [legal],
  );
  const mortgageable = useMemo(
    () => legal.filter((a) => a.kind === 'mortgage') as Extract<Action, { kind: 'mortgage' }>[],
    [legal],
  );
  const liftable = useMemo(
    () => legal.filter((a) => a.kind === 'unmortgage') as Extract<Action, { kind: 'unmortgage' }>[],
    [legal],
  );

  if (state.phase === 'gameOver') {
    return (
      <div className="panel">
        <h2>Result</h2>
        <div className="prompt"><strong>{prompt.title}</strong>{prompt.detail}</div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="primary" onClick={restart}>Play again</button>
        </div>
      </div>
    );
  }

  if (waitingLabel) {
    return (
      <div className="panel">
        <h2>Your move</h2>
        <div className="prompt">
          <strong>Waiting on {waitingLabel}</strong>
          Nothing for you to do until they finish.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Your move</h2>
      <div className="prompt"><strong>{prompt.title}</strong>{prompt.detail}</div>

      <div className="actions" style={{ marginTop: 12 }}>
        {has('payImpoundFine') && (
          <button onClick={() => dispatch({ kind: 'payImpoundFine', playerId: waitingOn })}>
            Pay {rand(state.options.impoundFine)} fine
          </button>
        )}
        {has('useImpoundCard') && (
          <button onClick={() => dispatch({ kind: 'useImpoundCard', playerId: waitingOn })}>
            Play exit card
          </button>
        )}
        {has('rollDice') && (
          <button className="primary" onClick={() => dispatch({ kind: 'rollDice', playerId: waitingOn })}>
            Roll the dice
          </button>
        )}
        {has('buyProperty') && (
          <button className="primary" onClick={() => dispatch({ kind: 'buyProperty', playerId: waitingOn })}>
            Buy it
          </button>
        )}
        {has('declineAndAuction') && (
          <button onClick={() => dispatch({ kind: 'declineAndAuction', playerId: waitingOn })}>
            Decline, send to auction
          </button>
        )}
        {has('chooseTaxOption') && (
          <>
            <button onClick={() => dispatch({ kind: 'chooseTaxOption', playerId: waitingOn, option: 'flat' })}>
              Pay flat R20,000
            </button>
            <button onClick={() => dispatch({ kind: 'chooseTaxOption', playerId: waitingOn, option: 'percent' })}>
              Pay ten percent
            </button>
          </>
        )}
        {has('settleDebt') && (
          <button className="primary" onClick={() => dispatch({ kind: 'settleDebt', playerId: waitingOn })}>
            Settle {rand(state.debts[0]?.amount ?? 0)}
          </button>
        )}
        {has('declareBankruptcy') && (
          <button className="danger" onClick={() => dispatch({ kind: 'declareBankruptcy', playerId: waitingOn })}>
            Declare bankruptcy
          </button>
        )}
        {has('acceptTrade') && (
          <button className="primary" onClick={() => dispatch({ kind: 'acceptTrade', playerId: waitingOn })}>
            Accept the deal
          </button>
        )}
        {has('declineTrade') && (
          <button onClick={() => dispatch({ kind: 'declineTrade', playerId: waitingOn })}>Decline</button>
        )}
        {has('endTurn') && (
          <button className="primary" onClick={() => dispatch({ kind: 'endTurn', playerId: waitingOn })}>
            End turn
          </button>
        )}
      </div>

      {state.phase === 'auction' && auction && (
        <div style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="bid">Your bid, minimum {rand(minBid)}</label>
            <input
              id="bid"
              className="mono"
              type="number"
              min={minBid}
              step={500}
              value={bid ?? minBid}
              onChange={(e) => setBid(Number.parseInt(e.target.value, 10) || minBid)}
            />
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button
              className="primary"
              disabled={!has('placeBid')}
              onClick={() => {
                dispatch({ kind: 'placeBid', playerId: waitingOn, amount: bid ?? minBid });
                setBid(null);
              }}
            >
              Bid
            </button>
            <button onClick={() => { setBid(null); dispatch({ kind: 'passBid', playerId: waitingOn }); }}>
              Pass
            </button>
          </div>
        </div>
      )}

      {(buildable.length > 0 || sellable.length > 0 || mortgageable.length > 0 || liftable.length > 0) && (
        <div style={{ marginTop: 16 }}>
          <h2>Fleet and finance</h2>
          <div className="actions">
            {buildable.map((a) => (
              <button key={`b${a.tileIndex}`} onClick={() => dispatch(a)}>
                Build on {tileAt(a.tileIndex).name}
              </button>
            ))}
            {sellable.map((a) => (
              <button key={`s${a.tileIndex}`} onClick={() => dispatch(a)}>
                Sell at {tileAt(a.tileIndex).name}
              </button>
            ))}
            {liftable.map((a) => (
              <button key={`u${a.tileIndex}`} onClick={() => dispatch(a)}>
                Lift {tileAt(a.tileIndex).name}
              </button>
            ))}
            {mortgageable.map((a) => (
              <button key={`m${a.tileIndex}`} onClick={() => dispatch(a)}>
                Mortgage {tileAt(a.tileIndex).name}
              </button>
            ))}
          </div>
        </div>
      )}

      {legal.some((a) => a.kind === 'rollDice' || a.kind === 'endTurn') && (
        <div style={{ marginTop: 16 }}>
          <button onClick={() => setTradeOpen((v) => !v)}>
            {tradeOpen ? 'Close deal maker' : 'Open deal maker'}
          </button>
          {tradeOpen && (
            <TradeBuilder
              state={state}
              fromId={waitingOn}
              onPropose={(offer) => {
                dispatch({ kind: 'proposeTrade', playerId: waitingOn, offer });
                setTradeOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TradeBuilder({
  state,
  fromId,
  onPropose,
}: {
  state: ObservableState;
  fromId: string;
  onPropose: (offer: TradeOffer) => void;
}) {
  const others = state.players.filter((p) => p.id !== fromId && !p.bankrupt);
  const [toId, setToId] = useState(others[0]?.id ?? '');
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [pay, setPay] = useState(0);
  const [want, setWant] = useState(0);

  const mine = BOARD.filter((t) => state.tiles[t.index]?.ownerId === fromId);
  const theirs = BOARD.filter((t) => state.tiles[t.index]?.ownerId === toId);
  const toggle = (list: number[], set: (v: number[]) => void, index: number) =>
    set(list.includes(index) ? list.filter((i) => i !== index) : [...list, index]);

  if (others.length === 0) return null;

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="field">
        <label htmlFor="partner">Deal with</label>
        <select id="partner" value={toId} onChange={(e) => setToId(e.target.value)}>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <TileChecklist label="You give" tiles={mine} chosen={give} onToggle={(i) => toggle(give, setGive, i)} />
      <TileChecklist label="You get" tiles={theirs} chosen={get} onToggle={(i) => toggle(get, setGet, i)} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="field">
          <label htmlFor="pay">You pay</label>
          <input id="pay" className="mono" type="number" min={0} step={1000} value={pay}
            onChange={(e) => setPay(Number.parseInt(e.target.value, 10) || 0)} />
        </div>
        <div className="field">
          <label htmlFor="want">They pay</label>
          <input id="want" className="mono" type="number" min={0} step={1000} value={want}
            onChange={(e) => setWant(Number.parseInt(e.target.value, 10) || 0)} />
        </div>
      </div>

      <button
        className="primary"
        onClick={() =>
          onPropose({
            fromId,
            toId,
            fromTiles: give,
            toTiles: get,
            fromCash: pay,
            toCash: want,
            fromGetOutCards: 0,
            toGetOutCards: 0,
          })
        }
      >
        Put it to them
      </button>
    </div>
  );
}

function TileChecklist({
  label,
  tiles,
  chosen,
  onToggle,
}: {
  label: string;
  tiles: typeof BOARD;
  chosen: number[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {tiles.length === 0 && <span className="faint" style={{ fontSize: 12 }}>Nothing to offer.</span>}
        {tiles.map((tile) => (
          <button
            key={tile.index}
            onClick={() => onToggle(tile.index)}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              borderColor: chosen.includes(tile.index) ? 'var(--ochre)' : 'var(--rule)',
              color: chosen.includes(tile.index) ? 'var(--ochre)' : 'var(--muted)',
            }}
          >
            {tile.name}
          </button>
        ))}
      </div>
    </div>
  );
}
