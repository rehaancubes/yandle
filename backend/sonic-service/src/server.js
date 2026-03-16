import http from "http";
import express from "express";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  NovaSonicBidirectionalStreamClient,
  StreamSession,
} from "./nova-sonic-client.js";
import {
  retrieveFromKnowledgeBase,
  formatRetrievalResultsForModel,
} from "./bedrock-kb-client.js";
import { SessionRecorder } from "./audio-recorder.js";

const app = express();
app.use(express.json());

const port = Number(process.env.PORT || 80);
const region = process.env.AWS_REGION || process.env.BEDROCK_REGION || "us-east-1";
const modelId = process.env.SONIC_MODEL_ID || "amazon.nova-2-sonic-v1:0";

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  path: "/socket.io/",
});

const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;
const HANDLES_TABLE = process.env.HANDLES_TABLE;
const SERVICES_TABLE = process.env.SERVICES_TABLE;
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE;
const BRANCHES_TABLE = process.env.BRANCHES_TABLE;
const GAMING_CENTERS_TABLE = process.env.GAMING_CENTERS_TABLE;
const CATALOG_TABLE = process.env.CATALOG_TABLE;
const TOKENS_TABLE = process.env.TOKENS_TABLE;
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE;
const CREDITS_TABLE = process.env.CREDITS_TABLE;
const REQUESTS_TABLE = process.env.REQUESTS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;

// DynamoDB client (used for booking tools)
const ddbDoc =
  BOOKINGS_TABLE != null && BOOKINGS_TABLE !== ""
    ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
    : null;

function normalizeHandle(raw) {
  let s = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
  // Canonical form: voxa.ai/m80esports → handle "m80esports" (strip leading "voxa-" if present)
  if (s.startsWith("voxa-")) s = s.slice(5);
  return s;
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

async function getOverlappingBookings(handle, startTime, durationMinutes, limit = 500) {
  if (!ddbDoc || !BOOKINGS_TABLE) return [];
  const start = new Date(startTime);
  const windowStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = addMinutes(startTime, durationMinutes + 7 * 24 * 60);
  const handlesToQuery = [handle];
  if (!handle.startsWith("voxa-")) handlesToQuery.push("voxa-" + handle);
  const all = [];
  for (const h of handlesToQuery) {
    const result = await ddbDoc.send(
      new QueryCommand({
        TableName: BOOKINGS_TABLE,
        KeyConditionExpression: "handle = :h AND startTime BETWEEN :lo AND :hi",
        ExpressionAttributeValues: { ":h": h, ":lo": windowStart, ":hi": windowEnd },
        Limit: limit,
      })
    );
    if (result.Items && result.Items.length) all.push(...result.Items);
  }
  return all.filter((b) =>
    slotsOverlap(b.startTime, b.durationMinutes || 0, startTime, durationMinutes)
  );
}

async function checkCapacityAndReject(handle, { branchId, centerName, machineType, doctorId, locationId }, startTime, durationMinutes) {
  const overlapping = await getOverlappingBookings(handle, startTime, durationMinutes);

  if (branchId && BRANCHES_TABLE && ddbDoc) {
    const branchRes = await ddbDoc.send(
      new GetCommand({
        TableName: BRANCHES_TABLE,
        Key: { handle, branchId: String(branchId).trim() },
      })
    );
    const capacity = Math.max(0, Number(branchRes.Item?.capacity) || 1);
    const count = overlapping.filter((b) => String(b.branchId || "") === String(branchId)).length;
    if (count >= capacity) {
      return { reject: true, error: "This branch is at capacity for the selected time. Please choose another slot or branch." };
    }
  }

  if ((centerName || machineType) && GAMING_CENTERS_TABLE && ddbDoc) {
    const centersRes = await ddbDoc.send(
      new QueryCommand({
        TableName: GAMING_CENTERS_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle },
      })
    );
    const centers = centersRes.Items || [];
    const center = centers.find(
      (c) =>
        (c.name && c.name.toLowerCase() === String(centerName || "").toLowerCase()) ||
        (c.centerId && c.centerId.toLowerCase() === String(centerName || "").toLowerCase())
    );
    if (center && Array.isArray(center.machines)) {
      const machine = center.machines.find(
        (m) =>
          (m.type && m.type.toLowerCase() === String(machineType || "").toLowerCase()) ||
          (m.name && m.name.toLowerCase() === String(machineType || "").toLowerCase())
      );
      const capacity = machine ? Math.max(0, Number(machine.count) || 1) : 0;
      const count = overlapping.filter(
        (b) =>
          String(b.centerName || "").toLowerCase() === String(centerName || "").toLowerCase() &&
          String(b.machineType || "").toLowerCase() === String(machineType || "").toLowerCase()
      ).length;
      if (count >= capacity) {
        return { reject: true, error: "No capacity for this machine type at this center for the selected time." };
      }
    }
  }

  if (doctorId) {
    const count = overlapping.filter((b) => String(b.doctorId || "") === String(doctorId)).length;
    if (count >= 1) {
      return { reject: true, error: "This doctor already has a booking in the selected time slot." };
    }
  }

  if (locationId) {
    const count = overlapping.filter((b) => String(b.locationId || "") === String(locationId)).length;
    if (count >= 1) {
      return { reject: true, error: "This location already has a booking in the selected time slot." };
    }
  }

  return { reject: false };
}

