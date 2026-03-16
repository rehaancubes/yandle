#!/usr/bin/env node
/**
 * Check whether an email owns any business (handle) in the Handles table.
 * Uses the OwnerEmailIndex GSI on HandlesTable.
 *
 * Usage (from backend/cdk): node ../scripts/check-owner-email.js <email>
 * Example: node ../scripts/check-owner-email.js rehaan@mobil80.com
 *
 * Uses TABLE_PREFIX (default VoxaStack-) to find HandlesTable. Region from AWS_REGION or us-east-1.
 */

const path = require("path");
const AWS = require(path.resolve(__dirname, "../cdk/node_modules/aws-sdk"));

const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || "us-east-1";
const tablePrefix = process.env.TABLE_PREFIX || "VoxaStack-";

const dynamo = new AWS.DynamoDB({ region });
const docClient = new AWS.DynamoDB.DocumentClient({ region });

async function findHandlesTable() {
  const out = await dynamo.listTables().promise();
  const name = (out.TableNames || []).find((n) => n.startsWith(tablePrefix) && n.includes("Handles"));
  return name || null;
}

async function main() {
  const email = process.argv[2];
  if (!email || !email.includes("@")) {
    console.error("Usage: node check-owner-email.js <email>");
    console.error("Example: node check-owner-email.js rehaan@mobil80.com");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const tableName = await findHandlesTable();
  if (!tableName) {
    console.error("Could not find Handles table (prefix: %s)", tablePrefix);
    process.exit(1);
  }

  try {
    const result = await docClient
      .query({
        TableName: tableName,
        IndexName: "OwnerEmailIndex",
        KeyConditionExpression: "ownerEmail = :e",
        ExpressionAttributeValues: { ":e": normalizedEmail },
      })
      .promise();

    const items = result.Items || [];
    if (items.length === 0) {
      console.log("No business found for: %s", normalizedEmail);
      return;
    }
    console.log("Yes. %s owns %d business(es):", normalizedEmail, items.length);
    items.forEach((item) => {
      console.log("  - %s (handle: %s)", item.displayName || item.businessName || item.handle, item.handle);
    });
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

main();
