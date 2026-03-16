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

/**
 * Collect all (lat, lng, address, locationId, locationName, type) points for a handle.
 * Each point has: lat, lng, address, locationId?, branchId?, centerId?, locationName, locationType.
 * If no geo points exist, returns one virtual point with handle-level address for a single listing.
 */
function getLocationPoints(handleItem, locations, branches, centers) {
  const points = [];
  if (typeof handleItem.geoLat === "number" && typeof handleItem.geoLng === "number") {
    points.push({
      lat: handleItem.geoLat,
      lng: handleItem.geoLng,
      address: handleItem.address || "",
      locationId: null,
      branchId: null,
      centerId: null,
      locationName: null,
      locationType: "handle"
    });
  }
  for (const loc of locations) {
    if (typeof loc.geoLat === "number" && typeof loc.geoLng === "number") {
      points.push({
        lat: loc.geoLat,
        lng: loc.geoLng,
        address: loc.address || loc.name || "",
        locationId: loc.locationId || null,
        branchId: null,
        centerId: null,
        locationName: loc.name || "",
        locationType: "location"
      });
    }
  }
  for (const br of branches) {
    if (typeof br.geoLat === "number" && typeof br.geoLng === "number") {
      points.push({
        lat: br.geoLat,
        lng: br.geoLng,
        address: br.address || br.location || br.name || "",
        locationId: null,
        branchId: br.branchId || null,
        centerId: null,
        locationName: br.name || "",
        locationType: "branch"
      });
    }
  }
  for (const c of centers) {
    if (typeof c.geoLat === "number" && typeof c.geoLng === "number") {
      points.push({
        lat: c.geoLat,
        lng: c.geoLng,
        address: c.address || c.location || c.name || "",
        locationId: null,
        branchId: null,
        centerId: c.centerId || null,
        locationName: c.name || "",
        locationType: "center"
      });
    }
  }
  if (points.length === 0) {
    points.push({
      lat: null,
      lng: null,
      address: handleItem.address || "",
      locationId: null,
      branchId: null,
      centerId: null,
      locationName: null,
      locationType: "handle"
    });
  }
  return points;
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
    if (categoryHint) {
      console.log("[discovery-search] category filter:", categoryHint);
    }

    const [handlesResult, locationsResult, branchesResult, centersResult] = await Promise.all([
      ddb.scan({ TableName: process.env.HANDLES_TABLE, Limit: 200 }).promise(),
      process.env.LOCATIONS_TABLE
        ? ddb.scan({ TableName: process.env.LOCATIONS_TABLE, Limit: 500 }).promise()
        : Promise.resolve({ Items: [] }),
      process.env.BRANCHES_TABLE
        ? ddb.scan({ TableName: process.env.BRANCHES_TABLE, Limit: 500 }).promise()
        : Promise.resolve({ Items: [] }),
      process.env.GAMING_CENTERS_TABLE
        ? ddb.scan({ TableName: process.env.GAMING_CENTERS_TABLE, Limit: 500 }).promise()
        : Promise.resolve({ Items: [] })
    ]);

    const items = Array.isArray(handlesResult.Items) ? handlesResult.Items : [];
    const locationsByHandle = {};
    for (const loc of locationsResult.Items || []) {
      const h = loc.handle;
      if (h) {
        if (!locationsByHandle[h]) locationsByHandle[h] = [];
        locationsByHandle[h].push(loc);
      }
    }
    const branchesByHandle = {};
    for (const br of branchesResult.Items || []) {
      const h = br.handle;
      if (h) {
        if (!branchesByHandle[h]) branchesByHandle[h] = [];
        branchesByHandle[h].push(br);
      }
    }
    const centersByHandle = {};
    for (const c of centersResult.Items || []) {
      const h = c.handle;
      if (h) {
        if (!centersByHandle[h]) centersByHandle[h] = [];
        centersByHandle[h].push(c);
      }
    }

    const results = [];

    for (const item of items) {
      const handle = item.handle;
      if (!handle) continue;

      const displayName = item.displayName || handle;
      const businessName = item.businessName || displayName;
      const useCaseId = (item.useCaseId || "").toString().toLowerCase();
      const category = (item.category || item.useCaseId || "").toString().toLowerCase();
      const cityField = (item.city || "").toString().toLowerCase();
      const tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [];
      const services = Array.isArray(item.services) ? item.services : [];
      const realtimeAvailability = item.realtimeAvailability || {};

      const locationPoints = getLocationPoints(
        item,
        locationsByHandle[handle] || [],
        branchesByHandle[handle] || [],
        centersByHandle[handle] || []
      );
      const defaultAddress = item.address || (locationPoints.length > 0 ? locationPoints[0].address : "");

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
          defaultAddress,
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

      if (categoryHint) {
        const match = category === categoryHint || useCaseId === categoryHint;
        if (match) {
          score += 5;
          reasons.push(`category matches: ${categoryHint}`);
        } else {
          if (process.env.LOG_LEVEL === "debug") {
            console.log("[discovery-search] handle skipped (category mismatch):", handle, "useCaseId:", useCaseId, "category:", category);
          }
          continue;
        }
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

      if (score <= 0) continue;

      for (const point of locationPoints) {
        let distanceKm;
        const addressForResult = point.address || defaultAddress;
        let rowScore = score;
        const rowReasons = [...reasons];
        if (lat != null && lng != null && typeof point.lat === "number" && typeof point.lng === "number") {
          distanceKm = haversineDistanceKm({ lat, lng }, { lat: point.lat, lng: point.lng });
          if (typeof distanceKm === "number") {
            const proximityBoost = Math.max(0, 5 - Math.min(distanceKm, 20) / 4);
            rowScore += proximityBoost;
            rowReasons.push("boosted by proximity");
          }
        } else if (lat != null && lng != null && typeof item.geoLat === "number" && typeof item.geoLng === "number") {
          distanceKm = haversineDistanceKm({ lat, lng }, { lat: item.geoLat, lng: item.geoLng });
          if (typeof distanceKm === "number") {
            const proximityBoost = Math.max(0, 5 - Math.min(distanceKm, 20) / 4);
            rowScore += proximityBoost;
            rowReasons.push("boosted by proximity");
          }
        }

        results.push({
          handle,
          displayName,
          businessName,
          category: item.category || item.useCaseId || null,
          address: addressForResult,
          city: item.city || null,
          phoneNumber: item.phoneNumber || null,
          hasAiPhone: item.hasAiPhone === true,
          hasWidget: item.hasWidget === true,
          planTier: item.planTier || null,
          realtimeAvailability,
          services,
          distanceKm: typeof distanceKm === "number" ? Number(distanceKm.toFixed(1)) : undefined,
          matchScore: Number(rowScore.toFixed(2)),
          reasons: rowReasons,
          locationId: point.locationId || undefined,
          branchId: point.branchId || undefined,
          centerId: point.centerId || undefined,
          locationName: point.locationName || undefined
        });
      }
    }

    results.sort((a, b) => b.matchScore - a.matchScore);

    // Attach first gallery image URL for each result (from website config)
    if (process.env.WEBSITE_CONFIG_TABLE && results.length > 0) {
      const handles = [...new Set(results.map((r) => r.handle))];
      const configMap = {};
      try {
        for (const handle of handles) {
          const wr = await ddb.get({ TableName: process.env.WEBSITE_CONFIG_TABLE, Key: { handle } }).promise();
          const gallery = wr.Item?.galleryImages;
          if (Array.isArray(gallery) && gallery.length > 0 && typeof gallery[0] === "string") {
            configMap[handle] = gallery[0];
          }
        }
        results.forEach((r) => { r.imageUrl = configMap[r.handle] || undefined; });
      } catch (_) {}
    }

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