function attachToolHandlers(client) {
  if (!ddbDoc || !BOOKINGS_TABLE) {
    // Tools are effectively disabled if we cannot reach the bookings table.
    return;
  }

  client.registerToolHandler(
    "createBooking",
    async (input, { handle: sessionHandle } = {}) => {
      const handle = normalizeHandle(input.handle || sessionHandle);
      const centerName = String(input.centerName || "").trim();
      const machineType = String(input.machineType || "").trim();
      const startTime = String(input.startTime || "").trim();
      let durationMinutes = Number(input.durationMinutes || 0);
      const name = String(input.name || "").trim();
      const phone = String(input.phone || "").trim();
      const email = String(input.email || "").trim();
      const notes = String(input.notes || "").trim();
      let serviceId = input.serviceId != null ? String(input.serviceId).trim() : "";
      const serviceName = String(input.serviceName || "").trim();
      let branchId = input.branchId != null ? String(input.branchId).trim() : "";
      const branchName = String(input.branchName || "").trim();
      const doctorId = input.doctorId != null ? String(input.doctorId).trim() : "";
      const locationId = input.locationId != null ? String(input.locationId).trim() : "";

      if (!handle || !startTime || !name) {
        return {
          ok: false,
          error: "Missing required fields: handle, startTime, name.",
        };
      }
      if (!phone && !email) {
        return {
          ok: false,
          error: "At least one of phone or email is required.",
        };
      }

      if (HANDLES_TABLE && ddbDoc) {
        const profileRes = await ddbDoc.send(
          new GetCommand({
            TableName: HANDLES_TABLE,
            Key: { handle },
          })
        );
        const profile = profileRes.Item;
        const capturePhone = profile?.capturePhone !== false;
        const captureEmail = profile?.captureEmail !== false;
        if (capturePhone && !phone) {
          return { ok: false, error: "Phone is required for this business." };
        }
        if (captureEmail && !email) {
          return { ok: false, error: "Email is required for this business." };
        }
      }

      // Resolve serviceName → serviceId if serviceId not provided
      if (!serviceId && serviceName && SERVICES_TABLE && ddbDoc) {
        const svcQuery = await ddbDoc.send(
          new QueryCommand({
            TableName: SERVICES_TABLE,
            KeyConditionExpression: "handle = :h",
            ExpressionAttributeValues: { ":h": handle },
          })
        );
        const match = (svcQuery.Items || []).find(
          (s) => (s.name || "").toLowerCase() === serviceName.toLowerCase()
        );
        if (match) {
          serviceId = match.serviceId;
          if (!durationMinutes && match.durationMinutes) {
            durationMinutes = Number(match.durationMinutes);
          }
        }
      }

      // Resolve branchName → branchId if branchId not provided
      if (!branchId && branchName && BRANCHES_TABLE && ddbDoc) {
        const brQuery = await ddbDoc.send(
          new QueryCommand({
            TableName: BRANCHES_TABLE,
            KeyConditionExpression: "handle = :h",
            ExpressionAttributeValues: { ":h": handle },
          })
        );
        const match = (brQuery.Items || []).find(
          (b) => (b.name || "").toLowerCase() === branchName.toLowerCase()
        );
        if (match) {
          branchId = match.branchId;
        }
      }

      if (serviceId && !durationMinutes && SERVICES_TABLE && ddbDoc) {
        const svcRes = await ddbDoc.send(
          new GetCommand({
            TableName: SERVICES_TABLE,
            Key: { handle, serviceId },
          })
        );
        if (svcRes.Item?.durationMinutes != null) {
          durationMinutes = Number(svcRes.Item.durationMinutes);
        }
      }
      const useGamingShape = centerName || machineType;
      if (useGamingShape && (!centerName || !machineType || !durationMinutes)) {
        return {
          ok: false,
          error: "For gaming-style bookings, centerName, machineType, and durationMinutes are required.",
        };
      }
      if (!durationMinutes) {
        return {
          ok: false,
          error: "durationMinutes is required, or provide serviceId to use service duration.",
        };
      }

      const capacityCheck = await checkCapacityAndReject(
        handle,
        { branchId, centerName, machineType, doctorId, locationId },
        startTime,
        durationMinutes
      );
      if (capacityCheck.reject) {
        return { ok: false, error: capacityCheck.error };
      }

      const bookingId =
        input.bookingId ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const createdAt = new Date().toISOString();

      const item = {
        handle,
        startTime,
        bookingId,
        durationMinutes,
        name,
        status: input.status || "BOOKED",
        notes,
        createdAt,
      };
      if (phone) item.phone = phone;
      if (email) item.email = email;
      if (centerName) item.centerName = centerName;
      if (machineType) item.machineType = machineType;
      if (serviceId) item.serviceId = serviceId;
      if (branchId) item.branchId = branchId;
      if (doctorId) item.doctorId = doctorId;
      if (locationId) item.locationId = locationId;

      await ddbDoc.send(
        new PutCommand({
          TableName: BOOKINGS_TABLE,
          Item: item,
        })
      );

      if (CUSTOMERS_TABLE && ddbDoc && (phone || email)) {
        const now = new Date().toISOString();
        const phoneNorm = phone.trim();
        const emailNorm = email.trim();
        const custQuery = await ddbDoc.send(
          new QueryCommand({
            TableName: CUSTOMERS_TABLE,
            KeyConditionExpression: "handle = :h",
            ExpressionAttributeValues: { ":h": handle },
            Limit: 100,
          })
        );
        const found = (custQuery.Items || []).find(
          (i) =>
            (phoneNorm && i.phone === phoneNorm) ||
            (emailNorm && i.email === emailNorm)
        );
        const customerId = found?.customerId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const customerItem = {
          handle,
          customerId,
          name: name || (found && found.name) || "",
          phone: phoneNorm || (found && found.phone) || "",
          email: emailNorm || (found && found.email) || "",
          firstSeenAt: (found && found.firstSeenAt) || now,
          lastBookingAt: now,
          lastSessionAt: (found && found.lastSessionAt) || now,
          lastSeenAt: now,
        };
        await ddbDoc.send(
          new PutCommand({
            TableName: CUSTOMERS_TABLE,
            Item: customerItem,
          })
        );
      }

      return {
        ok: true,
        status: item.status,
        handle,
        startTime,
        durationMinutes,
        name,
        phone: item.phone,
        email: item.email,
        centerName: item.centerName,
        machineType: item.machineType,
        serviceId: item.serviceId,
        branchId: item.branchId,
        doctorId: item.doctorId,
        locationId: item.locationId,
        bookingId,
        notes,
        createdAt,
        booking: item,
      };
    }
  );

  client.registerToolHandler(
    "getBookingsForTimeRange",
    async (input, { handle: sessionHandle } = {}) => {
      const handle = normalizeHandle(input.handle || sessionHandle);
      const centerName = String(input.centerName || "").trim();
      const machineType = String(input.machineType || "").trim();
      const branchId = input.branchId != null ? String(input.branchId).trim() : "";
      const doctorId = input.doctorId != null ? String(input.doctorId).trim() : "";
      const locationId = input.locationId != null ? String(input.locationId).trim() : "";
      const fromTime = String(input.fromTime || "").trim();
      const toTime = String(input.toTime || "").trim();

      if (!handle || !fromTime || !toTime) {
        return {
          ok: false,
          error: "Missing required fields: handle, fromTime, toTime.",
        };
      }
      const useGaming = centerName || machineType;
      const useSalon = !!branchId;
      const useClinic = !!doctorId || !!locationId;
      if (!useGaming && !useSalon && !useClinic) {
        return {
          ok: false,
          error:
            "Provide centerName+machineType (gaming), or branchId (salon), or doctorId/locationId (clinic) to filter.",
        };
      }

      const from = new Date(fromTime);
      const to = new Date(toTime);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return {
          ok: false,
          error:
            "fromTime and toTime must be valid ISO 8601 timestamps.",
        };
      }

      const handlesToQuery = [handle];
      if (!handle.startsWith("voxa-")) handlesToQuery.push("voxa-" + handle);

      const allBookings = [];
      for (const h of handlesToQuery) {
        const result = await ddbDoc.send(
          new QueryCommand({
            TableName: BOOKINGS_TABLE,
            KeyConditionExpression: "handle = :h",
            ExpressionAttributeValues: { ":h": h },
            ScanIndexForward: true,
            Limit: 200,
          })
        );
        if (result.Items && result.Items.length) allBookings.push(...result.Items);
      }

      let matching = allBookings;
      if (useGaming) {
        matching = matching.filter(
          (b) =>
            String(b.centerName || "").trim().toLowerCase() === centerName.toLowerCase() &&
            String(b.machineType || "").trim().toLowerCase() === machineType.toLowerCase()
        );
      }
      if (useSalon && branchId) {
        matching = matching.filter(
          (b) => String(b.branchId || "").trim() === branchId
        );
      }
      if (doctorId) {
        matching = matching.filter(
          (b) => String(b.doctorId || "").trim() === doctorId
        );
      }
      if (locationId) {
        matching = matching.filter(
          (b) => String(b.locationId || "").trim() === locationId
        );
      }

      const conflicts = [];
      for (const b of matching) {
        const existingStart = new Date(String(b.startTime || ""));
        if (Number.isNaN(existingStart.getTime())) continue;
        const duration = Number(b.durationMinutes || 0);
        const existingEnd = new Date(existingStart.getTime() + duration * 60000);
        const overlaps = existingStart < to && existingEnd > from;
        if (overlaps) {
          conflicts.push({
            bookingId: b.bookingId,
            startTime: b.startTime,
            durationMinutes: b.durationMinutes,
            name: b.name,
            phone: b.phone,
            email: b.email,
            status: b.status,
            notes: b.notes,
          });
        }
      }

      return {
        ok: true,
        handle,
        centerName: useGaming ? centerName : undefined,
        machineType: useGaming ? machineType : undefined,
        branchId: useSalon ? branchId : undefined,
        doctorId: useClinic ? doctorId : undefined,
        locationId: useClinic ? locationId : undefined,
        window: { fromTime, toTime },
        availability: conflicts.length === 0 ? "AVAILABLE" : "CONFLICT",
        conflicts,
        totalConflicts: conflicts.length,
      };
    }
  );

  // Catalog lookup tool — used during retail voice/chat sessions
  client.registerToolHandler(
    "lookupCatalogItems",
    async (input, { handle: sessionHandle, socket: sessionSocket } = {}) => {
      if (!CATALOG_TABLE || !ddbDoc) {
        return { ok: false, error: "Catalog not configured." };
      }
      const handle = normalizeHandle(input.handle || sessionHandle);
      const query = String(input.query || "").trim().toLowerCase();

      const result = await ddbDoc.send(new QueryCommand({
        TableName: CATALOG_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle }
      }));

      let items = result.Items || [];
      // Filter by query string if provided
      if (query) {
        items = items.filter((item) =>
          (item.name || "").toLowerCase().includes(query) ||
          (item.category || "").toLowerCase().includes(query) ||
          (item.description || "").toLowerCase().includes(query)
        );
      }
      // Filter by in-stock if requested
      if (input.inStockOnly) {
        items = items.filter((item) => item.inStock !== false);
      }

      const summary = items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        price: item.price,
        qty: item.qty,
        inStock: item.inStock !== false,
        category: item.category,
        description: item.description,
        imageUrl: item.imageUrl,
        customFields: item.customFields
      }));

      // Emit to UI so the chat/voice client can show catalog cards
      if (sessionSocket) {
        sessionSocket.emit("catalogItems", { items: summary, query });
      }

      const text = items.length === 0
        ? `No catalog items found${query ? ` matching "${query}"` : ""}.`
        : items.map((item) => {
            const stock = item.inStock !== false
              ? (item.qty != null ? `${item.qty} in stock` : "in stock")
              : "OUT OF STOCK";
            const price = item.price != null ? `, price: ${item.price}` : "";
            return `${item.name} (${stock}${price})${item.description ? ": " + item.description : ""}`;
          }).join("; ");

      return { ok: true, items: summary, text };
    }
  );

  // Clinic token creation tool — used during clinic voice/chat sessions
  client.registerToolHandler(
    "createClinicToken",
    async (input, { handle: sessionHandle } = {}) => {
      if (!TOKENS_TABLE || !ddbDoc) {
        return { ok: false, error: "Token queue not configured." };
      }
      const handle = normalizeHandle(input.handle || sessionHandle);
      const patientName = String(input.patientName || input.name || "").trim();
      const phone = String(input.phone || "").trim();
      const email = String(input.email || "").trim();
      const doctorId = input.doctorId ? String(input.doctorId).trim() : null;
      const date = new Date().toISOString().slice(0, 10);

      // Count existing tokens for this doctor today
      const existing = await ddbDoc.send(new QueryCommand({
        TableName: TOKENS_TABLE,
        KeyConditionExpression: "handle = :h",
        FilterExpression: "#d = :date" + (doctorId ? " AND doctorId = :did" : ""),
        ExpressionAttributeNames: { "#d": "date" },
        ExpressionAttributeValues: {
          ":h": handle,
          ":date": date,
          ...(doctorId ? { ":did": doctorId } : {})
        }
      }));
      const existingTokens = existing.Items || [];
      const tokenNumber = existingTokens.length + 1;

      // Estimate wait time
      let estimatedWaitMinutes = null;
      if (doctorId && process.env.DOCTORS_TABLE) {
        try {
          const docRes = await ddbDoc.send(new GetCommand({
            TableName: process.env.DOCTORS_TABLE,
            Key: { handle, doctorId }
          }));
          if (docRes.Item?.avgConsultMinutes) {
            const pending = existingTokens.filter((t) => t.status === "WAITING").length;
            estimatedWaitMinutes = pending * Number(docRes.Item.avgConsultMinutes);
          }
        } catch (_) {}
      }

      const tokenId = `${date}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const item = {
        handle, tokenId, tokenNumber, date,
        patientName: patientName || null,
        phone: phone || null,
        email: email || null,
        doctorId,
        status: "WAITING",
        source: "call",
        estimatedWaitMinutes,
        createdAt: new Date().toISOString()
      };
      await ddbDoc.send(new PutCommand({ TableName: TOKENS_TABLE, Item: item }));

      return {
        ok: true,
        tokenNumber,
        estimatedWaitMinutes,
        message: `Token #${tokenNumber} issued${estimatedWaitMinutes != null ? `. Estimated wait: ~${estimatedWaitMinutes} minutes` : ""}.`
      };
    }
  );

  // Bedrock Knowledge Base tool (from AWS sample pattern)
  client.registerToolHandler(
    "queryKnowledgeBase",
    async (input, { knowledgeBaseId, handle: contextHandle } = {}) => {
      if (!knowledgeBaseId) {
        return {
          error: "Knowledge base is not configured for this business.",
        };
      }
      const query = String(input?.query || "").trim();
      if (!query) {
        return { error: "Missing required field: query." };
      }
      const numberOfResults = Math.min(
        Math.max(1, Number(input?.numberOfResults) || 10),
        25
      );
      try {
        // Dedicated KB per handle: do not filter by handle (chunks may not have handle metadata; filter would return 0)
        const results = await retrieveFromKnowledgeBase({
          knowledgeBaseId,
          query,
          numberOfResults,
          handle: undefined,
        });
        const formatted = formatRetrievalResultsForModel(results);
        console.log("[queryKnowledgeBase] query:", query, "results:", results.length, "preview:", formatted.slice(0, 120) + (formatted.length > 120 ? "..." : ""));
        return formatted;
      } catch (err) {
        console.error("[queryKnowledgeBase]", err?.message || err);
        return {
          error: `Knowledge base lookup failed: ${err?.message || String(err)}`,
        };
      }
    }
  );

  // Create request tool — used during general business voice sessions
  client.registerToolHandler(
    "createRequest",
    async (input, { handle: sessionHandle } = {}) => {
      if (!REQUESTS_TABLE || !ddbDoc) {
        return { ok: false, error: "Requests not configured." };
      }
      const handle = normalizeHandle(input.handle || sessionHandle);
      const callerName = String(input.callerName || "").trim();
      const phone = String(input.phone || "").trim();
      const email = String(input.email || "").trim();
      const description = String(input.description || "").trim();

      if (!handle || !callerName) {
        return { ok: false, error: "Missing required fields: handle, callerName." };
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      const item = {
        handle,
        requestId,
        callerName,
        phone: phone || null,
        email: email || null,
        description: description || null,
        classification: "unknown",
        source: "call",
        status: "new",
        createdAt: now,
        updatedAt: now
      };

      await ddbDoc.send(new PutCommand({ TableName: REQUESTS_TABLE, Item: item }));

      // Upsert customer record
      if (CUSTOMERS_TABLE && (phone || email)) {
        try {
          const custId = phone || email;
          await ddbDoc.send(new PutCommand({
            TableName: CUSTOMERS_TABLE,
            Item: {
              handle, customerId: custId,
              name: callerName, phone: phone || undefined, email: email || undefined,
              lastSeenAt: now, source: "call"
            },
            ConditionExpression: "attribute_not_exists(customerId)"
          }));
        } catch (e) {
          if (e.name !== "ConditionalCheckFailedException") console.warn("[createRequest] customer upsert error:", e.message);
        }
      }

      return {
        ok: true,
        requestId,
        message: `Callback request created for ${callerName}. The business will get back to you shortly.`
      };
    }
  );

  // Create support ticket tool — used during customer_support voice sessions
  client.registerToolHandler(
    "createSupportTicket",
    async (input, { handle: sessionHandle } = {}) => {
      if (!TICKETS_TABLE || !ddbDoc) {
        return { ok: false, error: "Tickets not configured." };
      }
      const handle = normalizeHandle(input.handle || sessionHandle);
      const customerName = String(input.customerName || "").trim();
      const phone = String(input.phone || "").trim();
      const email = String(input.email || "").trim();
      const category = String(input.category || "General").trim();
      const description = String(input.description || "").trim();
      const priority = String(input.priority || "medium").trim();

      if (!handle || !customerName || !description) {
        return { ok: false, error: "Missing required fields: handle, customerName, description." };
      }

      const ticketId = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const now = new Date().toISOString();

      const item = {
        handle,
        ticketId,
        customerName,
        phone: phone || null,
        email: email || null,
        category,
        description,
        status: "Open",
        priority,
        source: "call",
        createdAt: now,
        updatedAt: now
      };

      await ddbDoc.send(new PutCommand({ TableName: TICKETS_TABLE, Item: item }));

      // Upsert customer record
      if (CUSTOMERS_TABLE && (phone || email)) {
        try {
          const custId = phone || email;
          await ddbDoc.send(new PutCommand({
            TableName: CUSTOMERS_TABLE,
            Item: {
              handle, customerId: custId,
              name: customerName, phone: phone || undefined, email: email || undefined,
              lastSeenAt: now, source: "call"
            },
            ConditionExpression: "attribute_not_exists(customerId)"
          }));
        } catch (e) {
          if (e.name !== "ConditionalCheckFailedException") console.warn("[createSupportTicket] customer upsert error:", e.message);
        }
      }

      return {
        ok: true,
        ticketId,
        message: `Support ticket ${ticketId} created for ${customerName}. Category: ${category}. Priority: ${priority}. Our team will follow up.`
      };
    }
  );

  // Onboarding field update tool — emits field updates back to the web client
  client.registerToolHandler(
    "updateOnboardingField",
    async (input, context = {}) => {
      const field = String(input.field || "").trim();
      const value = String(input.value || "").trim();
      if (!field || !value) {
        return { ok: false, error: "field and value are required." };
      }
      // Emit the field update to the web client via socket
      if (context.socket) {
        context.socket.emit("onboardingFieldUpdate", { field, value });
      }
      return { ok: true, field, value, message: `Updated ${field} to "${value}".` };
    }
  );

  // Check ticket status tool — look up existing tickets by phone
  client.registerToolHandler(
    "checkTicketStatus",
    async (input, { handle: sessionHandle } = {}) => {
      if (!TICKETS_TABLE || !ddbDoc) {
        return { ok: false, error: "Tickets not configured." };
      }
      const handle = normalizeHandle(input.handle || sessionHandle);
      const phone = String(input.phone || "").trim();

      if (!handle || !phone) {
        return { ok: false, error: "Missing required fields: handle, phone." };
      }

      const result = await ddbDoc.send(new QueryCommand({
        TableName: TICKETS_TABLE,
        IndexName: "PhoneIndex",
        KeyConditionExpression: "phone = :p",
        FilterExpression: "handle = :h",
        ExpressionAttributeValues: { ":p": phone, ":h": handle },
        ScanIndexForward: false,
        Limit: 5
      }));

      const tickets = result.Items || [];
      if (tickets.length === 0) {
        return { ok: true, tickets: [], message: "No tickets found for this phone number." };
      }

      const summary = tickets.map(t =>
        `Ticket ${t.ticketId}: ${t.category} — ${t.status} (${t.priority} priority, created ${t.createdAt.slice(0, 10)})`
      ).join(". ");

      return {
        ok: true,
        tickets: tickets.map(t => ({
          ticketId: t.ticketId,
          category: t.category,
          status: t.status,
          priority: t.priority,
          description: t.description,
          createdAt: t.createdAt
        })),
        message: `Found ${tickets.length} ticket(s). ${summary}`
      };
    }
  );
}

