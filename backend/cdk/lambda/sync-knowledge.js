/**
 * Syncs a handle's business data (profile, branches, services, doctors, locations, slot config)
 * into the shared Bedrock Knowledge Base: uploads content to S3 and starts an ingestion job.
 * Call this after handle-upsert or after branches/services/doctors/locations CRUD.
 */
const AWS = require("aws-sdk");
const { BedrockAgentClient, StartIngestionJobCommand, GetIngestionJobCommand } = require("@aws-sdk/client-bedrock-agent");
const ddb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const HANDLES_TABLE = process.env.HANDLES_TABLE;
const BRANCHES_TABLE = process.env.BRANCHES_TABLE;
const SERVICES_TABLE = process.env.SERVICES_TABLE;
const DOCTORS_TABLE = process.env.DOCTORS_TABLE;
const LOCATIONS_TABLE = process.env.LOCATIONS_TABLE;
const GAMING_CENTERS_TABLE = process.env.GAMING_CENTERS_TABLE;
const BUSINESS_CONFIG_TABLE = process.env.BUSINESS_CONFIG_TABLE;
const CATALOG_TABLE = process.env.CATALOG_TABLE;
const KB_CONTENT_BUCKET = process.env.KB_CONTENT_BUCKET;
const DEFAULT_KNOWLEDGE_BASE_ID = (process.env.DEFAULT_KNOWLEDGE_BASE_ID || "").trim();
const DEFAULT_KB_DATA_SOURCE_ID = (process.env.DEFAULT_KB_DATA_SOURCE_ID || "").trim();

const KB_PREFIX = "knowledge";

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
  } catch (e) {
    return [];
  }
}

function buildKnowledgeDocument(handle, profile, branches, services, doctors, locations, centers, slotConfig, catalogItems) {
  const lines = [];
  lines.push(`Business: ${profile?.displayName || handle}`);
  lines.push(`Handle: ${handle}`);
  if (profile?.businessName) lines.push(`Name: ${profile.businessName}`);
  if (profile?.address) lines.push(`Address: ${profile.address}`);
  if (profile?.city) lines.push(`City: ${profile.city}`);
  if (profile?.phoneNumber) lines.push(`Phone: ${profile.phoneNumber}`);
  if (profile?.useCaseId) lines.push(`\nBusiness type: ${profile.useCaseId}`);
  // Custom knowledge (pricing, FAQ, policies) first so retrieval and tool result include it
  if (profile?.knowledgeBaseCustomText) {
    lines.push("\n--- Custom knowledge (pricing, policies, FAQ) ---");
    lines.push(profile.knowledgeBaseCustomText);
  }
  if (profile?.knowledgeSummary) lines.push(`\nAbout / policies:\n${profile.knowledgeSummary}`);

  // Slot granularity and buffer are internal (used by booking tools only). Do not add to KB so the agent never mentions them to callers.

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
      // Custom fields
      if (item.customFields && typeof item.customFields === "object") {
        const fields = Object.entries(item.customFields).map(([k, v]) => `${k}: ${v}`).join(", ");
        if (fields) lines.push(`  Details: ${fields}`);
      }
    });
  }

  return lines.join("\n");
}

