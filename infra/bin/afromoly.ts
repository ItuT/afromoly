#!/usr/bin/env node
/**
 * Afromoly infrastructure.
 *
 *   pnpm --filter @afromoly/infra diff
 *   pnpm --filter @afromoly/infra deploy
 *
 * The site stack deploys apps/web/out, so build the client first:
 *
 *   pnpm build
 */

import { App, Tags } from 'aws-cdk-lib';
import { ACCOUNT, REGION } from '../lib/config.js';
import { AfromolyApiStack } from '../lib/api-stack.js';
import { AfromolySiteStack } from '../lib/site-stack.js';

const app = new App();
const env = { account: ACCOUNT, region: REGION };

const api = new AfromolyApiStack(app, 'AfromolyApi', {
  env,
  description: 'Afromoly game server: DynamoDB, Lambda, HTTP and WebSocket APIs',
});

const site = new AfromolySiteStack(app, 'AfromolySite', {
  env,
  description: 'Afromoly client: S3, CloudFront and DNS for afromoly.motebo.co.za',
  apiUrl: api.httpUrl,
  wsUrl: api.wsUrl,
});

// The site's config.json carries the API addresses, so it must go second.
site.addStackDependency(api);

Tags.of(app).add('project', 'afromoly');
Tags.of(app).add('managedBy', 'cdk');
