const AWS = require("aws-sdk");

const ddb = new AWS.DynamoDB.DocumentClient();

function normalizeHandle(raw) {
  let s = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
  if (s.startsWith("voxa-")) s = s.slice(5);
  return s;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Get logical start time for overlap/display (handles composite key startTime#bookingId). */
function getLogicalStartTime(item) {
  if (item.slotStartTime) return item.slotStartTime;
  const st = item.startTime || "";
  return st.includes("#") ? st.split("#")[0] : st;
}

/** Build composite sort key so multiple bookings can share the same slot (e.g. multiple PCs). */
function compositeStartTime(logicalStartTime, bookingId) {
  return `${logicalStartTime}#${bookingId}`;
}

async function getHandleProfile(handle) {
  if (!process.env.HANDLES_TABLE) return null;
  const result = await ddb.get({
    TableName: process.env.HANDLES_TABLE,
    Key: { handle }
  }).promise();
  return result.Item || null;
}

async function getServiceDuration(handle, serviceId) {
  if (!process.env.SERVICES_TABLE || !serviceId) return null;
  const result = await ddb.get({
    TableName: process.env.SERVICES_TABLE,
    Key: { handle, serviceId: String(serviceId).trim() }
  }).promise();
  return result.Item?.durationMinutes != null ? Number(result.Item.durationMinutes) : null;
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
  const start = new Date(startTime);
  const windowStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = addMinutes(startTime, durationMinutes + 7 * 24 * 60);
  const windowEndInclusive = windowEnd + "\uffff";
  const handlesToQuery = [handle];
  if (!handle.startsWith("voxa-")) handlesToQuery.push("voxa-" + handle);
  const all = [];
  for (const h of handlesToQuery) {
    const result = await ddb.query({
      TableName: process.env.BOOKINGS_TABLE,
      KeyConditionExpression: "handle = :h AND startTime BETWEEN :lo AND :hi",
      ExpressionAttributeValues: { ":h": h, ":lo": windowStart, ":hi": windowEndInclusive },
      Limit: limit
    }).promise();
    if (result.Items && result.Items.length) all.push(...result.Items);
  }
  return all.filter((b) => slotsOverlap(getLogicalStartTime(b), b.durationMinutes || 0, startTime, durationMinutes));
}

async function checkCapacityAndReject(handle, body, startTime, durationMinutes) {
  const { branchId, centerName, machineType, doctorId, locationId } = body;
  const overlapping = await getOverlappingBookings(handle, startTime, durationMinutes);

  if (branchId && process.env.BRANCHES_TABLE) {
    const branchRes = await ddb.get({
      TableName: process.env.BRANCHES_TABLE,
      Key: { handle, branchId: String(branchId).trim() }
    }).promise();
    const capacity = Math.max(0, Number(branchRes.Item?.capacity) || 1);
    const count = overlapping.filter((b) => String(b.branchId || "") === String(branchId)).length;
    if (count >= capacity) {
      return { reject: true, error: "This branch is at capacity for the selected time. Please choose another slot or branch." };
    }
  }

  if ((centerName || machineType) && process.env.GAMING_CENTERS_TABLE) {
    const centersRes = await ddb.query({
      TableName: process.env.GAMING_CENTERS_TABLE,
      KeyConditionExpression: "handle = :h",
      ExpressionAttributeValues: { ":h": handle }
    }).promise();
    const centers = centersRes.Items || [];
    const center = centers.find((c) =>
      (c.name && c.name.toLowerCase() === String(centerName || "").toLowerCase()) ||
      (c.centerId && c.centerId.toLowerCase() === String(centerName || "").toLowerCase())
    );
    if (center && Array.isArray(center.machines)) {
      const machine = center.machines.find((m) =>
        (m.type && m.type.toLowerCase() === String(machineType || "").toLowerCase()) ||
        (m.name && m.name.toLowerCase() === String(machineType || "").toLowerCase())
      );
      const capacity = machine ? Math.max(0, Number(machine.count) || 1) : 0;
      const count = overlapping.filter(
        (b) => String(b.centerName || "").toLowerCase() === String(centerName || "").toLowerCase() &&
          (String(b.machineType || "").toLowerCase() === String(machineType || "").toLowerCase())
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

async function upsertCustomer(handle, { name, phone, email }) {
  if (!process.env.CUSTOMERS_TABLE) return;
  const phoneNorm = String(phone || "").trim();
  const emailNorm = String(email || "").trim();
  if (!phoneNorm && !emailNorm) return;

  const now = new Date().toISOString();
  const existing = await ddb.query({
    TableName: process.env.CUSTOMERS_TABLE,
    KeyConditionExpression: "handle = :h",
    ExpressionAttributeValues: { ":h": handle },
    Limit: 100
  }).promise();

  const found = (existing.Items || []).find(
    (i) => (phoneNorm && i.phone === phoneNorm) || (emailNorm && i.email === emailNorm)
  );
  const customerId = found?.customerId || generateId();
  const item = {
    handle,
    customerId,
    name: String(name || "").trim() || (found && found.name) || "",
    phone: phoneNorm || (found && found.phone) || "",
    email: emailNorm || (found && found.email) || "",
    firstSeenAt: (found && found.firstSeenAt) || now,
    lastBookingAt: now,
    lastSessionAt: (found && found.lastSessionAt) || now,
    lastSeenAt: now
  };

  await ddb.put({
    TableName: process.env.CUSTOMERS_TABLE,
    Item: item
  }).promise();
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod || "GET";

    if (method === "DELETE") {
      const handle = normalizeHandle(event.queryStringParameters?.handle || "");
      let startTime = (event.queryStringParameters?.startTime || "").trim();
      const bookingId = (event.queryStringParameters?.bookingId || "").trim();

      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };
      }
      if (!startTime) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "startTime is required" }) };
      }

      const sortKey = startTime.includes("#") ? startTime : (bookingId ? compositeStartTime(startTime, bookingId) : startTime);

      const callerSub = event.requestContext?.authorizer?.jwt?.claims?.sub || "";
      const callerEmail = (event.requestContext?.authorizer?.jwt?.claims?.email || "").toLowerCase();

      const bookingRes = await ddb.get({
        TableName: process.env.BOOKINGS_TABLE,
        Key: { handle, startTime: sortKey }
      }).promise();

      if (!bookingRes.Item) {
        return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Booking not found" }) };
      }

      const bookingEmail = (bookingRes.Item.email || "").toLowerCase();
      const isSelfCancel = callerEmail && bookingEmail && bookingEmail === callerEmail;

      if (!isSelfCancel) {
        const { assertAccess } = require("./auth-helper");
        try {
          await assertAccess(handle, callerSub, callerEmail);
        } catch {
          return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Forbidden" }) };
        }
      }

      await ddb.delete({
        TableName: process.env.BOOKINGS_TABLE,
        Key: { handle, startTime: sortKey }
      }).promise();

      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    if (method === "GET") {
      const rawHandle = event.queryStringParameters?.handle || event.pathParameters?.handle || "";
      const handle = normalizeHandle(rawHandle);
      if (!handle) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "handle is required" })
        };
      }

      const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 200);
      const fromTime = (event.queryStringParameters?.fromTime || "").trim();
      const toTime = (event.queryStringParameters?.toTime || "").trim();

      const handlesToQuery = [handle];
      if (!handle.startsWith("voxa-")) handlesToQuery.push("voxa-" + handle);

      const allItems = [];
      for (const h of handlesToQuery) {
        const queryParams = {
          TableName: process.env.BOOKINGS_TABLE,
          KeyConditionExpression: "handle = :h",
          ExpressionAttributeValues: { ":h": h },
          ScanIndexForward: true,
          Limit: limit
        };
        if (fromTime && toTime) {
          queryParams.KeyConditionExpression = "handle = :h AND startTime BETWEEN :from AND :to";
          queryParams.ExpressionAttributeValues = { ":h": h, ":from": fromTime, ":to": toTime + "\uffff" };
        }
        const result = await ddb.query(queryParams).promise();
        if (result.Items && result.Items.length) allItems.push(...result.Items);
      }
      allItems.sort((a, b) => {
        const ta = getLogicalStartTime(a) || "";
        const tb = getLogicalStartTime(b) || "";
        const byTime = ta.localeCompare(tb);
        if (byTime !== 0) return byTime;
        return (a.bookingId || "").localeCompare(b.bookingId || "");
      });

      const bookingsForClient = allItems.slice(0, limit).map((item) => ({
        ...item,
        startTime: getLogicalStartTime(item)
      }));

      // CloudWatch: log GET result for debugging (e.g. m80esports 16 Mar 9pm = 21:00 UTC)
      if (fromTime && toTime) {
        const count = bookingsForClient.length;
        const at9pm = bookingsForClient.filter((b) => (b.startTime || "").includes("T21:00"));
        console.log(JSON.stringify({
          msg: "bookings GET",
          handle,
          fromTime,
          toTime,
          count,
          at21: at9pm.length,
          at21Details: at9pm.map((b) => ({ startTime: b.startTime, bookingId: b.bookingId, name: b.name }))
        }));
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle,
          bookings: bookingsForClient
        })
      };
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const handle = normalizeHandle(body.handle);
      if (!handle) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "handle is required" })
        };
      }

      const claims = event.requestContext?.authorizer?.jwt?.claims || {};
      const centerName = String(body.centerName || "").trim();
      const machineType = String(body.machineType || "").trim();
      const startTime = String(body.startTime || "").trim();
      let durationMinutes = Number(body.durationMinutes || 0);
      let name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      let email = String(body.email || "").trim();
      if (!email && claims.email) {
        email = String(claims.email).trim().toLowerCase();
      }
      if (!name && (claims.name || claims["cognito:username"])) {
        name = String(claims.name || claims["cognito:username"] || "").trim();
      }
      let serviceId = body.serviceId != null ? String(body.serviceId).trim() : "";
      const serviceName = String(body.serviceName || "").trim();
      let branchId = body.branchId != null ? String(body.branchId).trim() : "";
      const branchName = String(body.branchName || "").trim();
      const doctorId = body.doctorId != null ? String(body.doctorId).trim() : "";
      const locationId = body.locationId != null ? String(body.locationId).trim() : "";

      if (!startTime || !name) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "startTime and name are required."
          })
        };
      }

      if (!phone && !email) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "At least one of phone or email is required."
          })
        };
      }

      const profile = await getHandleProfile(handle);
      const captureEmail = profile?.captureEmail !== false;
      const capturePhone = profile?.capturePhone !== false;
      if (capturePhone && !phone) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Phone is required for this business." })
        };
      }
      if (captureEmail && !email) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Email is required for this business." })
        };
      }

      // Resolve serviceName → serviceId if serviceId not provided
      if (!serviceId && serviceName && process.env.SERVICES_TABLE) {
        const svcResult = await ddb.query({
          TableName: process.env.SERVICES_TABLE,
          KeyConditionExpression: "handle = :h",
          ExpressionAttributeValues: { ":h": handle }
        }).promise();
        const match = (svcResult.Items || []).find(
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
      if (!branchId && branchName && process.env.BRANCHES_TABLE) {
        const brResult = await ddb.query({
          TableName: process.env.BRANCHES_TABLE,
          KeyConditionExpression: "handle = :h",
          ExpressionAttributeValues: { ":h": handle }
        }).promise();
        const match = (brResult.Items || []).find(
          (b) => (b.name || "").toLowerCase() === branchName.toLowerCase()
        );
        if (match) {
          branchId = match.branchId;
        }
      }

      if (serviceId && !durationMinutes) {
        const fromService = await getServiceDuration(handle, serviceId);
        if (fromService != null) durationMinutes = fromService;
      }

      const useGamingShape = centerName || machineType;
      if (useGamingShape && (!centerName || !machineType || !durationMinutes)) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "For gaming-style bookings, centerName, machineType, and durationMinutes are required."
          })
        };
      }
      if (!useGamingShape && !durationMinutes) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "durationMinutes is required, or provide serviceId to use service duration."
          })
        };
      }

      const capacityCheck = await checkCapacityAndReject(handle, {
        branchId,
        centerName,
        machineType,
        doctorId,
        locationId
      }, startTime, durationMinutes);
      if (capacityCheck.reject) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: capacityCheck.error })
        };
      }

      const bookingId = body.bookingId || generateId();
      const createdAt = new Date().toISOString();
      const compositeKey = compositeStartTime(startTime, bookingId);

      const item = {
        handle,
        startTime: compositeKey,
        slotStartTime: startTime,
        bookingId,
        durationMinutes,
        name,
        status: body.status || "BOOKED",
        notes: body.notes || "",
        createdAt
      };
      if (phone) item.phone = phone;
      if (email) item.email = email;
      if (centerName) item.centerName = centerName;
      if (machineType) item.machineType = machineType;
      if (serviceId) item.serviceId = serviceId;
      if (branchId) item.branchId = branchId;
      if (doctorId) item.doctorId = doctorId;
      if (locationId) item.locationId = locationId;

      await ddb.put({
        TableName: process.env.BOOKINGS_TABLE,
        Item: item
      }).promise();

      await upsertCustomer(handle, { name, phone, email });

      const responseBooking = { ...item, startTime };
      return {
        statusCode: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, booking: responseBooking })
      };
    }

    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  } catch (error) {
    const details = error.message || String(error);
    console.error("[bookings] Error:", details, "code:", error.code, "stack:", error.stack);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details, code: error.code })
    };
  }
};