exports.handler = async (event) => {
  if (!KB_CONTENT_BUCKET) {
    return { ok: false, reason: "KB_CONTENT_BUCKET not set." };
  }
  if (!HANDLES_TABLE) {
    return { ok: false, reason: "HANDLES_TABLE not set." };
  }

  const handle = normalizeHandle(event.handle || event.pathParameters?.handle);
  if (!handle) {
    return { ok: false, reason: "handle is required." };
  }

  try {
    const [profileRes, branches, services, doctors, locations, centers, configRes, catalogItems] = await Promise.all([
      ddb.get({ TableName: HANDLES_TABLE, Key: { handle } }).promise(),
      queryAll(BRANCHES_TABLE, handle),
      queryAll(SERVICES_TABLE, handle),
      queryAll(DOCTORS_TABLE, handle),
      queryAll(LOCATIONS_TABLE, handle),
      queryAll(GAMING_CENTERS_TABLE, handle),
      BUSINESS_CONFIG_TABLE
        ? ddb.get({ TableName: BUSINESS_CONFIG_TABLE, Key: { handle, configType: "SLOT_CONFIG" } }).promise()
        : Promise.resolve({ Item: null }),
      queryAll(CATALOG_TABLE, handle)
    ]);

    const profile = profileRes.Item || {};
    const slotConfig = configRes.Item || {};
    const knowledgeBaseId = profile.knowledgeBaseId || DEFAULT_KNOWLEDGE_BASE_ID;
    const dataSourceId = profile.dataSourceId || DEFAULT_KB_DATA_SOURCE_ID;
    if (!knowledgeBaseId || !dataSourceId) {
      console.warn("[sync-knowledge] No KB configured for handle:", handle, "profile.knowledgeBaseId:", profile.knowledgeBaseId || "(missing)", "profile.dataSourceId:", profile.dataSourceId || "(missing)", "DEFAULT_KNOWLEDGE_BASE_ID:", DEFAULT_KNOWLEDGE_BASE_ID || "(unset)", "DEFAULT_KB_DATA_SOURCE_ID:", DEFAULT_KB_DATA_SOURCE_ID || "(unset)");
      return { ok: true, handle, message: "No knowledge base configured for this handle; skip sync." };
    }
    console.log("[sync-knowledge] Syncing handle:", handle, "knowledgeBaseId:", knowledgeBaseId, "dataSourceId:", dataSourceId);

    const content = buildKnowledgeDocument(handle, profile, branches, services, doctors, locations, centers, slotConfig, catalogItems);
    const key = `${KB_PREFIX}/${handle}/content.txt`;
    const metadataKey = `${KB_PREFIX}/${handle}/content.txt.metadata.json`;

    await s3.putObject({
      Bucket: KB_CONTENT_BUCKET,
      Key: key,
      Body: content,
      ContentType: "text/plain"
    }).promise();

    // Bedrock requires a valid metadata file per doc; use the documented schema (see kb-metadata / S3 data source).
    const metadata = {
      metadataAttributes: {
        handle: {
          value: { type: "STRING", stringValue: handle },
          includeForEmbedding: false
        }
      }
    };
    await s3.putObject({
      Bucket: KB_CONTENT_BUCKET,
      Key: metadataKey,
      Body: JSON.stringify(metadata),
      ContentType: "application/json"
    }).promise();

    const region = process.env.AWS_REGION || process.env.BEDROCK_REGION || "us-east-1";
    const bedrockAgent = new BedrockAgentClient({ region });
    const startResult = await bedrockAgent.send(new StartIngestionJobCommand({
      knowledgeBaseId,
      dataSourceId
    }));

    const ingestionJobId = startResult.ingestionJob?.ingestionJobId;
    console.log("[sync-knowledge] Upload done. Ingestion job started:", ingestionJobId);

    // Poll for completion so we can log success/failure (ingestion must complete for Retrieve to return results)
    const pollIntervalMs = 8000;
    const pollMaxMs = 52000; // stay under 60s Lambda timeout
    let status;
    let lastJob;
    for (let elapsed = 0; elapsed < pollMaxMs; elapsed += pollIntervalMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const getRes = await bedrockAgent.send(new GetIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId,
        ingestionJobId
      }));
      lastJob = getRes.ingestionJob;
      status = lastJob?.status;
      if (status === "COMPLETE" || status === "FAILED") break;
    }

    if (lastJob) {
      const stats = lastJob.statistics || {};
      console.log("[sync-knowledge] Ingestion job", status, "handle:", handle, "stats:", JSON.stringify(stats));
      if (lastJob.failureReasons?.length) {
        console.error("[sync-knowledge] Ingestion failureReasons:", lastJob.failureReasons);
      }
      if (stats.numberOfDocumentsFailed > 0) {
        console.error("[sync-knowledge] Some documents failed to index; check failureReasons above or Bedrock console.");
      }
    } else {
      console.log("[sync-knowledge] Ingestion job still in progress after", pollMaxMs, "ms; check Bedrock console for final status.");
    }

    return {
      ok: true,
      handle,
      ingestionJobId,
      ingestionStatus: status,
      message: status === "COMPLETE"
        ? "Knowledge document uploaded and ingestion completed."
        : status === "FAILED"
          ? "Ingestion failed; check CloudWatch for failureReasons."
          : "Document uploaded and ingestion started; completion pending."
    };
  } catch (err) {
    console.error("[sync-knowledge] Error handle:", handle, "error:", err.message, "name:", err.name, "code:", err.code);
    throw err;
  }
};