const defaultClient = new NovaSonicBidirectionalStreamClient({ region });
attachToolHandlers(defaultClient);
const regionClients = new Map([[region, defaultClient]]);
function getClientForRegion(reg) {
  if (!regionClients.has(reg)) {
    const client = new NovaSonicBidirectionalStreamClient({ region: reg });
    attachToolHandlers(client);
    regionClients.set(reg, client);
  }
  return regionClients.get(reg);
}
const socketSessions = new Map();
const socketClients = new Map();
const socketConfigs = new Map();
const socketRecorders = new Map(); // sessionId → SessionRecorder

const SessionState = {
  INITIALIZING: "initializing",
  READY: "ready",
  ACTIVE: "active",
  CLOSED: "closed",
};
const sessionStates = new Map();
const cleanupInProgress = new Map();

function setupSessionHandlers(session, socket) {
  session.onEvent("usageEvent", (data) => socket.emit("usageEvent", data));
  session.onEvent("completionStart", (data) => socket.emit("completionStart", data));
  session.onEvent("completionEnd", (data) => socket.emit("completionEnd", data));
  session.onEvent("contentStart", (data) => socket.emit("contentStart", data));
  session.onEvent("textOutput", (data) => socket.emit("textOutput", data));
  session.onEvent("audioOutput", (data) => socket.emit("audioOutput", data));
  session.onEvent("error", (data) => socket.emit("error", data));
  session.onEvent("contentEnd", (data) => socket.emit("contentEnd", data));
  // Surface tool usage and results to the Web UI for debugging / observability.
  session.onEvent("toolUse", (data) => socket.emit("toolUse", data));
  session.onEvent("toolResult", (data) => socket.emit("toolResult", data));
  session.onEvent("interruption", (data) => socket.emit("interruption", data));
  session.onEvent("streamComplete", () => {
    socket.emit("streamComplete");
    sessionStates.set(socket.id, SessionState.CLOSED);
  });
}

