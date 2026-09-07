# Afromoly infrastructure

AWS CDK in TypeScript. Two stacks, both in `af-south-1` (Cape Town), which is
the right region for a Johannesburg audience: single-digit millisecond round
trips instead of roughly 160 milliseconds via Ireland.

| Stack | What it creates |
| --- | --- |
| `AfromolyApi` | One DynamoDB table, four Lambdas, an HTTP API and a WebSocket API |
| `AfromolySite` | A private S3 bucket, a CloudFront distribution, and the DNS records for `afromoly.motebo.co.za` |

## Before you deploy

```bash
pnpm install
pnpm build          # the site stack deploys apps/web/out, and refuses without it
```

## Looking before you leap

```bash
pnpm --filter @afromoly/infra synth
pnpm --filter @afromoly/infra diff
```

`diff` reaches the account read-only. It creates a change set to work out what
would happen, and uploads the assets it would deploy to the CDK bootstrap
bucket. It changes nothing else.

## Deploying

```bash
pnpm --filter @afromoly/infra deploy
```

The API stack goes first, because the site's `config.json` carries the API
addresses. That file is how one client build works against any environment: the
browser fetches it at boot rather than having the addresses compiled in.

## What this deliberately does not do

- **No certificate is issued.** `*.motebo.co.za` already exists in `us-east-1`
  and covers the domain, so there is no ACM request and no DNS validation record.
- **No VPC, no NAT gateway, no idle compute.** Everything is on-demand.
- **Nothing existing is touched.** The only Route53 change is creating the A and
  AAAA records for `afromoly.motebo.co.za`, which had no records before.

## Notes

- The Lambda runtime is **Node 22**, not the Node 20 in the original brief.
  Node 20 was deprecated on 2026-04-30 and AWS stops accepting new functions on
  it from 2027-02-01. CI tests both.
- The DynamoDB table and the site bucket are set to **retain** on stack
  deletion, so tearing the stacks down cannot silently destroy live games.
- Every item in the table carries a TTL: six hours for a lobby nobody starts,
  a day after the last move otherwise.

## Account facts

Verified before they were written into `lib/config.ts`:

| | |
| --- | --- |
| Account | `135409860627` |
| Region | `af-south-1` |
| Hosted zone | `motebo.co.za`, `Z08219143LXBGLSNVUJBY` |
| Certificate | `*.motebo.co.za` in `us-east-1`, issued, expires 2027-02-05 |
