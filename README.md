# Afromoly: Johannesburg Edition

A server-authoritative multiplayer web version of **Afromoly: Johannesburg Edition**, the
Gauteng commuter property game. Players are transit tycoons buying up corridors from
Ferreirasdorp to Sandton CBD, running Quantum van fleets and Terminal Depots, and squeezing
rivals off the board.

The complete game design, board roster, both card decks and the rulebook live in
[GAME-DESIGN.md](GAME-DESIGN.md), and that document is the single source of truth for rules. The
build plan, including every rule contradiction found in it and how each was resolved, lives in
[PLAN.md](PLAN.md).

> The design document was originally called `Readme.md`. It was renamed because macOS filesystems
> are case-insensitive, so `Readme.md` and this `README.md` are the same file and cannot coexist.

**Playing now at [afromoly.motebo.co.za](https://afromoly.motebo.co.za).**

## Status

| Phase | What it delivers | State |
| --- | --- | --- |
| 1 | Rules engine, tests, terminal hot-seat | **done** |
| 2 | Next.js interface, 2D board, hot-seat in the browser | **done** |
| 3 | Lambda, DynamoDB and WebSocket multiplayer | **done** |
| 4 | Blender assets and the 3D board | **done** |
| 5 | Deploy to afromoly.motebo.co.za | **live** |

## Layout

```
packages/engine    pure TypeScript rules engine, no I/O
packages/protocol  the browser-to-server message shapes, no AWS code
apps/cli           terminal hot-seat runner
apps/web           Next.js client, hot seat and online
services/api       Lambda handlers, DynamoDB store, local dev server
infra              AWS CDK stacks (phase 5)
assets/blender     the model build script, its .blend outputs and the exporter
assets/audio       the sound synthesis script and its exporter
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

## Playing online, locally

Multiplayer runs against a local server that speaks the same protocol as the
deployed Lambdas and keeps everything in memory, so no AWS account is needed to
develop or play it.

```bash
pnpm --filter @afromoly/api dev      # the rank, on :4000
```

Then, in another terminal:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000 \
NEXT_PUBLIC_WS_URL=ws://localhost:4000 \
pnpm --filter @afromoly/web dev
```

Open the app, host a table, and read the six-character code out to whoever is
joining. Without those two variables the client still runs and offers hot-seat
play, and says plainly that online is not configured.

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

## The 3D board

The client has two views of the same game, switched from the header. The flat
board is the working view; the 3D board renders the real pieces.

Every model is built from primitives by a Blender script, so the `.blend` files
are outputs rather than hand-edited sources. Rebuild them with:

```bash
cd assets/blender && ./export.sh
```

That writes `.glb` files into `apps/web/public/models`. See
[assets/blender/README.md](assets/blender/README.md) for what gets built and how
the board's dimensions are kept in step between Blender and the client.

## Sound

Fourteen clips, none of them recorded: `assets/audio/build_sounds.py` synthesises
each one from oscillators and noise, the same way the models are built from
primitives. It needs nothing but Python.

```bash
cd assets/audio && ./export.sh
```

That writes `.wav` files into `apps/web/public/audio`. See
[assets/audio/README.md](assets/audio/README.md) for what each one is.

The client scores a batch of engine events rather than firing a noise per event.
The dice clatter first, the piece ticks once per tile it crosses, and whatever
the tile costs is heard once it has landed, which is the same schedule the 3D
scene animates to — both read their timings from `apps/web/lib/board3d.ts`, so
they cannot drift apart. Cues are scheduled on the audio clock, not with timers,
so the rhythm holds while the board is busy drawing.

Sound is on by default, off with the header switch, and the choice is
remembered. Nothing loads or plays until the page has been touched, because
browsers will not start audio before then.

## The server

`services/api` is server-authoritative. Clients send intents; the engine runs
on the server and the result is broadcast. Three things make that safe:

- **The state a client receives is redacted.** The shuffled deck order and the
  generator state never leave the server, so nobody can read the next card or
  predict a roll. Everything else in Monopoly is public and is sent as is.
- **Every write is conditional** on the game's version, so two moves that race
  cannot both land. The loser is told to resync and is handed the current state.
- **Every intent carries a nonce**, so a retried send after a dropped socket
  replays as the move it already made rather than applying twice.

Seats, connections, the game and its action log all live in one DynamoDB table
with a TTL, keyed as described in [PLAN.md](PLAN.md#4-dynamodb-key-design).

## Testing

159 tests: 115 over the engine, 26 over the server, and 18 over the client's
board geometry and sound. Every cell of the Readme's rent table is asserted against an
independently transcribed fixture, so a typo in the board data fails rather than agreeing with
itself. Beyond that: both bankruptcy routes, all three impound exits, the even-build rule in
both directions, mortgage interest on lifting and on transfer, auctions, the jackpot pot, and
all thirty-two cards. A soak test plays complete games from fixed seeds and checks invariants
after every action, and a determinism test asserts that the same seed replays byte for byte.

The server suite runs the whole path, from creating a table through joining,
starting, playing and disconnecting, against an in-memory store. It covers
redaction, the optimistic lock, nonce replay, acting out of turn, and acting on
another player's behalf.

The client tests assert that no two tiles overlap, that every token and every van
lands inside its own tile however many are sharing it, and that buildings sit on
the inner half of a street rather than hanging off the outer edge. The sound
tests check that every clip the client can ask for is a real file, and that a
batch of events is scored in the order it happens: hops held until the dice have
settled, rent heard only once the piece has landed.

```bash
pnpm test
pnpm --filter @afromoly/engine test:watch
```

## Deployment

Two CDK stacks in `af-south-1`, described in [infra/README.md](infra/README.md).

```bash
pnpm build                                  # the site stack deploys apps/web/out
pnpm --filter @afromoly/infra diff          # read-only
pnpm --filter @afromoly/infra deploy
```

The diff stands at 49 new resources and nothing removed or replaced. No
certificate is issued, because the existing `*.motebo.co.za` wildcard already
covers the domain. The only DNS change is creating the A and AAAA records for
`afromoly.motebo.co.za`.

The client fetches `/config.json` at boot for its API addresses, so one build
works against any environment, including a local server.

### What is live

| | |
| --- | --- |
| Site | `https://afromoly.motebo.co.za` |
| Lobby API | `https://79dy6ctg7f.execute-api.af-south-1.amazonaws.com` |
| WebSocket | `wss://9qvyf9qiob.execute-api.af-south-1.amazonaws.com/live` |
| Table | DynamoDB `afromoly` in `af-south-1` |

Deployed in five and a half minutes, most of it CloudFront. Verified afterwards
with two browsers on the live site: a table hosted and joined by code, fourteen
turns played, both views agreeing on turn number and cash, the 3D board
rendering, and no console errors.
