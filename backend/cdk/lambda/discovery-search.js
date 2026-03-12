const AWS = require("aws-sdk");

const ddb = new AWS.DynamoDB.DocumentClient();

function parseNumber(value, fallback = undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineDistanceKm(a, b) {
  if (
    typeof a?.lat !== "number" ||
    typeof a?.lng !== "number" ||
    typeof b?.lat !== "number" ||
    typeof b?.lng !== "number"
  ) {
    return undefined;
  }
  const R = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

exports.handler = async (event) => {
  try {
    if (!process.env.HANDLES_TABLE) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Server misconfigured", details: "HANDLES_TABLE is not set" })
      };
    }

    const method = event.requestContext?.http?.method || event.httpMethod || "GET";
    if (method !== "GET") {
      return {
        statusCode: 405,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const qs = event.queryStringParameters || {};
    const rawQuery = String(qs.q || qs.query || "").trim();
    const q = rawQuery.toLowerCase();
    const lat = parseNumber(qs.lat);
    const lng = parseNumber(qs.lng);
    const city = (qs.city || "").toString().trim().toLowerCase();
    const categoryHint = (qs.category || "").toString().trim().toLowerCase();
    const isUrgent = /now|urgent|asap|immediately|tonight|today/.test(q);

    const scanResult = await ddb
      .scan({
        TableName: process.env.HANDLES_TABLE,
        Limit: 200
      })
      .promise();

    const items = Array.isArray(scanResult.Items) ? scanResult.Items : [];

    const results = [];

    for (const item of items) {
      const handle = item.handle;
      if (!handle) continue;

      const displayName = item.displayName || handle;
      const businessName = item.businessName || displayName;
      const category = (item.category || "").toString().toLowerCase();
      const address = item.address || "";
      const cityField = (item.city || "").toString().toLowerCase();
      const tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [];
      const services = Array.isArray(item.services) ? item.services : [];
      const realtimeAvailability = item.realtimeAvailability || {};

      let score = 0;
      const reasons = [];

      if (!q) {
        score += 1;
        reasons.push("matches: default");
      } else {
        const haystack = [
          handle,
          displayName,
          businessName,
          category,
          cityField,
          address,
          item.knowledgeSummary || ""
        ]
          .join(" ")
          .toLowerCase();

        if (haystack.includes(q)) {
          score += 5;
          reasons.push(`matches text: "${rawQuery}"`);
        }

        if (/hair|salon|barber/.test(q) && /salon|barber|hair/.test(haystack)) {
          score += 4;
          reasons.push("matches haircut use case");
        }

        if (/(mri|scan)/.test(q) && /mri|scan/.test(haystack)) {
          score += 4;
          reasons.push("matches MRI / scan use case");
        }

        if (/(ipl|f1|match|screening)/.test(q) && /(ipl|f1|sports|screening)/.test(haystack)) {
          score += 4;
          reasons.push("matches live screening use case");
        }
      }

      if (categoryHint && category === categoryHint) {
        score += 2;
        reasons.push(`category matches: ${categoryHint}`);
      }

      if (city && cityField && cityField === city) {
        score += 2;
        reasons.push(`city matches: ${city}`);
      }

      if (isUrgent && realtimeAvailability?.hasWalkInSlots) {
        score += 3;
        reasons.push("marked as walk-in friendly");
      }

      if (isUrgent && realtimeAvailability?.supportsUrgentCases) {
        score += 3;
        reasons.push("marked as urgent-capable");
      }

      let distanceKm;
      if (lat != null && lng != null && typeof item.geoLat === "number" && typeof item.geoLng === "number") {
        distanceKm = haversineDistanceKm(
          { lat, lng },
          { lat: item.geoLat, lng: item.geoLng }
        );
        if (typeof distanceKm === "number") {
          const proximityBoost = Math.max(0, 5 - Math.min(distanceKm, 20) / 4);
          score += proximityBoost;
          reasons.push("boosted by proximity");
        }
      }

      if (score <= 0) continue;

      results.push({
        handle,
        displayName,
        businessName,
        category: item.category || null,
        address,
        city: item.city || null,
        phoneNumber: item.phoneNumber || null,
        hasAiPhone: item.hasAiPhone === true,
        hasWidget: item.hasWidget === true,
        planTier: item.planTier || null,
        realtimeAvailability,
        services,
        distanceKm: typeof distanceKm === "number" ? Number(distanceKm.toFixed(1)) : undefined,
        matchScore: Number(score.toFixed(2)),
        reasons
      });
    }

    results.sort((a, b) => b.matchScore - a.matchScore);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: rawQuery || null,
        isUrgent,
        location: lat != null && lng != null ? { lat, lng } : null,
        city: city || null,
        category: categoryHint || null,
        results
      })
    };
  } catch (error) {
    const details = error.message || String(error);
    console.error("[discovery-search] Error:", details, "code:", error.code, "stack:", error.stack);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details, code: error.code })
    };
  }
};

