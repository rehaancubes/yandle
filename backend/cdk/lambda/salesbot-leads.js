const AWS = require("aws-sdk");
const https = require("https");
const ddb = new AWS.DynamoDB.DocumentClient();

const SUPER_ADMINS = ["rehaanr4@gmail.com", "rehaan@mobil80.com"];

function isSuperAdmin(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  const email = (claims.email || claims["cognito:username"] || "").toLowerCase();
  return SUPER_ADMINS.includes(email);
}

/**
 * Fetch businesses from Google Places API (Text Search)
 * Returns: { businesses: [{ name, phone, address, placeId, rating, website, types }] }
 */
async function searchPlaces(businessType, location) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not configured");

  const query = `${businessType} in ${location}`;

  // Step 1: Text Search to get place IDs
  const searchBody = JSON.stringify({
    textQuery: query,
    maxResultCount: 20,
    languageCode: "en",
  });

  const searchResult = await httpPost(
    "places.googleapis.com",
    "/v1/places:searchText",
    searchBody,
    {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.websiteUri,places.types,places.userRatingCount",
    }
  );

  const places = searchResult.places || [];

  return places
    .filter((p) => p.internationalPhoneNumber || p.nationalPhoneNumber)
    .map((p) => ({
      name: p.displayName?.text || "Unknown",
      phone: p.internationalPhoneNumber || p.nationalPhoneNumber || "",
      address: p.formattedAddress || "",
      placeId: p.id || "",
      rating: p.rating || null,
      ratingCount: p.userRatingCount || 0,
      website: p.websiteUri || null,
      types: (p.types || []).slice(0, 3),
    }));
}

function httpPost(host, path, body, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, port: 443, path, method: "POST", headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON from Places API: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  try {
    if (!isSuperAdmin(event)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const path = event.requestContext?.http?.path || "";
    const method = event.requestContext?.http?.method || "";
    const qs = event.queryStringParameters || {};

    // GET /bms/salesbot/leads?all=1 — list all outbound-call leads (every call including test)
    if (method === "GET" && path.endsWith("/leads") && qs.all === "1") {
      const TABLE = process.env.SALES_LEADS_TABLE;
      if (!TABLE) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "SALES_LEADS_TABLE not set" }) };
      }
      const limit = Math.min(Number(qs.limit) || 200, 500);
      const result = await ddb.scan({ TableName: TABLE, Limit: limit }).promise();
      const items = (result.Items || []).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ leads: items }),
      };
    }

    // GET /bms/salesbot/leads?type=salon&location=Bangalore — Google Places search for lead finder
    if (method === "GET" && path.endsWith("/leads")) {
      const businessType = qs.type;
      const location = qs.location;

      if (!businessType || !location) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "type and location are required" }),
        };
      }

      const businesses = await searchPlaces(businessType, location);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ businesses, query: `${businessType} in ${location}` }),
      };
    }

    // POST /bms/salesbot/leads/save — batch save leads to a campaign
    if (method === "POST" && path.endsWith("/leads/save")) {
      const body = JSON.parse(event.body || "{}");
      const { campaignId, leads } = body;

      if (!campaignId || !leads || !Array.isArray(leads)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "campaignId and leads[] are required" }),
        };
      }

      const TABLE = process.env.SALES_LEADS_TABLE;
      const now = new Date().toISOString();

      // Batch write in groups of 25 (omit callUniqueId — it's a GSI key; null would cause "Type mismatch")
      const items = leads.map((lead) => ({
        campaignId,
        leadId: lead.leadId || generateId(),
        businessName: lead.name || lead.businessName || "Unknown",
        phoneNumber: lead.phone || lead.phoneNumber || "",
        address: lead.address || "",
        googlePlaceId: lead.placeId || lead.googlePlaceId || "",
        rating: lead.rating ?? undefined,
        website: lead.website ?? undefined,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      }));

      const batches = [];
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        batches.push(
          ddb
            .batchWrite({
              RequestItems: {
                [TABLE]: batch.map((item) => ({ PutRequest: { Item: item } })),
              },
            })
            .promise()
        );
      }
      await Promise.all(batches);

      // Update campaign totalLeads
      const CAMPAIGNS_TABLE = process.env.SALES_CAMPAIGNS_TABLE;
      await ddb
        .update({
          TableName: CAMPAIGNS_TABLE,
          Key: { campaignId },
          UpdateExpression: "SET totalLeads = :count, updatedAt = :now",
          ExpressionAttributeValues: { ":count": items.length, ":now": now },
        })
        .promise();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ saved: items.length, campaignId }),
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (error) {
    console.error("[salesbot-leads] Error:", error.message, error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

function generateId() {
  return "lead_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
