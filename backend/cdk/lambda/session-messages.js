const AWS = require("aws-sdk");

const ddb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const sessionId = String(event.pathParameters?.sessionId || "");
    if (!sessionId) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "sessionId is required" })
      };
    }

    const limit = Math.min(Number(event.queryStringParameters?.limit || 40), 200);

    const result = await ddb
      .query({
        TableName: process.env.CONVERSATIONS_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :msg)",
        ExpressionAttributeValues: {
          ":pk": `SESSION#${sessionId}`,
          ":msg": "MSG#"
        },
        ScanIndexForward: true,
        Limit: limit
      })
      .promise();

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        messages: result.Items || []
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};