async function createNewSession(socket, config = {}) {
  const sessionId = socket.id;
  const reg = config.region || region;
  const sonicClient = getClientForRegion(reg);

  sessionStates.set(sessionId, SessionState.INITIALIZING);

  const knowledgeBaseId =
    config.knowledgeBaseId || process.env.BEDROCK_KNOWLEDGE_BASE_ID || "";

  const session = sonicClient.createStreamSession(sessionId, {
    inferenceConfig: config.inferenceConfig,
    turnDetectionConfig: config.turnDetectionConfig,
    handle: config.handle,
    knowledgeBaseId: knowledgeBaseId || undefined,
    socket, // pass socket so tools can emit events (e.g. catalogItems)
    mode: config.mode, // "onboarding" enables updateOnboardingField tool
  });
  setupSessionHandlers(session, socket);

  // Create a proper voice session META record in ConversationsTable so
  // handle-conversations.js (HandleCreatedAtIndex) can discover it.
  const voiceSessionUuid = randomUUID();
  const voiceSessionPk = `SESSION#${voiceSessionUuid}`;
  const now = new Date().toISOString();
  if (CONVERSATIONS_TABLE && ddbDoc && config.handle) {
    try {
      await ddbDoc.send(new PutCommand({
        TableName: CONVERSATIONS_TABLE,
        Item: {
          pk: voiceSessionPk,
          sk: "META",
          handle: config.handle,
          channel: "voice",
          createdAt: now,
          updatedAt: now,
          status: "ACTIVE",
          owner: config.owner || "anonymous",
          ...(config.callerName ? { callerName: config.callerName } : {}),
        },
      }));
    } catch (e) {
      console.warn("[createNewSession] Could not write voice session META:", e.message);
    }
  }

  // Start recording session.
  // sessionId (socket.id) used for S3 filename; voiceSessionPk used for DynamoDB updates.
  const recorder = new SessionRecorder(voiceSessionUuid, config.handle || "unknown", voiceSessionPk);
  socketRecorders.set(sessionId, recorder);

  // Buffer AI audio chunks per content block so interrupted blocks can be discarded,
  // mirroring exactly what both the web and mobile clients do on barge-in.
  const pendingAiChunks = [];

  // Combined audioOutput: forward to client AND buffer for recording.
  // (onEvent uses Map.set, so this overwrites setupSessionHandlers' audioOutput handler)
  session.onEvent("audioOutput", (data) => {
    socket.emit("audioOutput", data);
    try {
      if (data?.content) pendingAiChunks.push(Buffer.from(data.content, "base64"));
    } catch (_) {}
  });

  // Combined contentEnd: forward to client AND commit/discard the buffered AI audio.
  // stopReason "INTERRUPTED" = barge-in; discard those chunks (client dropped them too).
  // (overwrites setupSessionHandlers' contentEnd handler — must emit to socket here)
  session.onEvent("contentEnd", (data) => {
    socket.emit("contentEnd", data);
    if (data?.type === "AUDIO") {
      if (data?.stopReason !== "INTERRUPTED") {
        for (const chunk of pendingAiChunks) recorder.addAiAudio(chunk);
      }
      pendingAiChunks.length = 0;
    }
  });

  socketSessions.set(sessionId, session);
  socketClients.set(sessionId, sonicClient);
  socketConfigs.set(sessionId, config);
  sessionStates.set(sessionId, SessionState.READY);
  return session;
}

