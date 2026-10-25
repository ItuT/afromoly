# Afromoly review — 9 September 2026

The biggest opportunity is making each decision readable and reachable on a phone. The Johannesburg setting, ochre/petrol palette, modeled Quantum pieces, and cream 3D board give the game a recognizable identity. The interface should bring those strengths into setup and the flat board, while giving the current move more prominence.

[Open the visual review and interactive layout concept](docs/review-2026-09-09/index.html). The concept previews a purchase, the start of a turn, and a trade review. It illustrates a proposed hierarchy; it does not implement game changes.

## Findings, in recommended order

**1. High: players cannot inspect the terms of a trade before accepting.** I offered R7,000 from one local online player to another. The recipient saw “Offer on the table” and Accept/Decline, but neither the amount nor what they were giving. The log also omits the terms. Hot seat has the same problem. Render `state.trade` from the recipient’s perspective: “You receive,” “You give,” both parties, cash, deeds, cards, mortgage fees, and resulting balances. This is essential information for the decision, not optional polish. [Actions.tsx](/Users/tlali/afromoly/apps/web/components/Actions.tsx:49) · [capture](docs/review-2026-09-09/images/mobile-online-trade-review.png).

**2. High: the mobile board has no readable property inspector.** Names are 6.5px and prices 6px below 721px. The tiles are noninteractive `div`s with a name-only hover title; there is no touch or keyboard route to a deed’s details. The purchase prompt supplies the price, but omits rent and development economics. Keep the board as an overview and add a readable property sheet, accessible from both tiles and a property list. Include owner, corridor progress, rent ladder, van/depot cost, mortgage value, and cash remaining after the action. [CSS](/Users/tlali/afromoly/apps/web/app/globals.css:380) · [Board.tsx](/Users/tlali/afromoly/apps/web/components/Board.tsx:18) · [Actions.tsx](/Users/tlali/afromoly/apps/web/components/Actions.tsx:29).

**3. High: normal turns require unnecessary scrolling.** The board is followed by the full player list, then the action panel. At 390 × 844 with six players, the Roll button begins at y=919, outside the initial viewport. At 768 × 1024 with three players, it begins at y=1112. A single pixel across the 1180px breakpoint moves the action from the sidebar to well below the board. Keep a compact active-player summary at the top and the primary action in a persistent bottom area on phones/tablets. Put the complete player list, holdings, and history in expandable panels. Account for safe areas and the keyboard. [Game.tsx](/Users/tlali/afromoly/apps/web/components/Game.tsx:55) · [Online.tsx](/Users/tlali/afromoly/apps/web/components/Online.tsx:88) · [six-player capture](docs/review-2026-09-09/images/mobile-six-players.png).

**4. High: setup and trade forms overflow on phones.** On a configured 390px-wide phone, setup extends the document to 443px, and the trade builder extends it to 451px. The fixed 190px token column and input minimum widths prevent shrinking; the two cash inputs also resist fitting into their grid. Use a stacked token label, `minmax(0, 1fr)`, and appropriately bounded input widths; stack the cash fields when necessary. Check 320, 360, 390, and 430px with long names and the keyboard open. [Setup CSS](/Users/tlali/afromoly/apps/web/app/globals.css:311) · [trade grid](/Users/tlali/afromoly/apps/web/components/Actions.tsx:301) · [setup capture](docs/review-2026-09-09/images/mobile-setup.png) · [trade capture](docs/review-2026-09-09/images/mobile-trade-builder.png).

**5. High: a refresh can end participation in the game.** Hot-seat state and the online seat exist only in React memory. I started a local online game, refreshed the host, and returned to the menu. Rejoining with the original code and name returned “That game is already under way.” Save hot-seat state after moves and persist a recoverable, authenticated online seat. Offer “Continue game,” handle expired sessions, and confirm restarting or abandoning unsaved play. A hot-seat Restart currently clears progress immediately. [Home state](/Users/tlali/afromoly/apps/web/app/page.tsx:16) · [restart](/Users/tlali/afromoly/apps/web/components/Game.tsx:74) · [rejoin capture](docs/review-2026-09-09/images/mobile-rejoin-error.png).

