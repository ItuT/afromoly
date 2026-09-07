# Afromoly: Johannesburg Edition — Build Plan

Status: **awaiting approval**. No code written, no AWS resources created, no repo pushed.

---

## 0. Environment verification (done, read-only)

| Check | Result |
| --- | --- |
| AWS account | `135409860627`, user `newmac`, default profile, default region `af-south-1` |
| Hosted zone `motebo.co.za` | `Z08219143LXBGLSNVUJBY` (public) |
| `afromoly.motebo.co.za` record | does not exist — free to create |
| ACM in `us-east-1` | `*.motebo.co.za` **already ISSUED**, expires 2027-02-05, ARN `…certificate/7ad8e412-609a-400f-9de6-ec167f580f5f` |
| DynamoDB in `af-south-1` | reachable |
| API Gateway v2 (WebSocket) in `af-south-1` | reachable |
| GitHub CLI | authenticated as `ItuT`, scopes include `repo` + `workflow` |
| `ItuT/afromoly` repo | does not exist yet |
| Toolchain | Node 22.20, pnpm 10.32, aws-cli 2.31, CDK 2.1133, Blender 5.2.1 LTS |

Two consequences worth noting up front:

1. **No new certificate is needed.** The existing wildcard covers `afromoly.motebo.co.za`, so Phase 5 has no ACM issuance and no DNS validation record. One less moving part and no 5–30 minute validation wait.
2. **Blender is installed but not on `PATH`.** Scripts will invoke it at `/Applications/Blender.app/Contents/MacOS/Blender`, overridable with a `BLENDER` env var.

---

## 1. Rule conflicts found in the Readme

The Readme is largely a faithful ×100 rescaling of standard Monopoly, and the rent tables are internally consistent to the cent. These are the genuine contradictions. Section 4A of the rulebook is treated as authoritative per your instruction, and where 4A is silent I state the resolution I intend to implement.

| # | Conflict | Resolution |
| --- | --- | --- |
| 1 | Start salary is **R2,000** in the concept section but **R20,000** on the board and in §4A. | **R20,000** (§4A). |
| 2 | Utility rent is **4× / 10×** the dice roll on board tiles 12 and 28, but **400× / 1000×** in the utilities section and §4E. | **400× / 1000×** (§4E). 4×/10× is a leftover from the unscaled figures. |
| 3 | Terminal Depot build cost is listed as R25,000 / R50,000 / R75,000 / R100,000 per colour tier in the concept section, but the Sandton title deed says a depot costs **R20,000**, the same as one Quantum van. | **Depot costs the same as one Quantum van**, per the title deed and §5 ("pay the deed's development fee"). The concept-section figures are depot *rent* values misread as costs. |
| 4 | Starting hand is "distributed across **16 bills**" but the table lists **110 bills**. | 110 bills, R150,000 total. Digitally only the R150,000 matters. |
| 5 | The 6-player note says "reduce R10,000 notes to **6**" — an increase from 5. | Physical-print issue only. The digital bank is unlimited. |
| 6 | Bank reserve is **R718,000**, but six players start with R900,000 between them. | Physical-print issue only. Flagged for when you print. |
| 7 | Kombi Hustle #3 offers "or use a *Mechanic Voucher*". No Mechanic Voucher exists anywhere in the design. | Implement as **pay R3,000**. The voucher is dropped unless you want it designed in. |
| 8 | The jackpot rule says *all* card penalties and e-tolls go to the centre pot, but individual cards say "pay to the bank". | With the jackpot rule **on**: card penalties and the e-toll go to the pot; SARS Road Tax, rent, and building costs go to the bank. With it **off**: everything goes to the bank and Kombi #9 reroutes to the bank. |
| 9 | City Watch #4 suspends utility rent "for one full round of turns" — undefined boundary. | Suspension lifts when the drawing player's **next turn begins**. |
| 10 | City Watch #8 "skip your next turn" is undefined for a detained player. | The skipped turn does **not** consume one of the three impound doubles attempts. |
| 11 | Whether rolling doubles to escape impound grants an extra turn is not stated. | It does **not** (standard Monopoly). Movement happens, turn ends. |
| 12 | "Advance to Parkhurst" and similar cards do not say whether Payday is collected. | §4A settles it: passing Start always pays R20,000, on every forward move including card moves. |

Nothing here changes a price, a rent, or a card value. Every number in the deed tables is used exactly as printed.

---

## 2. Answers to your open questions

**Property Tycoons for v1 — confirmed, Taxi Boss variant out of scope.** Worth knowing: the two are a re-skin, not a rules fork. The board already develops into Quantum vans and Terminal Depots, so a future Taxi Boss mode is a label and art swap over the same engine. No architectural accommodation needed now.

