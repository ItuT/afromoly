/**
 * The game server: one DynamoDB table, the Lambdas that run the engine, and
 * the two API Gateway endpoints in front of them.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { TABLE_NAME } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.resolve(here, '../../services/api/src');

export class AfromolyApiStack extends Stack {
  readonly httpUrl: string;
  readonly wsUrl: string;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    /**
     * Single table. Games, seats, connections and the action log all live here,
     * keyed as described in PLAN.md. On-demand billing means no idle cost, and
     * every item carries a TTL so finished games clear themselves out.
     */
    const table = new dynamodb.Table(this, 'Table', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Joining by a six-character code is a single query on this index.
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const fn = (name: string, entry: string, handler = 'handler') =>
      new NodejsFunction(this, name, {
        entry: path.join(apiSrc, entry),
        handler,
        // An explicit log group, rather than the logRetention property, which
        // deploys an extra Lambda just to set the retention.
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        // The brief said Node 20, but that runtime was deprecated on
        // 2026-04-30 and new functions stop being accepted on 2027-02-01.
        // Node 22 is current, still LTS, and what the repo develops on.
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(15),
        environment: { TABLE_NAME: table.tableName, NODE_OPTIONS: '--enable-source-maps' },
        bundling: { minify: true, sourceMap: true, format: undefined },
      });

    const restFn = fn('RestFn', 'handlers/rest.ts');
    const connectFn = fn('WsConnectFn', 'handlers/ws.ts', 'connect');
    const disconnectFn = fn('WsDisconnectFn', 'handlers/ws.ts', 'disconnect');
    const messageFn = fn('WsMessageFn', 'handlers/ws.ts', 'message');

    for (const handler of [restFn, connectFn, disconnectFn, messageFn]) {
      table.grantReadWriteData(handler);
    }

    // ---- Lobby REST API -------------------------------------------------- //

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'afromoly-lobby',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['content-type'],
      },
    });
    const restIntegration = new integrations.HttpLambdaIntegration('RestIntegration', restFn);
    httpApi.addRoutes({ path: '/games', methods: [apigwv2.HttpMethod.POST], integration: restIntegration });
    httpApi.addRoutes({ path: '/games/join', methods: [apigwv2.HttpMethod.POST], integration: restIntegration });
    httpApi.addRoutes({ path: '/games/{gameId}', methods: [apigwv2.HttpMethod.GET], integration: restIntegration });

    // ---- Real-time WebSocket API ----------------------------------------- //

    const wsApi = new apigwv2.WebSocketApi(this, 'WsApi', {
      apiName: 'afromoly-table',
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', connectFn),
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DisconnectIntegration', disconnectFn),
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('MessageIntegration', messageFn),
      },
    });

    const wsStage = new apigwv2.WebSocketStage(this, 'WsStage', {
      webSocketApi: wsApi,
      stageName: 'live',
      autoDeploy: true,
    });

    // Only the handlers that broadcast need to post back down a socket.
    for (const handler of [connectFn, disconnectFn, messageFn]) {
      wsStage.grantManagementApiAccess(handler);
    }

    this.httpUrl = httpApi.apiEndpoint;
    this.wsUrl = wsStage.url;

    new CfnOutput(this, 'HttpApiUrl', { value: this.httpUrl });
    new CfnOutput(this, 'WebSocketUrl', { value: this.wsUrl });
    new CfnOutput(this, 'TableName', { value: table.tableName });
  }
}
