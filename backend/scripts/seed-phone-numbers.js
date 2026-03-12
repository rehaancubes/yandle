/**
 * One-time seed script to populate PhoneNumbersTable with DID range.
 * Usage: PHONE_NUMBERS_TABLE=<table-name> node seed-phone-numbers.js
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE = process.env.PHONE_NUMBERS_TABLE;
if (!TABLE) {
  console.error("Set PHONE_NUMBERS_TABLE env var");
  process.exit(1);
}

const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }));

const DID_START = 8035229465;
const DID_END = 8035229492;
const COUNTRY_CODE = "+91";

async function seed() {
  let seeded = 0;
  let skipped = 0;
  for (let num = DID_START; num <= DID_END; num++) {
    const phoneNumber = `${COUNTRY_CODE}${num}`;
    try {
      await ddbDoc.send(new PutCommand({
        TableName: TABLE,
        Item: {
          phoneNumber,
          status: "available",
          monthlyPrice: 500,
          createdAt: new Date().toISOString()
        },
        ConditionExpression: "attribute_not_exists(phoneNumber)"
      }));
      console.log(`Seeded ${phoneNumber}`);
      seeded++;
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        console.log(`${phoneNumber} already exists, skipping`);
        skipped++;
      } else {
        throw e;
      }
    }
  }
  console.log(`\nDone. Seeded: ${seeded}, Skipped: ${skipped}, Total: ${seeded + skipped}`);
}

seed().catch(e => { console.error(e); process.exit(1); });
