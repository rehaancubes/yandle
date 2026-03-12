const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const { assertAccess } = require("./auth-helper");

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  try {
    return typeof str === "string" ? JSON.parse(str) : {};
  } catch (e) {
    throw new Error("Invalid JSON body: " + e.message);
  }
}

function getCallerInfo(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  return { sub: claims.sub, email: claims.email || claims["cognito:username"] };
}

exports.handler = async (event) => {
  try {
    const CONFIG_TABLE = process.env.WEBSITE_CONFIG_TABLE;
    const HANDLES_TABLE = process.env.HANDLES_TABLE;
    if (!CONFIG_TABLE) {
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "WEBSITE_CONFIG_TABLE not set" }) };
    }

    const method = event.requestContext?.http?.method;
    const path = event.requestContext?.http?.path || "";

    // GET /website/public/{handle} — public endpoint for website rendering
    if (method === "GET" && path.includes("/website/public/")) {
      const handle = event.pathParameters?.handle;
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle required" }) };
      }

      // Fetch config, profile, and structured data in parallel
      const fetchPromises = [
        ddb.get({ TableName: CONFIG_TABLE, Key: { handle } }).promise(),
        HANDLES_TABLE ? ddb.get({ TableName: HANDLES_TABLE, Key: { handle } }).promise() : { Item: null }
      ];
      // Fetch structured business data for the website
      if (process.env.GAMING_CENTERS_TABLE) {
        fetchPromises.push(ddb.query({ TableName: process.env.GAMING_CENTERS_TABLE, KeyConditionExpression: "handle = :h", ExpressionAttributeValues: { ":h": handle } }).promise());
      } else { fetchPromises.push(Promise.resolve({ Items: [] })); }
      if (process.env.BRANCHES_TABLE) {
        fetchPromises.push(ddb.query({ TableName: process.env.BRANCHES_TABLE, KeyConditionExpression: "handle = :h", ExpressionAttributeValues: { ":h": handle } }).promise());
      } else { fetchPromises.push(Promise.resolve({ Items: [] })); }
      if (process.env.SERVICES_TABLE) {
        fetchPromises.push(ddb.query({ TableName: process.env.SERVICES_TABLE, KeyConditionExpression: "handle = :h", ExpressionAttributeValues: { ":h": handle } }).promise());
      } else { fetchPromises.push(Promise.resolve({ Items: [] })); }
      if (process.env.DOCTORS_TABLE) {
        fetchPromises.push(ddb.query({ TableName: process.env.DOCTORS_TABLE, KeyConditionExpression: "handle = :h", ExpressionAttributeValues: { ":h": handle } }).promise());
      } else { fetchPromises.push(Promise.resolve({ Items: [] })); }

      const [configResult, profileResult, centersResult, branchesResult, servicesResult, doctorsResult] = await Promise.all(fetchPromises);

      const config = configResult.Item || {};
      const profile = profileResult.Item || {};

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle,
          // Website config
          heroTagline: config.heroTagline || "",
          aboutText: config.aboutText || "",
          galleryImages: config.galleryImages || [],
          colorTheme: config.colorTheme || "#4F46E5",
          contactEmail: config.contactEmail || "",
          socialLinks: config.socialLinks || {},
          // Business profile
          displayName: profile.displayName || handle,
          businessName: profile.businessName || "",
          category: profile.category || "",
          useCaseId: profile.useCaseId || "",
          address: profile.address || "",
          city: profile.city || "",
          phoneNumber: profile.phoneNumber || "",
          geoLat: profile.geoLat,
          geoLng: profile.geoLng,
          hasAiPhone: profile.hasAiPhone || false,
          voiceId: profile.voiceId || "tiffany",
          // Structured business data
          centers: centersResult.Items || [],
          branches: branchesResult.Items || [],
          services: servicesResult.Items || [],
          doctors: doctorsResult.Items || []
        })
      };
    }

    // GET /website/config?handle=xxx — authed, full config for dashboard
    if (method === "GET") {
      const handle = event.queryStringParameters?.handle;
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle required" }) };
      }
      const { sub, email } = getCallerInfo(event);
      await assertAccess(handle, sub, email);

      const result = await ddb.get({ TableName: CONFIG_TABLE, Key: { handle } }).promise();
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(result.Item || { handle }) };
    }

    // POST /website/config — save config
    if (method === "POST") {
      const body = parseBody(event);
      const handle = String(body.handle || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle required" }) };
      }
      const { sub, email } = getCallerInfo(event);
      await assertAccess(handle, sub, email);

      const now = new Date().toISOString();
      const item = {
        handle,
        heroTagline: body.heroTagline || "",
        aboutText: body.aboutText || "",
        galleryImages: Array.isArray(body.galleryImages) ? body.galleryImages : [],
        colorTheme: body.colorTheme || "#4F46E5",
        contactEmail: body.contactEmail || "",
        socialLinks: body.socialLinks || {},
        updatedAt: now
      };

      await ddb.put({ TableName: CONFIG_TABLE, Item: item }).promise();

      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, config: item }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    if (error.message === "FORBIDDEN") {
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Access denied" }) };
    }
    if (error.message === "NOT_FOUND") {
      return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found" }) };
    }
    console.error("[website-config] Error:", error.message, error.stack);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