**Jackpot house rule: recommend on, as a lobby toggle defaulting to on.** The Readme labels it the Official Variant and Kombi Hustle #9 pays into the pot by name, so switching it off requires rerouting that card. Building it as a toggle costs almost nothing since the pot is one integer in state.

**Rush-Hour timed variant: recommend deferring the timer to Phase 3, but building net worth into the engine from Phase 1.** Net worth is already required for the SARS Road Tax 10% option and for insolvency checks, so the calculation is not optional. Only the clock and the end-of-time scoring screen wait for multiplayer.

**Max 6 players, minimum 2.** Matches the six tokens.

---

## 3. Architecture

```
                          Browser (SPA)
              Next.js static export + react-three-fiber
                 |                              |
        HTTPS · page and assets          WSS + REST · game traffic
                 |                              |
            CloudFront                     API Gateway
       afromoly.motebo.co.za          HTTP API + WebSocket API
        (wildcard ACM cert)                     |
                 |                        Lambda (Node 20)
                 v                        ├── lobby      create / join / lookup
          S3 static site                  ├── connect / disconnect
                                          └── action     validates + applies intents
                                                |
                                          packages/engine
                                     pure TypeScript · no I/O · seeded RNG
                                                |
                                     DynamoDB · single table "afromoly"
                                   state · players · action log · connections

   Left column: global edge + us-east-1 certificate (already issued).
   Right column: entirely af-south-1 (Cape Town).
```

The engine is the same compiled package in the browser and in Lambda. The browser copy runs only for hot-seat play and for optimistic UI previews. **The server copy is the only authority.** Clients send intents, never state.

**Region placement.** Everything in `af-south-1` (Cape Town), which is the right call for a Johannesburg-audience game — single-digit millisecond round trips instead of ~160 ms via Ireland. DynamoDB and API Gateway v2 both verified reachable there. CloudFront and Route53 are global. Only the ACM certificate lives in `us-east-1`, and it already exists.

**Hosting: static export, no SSR, no OpenNext.** The app is a WebSocket-driven single-page app with no per-request server rendering, no secrets in the render path, and no SEO surface beyond a landing page. `output: 'export'` to S3 behind CloudFront is simpler, cheaper, and faster than a Lambda-backed Next.js. I will say so loudly if a later requirement forces SSR.

---

## 4. DynamoDB key design

Single table `afromoly`, on-demand billing, TTL attribute `expiresAt`.

| Item | PK | SK | Notes |
| --- | --- | --- | --- |
| Game state | `GAME#<gameId>` | `META` | Full serialized `GameState` JSON, plus `version` for optimistic locking. Estimated 8–15 KB, well under the 400 KB item limit. |
| Player | `GAME#<gameId>` | `PLAYER#<playerId>` | Display name, chosen token, seat index, current `connectionId`, connected flag. |
| Action log | `GAME#<gameId>` | `LOG#<seq zero-padded>` | Append-only, one item per applied action. Enables replay and dispute resolution. |
| Connection | `CONN#<connectionId>` | `META` | Reverse lookup so disconnect handling is a single point read. |

**GSI1** for joining by code: `GSI1PK = CODE#<6-char code>`, `GSI1SK = GAME#<gameId>`. Codes are uppercase, ambiguity-free alphabet (no `O`, `0`, `I`, `1`), released on game end.

**Concurrency.** Every write to `META` carries `ConditionExpression: version = :expected` and bumps `version`. A losing writer gets a conditional-check failure, and the action Lambda replies with a rejection plus the current state so the client resyncs. This is what stops two players double-buying the same tile on a race.

**TTL.** Lobbies that never start expire 6 hours after creation. Finished games expire 24 hours after the final move. Log items inherit the game's expiry.

---

## 5. WebSocket message schema

Every message is versioned so a deployed client and a newer backend can disagree safely.

Client to server:

```jsonc
{ "v": 1, "type": "intent", "gameId": "...", "playerId": "...",
  "expectedVersion": 42, "nonce": "uuid", "intent": { "kind": "rollDice" } }
```

Intent kinds, matching the rulebook one for one:

```
rollDice · buyProperty · declineAndAuction · placeBid · passBid
buyBuilding · sellBuilding · mortgage · unmortgage
proposeTrade · acceptTrade · declineTrade
payImpoundFine · useImpoundCard · rollForImpound
chooseTaxOption · settleDebt · declareBankruptcy · endTurn
```

Server to client:

