/**
 * The player-facing site: a private S3 bucket behind CloudFront, on
 * afromoly.motebo.co.za.
 *
 * The Next.js client is a static export, so there is nothing to run per
 * request. The deployment also writes a config.json next to it carrying the
 * API addresses, which is how one build works against any environment.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deployment from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { CERTIFICATE_ARN, DOMAIN, ZONE_ID, ZONE_NAME } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteOut = path.resolve(here, '../../apps/web/out');

export interface SiteStackProps extends StackProps {
  /** The lobby REST endpoint, from the API stack. */
  apiUrl: string;
  /** The WebSocket endpoint, from the API stack. */
  wsUrl: string;
}

export class AfromolySiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    if (!fs.existsSync(path.join(siteOut, 'index.html'))) {
      throw new Error(
        `No built client at ${siteOut}. Run "pnpm build" from the repository root first.`,
      );
    }

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // The certificate already exists and covers *.motebo.co.za, so nothing
    // here requests one or writes a validation record.
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', CERTIFICATE_ARN);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Afromoly: Johannesburg Edition',
      defaultRootObject: 'index.html',
      domainNames: [DOMAIN],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      defaultBehavior: {
        // Origin access control keeps the bucket private.
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        // The runtime config must never be cached, or a redeploy would leave
        // clients pointing at the previous API for hours.
        '/config.json': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      errorResponses: [
        // A static export has no server-side routing, so a miss returns the app.
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
      ],
    });

    new deployment.BucketDeployment(this, 'SiteDeployment', {
      sources: [
        deployment.Source.asset(siteOut),
        deployment.Source.jsonData('config.json', { apiUrl: props.apiUrl, wsUrl: props.wsUrl }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
      memoryLimit: 512,
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: ZONE_ID,
      zoneName: ZONE_NAME,
    });
    const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));

    new route53.ARecord(this, 'AliasA', { zone, recordName: DOMAIN, target });
    new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: DOMAIN, target });

    new CfnOutput(this, 'SiteUrl', { value: `https://${DOMAIN}` });
    new CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
