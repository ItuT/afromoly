# Afromoly: Johannesburg Edition — plan and build the online game

## Context
@Readme.md contains the complete game design: 40-tile board, prices, rent tables,
both 16-card decks, tokens, currency, and the full rulebook. Treat it as the
single source of truth for game rules. Do not invent or change rules; if the
Readme is ambiguous or self-contradictory (e.g. Start pays R2,000 in one place
and R20,000 in another), flag it and use the rulebook section (section 4A) as
authoritative.

## Goal
Build a playable, server-authoritative, multiplayer web version of the game,
deployed at https://afromoly.motebo.co.za.

## Tech stack (fixed decisions)
- **Frontend:** Next.js (App Router, TypeScript). 3D board and tokens rendered
  in-browser with react-three-fiber / three.js.
- **3D assets:** Blender. Model the board, the 6 tokens, the Quantum van, and
  the Terminal Depot. Export as glTF (.glb) into `apps/web/public/models`.
  Provide the .blend source files in `assets/blender/` and a Python script to
  re-export. Do not use Unity; a Unity WebGL build inside Next.js is too heavy
  for this. (If you believe Unity is genuinely better here, say why before
  starting, but default to Blender + three.js.)
- **Game rules engine:** a pure TypeScript package (`packages/engine`) with no
  I/O, implementing every rule in the Readme: movement, doubles, Impound
  (three exit paths), rent (color sets, vans, depots, hubs, utilities), auctions,
  even-build rule, mortgages with 10% interest, bankruptcy to player vs bank,
  jackpot pot, and both card decks. Unit-test it against the Readme tables.
- **Backend:** AWS Lambda (Node 20, TypeScript) behind API Gateway.
  - REST for lobby/game CRUD.
  - WebSocket API for real-time turns (the engine runs on the server; clients
    only send intents).
- **Database:** DynamoDB, single-table design (games, players, connections,
  action log). Add TTL on finished games.
- **Auth:** simple for v1: display name + game code, no accounts.
- **Infrastructure as code:** AWS CDK (TypeScript). Everything must be
  reproducible with `cdk deploy`.
- **Hosting:** Next.js on AWS via S3 + CloudFront (static export where possible;
  if SSR is needed, use OpenNext/SST and say so). ACM certificate in
  `us-east-1`, Route53 A/AAAA alias record for `afromoly.motebo.co.za` in the
  existing `motebo.co.za` hosted zone. Use my default AWS CLI profile; verify
  the account ID and hosted zone ID with `aws sts get-caller-identity` and
  `aws route53 list-hosted-zones` before creating anything. Deploy all other
  resources to `af-south-1` (Cape Town) unless a service is unavailable there;
  fall back to `eu-west-1` and tell me.

## Repository
- Create a public GitHub repo `ItuT/afromoly` using the `gh` CLI, initialise
  git in this folder, and push. Monorepo layout with pnpm workspaces:
  `apps/web`, `services/api`, `packages/engine`, `infra`, `assets/blender`.
- Add a README with local dev, test, and deploy instructions, and a GitHub
  Actions workflow that runs lint + engine tests on every PR.

## How to work
1. **Plan first.** Before writing code, produce a short plan: architecture
   diagram, DynamoDB key design, WebSocket message schema, engine API, and a
   phased build order. List any open questions. Stop and wait for my approval.
2. **Build in phases**, each ending in something runnable:
   - Phase 1: engine + tests (hot-seat playable in the terminal).
   - Phase 2: Next.js UI with a 2D board, local hot-seat play.
   - Phase 3: Lambda + DynamoDB + WebSocket multiplayer.
   - Phase 4: Blender assets and 3D board.
   - Phase 5: CDK deploy to afromoly.motebo.co.za.
3. Confirm with me before any action that creates billable AWS resources or
   modifies Route53. Show the `cdk diff` first.
4. Commit after each phase with clear messages.

## Open questions (answer these in the plan)
- Players are Property Tycoons for v1 (the Readme's option 1). Confirm the
  Taxi Boss variant is out of scope.
- Do we want the Jackpot house rule and the timed Rush-Hour variant in v1?
- Max players per game: 6 (matches the 6 tokens).
