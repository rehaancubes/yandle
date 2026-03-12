/**
 * Returns the formatted knowledge document that the AI voice agent currently uses,
 * built live from DynamoDB (same logic as sync-knowledge.js buildKnowledgeDocument).
 * GET /knowledge/preview?handle=<handle>  (JWT-authenticated, owner/member access)
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

const HANDLES_TABLE = process.env.HANDLES_TABLE;
const BRANCHES_TABLE = process.env.BRANCHES_TABLE;
const SERVICES_TABLE = process.env.SERVICES_TABLE;
const DOCTORS_TABLE = process.env.DOCTORS_TABLE;
const LOCATIONS_TABLE = process.env.LOCATIONS_TABLE;
const GAMING_CENTERS_TABLE = process.env.GAMING_CENTERS_TABLE;
const CATALOG_TABLE = process.env.CATALOG_TABLE;
const MEMBERS_TABLE = process.env.MEMBERS_TABLE;

function normalizeHandle(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

async function queryAll(tableName, handle) {
  if (!tableName) return [];
  try {
    const result = await ddb.query({
      TableName: tableName,
      KeyConditionExpression: "handle = :h",
      ExpressionAttributeValues: { ":h": handle }
    }).promise();
    return result.Items || [];
  } catch (_) {
    return [];
  }
}

function buildKnowledgeDocument(handle, profile, branches, services, doctors, locations, centers, catalogItems) {
  const lines = [];
  lines.push(`Business: ${profile?.displayName || handle}`);
  lines.push(`Handle: ${handle}`);
  if (profile?.businessName) lines.push(`Name: ${profile.businessName}`);
  if (profile?.address) lines.push(`Address: ${profile.address}`);
  if (profile?.city) lines.push(`City: ${profile.city}`);
  if (profile?.phoneNumber) lines.push(`Phone: ${profile.phoneNumber}`);
  if (profile?.useCaseId) lines.push(`\nBusiness type: ${profile.useCaseId}`);
  if (profile?.knowledgeBaseCustomText) {
    lines.push("\n--- Custom knowledge (pricing, policies, FAQ) ---");
    lines.push(profile.knowledgeBaseCustomText);
  }
  if (profile?.knowledgeSummary) lines.push(`\nAbout / policies:\n${profile.knowledgeSummary}`);

  if (branches && branches.length > 0) {
    lines.push("\n--- Branches / locations ---");
    branches.forEach((b) => {
      lines.push(`Branch: ${b.name || b.branchId}. Location: ${b.location || "—"}. Address: ${b.address || "—"}. Capacity: ${b.capacity ?? 1}.`);
    });
  }

  if (services && services.length > 0) {
    lines.push("\n--- Services (name, duration, pricing) ---");
    services.forEach((s) => {
      const price = s.priceCents != null ? `$${(Number(s.priceCents) / 100).toFixed(2)}` : "—";
      lines.push(`Service: ${s.name || s.serviceId}. Duration: ${s.durationMinutes ?? 0} minutes. Price: ${price}.`);
    });
  }

  if (doctors && doctors.length > 0) {
    lines.push("\n--- Doctors ---");
    doctors.forEach((d) => {
      lines.push(`Doctor: ${d.name || d.doctorId}. Specialty: ${d.specialty || "—"}.`);
    });
  }

  if (locations && locations.length > 0) {
    lines.push("\n--- Locations (clinics/offices) ---");
    locations.forEach((l) => {
      lines.push(`Location: ${l.name || l.locationId}. Address: ${l.address || "—"}.`);
    });
  }

  if (centers && centers.length > 0) {
    lines.push("\n--- Gaming centers & machines ---");
    centers.forEach((c) => {
      const loc = c.location ? ` Location: ${c.location}.` : "";
      lines.push(`Center: ${c.name || c.centerId}.${loc}`);
      (c.machines || []).forEach((m) => {
        const price = m.pricePerHour != null ? ` $${Number(m.pricePerHour) / 100}/hr` : "";
        lines.push(`  Machine: ${m.name || m.type}. Type: ${m.type}. Capacity: ${m.count ?? 1}.${price}`);
      });
    });
  }

  if (catalogItems && catalogItems.length > 0) {
    lines.push("\n--- Product catalog ---");
    catalogItems.forEach((item) => {
      const price = item.price != null ? ` Price: ${item.price}.` : "";
      const stock = item.inStock !== false
        ? (item.qty != null ? ` Stock: ${item.qty} units.` : " In stock.")
        : " OUT OF STOCK.";
      const category = item.category ? ` Category: ${item.category}.` : "";
      const desc = item.description ? ` ${item.description}` : "";
      lines.push(`Product: ${item.name}.${price}${stock}${category}${desc}`);
      if (item.customFields && typeof item.customFields === "object") {
        const fields = Object.entries(item.customFields).map(([k, v]) => `${k}: ${v}`).join(", ");
        if (fields) lines.push(`  Details: ${fields}`);
      }
    });
  }

  return lines.join("\n");
}

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  try {
    const handle = normalizeHandle(
      event.queryStringParameters?.handle || event.pathParameters?.handle
    );
    if (!handle) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "handle is required" }) };
    }
    if (!HANDLES_TABLE) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "HANDLES_TABLE not set" }) };
    }

    // Auth check: caller must own or be a member of this handle
    const callerId = event.requestContext?.authorizer?.jwt?.claims?.sub ||
      event.requestContext?.authorizer?.claims?.sub;
    const callerEmail = (
      event.requestContext?.authorizer?.jwt?.claims?.email ||
      event.requestContext?.authorizer?.claims?.email || ""
    ).toLowerCase();
    if (callerId || callerEmail) {
      const profileCheck = await ddb.get({ TableName: HANDLES_TABLE, Key: { handle } }).promise();
      const isOwner = profileCheck.Item?.ownerSub === callerId;
      let isMember = false;
      if (!isOwner && MEMBERS_TABLE && callerEmail) {
        try {
          // Members table PK=handle SK=email — must use email (not sub)
          const memberCheck = await ddb.get({
            TableName: MEMBERS_TABLE,
            Key: { handle, email: callerEmail }
          }).promise();
          isMember = !!memberCheck.Item;
        } catch (_) {}
      }
      if (!isOwner && !isMember) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Not authorized for this handle" }) };
      }
    }

    const [profileRes, branches, services, doctors, locations, centers, catalogItems] = await Promise.all([
      ddb.get({ TableName: HANDLES_TABLE, Key: { handle } }).promise(),
      queryAll(BRANCHES_TABLE, handle),
      queryAll(SERVICES_TABLE, handle),
      queryAll(DOCTORS_TABLE, handle),
      queryAll(LOCATIONS_TABLE, handle),
      queryAll(GAMING_CENTERS_TABLE, handle),
      queryAll(CATALOG_TABLE, handle)
    ]);

    const profile = profileRes.Item || {};
    const content = buildKnowledgeDocument(handle, profile, branches, services, doctors, locations, centers, catalogItems);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, handle, content })
    };
  } catch (err) {
    console.error("[knowledge-preview] Error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error", details: err.message }) };
  }
};
