/**
 * GET /public/{handle}/slots?date=YYYY-MM-DD
 * Returns available time slots for the given handle on the given day (UTC).
 * No auth. Uses slot config from business config; default hours 09:00–18:00 UTC.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function addMinutes(isoStr, minutes) {
  const d = new Date(isoStr);
  d.setMinutes(d.getMinutes() + (minutes || 0));
  return d.toISOString();
}

function slotsOverlap(start1, dur1, start2, dur2) {
  const end1 = addMinutes(start1, dur1);
  const end2 = addMinutes(start2, dur2);
  return start1 < end2 && start2 < end1;
}

function getLogicalStartTime(item) {
  if (item.slotStartTime) return item.slotStartTime;
  const st = item.startTime || "";
  return st.includes("#") ? st.split("#")[0] : st;
}

const DEFAULT_OPEN_HOUR = 9;
const DEFAULT_CLOSE_HOUR = 18;
const DEFAULT_GRANULARITY_MINUTES = 15;
const SLOT_CONFIG_TYPE = "SLOT_CONFIG";

exports.handler = async (event) => {
  try {
    if (event.requestContext?.http?.method !== "GET" && event.httpMethod !== "GET") {
      return {
        statusCode: 405,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const handle = normalizeHandle(event.pathParameters?.handle);
    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" })
      };
    }

    const qs = event.queryStringParameters || {};
    const dateStr = (qs.date || "").trim();
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "date is required (YYYY-MM-DD)" })
      };
    }

    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const fromTime = dayStart.toISOString();
    const toTime = dayEnd.toISOString();

    let granularityMinutes = DEFAULT_GRANULARITY_MINUTES;
    let openHour = DEFAULT_OPEN_HOUR;
    let closeHour = DEFAULT_CLOSE_HOUR;
    if (process.env.BUSINESS_CONFIG_TABLE) {
      try {
        const configRes = await ddb.get({
          TableName: process.env.BUSINESS_CONFIG_TABLE,
          Key: { handle, configType: SLOT_CONFIG_TYPE }
        }).promise();
        const cfg = configRes.Item || {};
        if (cfg.slotGranularityMinutes != null) {
          granularityMinutes = Math.max(1, Math.min(120, Number(cfg.slotGranularityMinutes)));
        }
        if (cfg.openHour != null) openHour = Math.max(0, Math.min(23, Number(cfg.openHour)));
        if (cfg.closeHour != null) closeHour = Math.max(0, Math.min(24, Number(cfg.closeHour)));
        if (closeHour <= openHour) closeHour = openHour + 1;
      } catch (_) {}
    }

    const slotDurationMinutes = granularityMinutes;
    const centerName = (qs.centerName || "").trim();
    const machineType = (qs.machineType || "").trim();
    const isGamingPerMachine = centerName && machineType && process.env.GAMING_CENTERS_TABLE;

    let capacityForMachine = 1;
    if (isGamingPerMachine) {
      const centersRes = await ddb.query({
        TableName: process.env.GAMING_CENTERS_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle }
      }).promise();
      const centers = centersRes.Items || [];
      const center = centers.find((c) =>
        (c.name && c.name.toLowerCase() === centerName.toLowerCase()) ||
        (c.centerId && c.centerId.toLowerCase() === centerName.toLowerCase())
      );
      if (center && Array.isArray(center.machines)) {
        const machine = center.machines.find((m) =>
          (m.type && m.type.toLowerCase() === machineType.toLowerCase()) ||
          (m.name && m.name.toLowerCase() === machineType.toLowerCase())
        );
        capacityForMachine = machine ? Math.max(0, Number(machine.count) || 1) : 0;
      } else {
        capacityForMachine = 0;
      }
    }

    const slotStarts = [];
    for (let h = openHour; h < closeHour; h++) {
      for (let m = 0; m < 60; m += slotDurationMinutes) {
        const slotStart = new Date(dayStart);
        slotStart.setUTCHours(h, m, 0, 0);
        if (slotStart >= dayStart && slotStart < dayEnd) {
          slotStarts.push(slotStart.toISOString());
        }
      }
    }

    const handlesToQuery = [handle];
    if (!handle.startsWith("voxa-")) handlesToQuery.push("voxa-" + handle);
    const bookingsInDay = [];
    for (const h of handlesToQuery) {
      const result = await ddb.query({
        TableName: process.env.BOOKINGS_TABLE,
        KeyConditionExpression: "handle = :h AND startTime BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":h": h, ":from": fromTime, ":to": toTime + "\uffff" }
      }).promise();
      if (result.Items?.length) bookingsInDay.push(...result.Items);
    }

    const nowIso = new Date().toISOString();
    const isToday = dateStr === nowIso.slice(0, 10);

    const slots = [];
    for (const startTime of slotStarts) {
      if (isToday && startTime <= nowIso) continue;
      const durationMinutes = slotDurationMinutes;
      let available;
      if (isGamingPerMachine) {
        const overlappingSameMachine = bookingsInDay.filter((b) =>
          slotsOverlap(startTime, durationMinutes, getLogicalStartTime(b), b.durationMinutes || 0) &&
          String(b.centerName || "").toLowerCase() === centerName.toLowerCase() &&
          String(b.machineType || "").toLowerCase() === machineType.toLowerCase()
        );
        available = overlappingSameMachine.length < capacityForMachine;
      } else {
        const overlaps = bookingsInDay.some((b) =>
          slotsOverlap(startTime, durationMinutes, getLogicalStartTime(b), b.durationMinutes || 0)
        );
        available = !overlaps;
      }
      if (available) {
        slots.push({
          startTime,
          endTime: addMinutes(startTime, durationMinutes)
        });
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle,
        date: dateStr,
        slotGranularityMinutes: granularityMinutes,
        slots
      })
    };
  } catch (err) {
    console.error("[public-slots]", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