// ALB health check and /health (both return 200)
app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "yandle-sonic-service",
    region,
    modelId,
    socketConnections: io.engine?.clientsCount ?? 0,
  });
});
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "yandle-sonic-service",
    region,
    modelId,
    socketConnections: io.engine?.clientsCount ?? 0,
  });
});

app.get("/session/start", (req, res) => {
  res.json({
    ok: true,
    mode: "realtime-voice",
    message: "Connect via Socket.IO to this host for Nova Sonic real-time voice.",
  });
});

io.on("connection", (socket) => {
  sessionStates.set(socket.id, SessionState.CLOSED);

  socket.on("initializeConnection", async (data, callback) => {
    try {
      let config = {};
      let cb = callback;
      if (typeof data === "function") {
        cb = data;
      } else if (data && typeof data === "object") {
        config = data;
      }

      const current = sessionStates.get(socket.id);
      if (
        current === SessionState.INITIALIZING ||
        current === SessionState.READY ||
        current === SessionState.ACTIVE
      ) {
        if (cb) cb({ success: true });
        return;
      }

      await createNewSession(socket, config);
      if (cb) cb({ success: true });
    } catch (error) {
      console.error("initializeConnection error", error);
      sessionStates.set(socket.id, SessionState.CLOSED);
      if (typeof data === "function" ? data : callback) {
        (typeof data === "function" ? data : callback)({
          success: false,
          error: error?.message || String(error),
        });
      }
      socket.emit("error", {
        message: "Failed to initialize session",
        details: error?.message || String(error),
      });
    }
  });

  socket.on("promptStart", async (data) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session) {
        socket.emit("error", { message: "No active session for prompt start" });
        return;
      }
      const voiceId = data?.voiceId || "tiffany";
      const outputSampleRate = data?.outputSampleRate || 24000;
      await session.setupSessionAndPromptStart(voiceId, outputSampleRate);
    } catch (error) {
      console.error("promptStart error", error);
      socket.emit("error", {
        message: "Error on prompt start",
        details: error?.message || String(error),
      });
    }
  });

  socket.on("systemPrompt", async (data) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session) {
        socket.emit("error", { message: "No active session for system prompt" });
        return;
      }
      const content =
        typeof data === "string" ? data : data?.content ?? data?.prompt ?? "";
      const voiceId = typeof data === "object" ? data?.voiceId : undefined;
      await session.setupSystemPrompt(content, voiceId);
    } catch (error) {
      console.error("systemPrompt error", error);
      socket.emit("error", {
        message: "Error on system prompt",
        details: error?.message || String(error),
      });
    }
  });

  socket.on("audioStart", async () => {
    try {
      const session = socketSessions.get(socket.id);
      const sonicClient = socketClients.get(socket.id) || defaultClient;
      if (!session) {
        socket.emit("error", { message: "No active session for audio start" });
        return;
      }
      await session.setupStartAudio();
      sonicClient.initiateBidirectionalStreaming(socket.id);
      sessionStates.set(socket.id, SessionState.ACTIVE);
      socket.emit("audioReady");
    } catch (error) {
      console.error("audioStart error", error);
      sessionStates.set(socket.id, SessionState.CLOSED);
      socket.emit("error", {
        message: "Error on audio start",
        details: error?.message || String(error),
      });
    }
  });

  socket.on("audioInput", async (audioData) => {
    try {
      const session = socketSessions.get(socket.id);
      const state = sessionStates.get(socket.id);
      if (!session || state !== SessionState.ACTIVE) {
        socket.emit("error", {
          message: "No active session for audio input",
          details: `state=${state}`,
        });
        return;
      }
      const buf =
        typeof audioData === "string"
          ? Buffer.from(audioData, "base64")
          : Buffer.from(audioData);
      // Record caller audio
      const recorder = socketRecorders.get(socket.id);
      if (recorder) recorder.addCallerAudio(buf);
      await session.streamAudio(buf);
    } catch (error) {
      console.error("audioInput error", error);
      socket.emit("error", {
        message: "Error processing audio",
        details: error?.message || String(error),
      });
    }
  });

  socket.on("stopAudio", async () => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session || cleanupInProgress.get(socket.id)) {
        socket.emit("sessionClosed");
        return;
      }
      cleanupInProgress.set(socket.id, true);
      sessionStates.set(socket.id, SessionState.CLOSED);

      await Promise.race([
        (async () => {
          await session.endAudioContent();
          await session.endPrompt();
          await session.close();
        })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cleanup timeout")), 5000)
        ),
      ]).catch(() => {});

      // Finalize recording and deduct voice credits
      const recorder = socketRecorders.get(socket.id);
      const config = socketConfigs.get(socket.id);
      if (recorder) {
        // Deduct voice credits: 3 credits per minute
        if (CREDITS_TABLE && ddbDoc && config?.handle) {
          try {
            const durationSeconds = recorder.getDurationSeconds();
            const durationMinutes = Math.ceil(durationSeconds / 60);
            const creditsToDeduct = durationMinutes * 3;
            if (creditsToDeduct > 0) {
              // Check if credits record exists; create if missing
              const creditsRes = await ddbDoc.send(new GetCommand({
                TableName: CREDITS_TABLE,
                Key: { handle: config.handle },
              }));
              if (!creditsRes.Item) {
                // Initialize credits record for handles that predate CreditsTable
                try {
                  await ddbDoc.send(new PutCommand({
                    TableName: CREDITS_TABLE,
                    Item: {
                      handle: config.handle,
                      credits: 1000,
                      totalCreditsUsed: 0,
                      planType: "free",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    ConditionExpression: "attribute_not_exists(handle)",
                  }));
                  console.log(`[stopAudio] Initialized credits record for ${config.handle}`);
                } catch (initErr) {
                  if (initErr.name !== "ConditionalCheckFailedException") {
                    console.error("[stopAudio] credits init error:", initErr);
                  }
                }
              }

              await ddbDoc.send(new UpdateCommand({
                TableName: CREDITS_TABLE,
                Key: { handle: config.handle },
                UpdateExpression: "SET credits = credits - :amt, totalCreditsUsed = totalCreditsUsed + :amt, updatedAt = :now",
                ConditionExpression: "attribute_exists(handle) AND credits >= :amt",
                ExpressionAttributeValues: { ":amt": creditsToDeduct, ":now": new Date().toISOString() },
              }));
              console.log(`[stopAudio] Deducted ${creditsToDeduct} credits (${durationMinutes} min) from ${config.handle}`);
            }
          } catch (e) {
            console.error("[stopAudio] credit deduction error:", e.name, e.message);
          }
        }
        socketRecorders.delete(socket.id);
        recorder.finalize(CONVERSATIONS_TABLE, ddbDoc).catch((e) =>
          console.error("[stopAudio] recording finalize error:", e.message)
        );
      }

      socketSessions.delete(socket.id);
      socketClients.delete(socket.id);
      socketConfigs.delete(socket.id);
      cleanupInProgress.delete(socket.id);
      socket.emit("sessionClosed");
    } catch (error) {
      console.error("stopAudio error", error);
      try {
        (socketClients.get(socket.id) || defaultClient).forceCloseSession(socket.id);
      } catch (_) {}
      const recorder = socketRecorders.get(socket.id);
      if (recorder) {
        socketRecorders.delete(socket.id);
        recorder.finalize(CONVERSATIONS_TABLE, ddbDoc).catch(() => {});
      }
      socketSessions.delete(socket.id);
      socketClients.delete(socket.id);
      socketConfigs.delete(socket.id);
      cleanupInProgress.delete(socket.id);
      sessionStates.set(socket.id, SessionState.CLOSED);
      socket.emit("sessionClosed");
    }
  });

  socket.on("disconnect", async () => {
    const session = socketSessions.get(socket.id);
    const sonicClient = socketClients.get(socket.id) || defaultClient;
    if (session && sonicClient.isSessionActive(socket.id) && !cleanupInProgress.get(socket.id)) {
      try {
        cleanupInProgress.set(socket.id, true);
        await Promise.race([
          (async () => {
            await session.endAudioContent();
            await session.endPrompt();
            await session.close();
          })(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Disconnect cleanup timeout")), 3000)
          ),
        ]).catch(() => {});
      } catch (e) {
        try {
          sonicClient.forceCloseSession(socket.id);
        } catch (_) {}
      }
    }
    const discRecorder = socketRecorders.get(socket.id);
    if (discRecorder) {
      socketRecorders.delete(socket.id);
      discRecorder.finalize(CONVERSATIONS_TABLE, ddbDoc).catch(() => {});
    }
    socketSessions.delete(socket.id);
    socketClients.delete(socket.id);
    socketConfigs.delete(socket.id);
    sessionStates.delete(socket.id);
    cleanupInProgress.delete(socket.id);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`yandle-sonic-service listening on :${port} (Nova Sonic real-time)`);
});
