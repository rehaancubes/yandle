const AWS = require("aws-sdk");

const ddb = new AWS.DynamoDB.DocumentClient();

async function queryAll(tableName, keyName, handle) {
  if (!tableName) return [];
  try {
    const result = await ddb
      .query({
        TableName: tableName,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle }
      })
      .promise();
    return result.Items || [];
  } catch (e) {
    return [];
  }
}

exports.handler = async (event) => {
  try {
    const handle = String(event.pathParameters?.handle || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "");

    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" })
      };
    }

    if (!process.env.HANDLES_TABLE) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Server misconfigured: HANDLES_TABLE is missing" })
      };
    }

    const result = await ddb
      .get({
        TableName: process.env.HANDLES_TABLE,
        Key: { handle }
      })
      .promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Handle not found" })
      };
    }

    const profile = { ...result.Item };
    if (!profile.knowledgeBaseId && process.env.DEFAULT_KNOWLEDGE_BASE_ID) {
      const defaultId = String(process.env.DEFAULT_KNOWLEDGE_BASE_ID || "").trim();
      if (defaultId) profile.knowledgeBaseId = defaultId;
    }

    // Attach website config (theme, gallery images) for mobile app and ShareableLink
    if (process.env.WEBSITE_CONFIG_TABLE) {
      try {
        const wcResult = await ddb.get({ TableName: process.env.WEBSITE_CONFIG_TABLE, Key: { handle } }).promise();
        const wc = wcResult.Item || {};
        if (wc.colorTheme) profile.colorTheme = wc.colorTheme;
        if (Array.isArray(wc.galleryImages) && wc.galleryImages.length > 0) profile.galleryImages = wc.galleryImages;
        if (wc.heroTagline) profile.heroTagline = wc.heroTagline;
      } catch (_) {}
    }

    const [doctors, locations, services, branches, centers] = await Promise.all([
      queryAll(process.env.DOCTORS_TABLE, "doctorId", handle),
      queryAll(process.env.LOCATIONS_TABLE, "locationId", handle),
      queryAll(process.env.SERVICES_TABLE, "serviceId", handle),
      queryAll(process.env.BRANCHES_TABLE, "branchId", handle),
      queryAll(process.env.GAMING_CENTERS_TABLE, "centerId", handle)
    ]);

    if (doctors.length) profile.doctors = doctors;
    if (locations.length) profile.locations = locations;
    if (services.length) profile.services = services;
    if (branches.length) profile.branches = branches;
    if (centers.length) profile.centers = centers;

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
        handle: event.pathParameters?.handle || null
      })
    };
  }
};