**6. Medium: the visual identity is strongest in the optional 3D view.** The cream pads, taxi pieces, and surrounding city communicate the setting. The home screen is mostly text and forms; the flat view uses small numbered dots and a large, mostly empty central log area. Carry the cream playing surface and token silhouettes into the flat board. Show the latest event, dice result, or selected deed in the centre; make full history secondary. Give setup visual token choices and the home screen a compact board/taxi illustration plus a short “How to play.” These are design judgments based on the captures, rather than measured user preferences. [Home](docs/review-2026-09-09/images/mobile-menu.png) · [flat board](docs/review-2026-09-09/images/game-1440.png) · [3D board](docs/review-2026-09-09/images/desktop-3d.png).

**7. Medium: small controls make touch play fiddly.** The Flat/3D/Sound controls measured 24px high, and Roll measured 32px. Target at least 44 × 44 CSS pixels for interactive areas, with visible focus and adequate spacing. This is the W3C **enhanced (AAA)** target-size recommendation, used here as a design goal; these measurements alone do not establish an AA violation. Retain player numbers alongside ownership colors and give important turn changes an accessible announcement. [Control CSS](/Users/tlali/afromoly/apps/web/app/globals.css:350) · [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

**8. Medium: the menu downloads the entire 3D model set.** A fresh local visit requested all 18 GLBs before entering a game or selecting 3D. Their combined file size is 1,854,404 bytes (about 1.77 MiB); this is asset size, not a production compressed-transfer measurement. The eager Board3D import triggers module-level preloads. Load the 3D component and assets when requested, or selectively warm them after essential UI is usable. Show loading progress and provide a flat-board fallback on rendering failure. Actual low-end phone frame rate, battery use, and cellular load time still need device testing. [preload call](/Users/tlali/afromoly/apps/web/components/Board3D.tsx:949).

## Important finding outside the visual focus

**High: online intents trust the player ID supplied in the message.** The service does not bind an intent’s game/player IDs to the connection record. In an isolated in-memory reproduction, a socket recorded as p2 submitted a roll naming p1; it was accepted, the version advanced from 2 to 3, and p1 moved to tile 8. The inner check only compares two caller-supplied IDs. Connect/subscribe also lack a secret proving seat ownership. Issue an unguessable seat credential, authenticate connection/resume, and derive the acting player from the authenticated connection for every intent and start request. Test impersonation rejection and valid reconnect together. This was reproduced locally, without contacting the live deployment. [service.ts](/Users/tlali/afromoly/services/api/src/service.ts:87) · [intent check](/Users/tlali/afromoly/services/api/src/session.ts:53) · [connection handling](/Users/tlali/afromoly/services/api/src/handlers/ws.ts:55).

## Suggested implementation sequence

1. **Make the existing game comfortable to play:** fix form overflow, show trade terms and property details, keep the current action visible, and add save/resume. Pair online resume with authenticated seat ownership.
2. **Unify the presentation:** reuse the 3D board’s cream/ochre direction, show actual token choices, present dice/cards/money changes clearly, and add a short first-turn guide.
3. **Tune for real phones:** defer 3D downloads, add loading/error states, and test touch, keyboard, rotation, tab suspension, and recovery on iOS and Android devices.

For the first milestone, aim for one ordinary turn at 390 × 844 without scrolling to find the action, zero document overflow at 320px, a complete readable trade summary, inspectable property economics, and a refresh that restores the same game and seat.

## Verification and limits

All **159 existing tests passed**: 115 engine, 26 API, and 18 web utility tests. `pnpm typecheck` and `pnpm lint` also passed. Those checks do not cover the visual and browser-flow failures above.

The local browser review covered setup, flat/3D switching, rolling, buying, trading, restart, online host/join/start, refresh, and attempted rejoin. Ten viewport sizes between 320 and 1440px were measured. Selected initial Roll-button positions:

| Viewport | Players | Button top | Visible without scrolling? |
| --- | ---: | ---: | --- |
| 320 × 740 | 3 | 750px | No |
| 390 × 844 | 3 | 775px | Yes, near the bottom |
| 390 × 844 | 6 | 919px | No |
| 768 × 1024 | 3 | 1112px | No |
| 1024 × 768 | 3 | 1080px | No |
| 1440 × 900 | 3 | 324px | Yes |

Captures used local Chromium with mobile/touch emulation, not physical phones. The Next.js development indicator appears in screenshots. These are not production load-time benchmarks, a complete accessibility audit, or multiplayer balance research. No game source changes were made; the added files contain review evidence and a concept only.

[Layout/network observations](docs/review-2026-09-09/capture.json) · [browser-flow observations](docs/review-2026-09-09/flows.json).

---

# Second pass, 9 September 2026: rules, server and product

The first pass covered visual design and mobile usability. This pass reads the rules engine against GAME-DESIGN.md, the multiplayer server, and the game as a product. Every bug below was reproduced with a throwaway test; the tests are kept in [docs/review-2026-09-09/repro/](docs/review-2026-09-09/repro/) and can be adapted into regression tests when the fixes land. Run them from the matching package with `npx vitest run --dir <that folder>`.

## Rules engine

**1. High: being sent to impound on a doubles roll does not end the turn.** When the roll is doubles, the reducer sets the phase to `awaitingRoll` before moving, and `sendToImpound` never overrides it. So a player who rolls doubles onto Go to Impound, or draws a Go to Impound card on a doubles roll, stays in `awaitingRoll` while detained and immediately gets a free escape attempt. Rulebook section 7 says the turn ends immediately. Fix: have `sendToImpound` set `phase` as well as `turnResumePhase`, and make the post-move check in `rollDice` respect it. [reduce.ts:216](packages/engine/src/reduce.ts:216) · [reduce.ts:723](packages/engine/src/reduce.ts:723).

**2. High: accepting a trade that carries mortgage interest the recipient cannot pay leaves a ghost debt.** `executeTrade` calls `charge` for the 10% interest, which pushes a debt and sets `debtSettlement`, but `acceptTrade` then overwrites the phase with `resumeAfterTrade`. The deed changes hands, no interest is paid, and the debt sits in `debts[]` until some unrelated later charge fails, at which point the wrong player is asked to settle in the wrong phase. Fix: after `executeTrade`, only restore the phase if `debts` is empty, and reject the offer in `validateTrade` when the recipient cannot cover the interest. [reduce.ts:962](packages/engine/src/reduce.ts:962) · [reduce.ts:1091](packages/engine/src/reduce.ts:1091).

**3. Medium: bankruptcy to the bank destroys Get Out of Impound cards.** The cards are cleared from the player without being pushed back to their decks, so the game permanently loses them. Bankruptcy to a player correctly hands them to the creditor. [reduce.ts:603](packages/engine/src/reduce.ts:603).

**4. Medium: a depot owner can be soft-locked in debt settlement.** Selling a depot needs four vans back from the bank. With 29 or more vans on the board, `sellBuilding` is rejected, `mortgage` is rejected because the street is built on, and `declareBankruptcy` is rejected because `maxRaisable` still counts the depot. Nobody has a legal action that makes progress. Fix: let a depot sell for its full 5 × half-cost when the bank cannot return vans, or exclude unsellable buildings from `maxRaisable`. [reduce.ts:863](packages/engine/src/reduce.ts:863) · [reduce.ts:1063](packages/engine/src/reduce.ts:1063) · [legalActions.ts:102](packages/engine/src/legalActions.ts:102).

**5. Low: rule gaps worth a decision.** Seat 1 always goes first; the rulebook opens with a high-roll for turn order. A player cannot mortgage to fund a purchase or an auction bid, because management actions are only legal in `awaitingRoll` and `awaitingEndTurn`. The deal maker never offers Get Out of Impound cards, though the engine supports them. The Rush-Hour timed variant is recorded in options but not played. [reduce.ts:98](packages/engine/src/reduce.ts:98) · [Actions.tsx:324](apps/web/components/Actions.tsx:324).

Everything else checked out: rent ladders, hub and utility tables, both decks, payday on card moves, the three impound exits, the even-build rule in both directions, the jackpot routing from PLAN.md conflict 8, and bankruptcy to a player versus the bank all match the design document.

## Multiplayer server

**6. High: any seated player can act as any other player, and can take over their socket.** `handleClientMessage` trusts `message.playerId` for both `subscribe` and `intent`; the inner check in `applyIntent` compares two values the sender supplied. The `$connect` handler likewise accepts any `playerId` in the query string. Reproduced: a socket subscribed as p2 rolled for p1 and the version advanced; the same socket then subscribed as p1 and stole p1's seat connection. Seat ids are predictable (`p1` to `p6`). Fix: issue a random seat secret on create and join, require it on connect, look up the connection record and derive `playerId` from it for every message. [service.ts:84](services/api/src/service.ts:84) · [service.ts:101](services/api/src/service.ts:101) · [session.ts:48](services/api/src/session.ts:48) · [ws.ts:49](services/api/src/handlers/ws.ts:49).

**7. Medium: two people joining at the same moment get the same seat.** `joinTable` derives the seat id from `listPlayers().length` and `addPlayer` writes unconditionally. Reproduced in memory: both joiners became p2. In DynamoDB the second put overwrites the first, so one joiner silently loses their seat while their client still believes it holds p2. Fix: a conditional put on the seat key with retry, or a seat counter on the game item updated with a conditional expression. [lobby.ts:84](services/api/src/lobby.ts:84).

**8. High, product consequence of finding 5 in the first pass: one refresh freezes the whole table.** The seat lives only in React state, join refuses once the game has started, and there is no turn timer or absence handling. If the player to move closes the tab, everyone else waits forever. Persisting the seat plus secret in local storage and offering "Continue" fixes the common case; a host action to skip or remove an absent player is the safety net. [page.tsx:16](apps/web/app/page.tsx:16).

**9. Low: seat records expire 24 hours after joining regardless of play.** The game item refreshes its TTL on every move, but player items are written once with a fixed TTL, so a table that runs past a day loses its seats while the game remains. [dynamoStore.ts:104](services/api/src/dynamoStore.ts:104).

Not found: version conflicts are handled correctly with a conditional write and a resync, retried sends are idempotent through the nonce, hidden state (deck order and RNG) is redacted before it leaves the server, and dead connections are cleaned up on broadcast.

## The game as a product

**10. There is no way to play alone.** Hot seat needs two people at one screen and online needs a second person with the code. A visitor arriving at the site by themselves cannot try the game. A simple bot that buys what it lands on, bids up to face value, builds when it holds a set, and accepts trades only if they favour it would be the single biggest change to how many people finish a first game. It slots in on the client for hot seat and on the server for online with no engine changes, since the engine already exposes `legalActions`.

**11. The first turn has no teaching.** Nothing explains what a corridor, a Quantum van or a Terminal Depot does in rent terms until the player reads the design document. A three-line explainer on the setup screen and a property sheet with the rent ladder, which the first pass already recommends, cover this.

## Revised implementation order

1. Engine fixes 1 to 4, with the reproduction tests turned into regression tests. Small, isolated, and they change outcomes in real games.
2. Seat secrets and connection-derived identity, together with seat persistence and "Continue game" on the client. These belong together because a resumable seat is only safe once seats are authenticated.
3. The first-pass mobile fixes: trade terms, property sheet, persistent action bar, form overflow.
4. A bot opponent, then the visual unification and 3D loading work from the first pass.

## What has been fixed since

Steps 1 and 2 of the order above are done, in the working tree:

- Findings 1 to 4 are fixed in the engine, with regression tests in `packages/engine/src/__tests__/review-fixes.test.ts`. Trades are now refused up front when either side could not pay the interest on a mortgaged deed they would receive.
- Finding 6: every seat carries a secret issued on create or join. The socket must present it to connect and to subscribe, and the server acts only for the seat the socket subscribed as. The protocol version is now 2.
- Finding 7: seat writes are conditional and a colliding join retries with the next seat number.
- Finding 8: the online seat is kept in localStorage and the home screen offers "Rejoin table". A seat the server no longer recognises is reported as lost rather than retried forever. Hot-seat games are saved after every move and offered as "Continue hot seat"; Restart and Leave ask first once a game is under way.
- Finding 9: seat records now live seven days.

Verified in a browser against the local server: host, join, start, roll, refresh, rejoin to the same table with the action still available; connect with a wrong or missing secret refused; an intent naming another seat refused with FORBIDDEN; hot seat played, refreshed, continued with the same log, and the save cleared on leaving. One known limit: the online log starts fresh after a rejoin, because past events are not replayed; the state itself is exact.

## Verification

Engine 123, API 33 and web 18 tests pass, along with typecheck and lint. The reproductions in the repro folder were written against the code before the fixes; the engine ones now pass and the server ones now fail at the assertion that expected the exploit, which is the intended outcome. No game source was changed in this pass.
