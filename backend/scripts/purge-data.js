#!/usr/bin/env node
/**
 * Purge all Voxa data for fresh testing: DynamoDB tables, S3 buckets, and Cognito users.
 * Requires AWS credentials and region (e.g. us-east-1).
 *
 * Usage: from backend/cdk run: node ../scripts/purge-data.js
 *
 * What gets purged:
 *   - All DynamoDB tables with prefix VoxaStack- (bookings, handles, conversations, etc.)
 *   - Recordings and KB content S3 buckets
 *   - All Cognito users in COGNITO_USER_POOL_ID, except emails in COGNITO_PRESERVE_EMAIL (BMS login).
 *
 * Env: TABLE_PREFIX, BUCKET_RECORDINGS, BUCKET_KB.
 *      COGNITO_USER_POOL_ID (default below) — set to "" to skip Cognito purge.
 *      COGNITO_PRESERVE_EMAIL — comma-separated emails to keep (default: rehaan@mobil80.com).
 */

const path = require("path");
const AWS = require(path.resolve(__dirname, "../cdk/node_modules/aws-sdk"));

const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || "us-east-1";
const tablePrefix = process.env.TABLE_PREFIX || "VoxaStack-";
const recordingsBucket = process.env.BUCKET_RECORDINGS || "voxastack-voxarecordingsbucketbcce1140-0nfpodn0lup5";
const kbBucket = process.env.BUCKET_KB || "voxastack-voxakbcontentbucket4e4638e8-ajclwvedqmlq";
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID !== undefined && process.env.COGNITO_USER_POOL_ID !== ""
  ? process.env.COGNITO_USER_POOL_ID
  : "us-east-1_D05ftfM4y";
const cognitoPreserveEmail = (process.env.COGNITO_PRESERVE_EMAIL || "rehaan@mobil80.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const dynamo = new AWS.DynamoDB({ region });
const s3 = new AWS.S3({ region });
const cognito = new AWS.CognitoIdentityServiceProvider({ region });

async function listTables() {
  const names = [];
  let token;
  do {
    const out = await dynamo.listTables({ ExclusiveStartTableName: token }).promise();
    names.push(...(out.TableNames || []));
    token = out.LastEvaluatedTableName;
  } while (token);
  return names.filter((n) => n.startsWith(tablePrefix));
}

async function getKeySchema(tableName) {
  const desc = await dynamo.describeTable({ TableName: tableName }).promise();
  return (desc.Table.KeySchema || []).map((k) => k.AttributeName);
}

async function purgeTable(tableName) {
  const keys = await getKeySchema(tableName);
  if (keys.length === 0) return 0;
  const proj = keys.map((k) => `#${k}`).join(", ");
  const expr = keys.reduce((acc, k) => ({ ...acc, [`#${k}`]: k }), {});
  let total = 0;
  let lastKey;
  do {
    const scan = await dynamo
      .scan({
        TableName: tableName,
        ProjectionExpression: proj,
        ExpressionAttributeNames: expr,
        ExclusiveStartKey: lastKey,
        Limit: 25,
      })
      .promise();
    const items = scan.Items || [];
    if (items.length === 0) break;
    const deletes = items.map((item) => ({
      DeleteRequest: { Key: item },
    }));
    await dynamo.batchWriteItem({
      RequestItems: { [tableName]: deletes },
    }).promise();
    total += items.length;
    lastKey = scan.LastEvaluatedKey;
    if (lastKey) await new Promise((r) => setTimeout(r, 50));
  } while (lastKey);
  return total;
}

async function emptyBucket(bucketName) {
  let total = 0;
  let continuationToken;
  do {
    const list = await s3.listObjectsV2({
      Bucket: bucketName,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    }).promise();
    const keys = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length > 0) {
      await s3.deleteObjects({
        Bucket: bucketName,
        Delete: { Objects: keys, Quiet: true },
      }).promise();
      total += keys.length;
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return total;
}

function getEmail(user) {
  const attrs = user.Attributes || [];
  const emailAttr = attrs.find((a) => a.Name === "email");
  return (emailAttr && emailAttr.Value) ? emailAttr.Value.trim().toLowerCase() : "";
}

async function purgeCognitoUsers(userPoolId, preserveEmails) {
  let total = 0;
  let skipped = 0;
  let token;
  do {
    const out = await cognito.listUsers({
      UserPoolId: userPoolId,
      Limit: 60,
      PaginationToken: token,
      AttributesToGet: ["email"],
    }).promise();
    for (const u of out.Users || []) {
      if (!u.Username) continue;
      const email = getEmail(u);
      if (preserveEmails.length && email && preserveEmails.includes(email)) {
        skipped++;
        continue;
      }
      await cognito.adminDeleteUser({ UserPoolId: userPoolId, Username: u.Username }).promise();
      total++;
    }
    token = out.PaginationToken;
  } while (token);
  if (skipped) console.log("  Cognito (preserved)", skipped, "user(s):", cognitoPreserveEmail.join(", "));
  return total;
}

async function main() {
  console.log("Purging Voxa data (tables + S3" + (cognitoUserPoolId ? " + Cognito users" : "") + ")...\n");
  const tables = await listTables();
  if (tables.length === 0) {
    console.log("No DynamoDB tables found with prefix:", tablePrefix);
  } else {
    for (const table of tables) {
      try {
        const n = await purgeTable(table);
        console.log("  Table", table, "→", n, "items deleted");
      } catch (e) {
        console.error("  Table", table, "error:", e.message);
      }
    }
  }
  for (const bucket of [recordingsBucket, kbBucket]) {
    try {
      const n = await emptyBucket(bucket);
      console.log("  Bucket", bucket, "→", n, "objects deleted");
    } catch (e) {
      if (e.code === "NoSuchBucket") console.log("  Bucket", bucket, "→ (not found, skipping)");
      else console.error("  Bucket", bucket, "error:", e.message);
    }
  }
  if (cognitoUserPoolId) {
    try {
      const n = await purgeCognitoUsers(cognitoUserPoolId, cognitoPreserveEmail);
      console.log("  Cognito User Pool", cognitoUserPoolId, "→", n, "users deleted");
    } catch (e) {
      console.error("  Cognito", cognitoUserPoolId, "error:", e.message);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
