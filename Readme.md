# Afromoly: Johannesburg Edition

A server-authoritative multiplayer web version of **Afromoly: Johannesburg Edition**, the
Gauteng commuter property game. Players are transit tycoons buying up corridors from
Ferreirasdorp to Sandton CBD, running Quantum van fleets and Terminal Depots, and squeezing
rivals off the board.

The complete game design lives in [Readme.md](Readme.md) and is the single source of truth for
rules. The build plan, including every rule contradiction found in that design and how it was
resolved, lives in [PLAN.md](PLAN.md).

## Status

| Phase | What it delivers | State |
| --- | --- | --- |
| 1 | Rules engine, tests, terminal hot-seat | **done** |
| 2 | Next.js interface, 2D board, hot-seat in the browser | not started |
| 3 | Lambda, DynamoDB and WebSocket multiplayer | not started |
| 4 | Blender assets and the 3D board | not started |
| 5 | Deploy to afromoly.motebo.co.za | not started |

## Layout

```
packages/engine    pure TypeScript rules engine, no I/O
apps/cli           terminal hot-seat runner
apps/web           Next.js client (phase 2)
services/api       Lambda handlers (phase 3)
infra              AWS CDK stacks (phase 5)
assets/blender     .blend sources and the glTF export script (phase 4)
```

## Getting started

Requires Node 20 or newer and pnpm 10.

```bash
pnpm install
pnpm test          # engine unit tests
pnpm lint          # eslint across the workspace
pnpm typecheck     # tsc across every package
pnpm build         # compile the engine to dist/
```

## Playing a game in the terminal

```bash
pnpm build          # the CLI consumes the engine's compiled output
pnpm hotseat
```

Or skip the prompts:

```bash
pnpm --filter @afromoly/cli start -- --players=3 --seed=noord
```

Type `help` for the command list. The board draws as an 11 by 11 grid: the top line of each
cell is the tile, the line under it is the tile number, the owner's seat number, a development
marker (`1` to `4` vans, `D` for a depot, `m` for mortgaged) and any tokens standing there.

## The engine

`packages/engine` is pure. It has no clock, no network, and no call to `Math.random`. Dice come
from a seeded generator held inside the game state, so a game replays exactly from its seed plus
its action log. That is what makes the action log a real audit trail rather than decoration.

```ts
createGame(players, seed, options?)       // → GameState
reduce(state, action)                     // → { state, events }
legalActions(state, playerId)             // → Action[]
netWorth(state, playerId)                 // → number
```

`reduce` is total. An illegal action returns the state unchanged alongside an `illegalAction`
event rather than throwing, so a malicious or stale client cannot crash the server.

The same compiled package runs in the browser and in Lambda. The browser copy drives hot-seat
play and optimistic previews. **The server copy is the only authority.**

## Rule decisions

The Readme contradicts itself in twelve places. Section 4 of its rulebook is authoritative, and
where that section is silent the engine implements the reading below. Full reasoning is in
[PLAN.md](PLAN.md#1-rule-conflicts-found-in-the-readme).

| Point | Implemented as |
| --- | --- |
| Month-End Payday salary | R20,000, per rulebook 4A, not the R2,000 in the concept section |
| Utility rent | 400 or 1000 times the roll, per 4E, not the 4 or 10 printed on the tiles |
| Terminal Depot cost | Same as one Quantum van, per the title deed card |
| Card penalties | Feed the jackpot pot when that rule is on; road tax and rent always go to the bank |
| Substation Explosion | Utility rent resumes when the drawing player's next turn begins |
| Building Plan Approval Delayed | A skipped turn does not consume an impound doubles attempt |
| Escaping impound on doubles | Moves the token and ends the turn, with no bonus roll |
| Advance-to-tile cards | Always clockwise, and always pay the salary on passing Start, per 4A |
| Mechanic Voucher | Dropped. No such component exists anywhere in the design |

Two smaller readings the Readme does not cover, both flagged here rather than buried:

- **Building on a mortgaged set** is refused. The Readme is silent; this follows standard play
  and closes an exploit where a set is mortgaged for cash and developed anyway.
- **Auctioning the last van or depot** when the bank runs short is not implemented. The engine
  refuses the purchase instead, which is the mechanically important half of the rule.

## Testing

115 tests cover the engine. Every cell of the Readme's rent table is asserted against an
independently transcribed fixture, so a typo in the board data fails rather than agreeing with
itself. Beyond that: both bankruptcy routes, all three impound exits, the even-build rule in
both directions, mortgage interest on lifting and on transfer, auctions, the jackpot pot, and
all thirty-two cards. A soak test plays complete games from fixed seeds and checks invariants
after every action, and a determinism test asserts that the same seed replays byte for byte.

```bash
pnpm test
pnpm --filter @afromoly/engine test:watch
```

## Deployment

Phase 5. Everything will be reproducible with `cdk deploy` against `af-south-1`, fronted by
CloudFront on `afromoly.motebo.co.za`. Nothing is deployed yet and no billable resource exists.
