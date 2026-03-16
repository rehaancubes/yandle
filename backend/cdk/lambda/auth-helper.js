/**
 * Shared access-control helper for YANDLE Lambda functions.
 * Checks if the caller is the handle owner OR an added manager via MembersTable.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

/**
 * Extract caller sub and email from API Gateway event. Tries multiple claim paths
 * (HTTP API JWT authorizer can use jwt.claims or claims; authorizer may also be the claims object).
 */
function getCallerFromEvent(event) {
  const auth = event?.requestContext?.authorizer || {};
  const claims = auth.jwt?.claims || auth.claims || auth;
  const sub = (claims.sub || "").toString().trim() || null;
  const email = (claims.email || claims["cognito:username"] || "").toString().trim().toLowerCase() || undefined;
  return { sub, email };
}

/**
 * Asserts the caller (identified by sub + email) has owner or manager access to a handle.
 * Throws "FORBIDDEN" if access is denied, "NOT_FOUND" if the handle doesn't exist.
 */
async function assertAccess(handle, sub, email) {
  if (!process.env.HANDLES_TABLE) return; // misconfigured — let through
  const result = await ddb.get({
    TableName: process.env.HANDLES_TABLE,
    Key: { handle }
  }).promise();
  if (!result.Item) throw new Error("NOT_FOUND");
  if (sub && result.Item.ownerId === sub) return; // owner ✓

  // Same person by email (e.g. re-registered with new sub, or handle created with different auth)
  const ownerEmail = result.Item.ownerEmail && String(result.Item.ownerEmail).trim().toLowerCase();
  if (email && ownerEmail && ownerEmail === email) return;

  // Check membership (email must match a row in Members table)
  if (email && process.env.MEMBERS_TABLE) {
    const memberRes = await ddb.get({
      TableName: process.env.MEMBERS_TABLE,
      Key: { handle, email: String(email).trim().toLowerCase() }
    }).promise();
    if (memberRes.Item) return; // manager ✓
  }

  // Debug: log why access was denied (no PII)
  console.warn("[auth] FORBIDDEN", {
    handle,
    callerSubPresent: !!sub,
    ownerIdPresent: !!result.Item.ownerId,
    ownerMatch: result.Item.ownerId === sub,
    emailPresent: !!email,
    membersTableChecked: !!(email && process.env.MEMBERS_TABLE),
  });
  throw new Error("FORBIDDEN");
}

/**
 * Returns true if the caller is owner or manager of the handle.
 * Does not throw — useful for conditional rendering.
 */
async function checkAccess(handle, sub, email) {
  try {
    await assertAccess(handle, sub, email);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true only if the caller is the owner (not just any manager).
 */
async function isOwner(handle, sub) {
  if (!process.env.HANDLES_TABLE) return false;
  const result = await ddb.get({
    TableName: process.env.HANDLES_TABLE,
    Key: { handle }
  }).promise();
  return result.Item?.ownerId === sub;
}

module.exports = { assertAccess, checkAccess, isOwner, getCallerFromEvent };
