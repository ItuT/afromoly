/**
 * Everything about the target account and domain, verified before it was
 * written down. See PLAN.md section 0 for how each value was checked.
 */

export const ACCOUNT = '135409860627';

/** Cape Town, for a Johannesburg audience. Both APIs and DynamoDB are available there. */
export const REGION = 'af-south-1';

export const DOMAIN = 'afromoly.motebo.co.za';
export const ZONE_NAME = 'motebo.co.za';
export const ZONE_ID = 'Z08219143LXBGLSNVUJBY';

/**
 * The existing wildcard certificate already covers afromoly.motebo.co.za, so
 * nothing here issues a certificate or writes a DNS validation record.
 * CloudFront requires the certificate in us-east-1, which this one is.
 */
export const CERTIFICATE_ARN =
  'arn:aws:acm:us-east-1:135409860627:certificate/7ad8e412-609a-400f-9de6-ec167f580f5f';

export const TABLE_NAME = 'afromoly';