```jsonc
{ "v": 1, "type": "state", "version": 43, "state": { ... }, "you": "playerId" }
{ "v": 1, "type": "events", "events": [ { "kind": "rentPaid", ... } ] }
{ "v": 1, "type": "error", "code": "ILLEGAL_ACTION" | "STALE_VERSION" | ..., "message": "..." }
```

The broadcast state is redacted per recipient: the shuffled deck order and the RNG seed are stripped. Everything else in Monopoly is public information, including other players' cash and held Get Out of Impound cards.

Events carry the narration the UI animates ("Thabo paid R45,000 rent on Vilakazi Street"), so the client never has to diff two states to work out what happened.

---

## 6. Engine API

`packages/engine` is pure: no clock, no network, no randomness outside a seeded generator held in state.

```ts
createGame(options: GameOptions, players: PlayerSetup[], seed: string): GameState
reduce(state: GameState, action: Action): { state: GameState; events: GameEvent[] }
legalActions(state: GameState, playerId: PlayerId): Action[]
netWorth(state: GameState, playerId: PlayerId): number
```

`reduce` is a total function: an illegal action returns an unchanged state and an `IllegalAction` event rather than throwing. Dice are drawn from a seeded `mulberry32` generator stored in state, so a game replays exactly from its seed plus its action log. That property is what makes the DynamoDB log a real audit trail rather than decoration.

**Turn state machine:** `awaitingRoll → moving → resolvingTile → {awaitingPurchase | auction | awaitingCardAck | debtSettlement} → awaitingEndTurn`, with `impound`, `tradeReview`, and `gameOver` as cross-cutting states.

**Test strategy.** The deed tables in the Readme become a fixture file, and a generated test asserts every rent cell: 22 properties × 7 rent levels, plus set-doubling, plus the four hub tiers, plus both utility tiers. Separate suites cover the even-build rule in both directions, mortgage and the 10% surcharge on both lifting and transfer, all three impound exits, three-doubles detention, both bankruptcy paths, the auction floor, the jackpot pot, and all 32 cards driven from a table.

---

## 7. Build order

Each phase ends in something you can actually run, and each ends in a commit.

**Phase 1 — engine and tests.** `packages/engine` complete, board and deck data transcribed from the Readme, full unit suite green, plus a terminal hot-seat runner so a whole game is playable before any pixel exists.

**Phase 2 — 2D web UI.** Next.js App Router, TypeScript, a 2D board that plays hot-seat in the browser against the same engine. This is where the interaction design gets settled cheaply, before 3D.

**Phase 3 — multiplayer.** Lambda handlers, DynamoDB, WebSocket API, lobby and game codes, reconnect handling. Deployed to a dev stack first.

**Phase 4 — 3D.** Blender sources in `assets/blender/`, a Python re-export script, glTF output into `apps/web/public/models`, and the react-three-fiber board replacing the 2D one with the 2D board kept as a fallback. Six tokens, the Quantum van, the Terminal Depot, the board.

**Phase 5 — production deploy.** CDK stacks, `cdk diff` shown to you first, then `afromoly.motebo.co.za`.

**Repository, at the start of Phase 1.** `git init` here, public repo `ItuT/afromoly` via `gh`, pnpm workspaces across `apps/web`, `services/api`, `packages/engine`, `infra`, `assets/blender`. README with dev, test, and deploy instructions. A GitHub Actions workflow running lint plus engine tests on every pull request.

---

## 8. What will cost money, and when

Nothing until Phase 5, and I will show you `cdk diff` and wait before any of it.

Resources: one S3 bucket, one CloudFront distribution, two Route53 records, an HTTP API, a WebSocket API, roughly six Lambda functions, one on-demand DynamoDB table, and their log groups. No NAT gateway, no VPC, no idle compute. At hobby traffic this lands in low single-digit dollars a month, dominated by CloudFront and the hosted zone you already pay for. The certificate is free and already exists.

Route53 changes are limited to creating `afromoly.motebo.co.za` A and AAAA alias records. No existing record is touched.

---

## 9. Decisions I need from you

1. **Jackpot on by default, as a lobby toggle?** My recommendation is yes.
2. **Card penalties route to the pot when the jackpot is on** (conflict 8 above). Confirm, or tell me you want every card paying the bank and only Kombi #9 feeding the pot.
3. **Terminal Depot costs the same as one Quantum van** (conflict 3). This follows the title deed card and standard Monopoly. Confirm, or give me a per-tier depot price.
4. **The Mechanic Voucher is dropped** (conflict 7), unless you want it designed as a real component.
5. **Public repo named `afromoly`**, given the Readme's own trademark caution about "-opoly" variants. Public and named `afromoly` is what your prompt says. Say the word if the branding note means you would rather it start private.
